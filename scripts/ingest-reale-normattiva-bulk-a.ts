/**
 * Ingest bulk-A Normattiva -> data/reali/normattiva-bulk-a-*.json.
 *
 * Scrittore bulk-A (disgiunto da W1/W2/W3/W4): UNA sola collezione chiusa
 * preconfezionata, lista-only, ZERO dettagli.
 *
 * Sorgente (bounded, MAI oltre i cap):
 *   - 1 collezione: `Atti di attuazione Regolamenti UE` (39 atti attesi) via
 *     GET /api/v1/collections/download/collection-preconfezionata
 *     ?nome=..&formato=JSON&formatoRichiesta=V (1 solo download).
 *   - Niente `dettaglio`: niente testo/articolato (il vincolo
 *     "batch dettagli <= 5 + pausa" e' soddisfatto per vacuo: 0 dettagli).
 *
 * Mapping onesto (riusa client lib/normattiva.ts, mai titoli inventati):
 *   - titolo SOLO da `metadati.titoloDoc` osservato (scarta se assente);
 *   - urn SOLO da `metadati.urn` validato (parseNIR);
 *   - eli SOLO da `metadati.eli` validato (parseELI) oppure eliFromUrn(urn,
 *     redazione); mai inventato;
 *   - stato SOLO da `metadati.abrogato`: "si" -> "abrogato",
 *     altrimenti "in_vigore" (lista-only: nessuna fine-vigenza/Art.1
 *     disponibile, MAI inferito dal corpo);
 *   - sintesi = titolo (max 600 caratteri).
 *
 * Bounded comuni: download timeout 90s, retry 2 solo 429/5xx (gestiti da
 * lib/normattiva.ts); stop immediato su 403/409/ERR_409; exit 1 SENZA
 * parziali su errore/cap/zero-atti; verifica cap byte (972800) PRIMA di
 * scrivere; mai troncare silenzioso (se le voci superano il cap -> exit 1).
 *
 * Dedup: ELI/URN lower-trim vs TUTTI i file data/reali/*.json esistenti
 * (letti dal vivo, mai rileggere il proprio output) + intra-file; scarta i
 * duplicati e logga i conteggi.
 *
 * Uso:
 *   npx tsx scripts/ingest-reale-normattiva-bulk-a.ts [--out=...]
 *     [--collezione=...] [--formato-richiesta=V] [--limite=100]
 *     [--api-base=...] [--help]
 *
 * Esce con codice 1 (SENZA scrivere file parziali) se la collezione
 * restituisce zero atti reali o se il JSON supera 950 KB.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { Effect } from "effect";
import { buildFonti } from "../lib/fonti";
import { parseELI, parseNIR } from "../lib/nir";
import {
  Normattiva,
  NormattivaError,
  arrayDa,
  defaultNormattivaConfig,
  downloadCollection,
  eliFromUrn,
  isRecord,
  normalizzaData,
  runNormattivaExit,
  tipoFromDenominazione,
} from "../lib/normattiva";
import type { FormatoRichiesta, NormattivaConfig } from "../lib/normattiva";

/* ------------------------------------------------------------------ tipi */

interface LawRecordBulkA {
  chiave: string;
  titolo: string;
  tipo: string;
  numero: string;
  dataEmanazione: string;
  nir: string;
  eli: string;
  dataGU?: string;
  numeroGU?: string;
  codiceRedazionale?: string;
  stato: "in_vigore" | "abrogato";
  sintesi: string;
  fonti: { normattiva?: string; gazzetta?: string; governo?: string };
  fonte: "normattiva-bff";
  dettaglio: false;
}

interface Provenance {
  fonte: string;
  url: string;
  recuperatoIl: string;
  licenza: string;
}

interface Envelope {
  provenance: Provenance;
  atti: LawRecordBulkA[];
}

export interface VoceBulkA {
  urn: string;
  eliReale: string;
  titoloDoc: string;
  tipoDoc: string;
  numDoc: string;
  dataDoc: string;
  codice: string;
  dataGU: string;
  numeroGU: string;
  abrogato: string;
}

