/**
 * Ingest storico Normattiva -> data/reali/normattiva-storico-collezioni.json
 * e data/reali/normattiva-storico-1980.json.
 *
 * Legge atti VERI dalle API Open Data di Normattiva (bff-opendata v1) e li
 * salva con envelope di provenance. Nessun dato dimostrativo: ogni campo del
 * record deriva dalla risposta HTTP (collezione ZIP / lista + dettaglio)
 * oppure il record viene scartato. Mai inventati: codici redazionali,
 * numeri, URL, date, stati.
 *
 * Sorgenti (bounded, MAI oltre i cap):
 *   - 3 collezioni chiuse: `Codici` (40) + `Leggi costituzionali` (50) +
 *     `Leggi di delegazione europea` (32) via
 *     GET /api/v1/collections/download/collection-preconfezionata
 *     ?nome=..&formato=JSON&formatoRichiesta=V (max 122 atti totali);
 *   - 1 finestra: POST /api/v1/ricerca/aggiornati su 1980-01-01..1980-12-31
 *     (max 80 atti).
 * Dettaglio per ogni URN: POST /api/v1/atto/dettaglio-atto-urn {urn} con il
 * prefisso `urn:` obbligatorio, a batch di 5 con pausa di 400 ms. Timeout
 * 15000 ms per le POST (90000 ms per i download ZIP), retry solo su 429/5xx
 * (gestiti da lib/normattiva.ts); stop su 403/409/ERR_409.
 *
 * Dedup: gli ELI/nir gia' presenti in data/reali/normattiva-recenti.json
 * (match su `eli` lower+trim, fallback `nir`) e i duplicati tra le due
 * nuove sorgenti vengono esclusi: mai due record per lo stesso atto.
 *
 * Stato onesto: `articoloDataFineVigenza` esplicita del dettaglio
 * (`99999999` = in vigore, data passata = abrogato) oppure intestazione
 * formale Art. 1 (`DECRETO DECADUTO` / `PROVVEDIMENTO ABROGATO` = status
 * ufficiale), altrimenti in_vigore. Mai inferito dal corpo del testo.
 *
 * Uso:
 *   bunx tsx scripts/ingest-reale-normattiva-storico.ts [--limite-1980=80]
 *     [--testo-max=2000] [--out-collezioni=...] [--out-1980=...]
 *     [--api-base=...] [--help]
 *
 * Esce con codice 1 (SENZA scrivere file parziali) se una delle due sorgenti
 * restituisce zero atti reali o se un JSON supera 950 KB.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { Effect } from "effect";
import { buildFonti } from "../lib/fonti";
import { formatNIR, parseELI, parseNIR } from "../lib/nir";
import {
  Normattiva,
  NormattivaError,
  arrayDa,
  defaultNormattivaConfig,
  downloadCollection,
  eliFromUrn,
  isRecord,
  normalizzaData,
  parseAttoDto,
  runNormattiva,
  stripHtml,
  tipoFromDenominazione,
  unwrapData,
} from "../lib/normattiva";
import type { AttoDto, NormattivaConfig } from "../lib/normattiva";
import { attoToLawRecord } from "../lib/sync";

/* ------------------------------------------------------------------ tipi */

interface LawRecord {
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
  stato: "in_vigore" | "abrogato" | "decaduto";
  /** Data fine vigenza dal dettaglio (`YYYYMMDD`, "" se assente). Audit. */
  articoloDataFineVigenza?: string;
  sintesi: string;
  testo?: string;
  testoTroncato?: boolean;
  fonti: { normattiva?: string; gazzetta?: string; governo?: string };
}

interface Provenance {
  fonte: string;
  url: string;
  recuperatoIl: string;
  licenza: string;
}

interface Envelope {
  provenance: Provenance;
  atti: LawRecord[];
}

export interface VoceLista {
  urn: string;
  codice: string;
  dataGU: string;
  numeroGU: string;
  /** ELI reale osservato nella sorgente di lista ("" se assente). Mai inventato. */
  eliReale: string;
}

/* -------------------------------------------------------------- costanti */

