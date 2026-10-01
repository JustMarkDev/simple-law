/**
 * Pipeline di ingest da Normattiva verso il database.
 *
 * Due pipeline principali, entrambe Effect-based e con errori catturati:
 *  - `storicoEffect`: scarica le collezioni bulk richieste (ZIP) e ingerisce
 *    gli atti tramite ricerca avanzata paginata;
 *  - `recenteEffect`: ingerisce gli atti aggiornati in un intervallo di date.
 *
 * Ogni atto viene **semplificato all'ingest** (`simplifyLaw` + `scoreQuality`)
 * e la semplificazione, con il punteggio di qualita', viene salvata in
 * `Law.extra.semplificata` / `Law.extra.qualita`. La forma salvata rispetta il
 * `SimplifiedLaw` della UI (chiavi `perTe`: guida/lavoro/impresa/studio).
 *
 * Nessuna funzione espone errori: i problemi di rete finiscono nel report.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Effect } from "effect";
import { persistLaws, recordIngestRun } from "./db";
import type { LawRecordExtra } from "./db";
import { parseNIR } from "./nir";
import {
  MAX_DOWNLOAD_BYTES,
  Normattiva,
  denominazioniAtto,
  dettaglioAtto,
  downloadCollection,
  eliFromUrn,
  getCollections,
  normattivaLayer,
  ricercaAggiornati,
  walkRicercaAvanzata,
} from "./normattiva";
import type {
  AttoDto,
  CollectionItem,
  NormattivaConfig,
  RicercaAvanzataInput,
  WalkRicercaResult,
} from "./normattiva";
import { scoreQuality } from "./quality";
import { simplifyLaw } from "./simplify";
import type { SimplifiedLaw } from "./simplify";

export type SyncPhase =
  | "collections"
  | "download"
  | "search"
  | "detail"
  | "simplify"
  | "persist"
  | "done"
  | "error";

export interface SyncProgress {
  readonly phase: SyncPhase;
  readonly message: string;
  readonly done?: number;
  readonly total?: number;
}

export type ProgressListener = (progress: SyncProgress) => void;

export interface SyncCollectionReport {
  readonly nome: string;
  readonly entries: number;
  readonly bytes: number;
  readonly file?: string;
}

export interface SyncReport {
  readonly source: "storico" | "recente";
  readonly ok: boolean;
  readonly fetched: number;
  readonly simplified: number;
  readonly persisted: number;
  readonly collections: SyncCollectionReport[];
  readonly errors: string[];
  readonly notes: string[];
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface StoricoSyncOptions {
  readonly emit?: ProgressListener;
  /** Numero massimo di atti da semplificare e salvare. */
  readonly limit?: number;
  readonly pageSize?: number;
  readonly maxPages?: number;
  readonly annoDa?: string | number;
  readonly annoA?: string | number;
  /** Denominate ufficiali, es. `["DECRETO-LEGGE", "LEGGE"]`. */
  readonly denominazioni?: readonly string[];
  /** Nomi delle collezioni bulk da scaricare. Se assente, nessun download. */
  readonly collezioni?: readonly string[];
  /** Cartella di destinazione degli ZIP. Default `data/bulk`. */
  readonly zipDir?: string;
  /** `false` per non scrivere su DB (dry run). */
  readonly persist?: boolean;
}

export interface RecenteSyncOptions {
  readonly emit?: ProgressListener;
  /** Data iniziale `YYYY-MM-DD`; default: 30 giorni prima di `al`. */
  readonly dal?: string;
  /** Data finale `YYYY-MM-DD`; default: oggi (UTC). */
  readonly al?: string;
  readonly limit?: number;
  readonly persist?: boolean;
}

const DEFAULT_DENOMINAZIONI: readonly string[] = ["DECRETO-LEGGE", "LEGGE", "DECRETO LEGISLATIVO"];

const DEFAULT_ZIP_DIR = "data/bulk";

/* ---------------------------------------------------------------------------
 * Semplificazione e mapping (puri, esportati per i test).
 * ------------------------------------------------------------------------- */

function normalizza(testo: string): string {
  return (testo ?? "").replace(/\s+/g, " ").trim();
}

function tronca(testo: string, max = 160): string {
  const pulito = normalizza(testo);
  if (pulito.length <= max) return pulito;
  return `${pulito.slice(0, max).trimEnd()}...`;
}

