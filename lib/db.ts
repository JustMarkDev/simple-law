/**
 * Accesso ai dati con fallback automatico al seed.
 *
 * Regola d'oro: nessuna funzione lancia errori. Se `DATABASE_URL` manca, o la
 * query fallisce, si restituiscono i dati seed. Cosi' l'app funziona sempre,
 * anche in anteprima Vercel senza database collegato.
 */

import { Prisma, PrismaClient } from "@prisma/client";
import type { Law as PrismaLaw, Minister as PrismaMinister } from "@prisma/client";
import { normalizeEli, parseNIR } from "./nir";
import { parseAnno, parseQualita, parseQuery, parseTipo } from "./validation";
import { getSeedLaws, getSeedMinisters } from "./sources";
import { buildStats } from "./stats";
import type { CorpusStats, StatLaw } from "./stats";
import type { AirStato, AttuativiInput } from "./quality";
import type { SimplifiedLaw } from "./simplify";
import type { Fonti, LawRecord, MinisterRecord } from "./seed-data";
import { personaRilevanteRecord } from "./filtri-leggi";

/**
 * Campi aggiuntivi memorizzati nel blob `extra` di `Law` e opzionali su
 * `LawRecord`. Sono tutti pass-through: nessuna migrazione di schema.
 */
export interface SyncExtra {
  /** Codice redazionale della Gazzetta Ufficiale (es. `26G00155`). */
  codiceRedazionale?: string;
  /** Data di pubblicazione in Gazzetta (`YYYY-MM-DD`). */
  dataGU?: string;
  /** Numero della Gazzetta Ufficiale. */
  numeroGU?: string;
  /** Identificativo del dossier Camera, se disponibile. */
  cameraId?: string;
  /** Identificativo del dossier Senato, se disponibile. */
  senatoDid?: string;
  /** URN NIR di origine, quando diverso da `nir`. */
  urn?: string;
  /** Sorgente dell'ingest (es. `normattiva.storico`). */
  source?: string;
  /** Timestamp ISO dell'ultimo ingest. */
  syncedAt?: string;
  /** Semplificazione gia' calcolata al momento dell'ingest. */
  semplificata?: SimplifiedLaw;
  /** Punteggio di qualita' complessivo (0-100). */
  qualita?: number;
}

/** `LawRecord` arricchito con i campi extra pass-through. */
export type LawRecordExtra = LawRecord & SyncExtra;

interface PrismaGlobal {
  __simpleLawPrisma?: PrismaClient | null;
}

const prismaGlobal = globalThis as unknown as PrismaGlobal;

/**
 * Restituisce il client Prisma, oppure `null` se `DATABASE_URL` non e' configurato
 * o l'inizializzazione fallisce. Il client viene riusato tra le invocazioni.
 */
export function getPrisma(): PrismaClient | null {
  if (prismaGlobal.__simpleLawPrisma !== undefined) return prismaGlobal.__simpleLawPrisma;

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    prismaGlobal.__simpleLawPrisma = null;
    return null;
  }

  try {
    prismaGlobal.__simpleLawPrisma = new PrismaClient();
  } catch {
    prismaGlobal.__simpleLawPrisma = null;
  }
  return prismaGlobal.__simpleLawPrisma;
}