const DIM_KB = 1024;
const LIMITE_FILE_KB = 950;
const PAUSA_BATCH_MS = 400;
const DETTAGLI_PER_BATCH = 5;
const TIMEOUT_POST_MS = 15000;
const TIMEOUT_DOWNLOAD_MS = 90000;
const RETRIES = 2;
const MAX_ATTI_COLLEZIONI = 122;
const MAX_ATTI_FINESTRA = 80;
const MAX_VOCI_ZIP_PER_COLLEZIONE = 60;
const MAX_BYTES_SINGOLO_JSON_ZIP = 64 * 1024 * 1024;

const COLLEZIONI: readonly string[] = [
  "Codici",
  "Leggi costituzionali",
  "Leggi di delegazione europea",
];

const PERCORSO_RECENTI = path.join("data", "reali", "normattiva-recenti.json");

const LICENZA =
  "riproduzione consentita con menzione di fonte, carattere non autentico e gratuito " +
  "(Note legali dati.normattiva.it; solo la Gazzetta Ufficiale a stampa e' autentica)";

/* ------------------------------------------------------- utility interne */

function oggiIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function oggiCompact(): string {
  return oggiIso().replace(/-/g, "");
}

export function normalizzaStorico(testo: string): string {
  return (testo ?? "").replace(/\s+/g, " ").trim();
}

export function stringaStorico(voce: unknown): string {
  if (typeof voce === "string") return voce.trim();
  if (typeof voce === "number" && Number.isFinite(voce)) return String(voce);
  return "";
}