/**
 * Testi "per te" per le quattro persone della UI. Chiavi allineate a
 * `PersonaKey` di `components/seed-fallback.ts`.
 */
export function perTePersone(sintesi: string): Record<string, string> {
  const breve = tronca(sintesi) || "Consulta il testo ufficiale per i dettagli.";
  return {
    guida: `Se guidi o usi un mezzo, controlla se cambiano costi o regole. In breve: ${breve}`,
    lavoro: `Se lavori come dipendente, verifica obblighi, tutele e scadenze. In breve: ${breve}`,
    impresa: `Se hai un'impresa, controlla adempimenti, incentivi e tempi. In breve: ${breve}`,
    studio: `Se studi, verifica borse, agevolazioni e servizi. In breve: ${breve}`,
  };
}

/** Aggiunge `testo`, `semplificata`, `qualita` e `gulpease` a un record. Pura. */
export function enrichLaw(
  law: LawRecordExtra,
  source = "normattiva",
  syncedAt = new Date().toISOString(),
): LawRecordExtra {
  const testo = (law.testo ?? "").trim() || [law.titolo, law.sintesi].filter(Boolean).join(". ");
  const attuativi = law.attuativi ?? { daAdottare: 0, adottati: 0, scaduti: 0 };

  const base = simplifyLaw({
    titolo: law.titolo,
    testo,
    eli: law.eli,
    air: law.air,
    attuativi,
  });
  const semplificata: SimplifiedLaw = {
    ...base,
    perTe: perTePersone(law.sintesi || base.in10Secondi),
  };
  const qualita = scoreQuality({
    testo,
    attuativi,
    air: law.air ?? "assente",
    fiducia: law.fiducia ?? false,
    omnibus: law.omnibus ?? false,
  });

  return {
    ...law,
    testo,
    semplificata,
    qualita: qualita.totale,
    gulpease: semplificata.gulpease,
    source,
    syncedAt,
  };
}

/**
 * Converte un `AttoDto` di Normattiva in un `LawRecordExtra`.
 * Restituisce `null` se manca il titolo o un identificativo utilizzabile.
 */
export function attoToLawRecord(atto: AttoDto): LawRecordExtra | null {
  const titolo = normalizza(atto.titolo || atto.sottoTitolo);
  if (!titolo) return null;

  const nir = atto.urn && parseNIR(atto.urn) ? atto.urn : "";
  const eliDaAtto = atto.eli && atto.eli.startsWith("/") ? atto.eli : "";
  const eli = eliDaAtto || (nir ? eliFromUrn(nir, atto.codiceRedazionale) : "");
  const chiave = eli || atto.urn || [atto.tipo, atto.dataEmanazione, atto.numero].join(":");
  if (!chiave) return null;

  const sintesi = tronca(atto.sottoTitolo || atto.testo || titolo, 600);

  return {
    eli: chiave,
    nir: nir || chiave,
    tipo: atto.tipo || "atto",
    numero: atto.numero || "",
    dataEmanazione: atto.dataEmanazione || "",
    titolo,
    sintesi,
    stato: atto.stato || "in_vigore",
    gulpease: null,
    fonti: eli.startsWith("/eli/") ? { normattiva: `https://www.normattiva.it${eli}` } : null,
    testo: atto.testo || undefined,
    urn: atto.urn || undefined,
    codiceRedazionale: atto.codiceRedazionale || undefined,
  };
}

/* ---------------------------------------------------------------------------
 * Utility interne.
 * ------------------------------------------------------------------------- */

function oggiIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function sottraiGiorni(iso: string, giorni: number): string {
  const data = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(data.getTime())) return iso;
  data.setUTCDate(data.getUTCDate() - giorni);
  return data.toISOString().slice(0, 10);
}

function messaggioDi(cause: unknown): string {
  if (cause && typeof cause === "object" && "message" in cause) {
    const messaggio = (cause as { message?: unknown }).message;
    if (typeof messaggio === "string" && messaggio) return messaggio;
  }
  return String(cause);
}

function nomeFileSicuro(nome: string): string {
  const pulito = nome
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 100);
  return pulito || `collection-${Date.now()}`;
}