/* -------------------------------------------------------------- costanti */

const DIM_KB = 1024;
const LIMITE_FILE_KB = 950;
const LIMITE_FILE_BYTE = LIMITE_FILE_KB * DIM_KB;
const TIMEOUT_DOWNLOAD_MS = 90000;
const RETRIES = 2;
const MAX_ATTI_BULK_A = 100;
const MAX_VOCI_ZIP = 120;
const MAX_BYTES_SINGOLO_JSON_ZIP = 64 * 1024 * 1024;

const COLLEZIONE_DEFAULT = "Atti di attuazione Regolamenti UE";
const OUT_DEFAULT = path.join("data", "reali", "normattiva-bulk-a-attuazione-ue.json");

const LICENZA =
  "riproduzione consentita con menzione di fonte, carattere non autentico e gratuito " +
  "(Note legali dati.normattiva.it; solo la Gazzetta Ufficiale a stampa e' autentica)";

/* ------------------------------------------------------- utility interne */

export function normalizzaBulkA(testo: string): string {
  return (testo ?? "").replace(/\s+/g, " ").trim();
}

export function stringaBulkA(voce: unknown): string {
  if (typeof voce === "string") return voce.trim();
  if (typeof voce === "number" && Number.isFinite(voce)) return String(voce);
  return "";
}