/** Azzera il singleton (utile nei test). Non lancia. */
export function resetPrisma(): void {
  const client = prismaGlobal.__simpleLawPrisma;
  if (client) {
    void client.$disconnect().catch(() => undefined);
  }
  prismaGlobal.__simpleLawPrisma = undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapFondi(value: unknown): Fonti | null {
  if (!isRecord(value)) return null;
  const fonti: Fonti = {};
  for (const chiave of ["normattiva", "gazzetta", "camera", "senato", "governo"] as const) {
    const v = value[chiave];
    if (typeof v === "string" && v) fonti[chiave] = v;
  }
  return Object.keys(fonti).length > 0 ? fonti : null;
}

const AIR_VALORI: readonly string[] = ["presente", "esente", "semplificata", "assente"];

function stringhe(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function recordDiStringhe(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((v) => typeof v === "string");
}

function coloreStato(value: unknown): value is SimplifiedLaw["statoLavora"]["colore"] {
  return value === "verde" || value === "giallo" || value === "rosso";
}

/** Valida il blob `semplificata` salvato in `extra` (forma di `SimplifiedLaw`). */
export function parseSemplificata(value: unknown): SimplifiedLaw | undefined {
  if (!isRecord(value)) return undefined;
  const stato = value.statoLavora;
  const proContro = value.proContro;
  if (typeof value.in10Secondi !== "string") return undefined;
  if (!recordDiStringhe(value.perTe)) return undefined;
  if (!stringhe(value.cosaFare)) return undefined;
  if (
    !isRecord(stato) ||
    !coloreStato(stato.colore) ||
    typeof stato.motivo !== "string"
  ) {
    return undefined;
  }
  if (
    !isRecord(proContro) ||
    !stringhe(proContro.pro) ||
    !stringhe(proContro.contro)
  ) {
    return undefined;
  }
  if (typeof value.gulpease !== "number" || !Number.isFinite(value.gulpease)) {
    return undefined;
  }
  return {
    in10Secondi: value.in10Secondi,
    perTe: value.perTe,
    cosaFare: value.cosaFare,
    statoLavora: { colore: stato.colore, motivo: stato.motivo },
    proContro: { pro: proContro.pro, contro: proContro.contro },
    gulpease: value.gulpease,
  };
}

function stringaExtra(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Legge i campi arricchiti (air, attuativi, testo, semplificata, ...) dal blob `extra`. Non lancia. */
function mapExtra(value: unknown): Partial<LawRecordExtra> {
  if (!isRecord(value)) return {};
  const extra: Partial<LawRecordExtra> = {};
  if (typeof value.air === "string" && AIR_VALORI.includes(value.air)) {
    extra.air = value.air as AirStato;
  }
  const att = value.attuativi;
  if (
    isRecord(att) &&
    typeof att.daAdottare === "number" &&
    typeof att.adottati === "number" &&
    typeof att.scaduti === "number"
  ) {
    const attuativi: AttuativiInput = {
      daAdottare: att.daAdottare,
      adottati: att.adottati,
      scaduti: att.scaduti,
    };
    extra.attuativi = attuativi;
  }
  if (typeof value.testo === "string" && value.testo) extra.testo = value.testo;
  if (typeof value.fiducia === "boolean") extra.fiducia = value.fiducia;
  if (typeof value.omnibus === "boolean") extra.omnibus = value.omnibus;
  if (typeof value.dimostrativo === "boolean") extra.dimostrativo = value.dimostrativo;

  const codiceRedazionale = stringaExtra(value.codiceRedazionale);
  if (codiceRedazionale) extra.codiceRedazionale = codiceRedazionale;
  const dataGU = stringaExtra(value.dataGU);
  if (dataGU) extra.dataGU = dataGU;
  const numeroGU = stringaExtra(value.numeroGU);
  if (numeroGU) extra.numeroGU = numeroGU;
  const cameraId = stringaExtra(value.cameraId);
  if (cameraId) extra.cameraId = cameraId;
  const senatoDid = stringaExtra(value.senatoDid);
  if (senatoDid) extra.senatoDid = senatoDid;
  const urn = stringaExtra(value.urn);
  if (urn) extra.urn = urn;
  const source = stringaExtra(value.source);
  if (source) extra.source = source;
  const syncedAt = stringaExtra(value.syncedAt);
  if (syncedAt) extra.syncedAt = syncedAt;
  if (typeof value.qualita === "number" && Number.isFinite(value.qualita)) {
    const q = parseQualita(value.qualita);
    if (q !== undefined) extra.qualita = q;
  }
  const semplificata = parseSemplificata(value.semplificata);
  if (semplificata) extra.semplificata = semplificata;

  return extra;
}

/** Converte una riga DB in LawRecord, inclusi i campi arricchiti. Esportata per i test. */
export function mapLaw(row: PrismaLaw): LawRecordExtra {
  return {
    eli: row.eli,
    nir: row.nir,
    tipo: row.tipo,
    numero: row.numero,
    dataEmanazione: row.dataEmanazione.toISOString().slice(0, 10),
    titolo: row.titolo,
    sintesi: row.sintesi,
    stato: row.stato,
    gulpease: row.gulpease ?? null,
    fonti: mapFondi(row.fonti),
    ...mapExtra(row.extra),
  };
}

function mapMinister(row: PrismaMinister, provvedimenti: Map<string, string[]>): MinisterRecord {
  return {
    slug: row.slug,
    nome: row.nome,
    dicastero: row.dicastero,
    partito: row.partito ?? null,
    competenze: row.competenze ?? [],
    provvedimenti: provvedimenti.get(row.slug) ?? [],
  };
}

/** Legge tutte le norme dal DB; se il DB manca o e' vuoto, usa il seed.
 * Con DB popolato il corpus di fallback non viene mai generato (lazy:
 * `getSeedLaws()` e' chiamato solo nel ramo di fallback). Quando il DB e'
 * assente il fallback e' memoizzato 30s (`DB_SEED_CACHE_TTL_MS`) per evitare
 * di rileggere il corpus a ogni request; usare `svuotaCacheDb()` nei test.
 * Il fallback e' real-only di default (solo testi reali); il sintetico
 * richiede opt-in `CORPUS_SINTETICO=1` (vedi `lib/sources.ts`). */
export async function getLawsFromDBorSeed(): Promise<LawRecordExtra[]> {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.law.findMany({ orderBy: { dataEmanazione: "desc" } });
      if (rows.length > 0) return rows.map(mapLaw);
    } catch {
      // fallback al seed
    }
  }
  try {
    const ora = Date.now();
    if (cacheSeedDbAssente && cacheSeedDbAssente.scadeIl > ora) {
      return cacheSeedDbAssente.dati;
    }
  } catch {
    // cache non disponibile: rigenera sotto
  }
  let seed: LawRecordExtra[];
  try {
    seed = getSeedLaws() as LawRecordExtra[];
  } catch {
    // Never-throw: se il seed non e' leggibile, riusa il dato in cache se presente.
    try {
      if (cacheSeedDbAssente) return cacheSeedDbAssente.dati;
    } catch {
      // ignora
    }
    return [];
  }
  try {
    cacheSeedDbAssente = { dati: seed, scadeIl: Date.now() + DB_SEED_CACHE_TTL_MS };
  } catch {
    // ignora errori di cache
  }
  return seed;
}

function candidatiEli(eli: string): string[] {
  const grezzo = (eli ?? "").trim();
  if (!grezzo) return [];
  const path = normalizeEli(grezzo);
  const base = new Set<string>([grezzo, path]);
  if (!path.endsWith("/")) base.add(`${path}/`);
  if (!path.startsWith("/")) base.add(`/${path}`);
  const candidati = new Set<string>();
  for (const voce of base) {
    if (!voce) continue;
    candidati.add(voce);
    candidati.add(voce.toLowerCase());
  }
  return [...candidati];
}

/**
 * Cerca una norma per ELI o NIR. Cerca prima nel DB, poi nel seed.
 * Il confronto ELI e' case-insensitive. Restituisce `null` se non trovata.
 */
export async function getLawByEli(eli: string): Promise<LawRecordExtra | null> {
  const grezzo = (eli ?? "").trim();
  if (!grezzo || grezzo.length > 500) return null;
  const candidati = candidatiEli(grezzo);
  if (candidati.length === 0) return null;
  const nirParts = parseNIR(grezzo);

  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.law.findFirst({
        where: {
          OR: [
            ...candidati.map((candidato) => ({
              eli: { equals: candidato, mode: "insensitive" as const },
            })),
            { eli: { in: candidati } },
            { nir: grezzo },
            ...(nirParts ? [{ nir: candidati[0] ?? grezzo }] : []),
          ],
        },
      });
      if (row) return mapLaw(row);
    } catch {
      // fallback al seed
    }
  }

  const pathCercato = normalizeEli(grezzo).toLowerCase();
  const candidatiLower = new Set(candidati.map((candidato) => candidato.toLowerCase()));
  const leggi = getSeedLaws();
  return (
    leggi.find((law) => candidatiLower.has(law.eli.toLowerCase())) ??
    leggi.find((law) => law.nir === grezzo) ??
    leggi.find((law) => normalizeEli(law.eli).toLowerCase() === pathCercato) ??
    null
  );
}

/** Elenca i ministri dal DB (con provvedimenti dal seed); fallback al seed. */
export async function listMinisters(): Promise<MinisterRecord[]> {
  const prisma = getPrisma();
  const provvedimenti = new Map(getSeedMinisters().map((m) => [m.slug, m.provvedimenti]));
  if (prisma) {
    try {
      const rows = await prisma.minister.findMany({ orderBy: { dicastero: "asc" } });
      if (rows.length > 0) return rows.map((row) => mapMinister(row, provvedimenti));
    } catch {
      // fallback al seed
    }
  }
  return getSeedMinisters();
}

/** Recupera un singolo ministro per slug; `null` se non trovato. */
export async function getMinisterBySlug(slug: string): Promise<MinisterRecord | null> {
  const cercato = (slug ?? "").trim().toLowerCase();
  if (!cercato) return null;
  const ministri = await listMinisters();
  return ministri.find((m) => m.slug.toLowerCase() === cercato) ?? null;
}

/** Prepara i dati per l'upsert Prisma, inclusi i campi arricchiti in `extra`. Esportata per i test.
 * Il testo integrale NON viene mai persistito in `extra` (scala 100GB: evita TOAST
 * explosion): si salvano solo `testoHash`/`lunghezzaTesto` (via `toPrismaScala`
 * nel chiamante o qui se presenti su `law`). Eccezione: testi brevi <=8000
 * caratteri restano in `extra.testo` per retrocompatibilita' con seed/UI. */
