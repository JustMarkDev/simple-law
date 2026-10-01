/**
 * Client per le API Open Data di Normattiva (bff-opendata v1).
 *
 * Il modulo e' diviso in due livelli:
 *  - **parser puri**: funzioni deterministiche che normalizzano le risposte JSON
 *    e leggono l'indice centrale degli archivi ZIP. Non toccano la rete e non
 *    lanciano mai eccezioni: in caso di forma inattesa restituiscono liste vuote
 *    o `null`.
 *  - **wrapper Effect**: chiamate HTTP con timeout e retry, componibili tramite
 *    `Effect.gen` e fornibili con un `Layer`. Gli errori sono tipizzati
 *    (`NormattivaError`) e classificati come ritentabili o definitivi.
 *
 * La base URL non e' una costante: arriva da `NORMATTIVA_API_BASE` (o dal
 * default pubblico). Il client invia header browser-like (User-Agent + Referer)
 * perche' l'endpoint anonimo li richiede.
 */

import { Context, Data, Duration, Effect, Layer, Schedule } from "effect";
import { formatNIR, normalizeEli, parseNIR } from "./nir";

export const DEFAULT_API_BASE = "https://api.normattiva.it/t/normattiva.api/bff-opendata/v1";

export const NORMATTIVA_REFERER = "https://www.normattiva.it/";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SimpleLaw/1.0";

/** Formati di esportazione accettati da `collection-preconfezionata`. */
export type FormatoExport = "AKN" | "XML" | "JSON" | "PDF" | "EPUB" | "RTF" | "URI" | "HTML";

/** Vigenza richiesta: O = originario, M = in vigore, V = vigente (vigore). */
export type FormatoRichiesta = "O" | "M" | "V";

export interface NormattivaConfig {
  readonly baseUrl: string;
  readonly fetchImpl: typeof fetch;
  readonly timeoutMs: number;
  readonly retries: number;
  readonly userAgent: string;
  readonly referer: string;
}

/** Configurazione di default. `NORMATTIVA_API_BASE` ha priorita' sul default. */
export function defaultNormattivaConfig(
  overrides: Partial<NormattivaConfig> = {},
): NormattivaConfig {
  const daAmbiente = (process.env.NORMATTIVA_API_BASE ?? "").trim();
  const fetchImpl = (globalThis.fetch as typeof fetch | undefined) ?? (fetch as typeof fetch);
  return {
    baseUrl: daAmbiente || DEFAULT_API_BASE,
    fetchImpl,
    timeoutMs: 15000,
    retries: 2,
    userAgent: USER_AGENT,
    referer: NORMATTIVA_REFERER,
    ...overrides,
  };
}

export interface NormattivaErrorFields {
  readonly message: string;
  readonly url: string;
  readonly status: number | null;
  readonly retryable: boolean;
}

/** Errore tipizzato del client Normattiva. */
export class NormattivaError extends Data.TaggedError("NormattivaError")<NormattivaErrorFields> {}

/* ---------------------------------------------------------------------------
 * Utility pure.
 * ------------------------------------------------------------------------- */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Cerca una chiave in modo case-insensitive nell'oggetto. */
function chiaveDi(value: Record<string, unknown>, chiave: string): string | undefined {
  if (chiave in value) return chiave;
  const target = chiave.toLowerCase();
  return Object.keys(value).find((k) => k.toLowerCase() === target);
}

function valoreDa(value: unknown, chiavi: readonly string[]): unknown {
  if (!isRecord(value)) return undefined;
  for (const chiave of chiavi) {
    const reale = chiaveDi(value, chiave);
    if (reale !== undefined) return value[reale];
  }
  return undefined;
}

function stringaDa(value: unknown, chiavi: readonly string[]): string {
  const grezzo = valoreDa(value, chiavi);
  if (typeof grezzo === "string") return grezzo.trim();
  if (typeof grezzo === "number" && Number.isFinite(grezzo)) return String(grezzo);
  return "";
}