/**
 * Anni da interrogare in base a `annoDa`/`annoA`. Se entrambi sono numeri
 * genera l'intervallo (al massimo 30 anni, per evitare walk sterminati);
 * altrimenti usa l'estremo disponibile o `undefined` (nessun filtro).
 */
export function anniDaSelezionare(
  annoDa?: string | number,
  annoA?: string | number,
): (string | number | undefined)[] {
  const da = typeof annoDa === "string" ? Number.parseInt(annoDa, 10) : annoDa;
  const a = typeof annoA === "string" ? Number.parseInt(annoA, 10) : annoA;
  const daNum = typeof da === "number" && Number.isFinite(da) ? da : NaN;
  const aNum = typeof a === "number" && Number.isFinite(a) ? a : NaN;

  if (Number.isFinite(daNum) && Number.isFinite(aNum)) {
    const inizio = Math.min(daNum, aNum);
    const fine = Math.max(daNum, aNum);
    if (fine - inizio > 30) return [annoDa as string | number, annoA as string | number];
    const anni: string[] = [];
    for (let anno = inizio; anno <= fine; anno += 1) anni.push(String(anno));
    return anni;
  }
  if (annoDa !== undefined) return [annoDa];
  if (annoA !== undefined) return [annoA];
  return [undefined];
}

/** Salva uno ZIP bulk su disco. Accetta solo cwd/data o os.tmpdir(), altrimenti ripiega su data/bulk. */
async function salvaZip(zipDir: string, nome: string, bytes: Uint8Array): Promise<string> {
  // Le route API usano sempre DEFAULT_ZIP_DIR; solo CLI/scripts possono passare
  // BULK_DIR validata. Rifiuta traversal e limita a cwd/data oppure os.tmpdir().
  const base = (zipDir || DEFAULT_ZIP_DIR).trim() || DEFAULT_ZIP_DIR;
  const risolta = path.resolve(base);
  const cwd = process.cwd();
  const tmp = path.resolve(process.env.TMPDIR || "/tmp");
  const dentroCwd = risolta === cwd || risolta.startsWith(`${cwd}${path.sep}`);
  const dentroTmp = risolta === tmp || risolta.startsWith(`${tmp}${path.sep}`);
  if (risolta.includes("..") && !dentroCwd && !dentroTmp) {
    throw new Error(`cartella bulk non consentita: ${base}`);
  }
  const cartella = dentroCwd || dentroTmp ? risolta : path.resolve(cwd, DEFAULT_ZIP_DIR);
  await mkdir(cartella, { recursive: true });
  const file = path.join(cartella, `${nomeFileSicuro(nome)}.zip`);
  await writeFile(file, bytes);
  return file;
}

function reportFinale(
  source: SyncReport["source"],
  startedAt: string,
  dati: Omit<SyncReport, "source" | "startedAt" | "finishedAt" | "ok">,
): SyncReport {
  return {
    source,
    ok: dati.errors.length === 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    ...dati,
  };
}

/* ---------------------------------------------------------------------------
 * Pipeline storico.
 * ------------------------------------------------------------------------- */

interface Accumulatore {
  fetched: number;
  simplified: number;
  persisted: number;
  collections: SyncCollectionReport[];
  errors: string[];
  notes: string[];
  leggi: LawRecordExtra[];
}

function accumulatore(): Accumulatore {
  return {
    fetched: 0,
    simplified: 0,
    persisted: 0,
    collections: [],
    errors: [],
    notes: [],
    leggi: [],
  };
}

/**
 * Ingest dello storico: collezioni bulk (opzionali) + ricerca avanzata
 * paginata, con semplificazione automatica. Non fallisce mai: eventuali
 * problemi finiscono in `report.errors`.
 */