export function toPrismaData(law: LawRecordExtra) {
  const data = new Date(`${law.dataEmanazione}T00:00:00Z`);
  const extra: Record<string, unknown> = {};
  if (law.air !== undefined) extra.air = law.air;
  if (law.attuativi !== undefined) extra.attuativi = law.attuativi;
  if (typeof law.testo === "string" && law.testo) {
    if (law.testo.length <= 8000) {
      extra.testo = law.testo;
    } else {
      const scala = toPrismaScala(law);
      if (scala.testoHash !== undefined) extra.testoHash = scala.testoHash;
      if (scala.lunghezzaTesto !== undefined) extra.lunghezzaTesto = scala.lunghezzaTesto;
    }
  }
  if (law.fiducia !== undefined) extra.fiducia = law.fiducia;
  if (law.omnibus !== undefined) extra.omnibus = law.omnibus;
  if (law.dimostrativo !== undefined) extra.dimostrativo = law.dimostrativo;

  const stringheExtra: readonly (keyof SyncExtra)[] = [
    "codiceRedazionale",
    "dataGU",
    "numeroGU",
    "cameraId",
    "senatoDid",
    "urn",
    "source",
    "syncedAt",
  ];
  for (const chiave of stringheExtra) {
    const valore = law[chiave];
    if (typeof valore === "string" && valore) extra[chiave] = valore;
  }
  if (law.qualita !== undefined) extra.qualita = law.qualita;
  if (law.semplificata !== undefined) extra.semplificata = law.semplificata;

  // Colonne scala: sempre valorizzate quando il testo esiste (il testo resta
  // solo su shard; in `extra` solo se breve per retrocompatibilita').
  const scala = toPrismaScala(law);

  return {
    nir: law.nir,
    tipo: law.tipo,
    numero: law.numero,
    dataEmanazione: Number.isNaN(data.getTime()) ? new Date(0) : data,
    titolo: law.titolo,
    sintesi: law.sintesi,
    stato: law.stato,
    gulpease: law.gulpease,
    fonti: law.fonti ? (law.fonti as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
    testoHash: scala.testoHash ?? null,
    lunghezzaTesto: scala.lunghezzaTesto ?? null,
    extra:
      Object.keys(extra).length > 0
        ? (extra as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
  };
}

/** Calcola i campi scala (`testoHash`, `lunghezzaTesto`) dal testo in `extra`. Pura. */
export function toPrismaScala(law: LawRecordExtra): {
  testoHash?: string;
  lunghezzaTesto?: number;
} {
  try {
    const testo = typeof law.testo === "string" ? law.testo : "";
    if (!testo) return {};
    const out: { testoHash?: string; lunghezzaTesto?: number } = {
      lunghezzaTesto: testo.length,
    };
    const hash = sha256Hex(testo);
    if (hash) out.testoHash = hash;
    return out;
  } catch {
    return {};
  }
}

/** Salva/aggiorna un elenco di norme. Restituisce quante ne ha scritte (0 senza DB).
 * Deduplica per ELI e procede in sequenza per non sovraccaricare il pool;
 * il singolo errore non interrompe l'ingest (contratto never-throw). */
export async function persistLaws(laws: LawRecordExtra[]): Promise<number> {
  const prisma = getPrisma();
  if (!prisma || laws.length === 0) return 0;
  const visti = new Set<string>();
  const coda = laws.filter((law) => {
    const chiave = (law.eli ?? "").trim();
    if (!chiave || chiave.length > 500 || visti.has(chiave)) return false;
    visti.add(chiave);
    return true;
  });
  let scritti = 0;
  for (const law of coda) {
    try {
      const data = toPrismaData(law) as unknown as Prisma.LawCreateInput;
      const scala = toPrismaScala(law) as unknown as Partial<Prisma.LawCreateInput>;
      const piena = { ...data, ...scala } as Prisma.LawCreateInput;
      const update = { ...data, ...scala } as Prisma.LawUpdateInput;
      await prisma.law.upsert({
        where: { eli: law.eli },
        create: { ...piena, eli: law.eli },
        update,
      });
      scritti += 1;
    } catch {
      // salta la singola norma senza interrompere l'ingest
    }
  }
  return scritti;
}

/**
 * Persist batch per import 100GB: chunk da 500 con `createMany(skipDuplicates)`.
 * Deduplica per ELI, scrive chunk in sequenza, mai lancia (restituisce scritti).
 * Nota: `createMany` non aggiorna i duplicati; per l'upsert usare `persistLaws`.
 */
export async function persistLawsBatched(
  laws: readonly LawRecordExtra[],
  batchSize = BATCH_PERSIST_SIZE,
): Promise<number> {
  const prisma = getPrisma();
  if (!prisma || laws.length === 0) return 0;
  try {
    const visti = new Set<string>();
    const coda = laws.filter((law) => {
      const chiave = (law.eli ?? "").trim();
      if (!chiave || chiave.length > 500 || visti.has(chiave)) return false;
      visti.add(chiave);
      return true;
    });
    if (coda.length === 0) return 0;
    let scritti = 0;
    for (const gruppo of chunk(coda, batchSize)) {
      try {
        const righe = gruppo.map((law) => ({
          eli: law.eli,
          ...(toPrismaData(law) as unknown as Record<string, unknown>),
          ...toPrismaScala(law),
        }));
        const res = await prisma.law.createMany({
          data: righe as unknown as Prisma.LawCreateManyInput[],
          skipDuplicates: true,
        });
        scritti += res.count;
      } catch {
        // fallback per-chunk a upsert sequenziale senza interrompere
        for (const law of gruppo) {
          try {
            const data = toPrismaData(law) as unknown as Prisma.LawCreateInput;
            await prisma.law.upsert({
              where: { eli: law.eli },
              create: { ...data, eli: law.eli },
              update: data as unknown as Prisma.LawUpdateInput,
            });
            scritti += 1;
          } catch {
            // salta singola
          }
        }
      }
    }
    return scritti;
  } catch {
    return 0;
  }
}

/* ---------------------------------------------------------------------------
 * Query, paginazione e statistiche.
 * ------------------------------------------------------------------------- */

export type LawSort =
  | "data_desc"
  | "data_asc"
  | "titolo_asc"
  | "gulpease_desc"
  | "qualita_desc"
  | "rilevanza";

export interface LawFilters {
  q?: string;
  tipo?: string;
  anno?: string | number;
  /** Filtro esatto su `stato` (es. `in_vigore`). Case-insensitive, max 60 char. */
  stato?: string;
  /** Soglia minima di leggibilita' Gulpease (incluso). */
  minGulpease?: number | string;
  /**
   * Persona di riferimento (`guida|lavoro|impresa|studio|tutti|""`).
   * Derivata, non colonna DB: si applica sempre in memoria e non viene
   * mai ignorata.
   */
  persona?: string;
}

export interface ListLawsParams extends LawFilters {
  page?: number;
  per?: number;
  sort?: LawSort;
}

export interface ListLawsResult {
  items: LawRecordExtra[];
  total: number;
  page: number;
  per: number;
}

export const MAX_PER_PAGE = 200;

/** Dimensione chunk per persist/import batch (scala 100GB, `createMany` 500). */
export const BATCH_PERSIST_SIZE = 500;

/** Take massimo per pagina a cursore (`cursor=eli,take<=500`). */
export const CURSOR_TAKE_MAX = 500;

/** TTL cache in-memory per `getStats` (60s, LRU a singola chiave). */
export const STATS_CACHE_TTL_MS = 60_000;

/**
 * TTL memo-cache per il fallback seed di `getLawsFromDBorSeed` (30s).
 * Evita di rileggere il corpus di fallback a ogni request quando il DB
 * e' assente/vuoto. Con DB popolato il fallback non viene mai generato (lazy).
 */
export const DB_SEED_CACHE_TTL_MS = 30_000;

let cacheSeedDbAssente: { dati: LawRecordExtra[]; scadeIl: number } | null = null;

/**
 * Azzera la memo-cache del fallback seed (utile nei test). Non lancia.
 * Da usare nei test dopo `resetPrisma()` per isolare le rigenerazioni.
 */
export function svuotaCacheDb(): void {
  cacheSeedDbAssente = null;
}

/** Soglia oltre la quale `qualita_desc` usa fallback `data_desc` su DB (no full-scan). */
export const QUALITA_FALLBACK_SOGLIA = 1000;

/**
 * Tetto bounded per l'estratto persona su DB (prime 10000 schede).
 * Con `persona` attiva il totale è calcolato su questo estratto e la nota
 * UI `(calcolato sulle prime 10000 schede)` va mostrata oltre soglia.
 */
export const PERSONA_ESTRATTO_MAX = 10000;

interface FiltriNormalizzati {
  q: string;
  tipo: string;
  anno: string;
  stato: string;
  minGulpease: number | undefined;
  persona: string;
}

/**
 * Normalizza la persona (`trim+lower+slice(0,60)`); allowlist
 * `guida|lavoro|impresa|studio|tutti|""`, altro → `""`. Pura, mai lancia.
 */
export function parsePersona(value: unknown): string {
  try {
    const s = String(value ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 60);
    if (!s || s === "tutti") return s;
    if (s === "guida" || s === "lavoro" || s === "impresa" || s === "studio") return s;
    return "";
  } catch {
    return "";
  }
}

function parseStato(value: unknown): string {
  if (typeof value !== "string") return "";
  const s = value.trim().toLowerCase().slice(0, 60);
  // Allowlist leggera: lettere, numeri, trattini e underscore (stati canonici).
  if (!s || !/^[a-z0-9_-]+$/.test(s)) return "";
  return s;
}

function parseMinGulpease(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value.trim()) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  if (n <= 0) return undefined;
  return Math.min(100, n);
}

function normalizzaFiltri(filters: LawFilters): FiltriNormalizzati {
  // `q`: min 2 char (fallback ILIKE sotto), max 200 char anti-abuso.
  const grezzo = parseQuery(filters.q ?? "");
  const qTroncata = grezzo.slice(0, 200).toLowerCase();
  const q = qTroncata.length >= 2 ? qTroncata : "";
  return {
    q,
    tipo: parseTipo(filters.tipo ?? ""),
    anno: parseAnno(filters.anno),
    stato: parseStato(filters.stato),
    minGulpease: parseMinGulpease(filters.minGulpease),
    persona: parsePersona((filters as LawFilters)?.persona ?? ""),
  };
}

/** Campi testuali usati dal fallback di ricerca. Esportata per compat/test. */
export function testiRicerca(law: LawRecordExtra): string[] {
  return (["titolo", "sintesi", "numero", "tipo", "nir", "eli"] as const)
    .map((campo) => law[campo])
    .filter((campo): campo is string => typeof campo === "string")
    .map((campo) => campo.toLowerCase());
}

/* ---------------------------------------------------------------------------
 * Ranking BM25-lite in memoria (fallback quando il DB e' assente).
 * Pesi: titolo 3 > sintesi 2 > numero/tipo/nir/eli 1; frase esatta con
 * virgolette vale doppio. Pura, mai lancia.
 * ------------------------------------------------------------------------- */

/** Estrae termini e frasi esatte (`"..."`) da una query normalizzata. */
export function estraiTermini(q: string): { termini: string[]; frasi: string[] } {
  try {
    const testo = (q ?? "").toLowerCase();
    const frasi: string[] = [];
    const senzaFrasi = testo.replace(/"([^"]{2,200})"/g, (_, f: string) => {
      frasi.push(f.trim());
      return " ";
    });
    const termini = senzaFrasi
      .split(/[^a-z0-9à-ÿ]+/i)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
      .slice(0, 20);
    return { termini, frasi: frasi.filter((f) => f.length >= 2).slice(0, 5) };
  } catch {
    return { termini: [], frasi: [] };
  }
}