export function isIsoDateBulkA(testo: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testo)) return false;
  const parsed = new Date(`${testo}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === testo;
}

/** Chiave di dedup ELI/URN: trim + lowercase (stessa regola del resto dell'app). */
export function chiaveEliBulkA(eli: unknown): string {
  return String(eli ?? "").trim().toLowerCase();
}

function messaggioDi(cause: unknown): string {
  if (cause instanceof NormattivaError) {
    return `${cause.message} (url=${cause.url}${cause.status ? ` status=${cause.status}` : ""})`;
  }
  return cause instanceof Error ? cause.message : String(cause);
}

function erroreDefinitivo(cause: unknown): boolean {
  if (cause instanceof NormattivaError) {
    if (cause.status === 403 || cause.status === 409) return true;
    return /ERR_409|1003|bloccata/i.test(cause.message);
  }
  return /ERR_409/i.test(String(cause));
}

/**
 * Cerca il NormattivaError originale dentro una Cause di Effect (campi
 * `failure`/`error`/`left`/`right` annidati). Restituisce null se assente.
 */
export function estraiErroreBulkA(causa: unknown, profondita = 0): NormattivaError | null {
  try {
    if (causa instanceof NormattivaError) return causa;
    if (!isRecord(causa) || profondita > 6) return null;
    if ((causa as { _tag?: unknown })._tag === "NormattivaError") {
      return causa as unknown as NormattivaError;
    }
    for (const chiave of ["failure", "error", "cause", "left", "right"] as const) {
      const dentro = (causa as Record<string, unknown>)[chiave];
      if (dentro !== undefined) {
        const trovato = estraiErroreBulkA(dentro, profondita + 1);
        if (trovato) return trovato;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Esegue un effetto Normattiva e restituisce il valore, lanciando il
 * `NormattivaError` originale (non il FiberFailure di `runNormattiva`):
 * cosi' messaggioDi/erroreDefinitivo vedono url e status reali.
 */
export async function eseguiBulkA<A>(
  effect: Effect.Effect<A, NormattivaError, Normattiva>,
  overrides: Partial<NormattivaConfig>,
): Promise<A> {
  const exit = await runNormattivaExit(effect, overrides);
  if ((exit as unknown as { _tag: string })._tag === "Success") {
    return (exit as unknown as { value: A }).value;
  }
  const causa = (exit as unknown as { cause?: unknown }).cause;
  const originale = estraiErroreBulkA(causa);
  if (originale) throw originale;
  throw new Error(`Ingest bulk-A fallito: ${String(causa ?? "errore sconosciuto").slice(0, 300)}`);
}

/**
 * Stato onesto da `metadati.abrogato` osservato: solo "si" (case-insensitive,
 * trim) significa abrogato; ogni altro valore (compreso assente) resta
 * in_vigore. Lista-only: nessuna fine-vigenza/Art.1 disponibile. Pura.
 */
export function statoDaMetadatiBulkA(abrogato: unknown): "in_vigore" | "abrogato" {
  const valore = String(abrogato ?? "").trim().toLowerCase();
  if (valore === "si" || valore === "sì" || valore === "yes" || valore === "true" || valore === "1") {
    return "abrogato";
  }
  return "in_vigore";
}

/**
 * Legge una voce di collezione bulk (formato `{metadati: {...}}` dei JSON
 * dentro gli ZIP preconfezionati). Usa SOLO campi osservati: `urn` reale
 * (validato), `titoloDoc` reale, `eli` reale (validato), `tipoDoc`,
 * `numDoc`, `dataDoc`, `redazione`, `dataPubblicazione`,
 * `numeroPubblicazione`, `abrogato`. Restituisce null se mancano URN valido
 * o titolo: mai inventare.
 */
export function voceCollezioneDaMetadatiBulkA(voce: unknown): VoceBulkA | null {
  if (!isRecord(voce)) return null;
  const metadati = isRecord(voce["metadati"]) ? (voce["metadati"] as Record<string, unknown>) : voce;
  const urn = stringaBulkA(metadati["urn"]);
  if (!parseNIR(urn)) return null;
  const titoloDoc = normalizzaBulkA(stringaBulkA(metadati["titoloDoc"]));
  if (!titoloDoc) return null;
  const eliGrezzo = stringaBulkA(metadati["eli"]);
  const eliCandidato = eliGrezzo.startsWith("/") ? eliGrezzo : eliGrezzo ? `/${eliGrezzo}` : "";
  const dataDocCandidata = normalizzaData(metadati["dataDoc"]);
  const dataGUCandidata = normalizzaData(
    metadati["dataPubblicazione"] ?? metadati["dataGU"],
  );
  const numeroGUCandidato = stringaBulkA(
    metadati["numeroPubblicazione"] ?? metadati["numeroGU"],
  );
  return {
    urn,
    eliReale: eliCandidato && parseELI(eliCandidato) ? eliCandidato : "",
    titoloDoc,
    tipoDoc: stringaBulkA(metadati["tipoDoc"]),
    numDoc: stringaBulkA(metadati["numDoc"]),
    dataDoc: isIsoDateBulkA(dataDocCandidata) ? dataDocCandidata : "",
    codice: stringaBulkA(metadati["redazione"] ?? metadati["codiceRedazionale"]),
    dataGU: isIsoDateBulkA(dataGUCandidata) ? dataGUCandidata : "",
    numeroGU: /^\d+$/.test(numeroGUCandidato) ? numeroGUCandidato : "",
    abrogato: stringaBulkA(metadati["abrogato"]),
  };
}

/**
 * Converte una voce di collezione reale in record usando SOLO campi
 * osservati (lista-only, zero dettagli). Restituisce null se mancano
 * titolo o identificativo.
 */
export function recordDaVoceBulkA(voce: VoceBulkA): LawRecordBulkA | null {
  const titolo = normalizzaBulkA(voce.titoloDoc);
  if (!titolo) return null;
  if (!parseNIR(voce.urn)) return null;

  const tipo = tipoFromDenominazione(voce.tipoDoc) || "atto";
  const numero = voce.numDoc || (parseNIR(voce.urn)?.numero ?? "");
  if (!numero) return null;
  const dataEmanazione = voce.dataDoc || (parseNIR(voce.urn)?.data ?? "");
  if (!dataEmanazione) return null;

  const eli = voce.eliReale || (voce.codice ? eliFromUrn(voce.urn, voce.codice) : "");
  if (!eli || !parseELI(eli)) return null;
  const stato = statoDaMetadatiBulkA(voce.abrogato);
  const sintesi = titolo.slice(0, 600);
  if (!sintesi) return null;

  const fonti = buildFonti({
    tipo,
    numero,
    dataEmanazione,
    codiceRedazionale: voce.codice || undefined,
    dataGU: voce.dataGU || undefined,
    numeroGU: voce.numeroGU || undefined,
  });

  const record: LawRecordBulkA = {
    chiave: eli,
    titolo,
    tipo,
    numero,
    dataEmanazione,
    nir: voce.urn,
    eli,
    stato,
    sintesi,
    fonti: {
      ...(fonti.normattiva ? { normattiva: fonti.normattiva } : {}),
      ...(fonti.gazzetta ? { gazzetta: fonti.gazzetta } : {}),
      ...(fonti.governo ? { governo: fonti.governo } : {}),
    },
    fonte: "normattiva-bff",
    dettaglio: false,
  };
  if (voce.dataGU) record.dataGU = voce.dataGU;
  if (voce.numeroGU) record.numeroGU = voce.numeroGU;
  if (voce.codice) record.codiceRedazionale = voce.codice;
  return record;
}

/**
 * Estrae voci reali da uno ZIP di collezione preconfezionata (JSON per atto,
 * forma `{metadati: {...}}`). Legge la central directory (gli ZIP
 * Normattiva usano data descriptor) e supporta stored (0) e deflate (8).
 * Non lancia mai: in caso di forma inattesa restituisce le voci estratte.
 */
export function vociDaZipBulkA(bytes: Uint8Array, maxVoci: number): VoceBulkA[] {
  const risultato: VoceBulkA[] = [];
  const visti = new Set<string>();
  try {
    if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    const min = Math.max(0, bytes.length - 65557);
    for (let off = bytes.length - 22; off >= min; off -= 1) {
      if (view.getUint32(off, true) !== 0x06054b50) continue;
      if (off + 22 + view.getUint16(off + 20, true) <= bytes.length) {
        eocd = off;
        break;
      }
    }
    if (eocd < 0) return [];
    const totali = view.getUint16(eocd + 8, true);
    const cdOffset = view.getUint32(eocd + 16, true);
    if (totali === 0xffff || cdOffset === 0xffffffff) return [];
    let offset = cdOffset;
    const nomi: Array<{ nome: string; metodo: number; dimCompatta: number; headerLocale: number }> = [];
    for (let i = 0; i < totali && offset + 46 <= bytes.length; i += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;
      const metodo = view.getUint16(offset + 10, true);
      const dimCompatta = view.getUint32(offset + 20, true);
      const dimEstesa = view.getUint32(offset + 24, true);
      const nomeLen = view.getUint16(offset + 28, true);
      const extraLen = view.getUint16(offset + 30, true);
      const commentoLen = view.getUint16(offset + 32, true);
      const headerLocale = view.getUint32(offset + 42, true);
      if (dimCompatta === 0xffffffff || dimEstesa === 0xffffffff || headerLocale === 0xffffffff) break;
      const nome = Buffer.from(bytes.subarray(offset + 46, offset + 46 + nomeLen)).toString("utf8");
      nomi.push({ nome, metodo, dimCompatta, headerLocale });
      offset += 46 + nomeLen + extraLen + commentoLen;
    }
    for (const entry of nomi) {
      if (risultato.length >= maxVoci) break;
      if (!/\.json$/i.test(entry.nome)) continue;
      if (entry.metodo !== 0 && entry.metodo !== 8) continue;
      if (entry.dimCompatta > MAX_BYTES_SINGOLO_JSON_ZIP) continue;
      const lh = entry.headerLocale;
      if (lh + 30 > bytes.length || view.getUint32(lh, true) !== 0x04034b50) continue;
      const nomeLen = view.getUint16(lh + 26, true);
      const extraLen = view.getUint16(lh + 28, true);
      const inizioDati = lh + 30 + nomeLen + extraLen;
      if (inizioDati + entry.dimCompatta > bytes.length) continue;
      const compatti = bytes.subarray(inizioDati, inizioDati + entry.dimCompatta);
      let testo = "";
      try {
        if (entry.metodo === 0) {
          testo = Buffer.from(compatti).toString("utf8");
        } else {
          const gonfiati = inflateRawSync(Buffer.from(compatti), {
            maxOutputLength: MAX_BYTES_SINGOLO_JSON_ZIP,
          });
          testo = gonfiati.toString("utf8");
        }
      } catch {
        continue;
      }
      if (!testo.trim()) continue;
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(testo) as unknown;
      } catch {
        continue;
      }
      const voce = voceCollezioneDaMetadatiBulkA(parsed);
      if (!voce || visti.has(voce.urn)) continue;
      visti.add(voce.urn);
      risultato.push(voce);
    }
  } catch {
    // mai lanciare: restituisce le voci estratte fin qui
  }
  return risultato;
}

/**
 * Carica le chiavi ELI/nir/chiave gia' presenti nei percorsi dati
 * (lower+trim). Non lancia mai: i file mancanti o invalidi vengono saltati.
 */
export async function caricaChiaviBulkA(percorsi: readonly string[]): Promise<Set<string>> {
  const chiavi = new Set<string>();
  for (const percorso of percorsi) {
    try {
      const raw = await readFile(path.resolve(percorso), "utf8");
      if (!raw || raw.length > 2_000_000) continue;
      const parsed = JSON.parse(raw) as unknown;
      const lista = arrayDa(
        isRecord(parsed) ? (parsed["atti"] ?? parsed["leggi"] ?? parsed["dati"] ?? []) : parsed,
        [],
      );
      const voci = Array.isArray(lista) ? lista : [];
      for (const item of voci) {
        if (!isRecord(item)) continue;
        for (const campo of ["eli", "nir", "chiave"] as const) {
          const chiave = chiaveEliBulkA(item[campo]);
          if (chiave) chiavi.add(chiave);
        }
      }
    } catch {
      continue;
    }
  }
  return chiavi;
}

/**
 * Elenca TUTTI i JSON in data/reali (tranne gli output bulk-a propri) per la
 * dedup ELI/URN. Non lancia mai.
 */
export async function elencaRealiPerDedupBulkA(escludi: readonly string[]): Promise<string[]> {
  try {
    const dir = path.resolve("data", "reali");
    const esclusi = new Set(escludi.map((p) => path.resolve(p)));
    const nomi = await readdir(dir);
    return nomi
      .filter((n) => n.endsWith(".json"))
      .map((n) => path.join(dir, n))
      .filter((p) => !esclusi.has(path.resolve(p)));
  } catch {
    return [];
  }
}

/** ELI candidati di una voce (reale osservato + derivato da URN/codice). */
export function eliCandidatiBulkA(voce: VoceBulkA): string[] {
  const candidati = new Set<string>();
  const reale = chiaveEliBulkA(voce.eliReale);
  if (reale) candidati.add(reale);
  if (voce.codice) {
    const derivato = chiaveEliBulkA(eliFromUrn(voce.urn, voce.codice));
    if (derivato) candidati.add(derivato);
  }
  return [...candidati];
}

/* ---------------------------------------------------------- lettura args */

function aiuto(): string {
  return [
    "Ingest bulk-A Normattiva (collezione chiusa, lista-only, zero dettagli).",
    "",
    "Uso:",
    "  npx tsx scripts/ingest-reale-normattiva-bulk-a.ts [opzioni]",
    "",
    "Opzioni:",
    "  --collezione=NOME        collezione preconfezionata (default: Atti di attuazione Regolamenti UE)",
    "  --formato-richiesta=X    vigenza O/M/V (default V)",
    "  --limite=N              atti da salvare (default 100, MAI oltre 100)",
    "  --out=PATH              file JSON (default data/reali/normattiva-bulk-a-attuazione-ue.json;",
    "                          ammessi SOLO data/reali/normattiva-bulk-a-*.json)",
    "  --api-base=URL          override base API Normattiva",
    "  --help                  mostra questo aiuto",
  ].join("\n");
}

function argomento(nome: string): string | undefined {
  const prefisso = `--${nome}=`;
  const trovato = process.argv.find((arg) => arg.startsWith(prefisso));
  return trovato ? trovato.slice(prefisso.length).trim() || undefined : undefined;
}

function intero(nome: string, fallback: number, min: number, max: number): number {
  const grezzo = argomento(nome);
  if (!grezzo) return fallback;
  const parsed = Number.parseInt(grezzo, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** L'output deve restare nei file assegnati (bulk-a): altrimenti exit 1. */
export function outConsentitoBulkA(out: string): boolean {
  const risolto = path.resolve(out);
  const base = path.resolve("data", "reali");
  const prefisso = `normattiva-bulk-a-`;
  const nome = path.basename(risolto);
  return risolto.startsWith(`${base}${path.sep}`) && nome.startsWith(prefisso) && nome.endsWith(".json");
}

/* --------------------------------------------------------------- main */

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(aiuto());
    return;
  }

  const collezione = argomento("collezione") ?? COLLEZIONE_DEFAULT;
  const formatoRichiesta = (argomento("formato-richiesta") ?? "V").trim().toUpperCase();
  if (formatoRichiesta !== "O" && formatoRichiesta !== "M" && formatoRichiesta !== "V") {
    console.error(`Formato richiesta non valido: ${formatoRichiesta} (ammessi O/M/V).`);
    process.exitCode = 1;
    return;
  }
  const limite = intero("limite", MAX_ATTI_BULK_A, 1, MAX_ATTI_BULK_A);
  const out = argomento("out") ?? OUT_DEFAULT;
  if (!outConsentitoBulkA(out)) {
    console.error(`Output non consentito (solo data/reali/normattiva-bulk-a-*.json): ${out}`);
    process.exitCode = 1;
    return;
  }
  const apiBase = argomento("api-base");

  const overridesDownload: Partial<NormattivaConfig> = {
    timeoutMs: TIMEOUT_DOWNLOAD_MS,
    retries: RETRIES,
    ...(apiBase ? { baseUrl: apiBase } : {}),
  };

  console.log(`Ingest bulk-A Normattiva: collezione [${collezione}] formato=${formatoRichiesta} (max ${limite} atti, lista-only, zero dettagli).`);

  // Dedup vs TUTTI i file data/reali/*.json esistenti (mai il proprio output).
  const percorsiDedup = await elencaRealiPerDedupBulkA([out]);
  const conosciuti = await caricaChiaviBulkA(percorsiDedup);
  console.log(
    `Dedup: ${conosciuti.size} chiavi ELI/nir gia' presenti nei file esistenti (${percorsiDedup.length} percorsi).`,
  );

  // 1 download bounded (timeout 90s, retry solo 429/5xx via lib).
  let voci: VoceBulkA[] = [];
  let urlCollezione = "";
  const inizioMs = Date.now();
  try {
    const archivio = await eseguiBulkA(
      downloadCollection({
        nome: collezione,
        formato: "JSON",
        formatoRichiesta: formatoRichiesta as FormatoRichiesta,
      }),
      overridesDownload,
    );
    urlCollezione = archivio.url || "";
    console.log(
      `Collezione ${collezione}: ZIP ${(archivio.bytes.length / 1024).toFixed(1)} KB, ${archivio.entries.length} voci indice.`,
    );
    voci = vociDaZipBulkA(archivio.bytes, MAX_VOCI_ZIP);
    console.log(`Collezione ${collezione}: ${voci.length} voci reali con URN+titolo.`);
  } catch (cause) {
    console.log(`Collezione ${collezione} fallita (${messaggioDi(cause)}): nessun file scritto.`);
    if (erroreDefinitivo(cause)) {
      console.log("Errore definitivo (403/409/ERR_409).");
    }
    process.exitCode = 1;
    return;
  }
  const reteMs = Date.now() - inizioMs;

  if (voci.length === 0) {
    console.error("Zero voci reali dalla collezione: nessun file scritto.");
    process.exitCode = 1;
    return;
  }

  // Dedup ELI/URN vs esistenti + intra-file (mai troncare silenzioso:
  // se le voci utili superano il cap -> exit 1).
  const escludiConosciute = (lista: VoceBulkA[]): { utili: VoceBulkA[]; duplicate: number } => {
    const utili: VoceBulkA[] = [];
    const visti = new Set<string>();
    let duplicate = 0;
    for (const voce of lista) {
      const impronte = [chiaveEliBulkA(voce.urn), ...eliCandidatiBulkA(voce)].filter(Boolean);
      if (impronte.some((i) => conosciuti.has(i) || visti.has(i))) {
        duplicate += 1;
        continue;
      }
      for (const i of impronte) visti.add(i);
      utili.push(voce);
    }
    return { utili, duplicate };
  };

  const { utili, duplicate } = escludiConosciute(voci);
  console.log(`Voci: ${voci.length} totali, ${duplicate} duplicate escluse, ${utili.length} utili.`);
  if (utili.length === 0) {
    console.error("Tutte le voci sono duplicate di atti esistenti: nessun file scritto.");
    process.exitCode = 1;
    return;
  }
  if (utili.length > limite) {
    console.error(
      `Voci utili (${utili.length}) oltre il cap (${limite}): mai troncare silenzioso, nessun file scritto.`,
    );
    process.exitCode = 1;
    return;
  }

  // Record lista-only (zero dettagli): solo campi osservati, mai inventati.
  const atti: LawRecordBulkA[] = [];
  let scarti = 0;
  const vistiRecord = new Set<string>();
  for (const voce of utili) {
    const record = recordDaVoceBulkA(voce);
    if (!record) {
      scarti += 1;
      continue;
    }
    const impronte = [
      chiaveEliBulkA(record.chiave),
      chiaveEliBulkA(record.eli),
      chiaveEliBulkA(record.nir),
    ].filter(Boolean);
    if (impronte.some((i) => vistiRecord.has(i))) {
      scarti += 1;
      continue;
    }
    for (const i of impronte) vistiRecord.add(i);
    atti.push(record);
  }
  console.log(`Record: ${atti.length} validi, ${scarti} scarti (senza titolo/chiave/duplicati).`);
  if (atti.length === 0) {
    console.error("Zero record validi: nessun file scritto.");
    process.exitCode = 1;
    return;
  }

  const envelope: Envelope = {
    provenance: {
      fonte: "normattiva",
      url: urlCollezione || `${defaultNormattivaConfig(overridesDownload).baseUrl}/api/v1/collections/download/collection-preconfezionata`,
      recuperatoIl: new Date().toISOString(),
      licenza: LICENZA,
    },
    atti,
  };
  const json = JSON.stringify(envelope, null, 2);
  const byte = Buffer.byteLength(json, "utf8");
  if (byte > LIMITE_FILE_BYTE) {
    console.error(
      `File oltre il limite di ${LIMITE_FILE_KB} KB (${(byte / DIM_KB).toFixed(1)} KB): nessun file scritto.`,
    );
    process.exitCode = 1;
    return;
  }

  const dest = path.resolve(out);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, json, "utf8");
  console.log(
    `Scritti ${atti.length} atti bulk-A in ${dest} (${(byte / DIM_KB).toFixed(1)} KB, rete ${(reteMs / 1000).toFixed(1)}s).`,
  );
}

const eseguitoComeScript =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv.length > 1 &&
  (process.argv[1] ?? "").endsWith("ingest-reale-normattiva-bulk-a.ts");

if (eseguitoComeScript) {
  main().catch((cause: unknown) => {
    console.error(`Ingest bulk-A fallito: ${messaggioDi(cause)}`);
    process.exitCode = 1;
  });
}