function numeroDa(value: unknown, chiavi: readonly string[]): number | null {
  const grezzo = valoreDa(value, chiavi);
  if (typeof grezzo === "number" && Number.isFinite(grezzo)) return grezzo;
  if (typeof grezzo === "string" && grezzo.trim()) {
    const parsed = Number.parseInt(grezzo.replace(/[^0-9-]/g, ""), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Estrae una lista da un involucro JSON frequente (`data`, `items`, ...). */
export function arrayDa(value: unknown, chiavi: readonly string[]): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const chiave of ["data", "results", "items", "content", ...chiavi]) {
    const candidato = valoreDa(value, [chiave]);
    if (Array.isArray(candidato)) return candidato;
  }
  return [];
}

/** Rimuove un eventuale involucro `{data: ...}` / `{result: ...}`. */
export function unwrapData(value: unknown): unknown {
  if (!isRecord(value)) return value;
  for (const chiave of ["data", "result", "payload", "body"]) {
    const reale = chiaveDi(value, chiave);
    if (reale !== undefined) {
      const interno = value[reale];
      if (isRecord(interno) || Array.isArray(interno)) return interno;
    }
  }
  return value;
}

/** Converte entita' HTML e rimuove i tag, per ottenere testo semplice. */
export function stripHtml(testo: string): string {
  if (!testo) return "";
  return testo
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&#0*34;/g, '"')
    .replace(/&#x0*22;/gi, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalizza date `gg/mm/aaaa`, ISO e timestamp in `YYYY-MM-DD`; `""` se invalida. */
export function normalizzaData(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return "";
  const testo = value.trim();
  if (!testo) return "";
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(testo);
  if (iso?.[1]) {
    const parsed = new Date(`${iso[1]}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? "" : iso[1];
  }
  const italiana = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(testo);
  if (italiana) {
    const [, g, m, a] = italiana;
    const giorno = g.padStart(2, "0");
    const mese = m.padStart(2, "0");
    const data = `${a}-${mese}-${giorno}`;
    const parsed = new Date(`${data}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? "" : data;
  }
  const parsed = new Date(testo);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

/**
 * Converte una denominazione ufficiale ("DECRETO-LEGGE") nel tipo usato
 * dall'app ("decreto.legge"). Restituisce `""` se la stringa e' vuota.
 */
export function tipoFromDenominazione(denominazione: string): string {
  const chiave = denominazione.trim().toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!chiave) return "";
  const mappa: Record<string, string> = {
    "DECRETO LEGGE": "decreto.legge",
    "DECRETO-LEGGE": "decreto.legge",
    LEGGE: "legge",
    "LEGGE COSTITUZIONALE": "legge.costituzionale",
    "DECRETO LEGISLATIVO": "decreto.legislativo",
    "DECRETO DEL PRESIDENTE DELLA REPUBBLICA": "decreto.presidente.repubblica",
    "DECRETO PRESIDENTE REPUBBLICA": "decreto.presidente.repubblica",
    "DECRETO DEL PRESIDENTE DEL CONSIGLIO DEI MINISTRI": "decreto.presidente.consiglio",
    "DECRETO PRESIDENTE CONSIGLIO": "decreto.presidente.consiglio",
    "DECRETO MINISTERIALE": "decreto.ministeriale",
    "DECRETO LEGISLATIVO LUOGOTENENZIALE": "decreto.legislativo.luogotenenziale",
    REGOLAMENTO: "regolamento",
    TRATTATO: "trattato",
    CODICE: "codice",
    COSTITUZIONE: "costituzione",
  };
  if (mappa[chiave]) return mappa[chiave];
  return chiave.toLowerCase().replace(/\s+/g, ".");
}

export interface NirPartsInput {
  readonly tipo: string;
  readonly anno: string | number;
  readonly mese: string | number;
  readonly giorno: string | number;
  readonly numero: string | number;
}

/** Compone un URN NIR a partire da tipo e data; `""` se non determinabile. */
export function buildNirUrn(parts: NirPartsInput): string {
  const anno = String(parts.anno).padStart(4, "0");
  const mese = String(parts.mese).padStart(2, "0");
  const giorno = String(parts.giorno).padStart(2, "0");
  return formatNIR({ tipo: parts.tipo, data: `${anno}-${mese}-${giorno}`, numero: parts.numero });
}

/** Costruisce un ELI a partire da URN + codice redazionale; `""` se impossibile. */
export function eliFromUrn(urn: string, codiceRedazionale: string): string {
  const parsed = parseNIR(urn);
  if (!parsed || !codiceRedazionale) return "";
  const [anno, mese, giorno] = parsed.data.split("-");
  if (!anno || !mese || !giorno) return "";
  return `/eli/id/${anno}/${mese}/${giorno}/${codiceRedazionale}/sg`;
}

/* ---------------------------------------------------------------------------
 * Parser delle risposte.
 * ------------------------------------------------------------------------- */

export interface CollectionItem {
  readonly nome: string;
  readonly numeroAtti: number | null;
  readonly descrizione: string;
  readonly raw: Record<string, unknown>;
}

/** Analizza `GET /collections/collection-predefinite`. */
export function parseCollections(raw: unknown): CollectionItem[] {
  const lista = arrayDa(unwrapData(raw), ["collections", "collection", "collezioni"]);
  const risultato: CollectionItem[] = [];
  for (const voce of lista) {
    if (typeof voce === "string") {
      const nome = voce.trim();
      if (nome) risultato.push({ nome, numeroAtti: null, descrizione: "", raw: {} });
      continue;
    }
    if (!isRecord(voce)) continue;
    const nome = stringaDa(voce, ["nome", "name", "titolo", "denominazione", "label"]);
    if (!nome) continue;
    risultato.push({
      nome,
      numeroAtti: numeroDa(voce, ["numeroAtti", "numAtti", "atti", "count", "totale", "numero"]),
      descrizione: stringaDa(voce, ["descrizione", "description", "sottotitolo"]),
      raw: voce,
    });
  }
  return risultato;
}

export interface AggiornatoHit {
  readonly numeroAtto: string;
  readonly codiceRedazionale: string;
  readonly dataGU: string;
  readonly numeroGU: string;
  readonly dataUltimaModifica: string;
  readonly urn: string;
  readonly raw: Record<string, unknown>;
}

/** Analizza `POST /ricerca/aggiornati`. */
export function parseAggiornati(raw: unknown): AggiornatoHit[] {
  const lista = arrayDa(unwrapData(raw), ["hits", "atti", "risultati"]);
  const risultato: AggiornatoHit[] = [];
  for (const voce of lista) {
    if (!isRecord(voce)) continue;
    const numeroAtto = stringaDa(voce, ["numeroAtto", "numero", "numeroProvvedimento"]);
    const codiceRedazionale = stringaDa(voce, ["codiceRedazionale", "codice", "codiceRedaz"]);
    if (!numeroAtto && !codiceRedazionale) continue;
    risultato.push({
      numeroAtto,
      codiceRedazionale,
      dataGU: normalizzaData(
        valoreDa(voce, ["dataGU", "dataGazzetta", "dataPubblicazione", "data"]),
      ),
      numeroGU: stringaDa(voce, ["numeroGU", "numeroGazzetta"]),
      dataUltimaModifica: normalizzaData(
        valoreDa(voce, ["dataUltimaModifica", "ultimaModifica", "dataAggiornamento"]),
      ),
      urn: stringaDa(voce, ["urn", "urnNir", "nir", "eli"]),
      raw: voce,
    });
  }
  return risultato;
}

export interface AttoDto {
  readonly urn: string;
  readonly eli: string;
  readonly titolo: string;
  readonly sottoTitolo: string;
  readonly articoloHtml: string;
  readonly testo: string;
  readonly tipo: string;
  readonly numero: string;
  readonly dataEmanazione: string;
  readonly codiceRedazionale: string;
  readonly stato: string;
  readonly raw: Record<string, unknown>;
}

/** Analizza `POST /atto/dettaglio-atto-urn` (o una voce di ricerca avanzata). */
export function parseAttoDto(raw: unknown): AttoDto | null {
  const interno = unwrapData(raw);
  if (!isRecord(interno)) return null;

  const titolo = stringaDa(interno, ["titolo", "title", "denominazione", "oggetto"]);
  const articoloHtml = stringaDa(interno, ["articoloHtml", "testoHtml", "html", "articolo"]);
  const urn = stringaDa(interno, ["urn", "urnNir", "nir"]);
  const eli = stringaDa(interno, ["eli"]);
  if (!titolo && !articoloHtml && !urn && !eli) return null;

  const tipoGrezzo = stringaDa(interno, ["denominazioneAtto", "tipoAtto", "tipo", "specieAtto"]);
  const dataGrezza = valoreDa(interno, [
    "dataEmanazione",
    "dtEmanazione",
    "dataGU",
    "dataPubblicazione",
  ]);

  return {
    urn,
    eli,
    titolo,
    sottoTitolo: stringaDa(interno, ["sottoTitolo", "sottotitolo", "sommario"]),
    articoloHtml,
    testo: stripHtml(
      articoloHtml || stringaDa(interno, ["testo", "testoIntegrale", "contenuto", "abstract"]),
    ),
    tipo: tipoFromDenominazione(tipoGrezzo),
    numero: stringaDa(interno, ["numero", "numeroAtto", "numeroProvvedimento"]),
    dataEmanazione: normalizzaData(dataGrezza),
    codiceRedazionale: stringaDa(interno, ["codiceRedazionale", "codice", "codiceRedaz"]),
    stato: stringaDa(interno, ["stato", "statoAtto", "vigenza"]),
    raw: interno,
  };
}

export interface RicercaAvanzataPage {
  readonly items: AttoDto[];
  readonly page: number;
  readonly total: number | null;
  readonly hasNext: boolean;
}

/** Analizza una pagina di `POST /ricerca/avanzata`. */
export function parseRicercaAvanzata(raw: unknown, page = 1, pageSize = 50): RicercaAvanzataPage {
  const involucro = unwrapData(raw);
  const lista = arrayDa(involucro, ["atti", "risultati", "hits"]);
  const items = lista
    .map((voce) => parseAttoDto(voce))
    .filter((atto): atto is AttoDto => atto !== null);

  const total = isRecord(involucro)
    ? numeroDa(involucro, ["total", "totale", "numTotale", "totalElements", "count"])
    : null;
  const hasNext =
    total !== null ? page * pageSize < total : items.length > 0 && items.length >= pageSize;

  return { items, page, total, hasNext };
}

export interface TipologicaItem {
  readonly value: string;
  readonly label: string;
}

/** Analizza `/tipologiche/denominazione-atto`. */
export function parseTipologica(raw: unknown): TipologicaItem[] {
  const lista = arrayDa(unwrapData(raw), ["tipologiche", "valori", "denominazioni"]);
  const risultato: TipologicaItem[] = [];
  for (const voce of lista) {
    if (typeof voce === "string") {
      const value = voce.trim();
      if (value) risultato.push({ value, label: value });
      continue;
    }
    if (!isRecord(voce)) continue;
    const value = stringaDa(voce, ["value", "codice", "valore", "denominazione", "nome"]);
    if (!value) continue;
    risultato.push({ value, label: stringaDa(voce, ["label", "descrizione", "nome"]) || value });
  }
  return risultato;
}

/** Analizza `/tipologiche/estensioni`. */
export function parseEstensioni(raw: unknown): string[] {
  const lista = arrayDa(unwrapData(raw), ["estensioni", "formati"]);
  const risultato = new Set<string>();
  for (const voce of lista) {
    if (typeof voce === "string" && voce.trim()) risultato.add(voce.trim().toUpperCase());
    else if (isRecord(voce)) {
      const valore = stringaDa(voce, ["estensione", "formato", "value", "codice", "nome"]);
      if (valore) risultato.add(valore.toUpperCase());
    }
  }
  return [...risultato];
}

/* ---------------------------------------------------------------------------
 * Lettore ZIP (solo indice centrale, nessuna dipendenza esterna).
 * ------------------------------------------------------------------------- */

const EOCD_SIG = 0x06054b50;
const CDH_SIG = 0x02014b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;

export interface ZipEntry {
  readonly name: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly compressionMethod: number;
}

/** `true` se i byte iniziano con la firma ZIP (`PK`). */
export function looksLikeZip(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b;
}

function trovaEocd(view: DataView): number {
  const min = Math.max(0, view.byteLength - 65557);
  for (let offset = view.byteLength - 22; offset >= min; offset -= 1) {
    if (view.getUint32(offset, true) !== EOCD_SIG) continue;
    const commentLen = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLen <= view.byteLength) return offset;
  }
  return -1;
}

function leggiZip64(view: DataView, eocd: number): { total: number; cdOffset: number } | null {
  const locator = eocd - 20;
  if (locator < 0) return null;
  if (view.getUint32(locator, true) !== ZIP64_LOCATOR_SIG) return null;
  const z64 = Number(view.getBigUint64(locator + 8, true));
  if (z64 < 0 || z64 + 56 > view.byteLength) return null;
  if (view.getUint32(z64, true) !== ZIP64_EOCD_SIG) return null;
  return {
    total: Number(view.getBigUint64(z64 + 32, true)),
    cdOffset: Number(view.getBigUint64(z64 + 48, true)),
  };
}

/**
 * Legge l'indice centrale di un archivio ZIP e restituisce le voci (nome e
 * dimensioni). Nessuna decompressione: serve solo a inventariare l'archivio.
 * In caso di dati non validi restituisce `[]`.
 */
export function parseZipEntries(data: Uint8Array): ZipEntry[] {
  if (!looksLikeZip(data) || data.byteLength < 22) return [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const eocd = trovaEocd(view);
  if (eocd < 0) return [];

  let total = view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);

  if (total === 0xffff || cdOffset === 0xffffffff) {
    const zip64 = leggiZip64(view, eocd);
    if (zip64) {
      total = zip64.total;
      cdOffset = zip64.cdOffset;
    }
  }

  const entries: ZipEntry[] = [];
  let offset = cdOffset;
  const decoder = new TextDecoder("utf-8");
  for (let i = 0; i < total; i += 1) {
    if (offset + 46 > view.byteLength) break;
    if (view.getUint32(offset, true) !== CDH_SIG) break;
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const nomeBytes = data.subarray(offset + 46, offset + 46 + nameLen);
    entries.push({
      name: decoder.decode(nomeBytes),
      compressedSize: compressedSize === 0xffffffff ? -1 : compressedSize,
      uncompressedSize: uncompressedSize === 0xffffffff ? -1 : uncompressedSize,
      compressionMethod,
    });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export interface ZipSummary {
  readonly entries: number;
  readonly totalUncompressed: number;
  readonly nomi: string[];
}

/** Riassunto leggero di un archivio ZIP (senza decompressione). */
export function summarizeZip(data: Uint8Array): ZipSummary {
  const entries = parseZipEntries(data);
  const totalUncompressed = entries.reduce(
    (acc, entry) => acc + Math.max(0, entry.uncompressedSize),
    0,
  );
  return { entries: entries.length, totalUncompressed, nomi: entries.map((e) => e.name) };
}

/* ---------------------------------------------------------------------------
 * Servizio HTTP Effect.
 * ------------------------------------------------------------------------- */

class RispostaHttpError extends Error {
  constructor(
    readonly status: number,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}`);
    this.name = "RispostaHttpError";
  }
}

export interface DownloadResult {
  readonly bytes: Uint8Array;
  readonly url: string;
  readonly contentType: string;
}

/** Dimensione massima accettata per un download (250 MB). */
export const MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024;

export interface NormattivaShape {
  readonly request: (
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
  ) => Effect.Effect<unknown, NormattivaError>;
  readonly download: (path: string) => Effect.Effect<DownloadResult, NormattivaError>;
}

export class Normattiva extends Context.Service<Normattiva, NormattivaShape>()("Normattiva") {}

function urlCompleto(config: NormattivaConfig, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${config.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function toNormattivaError(cause: unknown, url: string): NormattivaError {
  if (cause instanceof NormattivaError) return cause;
  if (cause instanceof RispostaHttpError) {
    return new NormattivaError({
      message: cause.message,
      url,
      status: cause.status,
      retryable: cause.status >= 500 || cause.status === 429,
    });
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  return new NormattivaError({
    message: message || "Errore di rete sconosciuto",
    url,
    status: null,
    retryable: true,
  });
}

function eseguiConRetry<A>(
  effect: Effect.Effect<A, NormattivaError>,
  config: NormattivaConfig,
  url: string,
): Effect.Effect<A, NormattivaError> {
  return effect.pipe(
    Effect.timeoutOrElse({
      duration: Duration.millis(config.timeoutMs),
      orElse: () =>
        Effect.fail(
          new NormattivaError({
            message: `Timeout dopo ${config.timeoutMs}ms`,
            url,
            status: null,
            retryable: true,
          }),
        ),
    }),
    Effect.retry({
      schedule: Schedule.exponential(Duration.millis(200)),
      times: Math.max(0, config.retries),
      while: (errore: NormattivaError) => errore.retryable,
    }),
  );
}

function decodificaCorpo(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8").decode(bytes).trim();
  } catch {
    return "";
  }
}

function messaggioDiErrore(testo: string): string {
  if (!testo) return "";
  try {
    const parsed = JSON.parse(testo) as unknown;
    if (isRecord(parsed)) {
      const messaggio =
        stringaDa(parsed, ["message", "messaggio", "error", "descrizione", "detail"]) ||
        stringaDa(parsed, ["title"]);
      if (messaggio) return messaggio;
    }
  } catch {
    // non JSON: usa il testo grezzo
  }
  return testo.slice(0, 300);
}

function makeService(config: NormattivaConfig): NormattivaShape {
  const headersBase = (): Record<string, string> => ({
    accept: "application/json, text/plain, */*",
    "user-agent": config.userAgent,
    referer: config.referer,
  });

  const request: NormattivaShape["request"] = (method, path, body) => {
    const url = urlCompleto(config, path);
    const chiamata = (signal: AbortSignal): Promise<unknown> => {
      const headers = headersBase();
      const init: RequestInit = { method, headers, signal, redirect: "follow" };
      if (body !== undefined) {
        headers["content-type"] = "application/json";
        init.body = JSON.stringify(body);
      }
      return config.fetchImpl(url, init).then(async (response) => {
        const testo = await response.text();
        if (!response.ok) {
          throw new RispostaHttpError(response.status, messaggioDiErrore(testo));
        }
        if (!testo.trim()) return null;
        try {
          return JSON.parse(testo) as unknown;
        } catch {
          return testo;
        }
      });
    };
    const effect = Effect.tryPromise({
      try: chiamata,
      catch: (cause) => toNormattivaError(cause, url),
    });
    return eseguiConRetry(effect, config, url);
  };

  const download: NormattivaShape["download"] = (path) => {
    const url = urlCompleto(config, path);
    const chiamata = (signal: AbortSignal): Promise<DownloadResult> => {
      const headers = headersBase();
      headers.accept = "application/zip, application/octet-stream, */*";
      return config
        .fetchImpl(url, { method: "GET", headers, signal, redirect: "follow" })
        .then(async (response) => {
          // Controllo preventivo: non bufferizzare archivi oltre il limite.
          const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
          if (Number.isFinite(contentLength) && contentLength > MAX_DOWNLOAD_BYTES) {
            throw new NormattivaError({
              message: `Risposta troppo grande: ${contentLength} byte (max 250 MB)`,
              url: response.url || url,
              status: 413,
              retryable: false,
            });
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (!response.ok) {
            throw new RispostaHttpError(response.status, messaggioDiErrore(decodificaCorpo(bytes)));
          }
          if (!looksLikeZip(bytes)) {
            const messaggio = messaggioDiErrore(decodificaCorpo(bytes));
            throw new RispostaHttpError(200, messaggio || "Risposta non in formato ZIP");
          }
          return {
            bytes,
            url: response.url || url,
            contentType: response.headers.get("content-type") ?? "",
          };
        });
    };
    const effect = Effect.tryPromise({
      try: chiamata,
      catch: (cause) => toNormattivaError(cause, url),
    });
    return eseguiConRetry(effect, config, url);
  };

  return { request, download };
}

/** Layer che fornisce il servizio Normattiva con la configurazione data. */
export function normattivaLayer(
  overrides: Partial<NormattivaConfig> = {},
): Layer.Layer<Normattiva> {
  return Layer.succeed(Normattiva, makeService(defaultNormattivaConfig(overrides)));
}

/* ---------------------------------------------------------------------------
 * API di alto livello (richiedono il servizio Normattiva).
 * ------------------------------------------------------------------------- */

/** `GET /collections/collection-predefinite`: elenco delle collezioni bulk. */
export const getCollections = (): Effect.Effect<CollectionItem[], NormattivaError, Normattiva> =>
  Effect.gen(function* () {
    const http = yield* Normattiva;
    const raw = yield* http.request("GET", "/api/v1/collections/collection-predefinite");
    return parseCollections(raw);
  });

export interface DownloadCollectionInput {
  readonly nome: string;
  readonly formato?: FormatoExport;
  readonly formatoRichiesta?: FormatoRichiesta;
}

export interface CollectionArchive extends DownloadResult {
  readonly nome: string;
  readonly entries: ZipEntry[];
}

/**
 * `GET /collections/download/collection-preconfezionata`.
 * Attenzione: `formato` e' l'esportazione (JSON/XML/...), `formatoRichiesta`
 * e' la vigenza (O/M/V). Invertirli provoca gli errori 1003/1006.
 */
export const downloadCollection = (
  input: DownloadCollectionInput,
): Effect.Effect<CollectionArchive, NormattivaError, Normattiva> =>
  Effect.gen(function* () {
    const http = yield* Normattiva;
    const query = new URLSearchParams({
      nome: input.nome,
      formato: input.formato ?? "JSON",
      formatoRichiesta: input.formatoRichiesta ?? "V",
    });
    const risultato = yield* http.download(
      `/api/v1/collections/download/collection-preconfezionata?${query.toString()}`,
    );
    return { ...risultato, nome: input.nome, entries: parseZipEntries(risultato.bytes) };
  });

export interface IntervalloAggiornamento {
  readonly dataInizioAggiornamento: string;
  readonly dataFineAggiornamento: string;
}

/** `POST /ricerca/aggiornati`: atti aggiornati in un intervallo di date. */
export const ricercaAggiornati = (
  input: IntervalloAggiornamento,
): Effect.Effect<AggiornatoHit[], NormattivaError, Normattiva> =>
  Effect.gen(function* () {
    const http = yield* Normattiva;
    const raw = yield* http.request("POST", "/api/v1/ricerca/aggiornati", input);
    return parseAggiornati(raw);
  });

export interface RicercaAvanzataInput {
  readonly denominazioneAtto?: string | readonly string[];
  readonly numeroProvvedimento?: string | number;
  readonly annoProvvedimento?: string | number;
  readonly mese?: string | number;
  readonly giorno?: string | number;
  readonly pagina?: number;
  readonly dimensionePagina?: number;
  readonly parametriExtra?: Record<string, unknown>;
}

function corpoRicercaAvanzata(
  input: RicercaAvanzataInput,
  pagina: number,
  dimensionePagina: number,
): Record<string, unknown> {
  const corpo: Record<string, unknown> = { ...input.parametriExtra };
  if (input.denominazioneAtto !== undefined) {
    corpo.denominazioneAtto = Array.isArray(input.denominazioneAtto)
      ? [...input.denominazioneAtto]
      : input.denominazioneAtto;
  }
  if (input.numeroProvvedimento !== undefined)
    corpo.numeroProvvedimento = input.numeroProvvedimento;
  if (input.annoProvvedimento !== undefined) corpo.annoProvvedimento = input.annoProvvedimento;
  if (input.mese !== undefined) corpo.mese = input.mese;
  if (input.giorno !== undefined) corpo.giorno = input.giorno;
  corpo.pagina = pagina;
  corpo.dimensionePagina = dimensionePagina;
  return corpo;
}

/** `POST /ricerca/avanzata`: una pagina di risultati. */
export const ricercaAvanzata = (
  input: RicercaAvanzataInput,
): Effect.Effect<RicercaAvanzataPage, NormattivaError, Normattiva> =>
  Effect.gen(function* () {
    const http = yield* Normattiva;
    const pagina = input.pagina && input.pagina > 0 ? input.pagina : 1;
    const dimensionePagina =
      input.dimensionePagina && input.dimensionePagina > 0 ? input.dimensionePagina : 50;
    const raw = yield* http.request(
      "POST",
      "/api/v1/ricerca/avanzata",
      corpoRicercaAvanzata(input, pagina, dimensionePagina),
    );
    return parseRicercaAvanzata(raw, pagina, dimensionePagina);
  });

export interface WalkRicercaOptions {
  readonly pageSize?: number;
  readonly maxPages?: number;
  readonly onPage?: (page: RicercaAvanzataPage, indice: number) => void;
}

export interface WalkRicercaResult {
  readonly items: AttoDto[];
  readonly pages: number;
  readonly total: number | null;
}

/**
 * Percorre la ricerca avanzata pagina per pagina finche' non esaurisce i
 * risultati o raggiunge `maxPages` (protezione contro walk infiniti).
 */
export const walkRicercaAvanzata = (
  input: RicercaAvanzataInput,
  options: WalkRicercaOptions = {},
): Effect.Effect<WalkRicercaResult, NormattivaError, Normattiva> =>
  Effect.gen(function* () {
    const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 50;
    const maxPages = options.maxPages && options.maxPages > 0 ? options.maxPages : 10;
    const items: AttoDto[] = [];
    let pages = 0;
    let total: number | null = null;

    for (let pagina = 1; pagina <= maxPages; pagina += 1) {
      const risultato = yield* ricercaAvanzata({
        ...input,
        pagina,
        dimensionePagina: pageSize,
      });
      pages += 1;
      if (risultato.total !== null) total = risultato.total;
      items.push(...risultato.items);
      if (options.onPage) options.onPage(risultato, pagina);
      if (!risultato.hasNext || risultato.items.length === 0) break;
    }

    return { items, pages, total };
  });

/** `POST /atto/dettaglio-atto-urn`: dettaglio di un singolo atto. */
export const dettaglioAtto = (
  urn: string,
): Effect.Effect<AttoDto | null, NormattivaError, Normattiva> =>
  Effect.gen(function* () {
    const http = yield* Normattiva;
    const raw = yield* http.request("POST", "/api/v1/atto/dettaglio-atto-urn", { urn });
    return parseAttoDto(raw);
  });

/** `GET /tipologiche/denominazione-atto`. */
export const denominazioniAtto = (
  value?: string,
): Effect.Effect<TipologicaItem[], NormattivaError, Normattiva> =>
  Effect.gen(function* () {
    const http = yield* Normattiva;
    const query = value ? `?${new URLSearchParams({ value }).toString()}` : "";
    const raw = yield* http.request("GET", `/api/v1/tipologiche/denominazione-atto${query}`);
    return parseTipologica(raw);
  });

/** `GET /tipologiche/estensioni`. */
export const estensioni = (): Effect.Effect<string[], NormattivaError, Normattiva> =>
  Effect.gen(function* () {
    const http = yield* Normattiva;
    const raw = yield* http.request("GET", "/api/v1/tipologiche/estensioni");
    return parseEstensioni(raw);
  });

export interface NuovaRicercaAsincronaInput {
  readonly formato: FormatoExport | string;
  readonly tipoRicerca: string;
  readonly richiestaExport: string;
  readonly parametriRicerca: Record<string, unknown>;
}

export interface RicercaAsincronaToken {
  readonly token: string;
  readonly raw: unknown;
}

function parseToken(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  return stringaDa(unwrapData(raw), ["token", "id", "codice", "identificativo"]);
}

/** `POST /ricerca-asincrona/nuova-ricerca` -> token. */
export const nuovaRicercaAsincrona = (
  input: NuovaRicercaAsincronaInput,
): Effect.Effect<RicercaAsincronaToken, NormattivaError, Normattiva> =>
  Effect.gen(function* () {
    const http = yield* Normattiva;
    const raw = yield* http.request("POST", "/api/v1/ricerca-asincrona/nuova-ricerca", input);
    return { token: parseToken(raw), raw };
  });

/** `PUT /ricerca-asincrona/conferma-ricerca` -> conferma il token. */
export const confermaRicercaAsincrona = (
  token: string,
): Effect.Effect<unknown, NormattivaError, Normattiva> =>
  Effect.gen(function* () {
    const http = yield* Normattiva;
    return yield* http.request("PUT", "/api/v1/ricerca-asincrona/conferma-ricerca", { token });
  });

export interface StatoRicercaAsincrona {
  readonly stato: string;
  readonly completata: boolean;
  readonly raw: unknown;
}

/** `GET /ricerca-asincrona/check-status/{token}`; stato `3` = completata. */
export const checkRicercaAsincrona = (
  token: string,
): Effect.Effect<StatoRicercaAsincrona, NormattivaError, Normattiva> =>
  Effect.gen(function* () {
    const http = yield* Normattiva;
    const raw = yield* http.request(
      "GET",
      `/api/v1/ricerca-asincrona/check-status/${encodeURIComponent(token)}`,
    );
    const stato =
      typeof raw === "string" || typeof raw === "number"
        ? String(raw)
        : stringaDa(unwrapData(raw), ["stato", "status", "esito", "value", "codice"]);
    return { stato, completata: stato === "3", raw };
  });

export interface RicercaAsincronaArchive extends DownloadResult {
  readonly entries: ZipEntry[];
}

/** `GET /collections/download/collection-asincrona/{token}` -> ZIP. */
export const downloadRicercaAsincrona = (
  token: string,
): Effect.Effect<RicercaAsincronaArchive, NormattivaError, Normattiva> =>
  Effect.gen(function* () {
    const http = yield* Normattiva;
    const risultato = yield* http.download(
      `/api/v1/collections/download/collection-asincrona/${encodeURIComponent(token)}`,
    );
    return { ...risultato, entries: parseZipEntries(risultato.bytes) };
  });

/* ---------------------------------------------------------------------------
 * Runner.
 * ------------------------------------------------------------------------- */

/** Esegue un effetto Normattiva fornendo il Layer di default (o custom). */
export function runNormattiva<A, E>(
  effect: Effect.Effect<A, E, Normattiva>,
  overrides: Partial<NormattivaConfig> = {},
): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, normattivaLayer(overrides)));
}

/** Come `runNormattiva`, ma restituisce l'`Exit` senza lanciare. */
export function runNormattivaExit<A, E>(
  effect: Effect.Effect<A, E, Normattiva>,
  overrides: Partial<NormattivaConfig> = {},
) {
  return Effect.runPromiseExit(Effect.provide(effect, normattivaLayer(overrides)));
}

/** Ri-esporta `normalizeEli` per comodita' dei chiamanti del client. */
export { normalizeEli };