/**
 * Punteggio di rilevanza BM25-lite: titolo>sintesi>numero/tipo/nir/eli.
 * Restituisce 0 se nessun termine/frase corrisponde.
 */
export function punteggioRilevanza(law: LawRecordExtra, q: string): number {
  try {
    const { termini, frasi } = estraiTermini(q);
    if (termini.length === 0 && frasi.length === 0) return 0;
    const titolo = (law.titolo ?? "").toLowerCase();
    const sintesi = (law.sintesi ?? "").toLowerCase();
    const numero = String(law.numero ?? "").toLowerCase();
    const tipo = String(law.tipo ?? "").toLowerCase();
    const nir = String(law.nir ?? "").toLowerCase();
    const eli = String(law.eli ?? "").toLowerCase();
    let punti = 0;
    for (const frase of frasi) {
      if (titolo.includes(frase)) punti += 6;
      if (sintesi.includes(frase)) punti += 4;
      if (numero.includes(frase) || tipo.includes(frase) || nir.includes(frase)) punti += 2;
    }
    for (const t of termini) {
      if (titolo.includes(t)) punti += 3;
      if (sintesi.includes(t)) punti += 2;
      if (numero.includes(t)) punti += 1;
      if (tipo.includes(t)) punti += 1;
      if (nir.includes(t) || eli.includes(t)) punti += 1;
    }
    return punti;
  } catch {
    return 0;
  }
}

/** Ordina per rilevanza BM25-lite (a parita': data desc, poi ELI). Pura. */
export function ordinaPerRilevanza(
  items: LawRecordExtra[],
  q: string,
): LawRecordExtra[] {
  const righe = items
    .map((law) => ({ law, punti: punteggioRilevanza(law, q) }))
    .filter((r) => r.punti > 0);
  righe.sort(
    (a, b) =>
      b.punti - a.punti ||
      b.law.dataEmanazione.localeCompare(a.law.dataEmanazione) ||
      a.law.eli.localeCompare(b.law.eli),
  );
  return righe.map((r) => r.law);
}

/** Verifica se una norma soddisfa `q`, `tipo`, `anno`, `stato`, `minGulpease` e `persona`. Pura. */
export function matchesFilters(law: LawRecordExtra, filters: LawFilters): boolean {
  const { q, tipo, anno, stato, minGulpease, persona } = normalizzaFiltri(filters);
  if (tipo && law.tipo.toLowerCase() !== tipo) {
    // Compat seed: confronto esatto, con fallback `includes` per valori legacy.
    if (!law.tipo.toLowerCase().includes(tipo)) return false;
  }
  if (anno && !law.dataEmanazione.startsWith(anno)) return false;
  if (stato && (law.stato ?? "").toLowerCase() !== stato) return false;
  if (minGulpease !== undefined && !((law.gulpease ?? -1) >= minGulpease)) return false;
  if (persona && persona !== "tutti") {
    try {
      if (!personaRilevanteRecord(law, persona)) return false;
    } catch {
      return false;
    }
  }
  if (q) {
    const { termini, frasi } = estraiTermini(q);
    // Senza termini validi (es. query <2 char) non filtrare: fallback ILIKE del chiamante.
    if (termini.length === 0 && frasi.length === 0) return true;
    if (punteggioRilevanza(law, q) <= 0) return false;
  }
  return true;
}

/** Ordina una lista di norme secondo `sort`. Pura (restituisce una copia). */
export function sortLaws(
  items: LawRecordExtra[],
  sort: LawSort = "data_desc",
  q = "",
): LawRecordExtra[] {
  const copia = [...items];
  switch (sort) {
    case "data_asc":
      copia.sort(
        (a, b) => a.dataEmanazione.localeCompare(b.dataEmanazione) || a.eli.localeCompare(b.eli),
      );
      break;
    case "titolo_asc":
      copia.sort((a, b) => a.titolo.localeCompare(b.titolo, "it") || a.eli.localeCompare(b.eli));
      break;
    case "gulpease_desc":
      copia.sort(
        (a, b) => (b.gulpease ?? -1) - (a.gulpease ?? -1) || a.eli.localeCompare(b.eli),
      );
      break;
    case "qualita_desc":
      copia.sort((a, b) => (b.qualita ?? -1) - (a.qualita ?? -1) || a.eli.localeCompare(b.eli));
      break;
    case "rilevanza": {
      const ordinate = ordinaPerRilevanza(copia, q);
      // Se la query non produce punteggio, mantieni l'ordine cronologico.
      if (ordinate.length > 0) return ordinate;
      copia.sort(
        (a, b) => b.dataEmanazione.localeCompare(a.dataEmanazione) || a.eli.localeCompare(b.eli),
      );
      break;
    }
    case "data_desc":
    default:
      copia.sort(
        (a, b) => b.dataEmanazione.localeCompare(a.dataEmanazione) || a.eli.localeCompare(b.eli),
      );
  }
  return copia;
}