export const storicoEffect = (
  options: StoricoSyncOptions = {},
): Effect.Effect<SyncReport, never, Normattiva> =>
  Effect.gen(function* () {
    const startedAt = new Date().toISOString();
    const emit: ProgressListener = options.emit ?? (() => undefined);
    const acc = accumulatore();

    // 1) Inventario delle collezioni predefinite.
    emit({ phase: "collections", message: "Lettura delle collezioni predefinite" });
    const collections = yield* getCollections().pipe(
      Effect.catch((errore) => {
        acc.errors.push(`collections: ${errore.message}`);
        return Effect.succeed<CollectionItem[]>([]);
      }),
    );

    const nomi = options.collezioni ? [...options.collezioni] : [];
    if (nomi.length === 0) {
      acc.notes.push(
        `Archivi non scaricati (${collections.length} collezioni disponibili; passa "collezioni" per isolarne alcune).`,
      );
    } else {
      acc.notes.push(
        `Limite massimo per archivio: ${Math.round(MAX_DOWNLOAD_BYTES / (1024 * 1024))} MB; oltre il limite il download viene interrotto.`,
      );
    }

    // 2) Download degli archivi richiesti (ZIP salvato su disco + inventario).
    for (const nome of nomi) {
      emit({ phase: "download", message: `Download archivio: ${nome}` });
      const archivio = yield* downloadCollection({
        nome,
        formato: "JSON",
        formatoRichiesta: "V",
      }).pipe(
        Effect.catch((errore) => {
          acc.errors.push(`download ${nome}: ${errore.message}`);
          return Effect.succeed(null);
        }),
      );
      if (!archivio) continue;

      let file: string | undefined;
      try {
        file = yield* Effect.promise(() =>
          salvaZip(options.zipDir ?? DEFAULT_ZIP_DIR, nome, archivio.bytes),
        );
      } catch (cause) {
        acc.errors.push(`salvataggio ${nome}: ${messaggioDi(cause)}`);
      }
      acc.collections.push({
        nome,
        entries: archivio.entries.length,
        bytes: archivio.bytes.byteLength,
        file,
      });
      emit({
        phase: "download",
        message: `Archivio ${nome}: ${archivio.entries.length} voci`,
        done: acc.collections.length,
        total: nomi.length,
      });
    }

    // 3) Denominate da cercare.
    let denominazioni: string[] = options.denominazioni ? [...options.denominazioni] : [];
    if (denominazioni.length === 0) {
      const tipologiche = yield* denominazioniAtto().pipe(Effect.catch(() => Effect.succeed([])));
      denominazioni = tipologiche.map((voce) => voce.value).filter(Boolean);
      if (denominazioni.length === 0) denominazioni = [...DEFAULT_DENOMINAZIONI];
    }

    // 4) Ricerca avanzata paginata + semplificazione.
    const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 50;
    const maxPages = options.maxPages && options.maxPages > 0 ? options.maxPages : 5;
    const limit = options.limit && options.limit > 0 ? options.limit : Number.POSITIVE_INFINITY;

    for (const denominazione of denominazioni) {
      if (acc.fetched >= limit) break;
      for (const anno of anniDaSelezionare(options.annoDa, options.annoA)) {
        if (acc.fetched >= limit) break;
        emit({
          phase: "search",
          message: `Ricerca avanzata: ${denominazione}${anno !== undefined ? ` (${anno})` : ""}`,
        });

        const input: RicercaAvanzataInput = {
          denominazioneAtto: denominazione,
          annoProvvedimento: anno,
        };
        const walk: WalkRicercaResult = yield* walkRicercaAvanzata(input, {
          pageSize,
          maxPages,
          onPage: (page, indice) =>
            emit({
              phase: "search",
              message: `${denominazione}: pagina ${indice}`,
              done: acc.fetched,
              total: page.total ?? undefined,
            }),
        }).pipe(
          Effect.catch((errore) => {
            acc.errors.push(`ricerca ${denominazione}: ${errore.message}`);
            return Effect.succeed<WalkRicercaResult>({ items: [], pages: 0, total: null });
          }),
        );

        for (const atto of walk.items) {
          if (acc.fetched >= limit) break;
          const law = attoToLawRecord(atto);
          if (!law) continue;
          acc.leggi.push(enrichLaw(law, "normattiva.storico", startedAt));
          acc.fetched += 1;
          acc.simplified += 1;
        }
      }
    }

    // 5) Persistenza (se richiesta e se il DB e' configurato).
    if (options.persist !== false && acc.leggi.length > 0) {
      emit({ phase: "persist", message: `Salvataggio di ${acc.leggi.length} norme` });
      acc.persisted = yield* Effect.promise(() => persistLaws(acc.leggi));
    }

    yield* Effect.promise(() =>
      recordIngestRun({
        source: "normattiva.storico",
        status: acc.errors.length > 0 ? "error" : "ok",
        detail: `fetch=${acc.fetched}; semplificate=${acc.simplified}; persistite=${acc.persisted}`,
        startedAt: new Date(startedAt),
      }),
    );

    emit({ phase: "done", message: "Sync storico completato", done: acc.fetched });
    return reportFinale("storico", startedAt, {
      fetched: acc.fetched,
      simplified: acc.simplified,
      persisted: acc.persisted,
      collections: acc.collections,
      errors: acc.errors,
      notes: acc.notes,
    });
  });