export function isIsoDateStorico(testo: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testo)) return false;
  const parsed = new Date(`${testo}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === testo;
}

function isoDaParti(anno: unknown, mese: unknown, giorno: unknown): string {
  const a = stringaStorico(anno).padStart(4, "0");
  const m = stringaStorico(mese).padStart(2, "0");
  const g = stringaStorico(giorno).padStart(2, "0");
  const iso = `${a}-${m}-${g}`;
  return isIsoDateStorico(iso) ? iso : "";
}

/** Chiave di dedup ELI: trim + lowercase (stessa regola del resto dell'app). */
export function chiaveEliStorico(eli: unknown): string {
  return String(eli ?? "")
    .trim()
    .toLowerCase();
}

function pausa(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function erroreDefinitivo(cause: unknown): boolean {
  if (cause instanceof NormattivaError) {
    if (cause.status === 403 || cause.status === 409) return true;
    return /ERR_409|1003|bloccata/i.test(cause.message);
  }
  return /ERR_409/i.test(String(cause));
}

function messaggioDi(cause: unknown): string {
  if (cause instanceof NormattivaError) {
    return `${cause.message} (url=${cause.url}${cause.status ? ` status=${cause.status}` : ""})`;
  }
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Stato onesto da `articoloDataFineVigenza` esplicita (formato `YYYYMMDD`):
 * `99999999` = ancora in vigore, data passata = abrogato. Pura, per i test.
 */
export function statoDaFineVigenza(
  fineVigenza: string,
  oggiYYYYMMDD: string,
): "in_vigore" | "abrogato" {
  const valida = /^(\d{4})(\d{2})(\d{2})$/.exec((fineVigenza ?? "").trim());
  if (valida && valida[0] !== "99999999" && valida[0] < oggiYYYYMMDD) return "abrogato";
  return "in_vigore";
}

/**
 * Stato dall'intestazione formale Art. 1 di Normattiva
 * (`ART. 1 DECRETO DECADUTO...` / `ART. 1 ((PROVVEDIMENTO ABROGATO ...))`):
 * e' lo status ufficiale dell'atto, non una citazione nel corpo. Pura.
 * Restituisce null se nessuna intestazione formale presente.
 */
export function statoDaIntestazioneArt1(testo: string): "decaduto" | "abrogato" | null {
  try {
    const righe = String(testo ?? "").split(/\r?\n/);
    for (const riga of righe.slice(0, 8)) {
      const pulita = riga.trim().toUpperCase();
      if (/^ART\.\s*1\s+(\(\()?DECRETO DECADUTO\b/.test(pulita)) return "decaduto";
      if (/^ART\.\s*1\s+\(\(PROVVEDIMENTO ABROGATO\b/.test(pulita)) return "abrogato";
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Costruisce un URN NIR reale dai campi di una voce di lista aggiornati.
 * Restituisce "" se i campi non bastano: mai inventare.
 */
export function urnDaVoceLista(voce: unknown): string {
  if (!isRecord(voce)) return "";
  const denominazione = stringaStorico(
    voce["denominazioneAtto"] ?? voce["tipoProvvedimentoDescrizione"],
  );
  const tipo = tipoFromDenominazione(denominazione);
  const numero = stringaStorico(
    voce["numeroProvvedimento"] ?? voce["numero"] ?? voce["numeroAttoAlfanumerico"],
  );
  const iso = isoDaParti(
    voce["annoProvvedimento"],
    voce["meseProvvedimento"],
    voce["giornoProvvedimento"],
  );
  if (!tipo || !numero || !iso) return "";
  const urn = formatNIR({ tipo, data: iso, numero });
  return parseNIR(urn) ? urn : "";
}

/**
 * Legge una voce di collezione bulk (formato `{metadati: {...}}` dei JSON
 * dentro gli ZIP preconfezionati). Usa SOLO campi osservati: `urn` reale
 * (validato), `redazione`, `dataPubblicazione`, `numeroPubblicazione` ed
 * `eli` reale (validato). Restituisce null se manca un URN valido.
 */
export function voceCollezioneDaMetadati(voce: unknown): VoceLista | null {
  if (!isRecord(voce)) return null;
  const metadati = isRecord(voce["metadati"])
    ? (voce["metadati"] as Record<string, unknown>)
    : voce;
  const urn = stringaStorico(metadati["urn"]);
  if (!parseNIR(urn)) return null;
  const codice = stringaStorico(metadati["redazione"] ?? metadati["codiceRedazionale"]);
  const dataGUCandidata = normalizzaData(metadati["dataPubblicazione"] ?? metadati["dataGU"]);
  const numeroGUCandidato = stringaStorico(metadati["numeroPubblicazione"] ?? metadati["numeroGU"]);
  const eliGrezzo = stringaStorico(metadati["eli"]);
  const eliCandidato = eliGrezzo.startsWith("/") ? eliGrezzo : eliGrezzo ? `/${eliGrezzo}` : "";
  return {
    urn,
    codice,
    dataGU: isIsoDateStorico(dataGUCandidata) ? dataGUCandidata : "",
    numeroGU: /^\d+$/.test(numeroGUCandidato) ? numeroGUCandidato : "",
    eliReale: eliCandidato && parseELI(eliCandidato) ? eliCandidato : "",
  };
}

/** Estrae la parte `atto` da una risposta di dettaglio (se presente). */
function attoInterno(raw: unknown): Record<string, unknown> | null {
  const involucro = unwrapData(raw);
  if (isRecord(involucro)) {
    const interno = involucro["atto"];
    if (isRecord(interno)) return interno;
    return involucro;
  }
  return null;
}

/**
 * Converte un dettaglio reale in LawRecord usando SOLO campi osservati.
 * Restituisce null se mancano titolo o identificativo.
 */
export function dettaglioToRecordStorico(
  voce: VoceLista,
  raw: unknown,
  testoMax: number,
): LawRecord | null {
  const interno = attoInterno(raw);
  if (!interno) return null;
  const dto: AttoDto | null = parseAttoDto(interno);

  const titolo =
    normalizzaStorico(dto?.titolo ?? "") ||
    normalizzaStorico(stringaStorico(interno["titolo"])) ||
    normalizzaStorico(stringaStorico(interno["descrizioneAtto"]));
  if (!titolo) return null;

  const tipo =
    dto?.tipo ||
    tipoFromDenominazione(
      stringaStorico(interno["tipoProvvedimentoDescrizione"]) ||
        stringaStorico(interno["denominazioneAtto"]),
    ) ||
    "atto";

  const numero =
    dto?.numero ||
    stringaStorico(interno["numeroProvvedimento"]) ||
    (parseNIR(voce.urn)?.numero ?? "");
  if (!numero) return null;

  const dataEmanazione =
    dto?.dataEmanazione ||
    isoDaParti(
      interno["annoProvvedimento"],
      interno["meseProvvedimento"],
      interno["giornoProvvedimento"],
    ) ||
    normalizzaData(interno["dataEmanazione"]) ||
    (parseNIR(voce.urn)?.data ?? "");
  if (!dataEmanazione) return null;

  const codice =
    dto?.codiceRedazionale || stringaStorico(interno["codiceRedazionale"]) || voce.codice;

  const html = dto?.articoloHtml || stringaStorico(interno["articoloHtml"]);
  const testoIntegrale = dto?.testo || stripHtml(html);
  const sottoTitolo = dto?.sottoTitolo || normalizzaStorico(stringaStorico(interno["sottoTitolo"]));
  // Vigenza onesta, in ordine di affidabilita':
  // 1) data di fine vigenza esplicita del dettaglio (passata = abrogato);
  // 2) intestazione formale Art. 1 di Normattiva (DECRETO DECADUTO /
  //    PROVVEDIMENTO ABROGATO = status ufficiale, non citazione nel corpo);
  // 3) default in_vigore. MAI inferire dal corpo del testo.
  const fineVigenzaGrezza = stringaStorico(interno["articoloDataFineVigenza"]);
  const daData = statoDaFineVigenza(fineVigenzaGrezza, oggiCompact());
  const daIntestazione = statoDaIntestazioneArt1(testoIntegrale);
  const stato: "in_vigore" | "abrogato" | "decaduto" =
    daData === "abrogato" ? "abrogato" : (daIntestazione ?? "in_vigore");

  const eliReale = dto?.eli && dto.eli.startsWith("/") ? dto.eli : voce.eliReale;
  const eli = eliReale || (codice ? eliFromUrn(voce.urn, codice) : "");
  const chiave = eli || voce.urn;
  if (!chiave) return null;

  const law = attoToLawRecord({
    urn: voce.urn,
    eli,
    titolo,
    sottoTitolo,
    articoloHtml: html,
    testo: testoIntegrale,
    tipo,
    numero,
    dataEmanazione,
    codiceRedazionale: codice,
    stato,
    raw: interno,
  });
  if (!law) return null;

  const dataGU =
    isoDaParti(interno["annoGU"], interno["meseGU"], interno["giornoGU"]) ||
    (isIsoDateStorico(voce.dataGU) ? voce.dataGU : "");
  const numeroGU =
    stringaStorico(interno["numeroGU"]) || (/^\d+$/.test(voce.numeroGU) ? voce.numeroGU : "");

  const fonti = buildFonti({
    tipo,
    numero,
    dataEmanazione,
    codiceRedazionale: codice || undefined,
    dataGU: dataGU || undefined,
    numeroGU: numeroGU || undefined,
  });

  const sintesi = normalizzaStorico(law.sintesi || sottoTitolo || testoIntegrale || titolo).slice(
    0,
    600,
  );
  if (!sintesi) return null;

  const testoPieno = (law.testo ?? "").trim();
  const troncato = testoPieno.length > testoMax;
  const record: LawRecord = {
    chiave,
    titolo: law.titolo,
    tipo: law.tipo,
    numero: law.numero,
    dataEmanazione: law.dataEmanazione,
    nir: voce.urn,
    eli,
    stato,
    sintesi,
    fonti: {
      ...(fonti.normattiva ? { normattiva: fonti.normattiva } : {}),
      ...(fonti.gazzetta ? { gazzetta: fonti.gazzetta } : {}),
      ...(fonti.governo ? { governo: fonti.governo } : {}),
    },
  };
  if (dataGU) record.dataGU = dataGU;
  if (numeroGU) record.numeroGU = numeroGU;
  if (codice) record.codiceRedazionale = codice;
  if (/^\d{8}$/.test(fineVigenzaGrezza)) record.articoloDataFineVigenza = fineVigenzaGrezza;
  if (testoPieno) record.testo = troncato ? `${testoPieno.slice(0, testoMax)} [...]` : testoPieno;
  if (troncato) record.testoTroncato = true;
  return record;
}

/* ---------------------------------------------------------- lettura args */

function aiuto(): string {
  return [
    "Ingest storico Normattiva (dati ufficiali, mai dimostrativi).",
    "",
    "Uso:",
    "  bunx tsx scripts/ingest-reale-normattiva-storico.ts [opzioni]",
    "",
    "Opzioni:",
    "  --limite-1980=N         atti della finestra 1980 (default 80, MAI oltre 80)",
    "  --testo-max=N           caratteri max per testo (default 2000, max 61440)",
    "  --out-collezioni=PATH   file JSON collezioni (default data/reali/normattiva-storico-collezioni.json)",
    "  --out-1980=PATH         file JSON finestra 1980 (default data/reali/normattiva-storico-1980.json)",
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

/* -------------------------------------------------------- fasi di lista */

/**
 * POST JSON grezza tramite il servizio Normattiva di lib (timeout 15s,
 * retry solo su 429/5xx). Restituisce il corpo parsato.
 */
async function postJson(
  overrides: Partial<NormattivaConfig>,
  path: string,
  body: unknown,
): Promise<unknown> {
  return runNormattiva(
    Effect.gen(function* () {
      const http = yield* Normattiva;
      return yield* http.request("POST", path, body);
    }),
    overrides,
  );
}

function vociDaAggiornati(raw: unknown): VoceLista[] {
  const voci = arrayDa(unwrapData(raw), ["listaAtti", "atti", "risultati", "hits"]);
  const risultato: VoceLista[] = [];
  const visti = new Set<string>();
  for (const voce of voci) {
    const urn = urnDaVoceLista(voce);
    if (!urn || visti.has(urn)) continue;
    visti.add(urn);
    if (!isRecord(voce)) continue;
    const dataGUCandidata = normalizzaData(voce["dataGU"]);
    risultato.push({
      urn,
      codice: stringaStorico(voce["codiceRedazionale"]),
      dataGU: isIsoDateStorico(dataGUCandidata) ? dataGUCandidata : "",
      numeroGU: stringaStorico(voce["numeroGU"]),
      eliReale: "",
    });
  }
  return risultato;
}

/**
 * Estrae voci reali da uno ZIP di collezione preconfezionata (JSON per atto,
 * forma `{metadati: {...}}`). Implementazione senza dipendenze: legge la
 * central directory (gli ZIP Normattiva usano data descriptor, quindi gli
 * header locali non riportano le dimensioni), poi legge i dati dall'header
 * locale. Supporta metodo stored (0) e deflate (8). Non lancia mai: in caso
 * di forma inattesa restituisce le voci estratte fin li'.
 */
export function vociDaZipCollezione(bytes: Uint8Array, maxVoci: number): VoceLista[] {
  const risultato: VoceLista[] = [];
  const visti = new Set<string>();
  try {
    if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Cerca EOCD negli ultimi 65557 byte.
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
    const nomi: Array<{ nome: string; metodo: number; dimCompatta: number; headerLocale: number }> =
      [];
    for (let i = 0; i < totali && offset + 46 <= bytes.length; i += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;
      const metodo = view.getUint16(offset + 10, true);
      const dimCompatta = view.getUint32(offset + 20, true);
      const dimEstesa = view.getUint32(offset + 24, true);
      const nomeLen = view.getUint16(offset + 28, true);
      const extraLen = view.getUint16(offset + 30, true);
      const commentoLen = view.getUint16(offset + 32, true);
      const headerLocale = view.getUint32(offset + 42, true);
      if (dimCompatta === 0xffffffff || dimEstesa === 0xffffffff || headerLocale === 0xffffffff)
        break;
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
      const voce = voceCollezioneDaMetadati(parsed);
      if (!voce || visti.has(voce.urn)) continue;
      visti.add(voce.urn);
      risultato.push(voce);
    }
  } catch {
    // mai lanciare: restituisce le voci estratte fin qui
  }
  return risultato;
}

/** Scarica una collezione preconfezionata ed estrae le voci reali dallo ZIP. */
async function listaCollezione(
  overrides: Partial<NormattivaConfig>,
  nome: string,
  maxVoci: number,
): Promise<{ voci: VoceLista[]; url: string }> {
  const archivio = await runNormattiva(
    downloadCollection({ nome, formato: "JSON", formatoRichiesta: "V" }),
    overrides,
  );
  const voci = vociDaZipCollezione(archivio.bytes, maxVoci);
  return { voci, url: archivio.url || "" };
}

/** Finestra 1980: POST /api/v1/ricerca/aggiornati su 1980-01-01..1980-12-31. */
async function listaFinestra1980(
  overrides: Partial<NormattivaConfig>,
): Promise<{ voci: VoceLista[]; url: string }> {
  const raw = await postJson(overrides, "/api/v1/ricerca/aggiornati", {
    dataInizioAggiornamento: "1980-01-01",
    dataFineAggiornamento: "1980-12-31",
  });
  const baseUrl = defaultNormattivaConfig(overrides).baseUrl;
  return { voci: vociDaAggiornati(raw), url: `${baseUrl}/api/v1/ricerca/aggiornati` };
}

/**
 * Carica gli ELI/nir gia' presenti in normattiva-recenti.json (lower+trim).
 * Non lancia mai: se il file manca o e' invalido restituisce un set vuoto.
 */
export async function caricaChiaviRecenti(percorso: string): Promise<Set<string>> {
  const chiavi = new Set<string>();
  try {
    const raw = await readFile(path.resolve(percorso), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const lista = arrayDa(
      isRecord(parsed) ? (parsed["atti"] ?? parsed["leggi"] ?? parsed["dati"] ?? []) : parsed,
      [],
    );
    const voci = Array.isArray(lista) ? lista : [];
    for (const item of voci) {
      if (!isRecord(item)) continue;
      const eli = chiaveEliStorico(item["eli"]);
      if (eli) chiavi.add(eli);
      const nir = chiaveEliStorico(item["nir"]);
      if (nir) chiavi.add(nir);
    }
  } catch {
    // set vuoto: nessun filtro applicabile
  }
  return chiavi;
}

/** ELI candidati di una voce (reale osservato + derivato da URN/codice). */
export function eliCandidatiVoce(voce: VoceLista): string[] {
  const candidati = new Set<string>();
  const reale = chiaveEliStorico(voce.eliReale);
  if (reale) candidati.add(reale);
  if (voce.codice) {
    const derivato = chiaveEliStorico(eliFromUrn(voce.urn, voce.codice));
    if (derivato) candidati.add(derivato);
  }
  return [...candidati];
}

/* --------------------------------------------------------------- main */

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(aiuto());
    return;
  }

  const limite1980 = intero("limite-1980", MAX_ATTI_FINESTRA, 1, MAX_ATTI_FINESTRA);
  const testoMax = intero("testo-max", 2000, 1000, 61440);
  const outCollezioni =
    argomento("out-collezioni") ?? path.join("data", "reali", "normattiva-storico-collezioni.json");
  const out1980 =
    argomento("out-1980") ?? path.join("data", "reali", "normattiva-storico-1980.json");
  const apiBase = argomento("api-base");

  const overridesPost: Partial<NormattivaConfig> = {
    timeoutMs: TIMEOUT_POST_MS,
    retries: RETRIES,
    ...(apiBase ? { baseUrl: apiBase } : {}),
  };
  const overridesDownload: Partial<NormattivaConfig> = {
    timeoutMs: TIMEOUT_DOWNLOAD_MS,
    retries: RETRIES,
    ...(apiBase ? { baseUrl: apiBase } : {}),
  };

  console.log(
    `Ingest storico Normattiva: collezioni [${COLLEZIONI.join(", ")}] + finestra 1980-01-01..1980-12-31.`,
  );

  const conosciuti = await caricaChiaviRecenti(PERCORSO_RECENTI);
  console.log(`Dedup: ${conosciuti.size} chiavi ELI/nir gia' in normattiva-recenti.json.`);

  const escludiConosciute = (voci: VoceLista[]): VoceLista[] =>
    voci.filter((voce) => {
      if (chiaveEliStorico(voce.urn) && conosciuti.has(chiaveEliStorico(voce.urn))) return false;
      for (const candidato of eliCandidatiVoce(voce)) {
        if (conosciuti.has(candidato)) return false;
      }
      return true;
    });

  // 1) Collezioni chiuse (bounded: max 122 atti totali).
  let vociCollezioni: VoceLista[] = [];
  let urlCollezioni = "";
  try {
    const raccolte: VoceLista[] = [];
    const urls: string[] = [];
    for (const nome of COLLEZIONI) {
      try {
        const { voci, url } = await listaCollezione(
          overridesDownload,
          nome,
          MAX_VOCI_ZIP_PER_COLLEZIONE,
        );
        console.log(`Collezione ${nome}: ${voci.length} voci reali.`);
        if (url) urls.push(url);
        raccolte.push(...voci);
      } catch (cause) {
        console.log(`Collezione ${nome} fallita (${messaggioDi(cause)}).`);
        if (erroreDefinitivo(cause)) {
          console.log("Errore definitivo (403/409/ERR_409): interrompo le altre collezioni.");
          break;
        }
      }
    }
    urlCollezioni =
      urls[0] ??
      `${defaultNormattivaConfig(overridesDownload).baseUrl}/api/v1/collections/download/collection-preconfezionata`;
    const filtrate = escludiConosciute(raccolte);
    console.log(
      `Collezioni: ${raccolte.length} voci, ${raccolte.length - filtrate.length} duplicate escluse.`,
    );
    vociCollezioni = filtrate.slice(0, MAX_ATTI_COLLEZIONI);
  } catch (cause) {
    console.log(`Fase collezioni fallita (${messaggioDi(cause)}).`);
  }

  // 2) Finestra 1980 (bounded: max 80 atti).
  let voci1980: VoceLista[] = [];
  let url1980 = "";
  try {
    const { voci, url } = await listaFinestra1980(overridesPost);
    url1980 = url;
    console.log(`Finestra 1980: ${voci.length} voci reali.`);
    const filtrate = escludiConosciute(voci);
    console.log(
      `Finestra 1980: ${voci.length} voci, ${voci.length - filtrate.length} duplicate escluse.`,
    );
    voci1980 = filtrate.slice(0, limite1980);
  } catch (cause) {
    console.log(`Finestra 1980 fallita (${messaggioDi(cause)}).`);
    if (erroreDefinitivo(cause)) {
      console.log("Errore definitivo (403/409/ERR_409) sulla finestra 1980.");
    }
  }

  const daDettagliare: Array<{ voce: VoceLista; gruppo: "collezioni" | "1980" }> = [
    ...vociCollezioni.map((voce) => ({ voce, gruppo: "collezioni" as const })),
    ...voci1980.map((voce) => ({ voce, gruppo: "1980" as const })),
  ];
  if (daDettagliare.length === 0) {
    console.error("Nessuna voce reale da dettagliare: nessun file scritto.");
    process.exitCode = 1;
    return;
  }
  console.log(
    `Recupero dettagli per ${daDettagliare.length} atti (batch da ${DETTAGLI_PER_BATCH}).`,
  );

  const attiCollezioni: LawRecord[] = [];
  const atti1980: LawRecord[] = [];
  const visti = new Set<string>();
  const errori: string[] = [];
  let interrotto = false;

  for (let i = 0; i < daDettagliare.length && !interrotto; i += DETTAGLI_PER_BATCH) {
    const batch = daDettagliare.slice(i, i + DETTAGLI_PER_BATCH);
    for (const { voce, gruppo } of batch) {
      try {
        const raw = await postJson(overridesPost, "/api/v1/atto/dettaglio-atto-urn", {
          urn: voce.urn,
        });
        const record = dettaglioToRecordStorico(voce, raw, testoMax);
        if (!record) {
          errori.push(`dettaglio senza titolo/chiave: ${voce.urn}`);
          continue;
        }
        // Dedup finale: mai due record per lo stesso atto (chiave + ELI/nir
        // contro i recenti e contro i record gia' raccolti).
        const impronte = [
          chiaveEliStorico(record.chiave),
          chiaveEliStorico(record.eli),
          chiaveEliStorico(record.nir),
        ].filter(Boolean);
        if (impronte.some((impronta) => visti.has(impronta) || conosciuti.has(impronta))) {
          errori.push(`duplicato escluso: ${voce.urn}`);
          continue;
        }
        for (const impronta of impronte) visti.add(impronta);
        if (gruppo === "collezioni") attiCollezioni.push(record);
        else atti1980.push(record);
      } catch (cause) {
        errori.push(`dettaglio ${voce.urn}: ${messaggioDi(cause)}`);
        if (erroreDefinitivo(cause)) {
          console.log("Stop su errore definitivo (403/409/ERR_409) durante i dettagli.");
          interrotto = true;
          break;
        }
      }
    }
    if (i + DETTAGLI_PER_BATCH < daDettagliare.length && !interrotto) {
      await pausa(PAUSA_BATCH_MS);
    }
  }

  console.log(
    `Dettagli OK: collezioni=${attiCollezioni.length} finestra1980=${atti1980.length}; scarti/errori: ${errori.length}.`,
  );
  // Niente parziali: entrambe le sorgenti devono aver prodotto atti reali.
  if (attiCollezioni.length === 0 || atti1980.length === 0) {
    console.error("Una sorgente ha prodotto zero atti reali: nessun file scritto.");
    for (const e of errori.slice(0, 10)) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  const recuperatoIl = new Date().toISOString();
  const envelopeCollezioni: Envelope = {
    provenance: {
      fonte: "normattiva",
      url: urlCollezioni,
      recuperatoIl,
      licenza: LICENZA,
    },
    atti: attiCollezioni,
  };
  const envelope1980: Envelope = {
    provenance: {
      fonte: "normattiva",
      url: url1980,
      recuperatoIl,
      licenza: LICENZA,
    },
    atti: atti1980,
  };

  const jsonCollezioni = JSON.stringify(envelopeCollezioni, null, 2);
  const json1980 = JSON.stringify(envelope1980, null, 2);
  const kbCollezioni = Buffer.byteLength(jsonCollezioni, "utf8") / DIM_KB;
  const kb1980 = Buffer.byteLength(json1980, "utf8") / DIM_KB;
  if (kbCollezioni > LIMITE_FILE_KB || kb1980 > LIMITE_FILE_KB) {
    console.error(
      `File oltre il limite di ${LIMITE_FILE_KB} KB ` +
        `(collezioni=${kbCollezioni.toFixed(1)} KB, 1980=${kb1980.toFixed(1)} KB): nessun file scritto.`,
    );
    process.exitCode = 1;
    return;
  }

  const destCollezioni = path.resolve(outCollezioni);
  const dest1980 = path.resolve(out1980);
  await mkdir(path.dirname(destCollezioni), { recursive: true });
  await mkdir(path.dirname(dest1980), { recursive: true });
  await writeFile(destCollezioni, jsonCollezioni, "utf8");
  await writeFile(dest1980, json1980, "utf8");
  console.log(
    `Scritti ${attiCollezioni.length} atti collezioni in ${destCollezioni} (${kbCollezioni.toFixed(1)} KB) ` +
      `e ${atti1980.length} atti 1980 in ${dest1980} (${kb1980.toFixed(1)} KB).`,
  );
  if (errori.length > 0) {
    console.log(`Note (${errori.length}):`);
    for (const e of errori.slice(0, 10)) console.log(`  - ${e}`);
  }
}

const eseguitoComeScript =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv.length > 1 &&
  (process.argv[1] ?? "").endsWith("ingest-reale-normattiva-storico.ts");

if (eseguitoComeScript) {
  main().catch((cause: unknown) => {
    console.error(`Ingest storico fallito: ${messaggioDi(cause)}`);
    process.exitCode = 1;
  });
}