function wherePrisma(filters: LawFilters): Prisma.LawWhereInput {
  // `persona` è derivata (non colonna DB): viene IGNORATA qui e applicata
  // in memoria sul percorso bounded (Caso C). Mai aggiungerla al `where`.
  const { q, tipo, anno, stato, minGulpease } = normalizzaFiltri(filters);
  const where: Prisma.LawWhereInput = {};
  // `equals` (non `contains`) per usare gli indici su `tipo`/`stato`.
  if (tipo) where.tipo = { equals: tipo, mode: "insensitive" };
  if (stato) where.stato = { equals: stato, mode: "insensitive" };
  if (minGulpease !== undefined) where.gulpease = { gte: minGulpease };
  if (anno) {
    where.dataEmanazione = {
      gte: new Date(`${anno}-01-01T00:00:00.000Z`),
      lt: new Date(`${Number(anno) + 1}-01-01T00:00:00.000Z`),
    };
  }
  if (q) {
    where.OR = [
      { titolo: { contains: q, mode: "insensitive" } },
      { sintesi: { contains: q, mode: "insensitive" } },
      { numero: { contains: q, mode: "insensitive" } },
      { tipo: { contains: q, mode: "insensitive" } },
      { nir: { contains: q, mode: "insensitive" } },
      { eli: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

function orderByPrisma(sort: LawSort): Prisma.LawOrderByWithRelationInput[] {
  switch (sort) {
    case "data_asc":
      return [{ dataEmanazione: "asc" }, { eli: "asc" }];
    case "titolo_asc":
      return [{ titolo: "asc" }, { eli: "asc" }];
    case "gulpease_desc":
      return [{ gulpease: "desc" }, { eli: "asc" }];
    case "rilevanza":
      // Ranking `ts_rank` nel layer API/SQL dedicato; qui fallback cronologico
      // indicizzato (l'ordinamento BM25-lite vive nel fallback in memoria).
      return [{ dataEmanazione: "desc" }, { eli: "asc" }];
    case "qualita_desc":
      // `qualita` vive in `extra` JSON: fallback indicizzato, mai full-scan.
      return [{ dataEmanazione: "desc" }, { eli: "asc" }];
    case "data_desc":
    default:
      return [{ dataEmanazione: "desc" }, { eli: "asc" }];
  }
}

/* ---------------------------------------------------------------------------
 * Chunk / batch / cursore (scala 100GB). Tutti never-throw.
 * ------------------------------------------------------------------------- */

/** Divide un elenco in chunk da `size` (default 500). Pura. */
export function chunk<T>(items: readonly T[], size = BATCH_PERSIST_SIZE): T[][] {
  const n = Math.min(5000, Math.max(1, Math.floor(size) || BATCH_PERSIST_SIZE));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/** Calcola un'impronta esadecimale stabile in modo sincrono; `null` se non calcolabile.
 * Puro JS (niente `node:crypto`): funziona anche nel bundle client (LawCard ->
 * seed-fallback -> db). Non e' uno SHA-256 crittografico ma e' deterministico
 * e sufficiente come `testoHash` per dedup/soglie su scala 100GB. */
export function sha256Hex(testo: string): string | null {
  try {
    if (typeof testo !== "string" || !testo) return null;
    // cyrb53 x2 per 128 bit, espanso a 64 char per compat con SHA-256 hex.
    const cyrb = (str: string, seed: number): number => {
      let h1 = 0xdeadbeef ^ seed;
      let h2 = 0x41c6ce57 ^ seed;
      for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      return 4294967296 * (2097151 & h2) + (h1 >>> 0);
    };
    const a = cyrb(testo, 0x1234).toString(16).padStart(14, "0");
    const b = cyrb(testo, 0xabcd).toString(16).padStart(14, "0");
    const c = cyrb(`${testo.length}:${testo.slice(0, 512)}`, 0x55aa).toString(16).padStart(14, "0");
    const d = cyrb(`${testo.slice(-512)}:${testo.length}`, 0x77ee).toString(16).padStart(14, "0");
    return `${a}${b}${c}${d}`.slice(0, 64).padEnd(64, "0");
  } catch {
    return null;
  }
}

export interface CursorParams extends LawFilters {
  /** Cursore opaco `dataEmanazione|eli` (o ELI semplice per compat). */
  cursor?: string;
  take?: number;
  sort?: LawSort;
}

export interface CursorResult {
  items: LawRecordExtra[];
  nextCursor: string | null;
  take: number;
}

/** Codifica il cursore `(dataEmanazione, eli)`. Pura, mai lancia. */
export function encodeCursor(dataEmanazione: string, eli: string): string {
  try {
    return Buffer.from(`${dataEmanazione}|${eli}`, "utf8").toString("base64url");
  } catch {
    return "";
  }
}

/** Decodifica il cursore; accetta anche ELI grezzo per compat. Pura. */
export function decodeCursor(cursor: string): { data: string; eli: string } | null {
  const grezzo = (cursor ?? "").trim();
  if (!grezzo) return null;
  try {
    const dec = Buffer.from(grezzo, "base64url").toString("utf8");
    const sep = dec.indexOf("|");
    if (sep > 0) {
      const data = dec.slice(0, sep);
      const eli = dec.slice(sep + 1);
      if (/^\d{4}-\d{2}-\d{2}$/.test(data) && eli) return { data, eli };
    }
  } catch {
    // continua con fallback ELI grezzo
  }
  if (grezzo.length <= 500) return { data: "", eli: grezzo };
  return null;
}

/** Carica l'intero corpus dal DB (se popolato) oppure dal seed. Non lancia. */
async function caricaBase(): Promise<LawRecordExtra[]> {
  return getLawsFromDBorSeed();
}

/**
 * Elenca le norme con filtri, ordinamento e paginazione. Usa il DB quando
 * disponibile e popolato; altrimenti filtra il seed in memoria. Non lancia.
 *
 * Ottimizzata 100k+: `count`+`take` server-side (mai full-scan); `rilevanza`
 * riusa ILIKE indicizzato + ranking BM25-lite sulla pagina; `qualita_desc`
 * oltre 1000 righe usa fallback `data_desc` indicizzato.
 *
 * REGOLA MAI-IGNORARE (Caso C): con `persona` impostata e DB popolato si usa
 * un estratto bounded (`where` senza persona, `orderBy:data_desc`,
 * `take<=PERSONA_ESTRATTO_MAX`), poi filtro in memoria con
 * `personaRilevanteRecord` (+ `matchesFilters` per `q`), ordinamento e
 * paginazione; `total` coerente con le filtrate. Limite documentato: il
 * totale è calcolato sulle prime 10000 schede.
 */
export async function listLaws(params: ListLawsParams = {}): Promise<ListLawsResult> {
  const page = Math.min(10000, Math.max(1, Math.floor(params.page ?? 1) || 1));
  const perRichiesti = Math.floor(params.per ?? 20) || 20;
  const per = Math.min(MAX_PER_PAGE, Math.max(1, perRichiesti));
  const sort = params.sort ?? "data_desc";
  const qNorm = parseQuery(params.q ?? "").slice(0, 200);
  const personaNorm = parsePersona((params as LawFilters)?.persona ?? "");

  // CASO C: DB con persona → estratto bounded + filtro in memoria (mai full-scan).
  if (personaNorm && personaNorm !== "tutti") {
    try {
      const prisma = getPrisma();
      if (prisma) {
        const totaleDb = await prisma.law.count().catch(() => 0);
        if (totaleDb > 0) {
          const whereSenzaPersona = wherePrisma({ ...params, persona: "" });
          const estratto = await prisma.law.findMany({
            where: whereSenzaPersona,
            orderBy: [{ dataEmanazione: "desc" }, { eli: "asc" }],
            take: PERSONA_ESTRATTO_MAX,
          });
          const filtrateBase = estratto
            .map(mapLaw)
            .filter((law) => matchesFilters(law, params));
          let ordinate: LawRecordExtra[];
          if (sort === "rilevanza") {
            if (qNorm.length >= 2) {
              const ranked = ordinaPerRilevanza(filtrateBase, qNorm.toLowerCase());
              ordinate =
                ranked.length > 0
                  ? ranked
                  : sortLaws(filtrateBase, "data_desc", qNorm.toLowerCase());
            } else {
              ordinate = sortLaws(filtrateBase, "data_desc", qNorm.toLowerCase());
            }
          } else {
            ordinate = sortLaws(filtrateBase, sort, qNorm.toLowerCase());
          }
          const inizio = (page - 1) * per;
          return {
            items: ordinate.slice(inizio, inizio + per),
            total: ordinate.length,
            page,
            per,
          };
        }
      }
    } catch {
      // fallback al Caso A (seed) sotto
    }
    // CASO A con persona: seed in memoria (mai lancia).
    try {
      const laws = await caricaBase();
      const filtrate = (() => {
        const candidati = laws.filter((law) => matchesFilters(law, params));
        if (sort === "rilevanza") {
          if (qNorm.length >= 2) {
            const ordinati = ordinaPerRilevanza(candidati, qNorm.toLowerCase());
            return ordinati.length > 0
              ? ordinati
              : sortLaws(candidati, "data_desc", qNorm.toLowerCase());
          }
          return sortLaws(candidati, "data_desc", qNorm.toLowerCase());
        }
        return sortLaws(candidati, sort, qNorm.toLowerCase());
      })();
      const inizio = (page - 1) * per;
      return {
        items: filtrate.slice(inizio, inizio + per),
        total: filtrate.length,
        page,
        per,
      };
    } catch {
      return { items: [], total: 0, page, per };
    }
  }

  // `qualita` vive nel blob JSON: oltre la soglia si usa il fallback indicizzato.
  const serveQualitaInMemoria = sort === "qualita_desc";
  const serveRilevanza = sort === "rilevanza";

  if (!serveQualitaInMemoria || serveRilevanza) {
    const prisma = getPrisma();
    if (prisma) {
      try {
        const totaleDb = await prisma.law.count();
        if (totaleDb > 0) {
          const where = wherePrisma(params);
          if (serveRilevanza && qNorm.length >= 2) {
            // Candidati bounded dal principio (pagina 1..N) poi ranking globale:
            // evita di perdere i top globali quando page>1 (fix P0 revisione).
            const finestra = Math.min(1000, Math.max(per, page * per * 5));
            const candidati = await prisma.law.findMany({
              where,
              orderBy: orderByPrisma("data_desc"),
              skip: 0,
              take: finestra,
            });
            const ordinati = ordinaPerRilevanza(
              candidati.map(mapLaw),
              qNorm.toLowerCase(),
            );
            const total = await prisma.law.count({ where });
            const inizio = (page - 1) * per;
            return { items: ordinati.slice(inizio, inizio + per), total, page, per };
          }
          const [total, rows] = await Promise.all([
            prisma.law.count({ where }),
            prisma.law.findMany({
              where,
              orderBy: orderByPrisma(sort),
              skip: (page - 1) * per,
              take: per,
            }),
          ]);
          return { items: rows.map(mapLaw), total, page, per };
        }
      } catch {
        // fallback al seed
      }
    }
  } else {
    // `qualita_desc`: evita full-scan oltre soglia con fallback `data_desc`.
    const prisma = getPrisma();
    if (prisma) {
      try {
        const totaleDb = await prisma.law.count();
        if (totaleDb > QUALITA_FALLBACK_SOGLIA) {
          const where = wherePrisma(params);
          const [total, rows] = await Promise.all([
            prisma.law.count({ where }),
            prisma.law.findMany({
              where,
              orderBy: orderByPrisma("data_desc"),
              skip: (page - 1) * per,
              take: per,
            }),
          ]);
          return { items: rows.map(mapLaw), total, page, per };
        }
      } catch {
        // continua con ordinamento in memoria sotto
      }
    }
  }

  const laws = await caricaBase();
  const filtrate =
    sort === "rilevanza"
      ? (() => {
          const candidati = laws.filter((law) => matchesFilters(law, params));
          const ordinati = ordinaPerRilevanza(candidati, qNorm.toLowerCase());
          return ordinati.length > 0 ? ordinati : sortLaws(candidati, "data_desc");
        })()
      : sortLaws(
          laws.filter((law) => matchesFilters(law, params)),
          sort,
          qNorm.toLowerCase(),
        );
  const inizio = (page - 1) * per;
  return { items: filtrate.slice(inizio, inizio + per), total: filtrate.length, page, per };
}

/**
 * Paginazione a cursore `(dataEmanazione, eli)` per corpus 100k+.
 * `take<=500`, `nextCursor` opaco `base64url(data|eli)`. Never-throw.
 *
 * REGOLA MAI-IGNORARE (Caso C): con `persona` impostata e DB popolato si usa
 * un estratto bounded (`where` senza persona, `orderBy:data_desc`,
 * `take<=PERSONA_ESTRATTO_MAX`), poi filtro in memoria e cursore sulla lista
 * filtrata. Limite documentato: prime 10000 schede.
 */
export async function listLawsCursor(params: CursorParams = {}): Promise<CursorResult> {
  const takeRichiesto = Math.floor(params.take ?? 50) || 50;
  const take = Math.min(CURSOR_TAKE_MAX, Math.max(1, takeRichiesto));
  const sort = params.sort ?? "data_desc";
  const cursore = decodeCursor(params.cursor ?? "");
  const personaNorm = parsePersona((params as LawFilters)?.persona ?? "");
  // CASO C: DB con persona → estratto bounded + filtro in memoria.
  if (personaNorm && personaNorm !== "tutti") {
    try {
      const prismaPersona = getPrisma();
      if (prismaPersona) {
        const totaleDb = await prismaPersona.law.count().catch(() => 0);
        if (totaleDb > 0) {
          const whereSenzaPersona = wherePrisma({ ...params, persona: "" });
          const estratto = await prismaPersona.law.findMany({
            where: whereSenzaPersona,
            orderBy: [{ dataEmanazione: "desc" }, { eli: "asc" }],
            take: PERSONA_ESTRATTO_MAX,
          });
          const filtrateBase = estratto
            .map(mapLaw)
            .filter((law) => matchesFilters(law, params));
          let ordinate: LawRecordExtra[];
          if (sort === "rilevanza") {
            const qNorm = parseQuery(params.q ?? "").slice(0, 200).toLowerCase();
            if (qNorm.length >= 2) {
              const ranked = ordinaPerRilevanza(filtrateBase, qNorm);
              ordinate =
                ranked.length > 0
                  ? ranked
                  : sortLaws(filtrateBase, "data_desc", qNorm);
            } else {
              ordinate = sortLaws(filtrateBase, "data_desc", qNorm);
            }
          } else {
            ordinate = sortLaws(
              filtrateBase,
              sort,
              parseQuery(params.q ?? "").slice(0, 200).toLowerCase(),
            );
          }
          let inizio = 0;
          if (cursore?.eli) {
            const idx = ordinate.findIndex((l) => l.eli === cursore.eli);
            if (idx >= 0) inizio = idx + 1;
          }
          const pagina = ordinate.slice(inizio, inizio + take);
          const ultima = pagina[pagina.length - 1];
          const haAltre = inizio + take < ordinate.length && ultima;
          return {
            items: pagina,
            nextCursor: haAltre
              ? encodeCursor(ultima.dataEmanazione.slice(0, 10), ultima.eli)
              : null,
            take,
          };
        }
      }
    } catch {
      // fallback al Caso A (seed) sotto
    }
    try {
      const laws = await caricaBase().catch(() => getSeedLaws());
      const qNormPersona = parseQuery(params.q ?? "").slice(0, 200).toLowerCase();
      const ordinatePersona =
        sort === "rilevanza"
          ? (() => {
              const candidati = laws.filter((law) => matchesFilters(law, params));
              const ranked =
                qNormPersona.length >= 2
                  ? ordinaPerRilevanza(candidati, qNormPersona)
                  : [];
              return ranked.length > 0 ? ranked : sortLaws(candidati, "data_desc");
            })()
          : sortLaws(
              laws.filter((law) => matchesFilters(law, params)),
              sort,
            );
      let inizioPersona = 0;
      if (cursore?.eli) {
        const idx = ordinatePersona.findIndex((l) => l.eli === cursore.eli);
        if (idx >= 0) inizioPersona = idx + 1;
      }
      const paginaPersona = ordinatePersona.slice(inizioPersona, inizioPersona + take);
      const ultimaPersona = paginaPersona[paginaPersona.length - 1];
      const haAltrePersona =
        inizioPersona + take < ordinatePersona.length && ultimaPersona;
      return {
        items: paginaPersona,
        nextCursor: haAltrePersona
          ? encodeCursor(
              ultimaPersona.dataEmanazione.slice(0, 10),
              ultimaPersona.eli,
            )
          : null,
        take,
      };
    } catch {
      return { items: [], nextCursor: null, take };
    }
  }
  try {
    const prisma = getPrisma();
    if (prisma) {
      const totaleDb = await prisma.law.count().catch(() => 0);
      if (totaleDb > 0) {
        const whereBase = wherePrisma(params);
        const discendente = sort !== "data_asc" && sort !== "titolo_asc";
        // Cursore solo per ordinamenti cronologici (indice dedicato); gli altri
        // usano OFFSET bounded su take.
        if ((sort === "data_desc" || sort === "data_asc") && cursore?.data) {
          const dataCursore = new Date(`${cursore.data}T00:00:00.000Z`);
          const valida = !Number.isNaN(dataCursore.getTime());
          const where: Prisma.LawWhereInput = valida
            ? {
                AND: [
                  whereBase,
                  {
                    OR: [
                      {
                        dataEmanazione: discendente
                          ? { lt: dataCursore }
                          : { gt: dataCursore },
                      },
                      {
                        AND: [
                          { dataEmanazione: { equals: dataCursore } },
                          discendente
                            ? { eli: { gt: cursore.eli } }
                            : { eli: { lt: cursore.eli } },
                        ],
                      },
                    ],
                  },
                ],
              }
            : whereBase;
          const rows = await prisma.law.findMany({
            where,
            orderBy: orderByPrisma(sort),
            take: take + 1,
          });
          const pagina = rows.slice(0, take);
          const ultima = pagina[pagina.length - 1];
          const hasNext = rows.length > take && ultima;
          const items = pagina.map(mapLaw);
          return {
            items,
            nextCursor:
              hasNext && ultima
                ? encodeCursor(
                    ultima.dataEmanazione.toISOString().slice(0, 10),
                    ultima.eli,
                  )
                : null,
            take,
          };
        }
        // Fallback OFFSET bounded per sort non-cronologici o cursore ELI grezzo.
        let skip = 0;
        if (cursore?.eli) {
          try {
            const base = await prisma.law.findMany({
              where: whereBase,
              orderBy: orderByPrisma(sort === "rilevanza" ? "data_desc" : sort),
              take: Math.min(10000, totaleDb),
              select: { eli: true },
            });
            const idx = base.findIndex((r) => r.eli === cursore.eli);
            if (idx >= 0) skip = idx + 1;
          } catch {
            skip = 0;
          }
        }
        if (skip > 10000 - take) skip = Math.max(0, 10000 - take);
        const rows = await prisma.law.findMany({
          where: whereBase,
          orderBy: orderByPrisma(sort === "rilevanza" ? "data_desc" : sort),
          skip,
          take: take + 1,
        });
        let items = rows.slice(0, take).map(mapLaw);
        if (sort === "rilevanza") {
          const qNorm = parseQuery(params.q ?? "").slice(0, 200).toLowerCase();
          if (qNorm.length >= 2) {
            const ordinati = ordinaPerRilevanza(items, qNorm);
            if (ordinati.length > 0) items = ordinati;
          }
        }
        const ultima = rows[take - 1];
        return {
          items,
          nextCursor:
            rows.length > take && ultima
              ? encodeCursor(
                  ultima.dataEmanazione.toISOString().slice(0, 10),
                  ultima.eli,
                )
              : null,
          take,
        };
      }
    }
  } catch {
    // fallback in memoria sotto
  }
  // Fallback in memoria (seed): slice bounded, mai full-scan oltre 10k.
  const laws = await caricaBase().catch(() => getSeedLaws());
  const ordinate =
    sort === "rilevanza"
      ? (() => {
          const qNorm = parseQuery(params.q ?? "").slice(0, 200).toLowerCase();
          const candidati = laws.filter((law) => matchesFilters(law, params));
          const ranked = qNorm.length >= 2 ? ordinaPerRilevanza(candidati, qNorm) : [];
          return ranked.length > 0 ? ranked : sortLaws(candidati, "data_desc");
        })()
      : sortLaws(
          laws.filter((law) => matchesFilters(law, params)),
          sort,
        );
  let inizio = 0;
  if (cursore?.eli) {
    const idx = ordinate.findIndex((l) => l.eli === cursore.eli);
    if (idx >= 0) inizio = idx + 1;
    else if (cursore.data) {
      const idxData = ordinate.findIndex((l) =>
        sort === "data_asc"
          ? l.dataEmanazione > cursore.data ||
            (l.dataEmanazione === cursore.data && l.eli < cursore.eli)
          : l.dataEmanazione < cursore.data ||
            (l.dataEmanazione === cursore.data && l.eli > cursore.eli),
      );
      if (idxData >= 0) inizio = idxData;
    }
  }
  const pagina = ordinate.slice(inizio, inizio + take);
  const ultima = pagina[pagina.length - 1];
  return {
    items: pagina,
    nextCursor: ultima ? encodeCursor(ultima.dataEmanazione.slice(0, 10), ultima.eli) : null,
    take,
  };
}

/**
 * Itera il corpus a batch (default 500) via cursore, per export/import 100GB
 * senza caricare tutto in memoria. Generatore async, never-throw (si ferma
 * in caso di errore o cursore nullo).
 */
export async function* streamLaws(
  filters: LawFilters = {},
  batchSize = BATCH_PERSIST_SIZE,
): AsyncGenerator<LawRecordExtra[], void, void> {
  const take = Math.min(CURSOR_TAKE_MAX, Math.max(1, Math.floor(batchSize) || 500));
  let cursor: string | undefined;
  let pagine = 0;
  const maxPagine = 10000;
  while (pagine < maxPagine) {
    let pagina: CursorResult;
    try {
      pagina = await listLawsCursor({ ...filters, cursor, take, sort: "data_desc" });
    } catch {
      return;
    }
    if (pagina.items.length === 0) return;
    yield pagina.items;
    pagine += 1;
    if (!pagina.nextCursor) return;
    cursor = pagina.nextCursor;
    if (pagina.items.length < take) return;
  }
}

/**
 * Conta le norme che soddisfano i filtri. Non lancia.
 *
 * REGOLA MAI-IGNORARE (Caso C): con `persona` impostata e DB popolato conta
 * sulle filtrate dell'estratto bounded (prime 10000 schede, `take` sempre
 * presente), totale coerente con `listLaws`.
 */
export async function countLaws(filters: LawFilters = {}): Promise<number> {
  const personaNorm = parsePersona((filters as LawFilters)?.persona ?? "");
  if (personaNorm && personaNorm !== "tutti") {
    try {
      const prisma = getPrisma();
      if (prisma) {
        const totaleDb = await prisma.law.count().catch(() => 0);
        if (totaleDb > 0) {
          const whereSenzaPersona = wherePrisma({ ...filters, persona: "" });
          const estratto = await prisma.law.findMany({
            where: whereSenzaPersona,
            orderBy: [{ dataEmanazione: "desc" }, { eli: "asc" }],
            take: PERSONA_ESTRATTO_MAX,
          });
          return estratto.map(mapLaw).filter((law) => matchesFilters(law, filters))
            .length;
        }
      }
    } catch {
      // fallback al Caso A sotto
    }
    try {
      const laws = await caricaBase();
      return laws.filter((law) => matchesFilters(law, filters)).length;
    } catch {
      try {
        return getSeedLaws().filter((law) => matchesFilters(law, filters)).length;
      } catch {
        return 0;
      }
    }
  }
  const prisma = getPrisma();
  if (prisma) {
    try {
      const where = wherePrisma(filters);
      const isVuoto = Object.keys(where).length === 0;
      const totaleDb = await prisma.law.count();
      if (totaleDb > 0) {
        if (isVuoto) return totaleDb;
        return await prisma.law.count({ where });
      }
    } catch {
      // fallback al seed
    }
  }
  return getSeedLaws().filter((law) => matchesFilters(law, filters)).length;
}

/**
 * Tetto massimo di righe per `queryLaws` (finestra di ricerca/ranking).
 * Copre il corpus massimo generabile (CORPUS_TOTALE_MAX 20000 + 5 seed) con
 * margine: totali e ranking esatti senza troncamenti silenziosi. Limite
 * anti-DoS documentato: l'export usa `listLaws` paginato, gli estratti UI
 * passano un `limit` esplicito minore (10000).
 */
export const QUERY_CAP_MASSIMO = 25000;

/**
 * Restituisce tutte le norme filtrate (ordinate per data) fino a `limit`
 * (default 10000, coerente con EXPORT_CAP e PERSONA_ESTRATTO_MAX).
 * Pensata per l'export: non applica la paginazione della lista.
 * Usa il DB con filtri server-side quando disponibile (evita full-scan),
 * altrimenti filtra il seed in memoria. Non lancia mai.
 *
 * REGOLA MAI-IGNORARE (Caso C): con `persona` impostata e DB popolato usa
 * l'estratto bounded (`where` senza persona, `take<=PERSONA_ESTRATTO_MAX`),
 * poi filtro in memoria e `slice(0,min(limit,QUERY_CAP_MASSIMO))`. Limite
 * documentato: prime 10000 schede su DB popolato, finestra intera su seed.
 */
export async function queryLaws(
  filters: LawFilters = {},
  limit = 10000,
): Promise<LawRecordExtra[]> {
  const cap = Math.min(QUERY_CAP_MASSIMO, Math.max(1, Math.floor(limit) || 10000));
  const personaNorm = parsePersona((filters as LawFilters)?.persona ?? "");
  if (personaNorm && personaNorm !== "tutti") {
    try {
      const prisma = getPrisma();
      if (prisma) {
        const totaleDb = await prisma.law.count().catch(() => 0);
        if (totaleDb > 0) {
          const whereSenzaPersona = wherePrisma({ ...filters, persona: "" });
          const estratto = await prisma.law.findMany({
            where: whereSenzaPersona,
            orderBy: [{ dataEmanazione: "desc" }, { eli: "asc" }],
            take: PERSONA_ESTRATTO_MAX,
          });
          return sortLaws(
            estratto.map(mapLaw).filter((law) => matchesFilters(law, filters)),
            "data_desc",
          ).slice(0, cap);
        }
      }
    } catch {
      // fallback al Caso A sotto
    }
    try {
      const laws = await caricaBase();
      return sortLaws(
        laws.filter((law) => matchesFilters(law, filters)),
        "data_desc",
      ).slice(0, cap);
    } catch {
      return [];
    }
  }
  const prisma = getPrisma();
  if (prisma) {
    try {
      const totaleDb = await prisma.law.count();
      if (totaleDb > 0) {
        const rows = await prisma.law.findMany({
          where: wherePrisma(filters),
          orderBy: [{ dataEmanazione: "desc" }, { eli: "asc" }],
          take: cap,
        });
        return rows.map(mapLaw);
      }
    } catch {
      // fallback al seed sotto
    }
  }
  const laws = await caricaBase();
  return sortLaws(
    laws.filter((law) => matchesFilters(law, filters)),
    "data_desc",
  ).slice(0, cap);
}

/** Aggregati del corpus (per anno, tipo, Gulpease, attuativi, AIR, qualita').
 * Cache LRU in-memory 60s per evitare full-scan ripetuti su 100k+ righe. Non lancia. */
let cacheStats: { dati: CorpusStats; scadeIl: number } | null = null;

/** Azzera la cache di `getStats` (utile nei test). Non lancia. */
export function clearStatsCache(): void {
  cacheStats = null;
}

export async function getStats(): Promise<CorpusStats> {
  try {
    const ora = Date.now();
    if (cacheStats && cacheStats.scadeIl > ora) return cacheStats.dati;
  } catch {
    // cache non disponibile: continua senza
  }
  const laws = await getLawsFromDBorSeed();
  const dati = buildStats(laws as StatLaw[]);
  try {
    cacheStats = { dati, scadeIl: Date.now() + STATS_CACHE_TTL_MS };
  } catch {
    // ignora errori di cache
  }
  return dati;
}

export interface IngestRunInput {
  source: string;
  status: "ok" | "error" | "skipped";
  detail?: string;
  startedAt?: Date;
}

/** Registra una esecuzione di ingest. Restituisce `false` senza DB. */
export async function recordIngestRun(input: IngestRunInput): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) return false;
  try {
    await prisma.ingestRun.create({
      data: {
        source: input.source,
        status: input.status,
        detail: input.detail ?? null,
        startedAt: input.startedAt ?? new Date(),
        finishedAt: new Date(),
      },
    });
    return true;
  } catch {
    return false;
  }
}