/* ---------------------------------------------------------------------------
 * Pipeline recente.
 * ------------------------------------------------------------------------- */

/**
 * Ingest degli atti aggiornati in un intervallo (default: ultimi 30 giorni).
 * Per ogni hit recupera il dettaglio, semplifica e salva. Non fallisce mai.
 */
export const recenteEffect = (
  options: RecenteSyncOptions = {},
): Effect.Effect<SyncReport, never, Normattiva> =>
  Effect.gen(function* () {
    const startedAt = new Date().toISOString();
    const emit: ProgressListener = options.emit ?? (() => undefined);
    const acc = accumulatore();

    const al = options.al || oggiIso();
    const dal = options.dal || sottraiGiorni(al, 30);
    const limit = options.limit && options.limit > 0 ? options.limit : Number.POSITIVE_INFINITY;

    emit({ phase: "search", message: `Ricerca aggiornati ${dal} -> ${al}` });
    const hits = yield* ricercaAggiornati({
      dataInizioAggiornamento: dal,
      dataFineAggiornamento: al,
    }).pipe(
      Effect.catch((errore) => {
        acc.errors.push(`aggiornati: ${errore.message}`);
        return Effect.succeed([]);
      }),
    );

    emit({ phase: "detail", message: `${hits.length} atti aggiornati`, total: hits.length });
    for (const hit of hits) {
      if (acc.fetched >= limit) break;
      const urn = hit.urn || hit.codiceRedazionale;
      if (!urn) {
        acc.notes.push(`hit senza URN ignorato (numero ${hit.numeroAtto || "?"})`);
        continue;
      }
      const atto = yield* dettaglioAtto(urn).pipe(
        Effect.catch((errore) => {
          acc.errors.push(`dettaglio ${urn}: ${errore.message}`);
          return Effect.succeed<AttoDto | null>(null);
        }),
      );
      if (!atto) continue;
      const law = attoToLawRecord(atto);
      if (!law) continue;
      acc.leggi.push(enrichLaw(law, "normattiva.recente", startedAt));
      acc.fetched += 1;
      acc.simplified += 1;
    }

    if (options.persist !== false && acc.leggi.length > 0) {
      emit({ phase: "persist", message: `Salvataggio di ${acc.leggi.length} norme` });
      acc.persisted = yield* Effect.promise(() => persistLaws(acc.leggi));
    }

    yield* Effect.promise(() =>
      recordIngestRun({
        source: "normattiva.recente",
        status: acc.errors.length > 0 ? "error" : "ok",
        detail: `intervallo=${dal}..${al}; fetch=${acc.fetched}; persistite=${acc.persisted}`,
        startedAt: new Date(startedAt),
      }),
    );

    emit({ phase: "done", message: "Sync recente completato", done: acc.fetched });
    return reportFinale("recente", startedAt, {
      fetched: acc.fetched,
      simplified: acc.simplified,
      persisted: acc.persisted,
      collections: acc.collections,
      errors: acc.errors,
      notes: acc.notes,
    });
  });

/* ---------------------------------------------------------------------------
 * Runner.
 * ------------------------------------------------------------------------- */

/** Esegue il sync dello storico con il Layer Normattiva di default. */
export function runStoricoSync(
  options: StoricoSyncOptions = {},
  overrides: Partial<NormattivaConfig> = {},
): Promise<SyncReport> {
  return Effect.runPromise(Effect.provide(storicoEffect(options), normattivaLayer(overrides)));
}

/** Esegue il sync del recente con il Layer Normattiva di default. */
export function runRecenteSync(
  options: RecenteSyncOptions = {},
  overrides: Partial<NormattivaConfig> = {},
): Promise<SyncReport> {
  return Effect.runPromise(Effect.provide(recenteEffect(options), normattivaLayer(overrides)));
}
