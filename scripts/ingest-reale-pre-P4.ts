/**
 * Ingest finestre pre-P4 (1935-1947 Regno d'Italia) Normattiva -> data/reali/normattiva-storico-{anno}.json
 * per 1935,1936,1937,1938,1939,1940,1941,1942,1943,1944,1945,1946,1947
 * (backfill pre-1948 Regno d'Italia).
 *
 * Legge atti VERI dalle API Open Data di Normattiva (bff-opendata v1) e li
 * salva con envelope di provenance. Nessun dato dimostrativo: ogni campo del
 * record deriva dalla risposta HTTP (lista + dettaglio) oppure il record
 * viene scartato. Mai inventati: codici redazionali, numeri, URL, date, stati.
 * Atti 1800/primi-900 spesso senza dettaglio servito: scarti onesti attesi,
 * MAI inventare.
 *
 * Sorgenti (bounded, MAI oltre i cap):
 *   - finestra <anno>: POST /api/v1/ricerca/aggiornati su <anno>-01-01..<anno>-12-31
 *     (max 80 atti per finestra).
 * Dettaglio per ogni URN: POST /api/v1/atto/dettaglio-atto-urn {urn} con il
 * prefisso `urn:` obbligatorio, a batch di 5 con pausa di 400 ms. Timeout
 * 15000 ms per le POST, retry solo su 429/5xx (gestiti da lib/normattiva.ts);
 * stop su 403/409/ERR_409.
 *
 * Dedup: gli ELI/nir/chiave gia' presenti nei file normattiva-*.json esistenti
 * su disco (tutti tranne i propri output, letti via readdir: mai rileggere i
 * propri output) e i duplicati tra le finestre selezionate vengono esclusi:
 * mai due record per lo stesso atto.
 *
 * Stato onesto: `articoloDataFineVigenza` esplicita del dettaglio
 * (`99999999` = in vigore, data passata = abrogato) oppure intestazione
 * formale Art. 1 (`DECRETO DECADUTO` / `PROVVEDIMENTO ABROGATO` = status
 * ufficiale), altrimenti in_vigore. Mai inferito dal corpo del testo.
 *
 * Testi visibili: zero em-dash/en-dash (sostituiti con `-`), max 1 middle-dot
 * (`·`) per riga (i successivi diventano `-`). Applicato a titolo, sintesi,
 * testo prima della scrittura.
 *
 * Uso:
 *   npx tsx scripts/ingest-reale-pre-P4.ts [--anni=1935,1936,1937,1938,1939,1940,1941,1942,1943,1944,1945,1946,1947]
 *     [--limite=80] [--testo-max=2000] [--api-base=...] [--help]
 *
 * Anni a zero: NESSUN file per l'anno vuoto (lista onesta in console). Esce
 * con codice 1 SENZA scrivere alcun file solo se TUTTE le finestre
 * selezionate restituiscono zero atti reali, o se un JSON da scrivere supera
 * 950 KB (in quel caso nessun file scritto).
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Effect } from "effect";
import { buildFonti } from "../lib/fonti";
import { formatNIR, parseELI, parseNIR } from "../lib/nir";
import {
  Normattiva,
  NormattivaError,
  arrayDa,
  defaultNormattivaConfig,
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

export interface VoceFinestraPreP4 {
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
const RETRIES = 2;
const MAX_ATTI_FINESTRA = 80;

const FINESTRA_1935 = { nome: "1935", inizio: "1935-01-01", fine: "1935-12-31" } as const;
const FINESTRA_1936 = { nome: "1936", inizio: "1936-01-01", fine: "1936-12-31" } as const;
const FINESTRA_1937 = { nome: "1937", inizio: "1937-01-01", fine: "1937-12-31" } as const;
const FINESTRA_1938 = { nome: "1938", inizio: "1938-01-01", fine: "1938-12-31" } as const;
const FINESTRA_1939 = { nome: "1939", inizio: "1939-01-01", fine: "1939-12-31" } as const;
const FINESTRA_1940 = { nome: "1940", inizio: "1940-01-01", fine: "1940-12-31" } as const;
const FINESTRA_1941 = { nome: "1941", inizio: "1941-01-01", fine: "1941-12-31" } as const;
const FINESTRA_1942 = { nome: "1942", inizio: "1942-01-01", fine: "1942-12-31" } as const;
const FINESTRA_1943 = { nome: "1943", inizio: "1943-01-01", fine: "1943-12-31" } as const;
const FINESTRA_1944 = { nome: "1944", inizio: "1944-01-01", fine: "1944-12-31" } as const;
const FINESTRA_1945 = { nome: "1945", inizio: "1945-01-01", fine: "1945-12-31" } as const;
const FINESTRA_1946 = { nome: "1946", inizio: "1946-01-01", fine: "1946-12-31" } as const;
const FINESTRA_1947 = { nome: "1947", inizio: "1947-01-01", fine: "1947-12-31" } as const;

/** Ordine di default: backfill pre-1948 Regno d'Italia (1935 prima, 1947 ultima). */
const ORDINE_DEFAULT = ["1935", "1936", "1937", "1938", "1939", "1940", "1941", "1942", "1943", "1944", "1945", "1946", "1947"] as const;

/** Finestre selezionabili via --anni (stesso bounded: max 80 atti). */
const FINESTRE_DISPONIBILI = {
  "1935": FINESTRA_1935,
  "1936": FINESTRA_1936,
  "1937": FINESTRA_1937,
  "1938": FINESTRA_1938,
  "1939": FINESTRA_1939,
  "1940": FINESTRA_1940,
  "1941": FINESTRA_1941,
  "1942": FINESTRA_1942,
  "1943": FINESTRA_1943,
  "1944": FINESTRA_1944,
  "1945": FINESTRA_1945,
  "1946": FINESTRA_1946,
  "1947": FINESTRA_1947,
} as const;

type NomeFinestraPreP4 = keyof typeof FINESTRE_DISPONIBILI;

/** Output default per finestra (mai fuori data/reali senza --out esplicito). */
const OUT_DEFAULT_FINESTRA: Record<NomeFinestraPreP4, string> = {
  "1935": path.join("data", "reali", "normattiva-storico-1935.json"),
  "1936": path.join("data", "reali", "normattiva-storico-1936.json"),
  "1937": path.join("data", "reali", "normattiva-storico-1937.json"),
  "1938": path.join("data", "reali", "normattiva-storico-1938.json"),
  "1939": path.join("data", "reali", "normattiva-storico-1939.json"),
  "1940": path.join("data", "reali", "normattiva-storico-1940.json"),
  "1941": path.join("data", "reali", "normattiva-storico-1941.json"),
  "1942": path.join("data", "reali", "normattiva-storico-1942.json"),
  "1943": path.join("data", "reali", "normattiva-storico-1943.json"),
  "1944": path.join("data", "reali", "normattiva-storico-1944.json"),
  "1945": path.join("data", "reali", "normattiva-storico-1945.json"),
  "1946": path.join("data", "reali", "normattiva-storico-1946.json"),
  "1947": path.join("data", "reali", "normattiva-storico-1947.json"),
};

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

export function normalizzaFinestraPreP4(testo: string): string {
  return (testo ?? "").replace(/\s+/g, " ").trim();
}

export function stringaFinestraPreP4(voce: unknown): string {
  if (typeof voce === "string") return voce.trim();
  if (typeof voce === "number" && Number.isFinite(voce)) return String(voce);
  return "";
}

export function isIsoDateFinestraPreP4(testo: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testo)) return false;
  const parsed = new Date(`${testo}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === testo;
}

/**
 * Pulizia testi visibili: em-dash (U+2014) ed en-dash (U+2013) diventano `-`;
 * max 1 middle-dot (U+00B7) per riga, i successivi diventano `-`. Pura.
 */
export function pulisciTestoVisibilePreP4(testo: string): string {
  const senzaTrattini = String(testo ?? "").replace(/[—–]/g, "-");
  const righe = senzaTrattini.split("\n");
  const pulite = righe.map((riga) => {
    let visti = 0;
    return riga
      .split("")
      .map((ch) => {
        if (ch !== "·") return ch;
        visti += 1;
        return visti <= 1 ? ch : "-";
      })
      .join("");
  });
  return pulite.join("\n");
}

function isoDaParti(anno: unknown, mese: unknown, giorno: unknown): string {
  const a = stringaFinestraPreP4(anno).padStart(4, "0");
  const m = stringaFinestraPreP4(mese).padStart(2, "0");
  const g = stringaFinestraPreP4(giorno).padStart(2, "0");
  const iso = `${a}-${m}-${g}`;
  return isIsoDateFinestraPreP4(iso) ? iso : "";
}

/** Chiave di dedup ELI: trim + lowercase (stessa regola del resto dell'app). */
export function chiaveEliFinestraPreP4(eli: unknown): string {
  return String(eli ?? "").trim().toLowerCase();
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
export function statoDaFineVigenzaPreP4(
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
export function statoDaIntestazioneArt1PreP4(testo: string): "decaduto" | "abrogato" | null {
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
 * Costruisce un URN NIR reale dai campi di una voce di lista aggiornati
 * (`denominazioneAtto`, `numeroProvvedimento`, `anno/mese/giornoProvvedimento`).
 * Restituisce "" se i campi non bastano: mai inventare.
 */
export function urnDaVoceFinestraPreP4(voce: unknown): string {
  if (!isRecord(voce)) return "";
  const denominazione = stringaFinestraPreP4(
    voce["denominazioneAtto"] ?? voce["tipoProvvedimentoDescrizione"],
  );
  const tipo = tipoFromDenominazione(denominazione);
  const numero = stringaFinestraPreP4(
    voce["numeroProvvedimento"] ?? voce["numero"] ?? voce["numeroAttoAlfanumerico"],
  );
  const iso = isoDaParti(voce["annoProvvedimento"], voce["meseProvvedimento"], voce["giornoProvvedimento"]);
  if (!tipo || !numero || !iso) return "";
  const urn = formatNIR({ tipo, data: iso, numero });
  return parseNIR(urn) ? urn : "";
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
export function dettaglioToRecordFinestraPreP4(
  voce: VoceFinestraPreP4,
  raw: unknown,
  testoMax: number,
): LawRecord | null {
  const interno = attoInterno(raw);
  if (!interno) return null;
  const dto: AttoDto | null = parseAttoDto(interno);

  const titoloGrezzo =
    normalizzaFinestraPreP4(dto?.titolo ?? "") ||
    normalizzaFinestraPreP4(stringaFinestraPreP4(interno["titolo"])) ||
    normalizzaFinestraPreP4(stringaFinestraPreP4(interno["descrizioneAtto"]));
  if (!titoloGrezzo) return null;
  const titolo = pulisciTestoVisibilePreP4(titoloGrezzo);
  if (!titolo) return null;

  const tipo =
    dto?.tipo ||
    tipoFromDenominazione(
      stringaFinestraPreP4(interno["tipoProvvedimentoDescrizione"]) ||
        stringaFinestraPreP4(interno["denominazioneAtto"]),
    ) ||
    "atto";

  const numero =
    dto?.numero ||
    stringaFinestraPreP4(interno["numeroProvvedimento"]) ||
    (parseNIR(voce.urn)?.numero ?? "");
  if (!numero) return null;

  const dataEmanazione =
    dto?.dataEmanazione ||
    isoDaParti(interno["annoProvvedimento"], interno["meseProvvedimento"], interno["giornoProvvedimento"]) ||
    normalizzaData(interno["dataEmanazione"]) ||
    (parseNIR(voce.urn)?.data ?? "");
  if (!dataEmanazione) return null;

  const codice = dto?.codiceRedazionale || stringaFinestraPreP4(interno["codiceRedazionale"]) || voce.codice;

  const html = dto?.articoloHtml || stringaFinestraPreP4(interno["articoloHtml"]);
  const testoIntegrale = dto?.testo || stripHtml(html);
  const sottoTitolo =
    dto?.sottoTitolo || normalizzaFinestraPreP4(stringaFinestraPreP4(interno["sottoTitolo"]));
  // Vigenza onesta, in ordine di affidabilita':
  // 1) data di fine vigenza esplicita del dettaglio (passata = abrogato);
  // 2) intestazione formale Art. 1 di Normattiva (DECRETO DECADUTO /
  //    PROVVEDIMENTO ABROGATO = status ufficiale, non citazione nel corpo);
  // 3) default in_vigore. MAI inferire dal corpo del testo.
  const fineVigenzaGrezza = stringaFinestraPreP4(interno["articoloDataFineVigenza"]);
  const daData = statoDaFineVigenzaPreP4(fineVigenzaGrezza, oggiCompact());
  const daIntestazione = statoDaIntestazioneArt1PreP4(testoIntegrale);
  const stato: "in_vigore" | "abrogato" | "decaduto" =
    daData === "abrogato" ? "abrogato" : (daIntestazione ?? "in_vigore");

  const eliReale = dto?.eli && dto.eli.startsWith("/") ? dto.eli : voce.eliReale;
  const eliValido = eliReale && parseELI(eliReale) ? eliReale : "";
  const eli = eliValido || (codice ? eliFromUrn(voce.urn, codice) : "");
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
    (isIsoDateFinestraPreP4(voce.dataGU) ? voce.dataGU : "");
  const numeroGU =
    stringaFinestraPreP4(interno["numeroGU"]) || (/^\d+$/.test(voce.numeroGU) ? voce.numeroGU : "");

  const fonti = buildFonti({
    tipo,
    numero,
    dataEmanazione,
    codiceRedazionale: codice || undefined,
    dataGU: dataGU || undefined,
    numeroGU: numeroGU || undefined,
  });

  const sintesi = pulisciTestoVisibilePreP4(
    normalizzaFinestraPreP4(law.sintesi || sottoTitolo || testoIntegrale || titolo),
  ).slice(0, 600);
  if (!sintesi) return null;

  const testoPieno = pulisciTestoVisibilePreP4((law.testo ?? "").trim());
  const troncato = testoPieno.length > testoMax;
  const record: LawRecord = {
    chiave,
    titolo: pulisciTestoVisibilePreP4(law.titolo),
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
    "Ingest finestre pre-P4 (1935-1947 Regno d'Italia) Normattiva 1935/1936/1937/1938/1939/1940/1941/1942/1943/1944/1945/1946/1947 (dati ufficiali, mai dimostrativi).",
    "",
    "Uso:",
    "  npx tsx scripts/ingest-reale-pre-P4.ts [opzioni]",
    "",
    "Opzioni:",
    "  --anni=A,B            finestre da ingerire (default 1935,1936,1937,1938,1939,1940,1941,1942,1943,1944,1945,1946,1947; ammessi 1935,1936,1937,1938,1939,1940,1941,1942,1943,1944,1945,1946,1947)",
    "  --limite=N            atti per finestra (default 80, MAI oltre 80)",
    "  --testo-max=N         caratteri max per testo (default 2000, max 61440)",
    "  --out-1935=PATH       file JSON finestra 1935 (default data/reali/normattiva-storico-1935.json)",
    "  --out-1936=PATH       file JSON finestra 1936 (default data/reali/normattiva-storico-1936.json)",
    "  --out-1937=PATH       file JSON finestra 1937 (default data/reali/normattiva-storico-1937.json)",
    "  --out-1938=PATH       file JSON finestra 1938 (default data/reali/normattiva-storico-1938.json)",
    "  --out-1939=PATH       file JSON finestra 1939 (default data/reali/normattiva-storico-1939.json)",
    "  --out-1940=PATH       file JSON finestra 1940 (default data/reali/normattiva-storico-1940.json)",
    "  --out-1941=PATH       file JSON finestra 1941 (default data/reali/normattiva-storico-1941.json)",
    "  --out-1942=PATH       file JSON finestra 1942 (default data/reali/normattiva-storico-1942.json)",
    "  --out-1943=PATH       file JSON finestra 1943 (default data/reali/normattiva-storico-1943.json)",
    "  --out-1944=PATH       file JSON finestra 1944 (default data/reali/normattiva-storico-1944.json)",
    "  --out-1945=PATH       file JSON finestra 1945 (default data/reali/normattiva-storico-1945.json)",
    "  --out-1946=PATH       file JSON finestra 1946 (default data/reali/normattiva-storico-1946.json)",
    "  --out-1947=PATH       file JSON finestra 1947 (default data/reali/normattiva-storico-1947.json)",
    "  --api-base=URL        override base API Normattiva",
    "  --help                mostra questo aiuto",
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

/** Voci reali da una risposta di `POST /ricerca/aggiornati` (dedup per URN). */
export function vociDaAggiornatiPreP4(raw: unknown): VoceFinestraPreP4[] {
  const voci = arrayDa(unwrapData(raw), ["listaAtti", "atti", "risultati", "hits"]);
  const risultato: VoceFinestraPreP4[] = [];
  const visti = new Set<string>();
  for (const voce of voci) {
    const urn = urnDaVoceFinestraPreP4(voce);
    if (!urn || visti.has(urn)) continue;
    visti.add(urn);
    if (!isRecord(voce)) continue;
    const dataGUCandidata = normalizzaData(voce["dataGU"]);
    const eliGrezzo = stringaFinestraPreP4(voce["eli"]);
    const eliCandidato = eliGrezzo.startsWith("/") ? eliGrezzo : eliGrezzo ? `/${eliGrezzo}` : "";
    risultato.push({
      urn,
      codice: stringaFinestraPreP4(voce["codiceRedazionale"]),
      dataGU: isIsoDateFinestraPreP4(dataGUCandidata) ? dataGUCandidata : "",
      numeroGU: stringaFinestraPreP4(voce["numeroGU"]),
      eliReale: eliCandidato && parseELI(eliCandidato) ? eliCandidato : "",
    });
  }
  return risultato;
}

/** Errore "troppi atti" del server (limite 7000): va raffinata la ricerca. */
export function isErroreLimiteAttiPreP4(cause: unknown): boolean {
  return /superiore al limite|superiore a 12 mesi|periodo di esportazione|7000|1501|raffinare la ricerca/i.test(
    messaggioDi(cause),
  );
}

/** Dimezza un intervallo ISO [inizio..fine] in due sotto-intervalli per giorni. */
export function dividiIntervalloPreP4(inizio: string, fine: string): Array<[string, string]> | null {
  if (!isIsoDateFinestraPreP4(inizio) || !isIsoDateFinestraPreP4(fine) || inizio >= fine) return null;
  const t0 = Date.parse(`${inizio}T00:00:00Z`);
  const t1 = Date.parse(`${fine}T00:00:00Z`);
  const giorni = Math.round((t1 - t0) / 86400000);
  if (!Number.isFinite(giorni) || giorni < 1) return null;
  const mid = new Date(t0 + Math.floor(giorni / 2) * 86400000).toISOString().slice(0, 10);
  const dopoMid = new Date(Date.parse(`${mid}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  if (!(inizio <= mid && dopoMid <= fine && mid < dopoMid)) return null;
  return [
    [inizio, mid],
    [dopoMid, fine],
  ];
}

/** Finestra aggiornati: POST /api/v1/ricerca/aggiornati su [inizio..fine]. */
async function listaFinestra(
  overrides: Partial<NormattivaConfig>,
  inizio: string,
  fine: string,
): Promise<{ voci: VoceFinestraPreP4[]; url: string }> {
  const raw = await postJson(overrides, "/api/v1/ricerca/aggiornati", {
    dataInizioAggiornamento: inizio,
    dataFineAggiornamento: fine,
  });
  const baseUrl = defaultNormattivaConfig(overrides).baseUrl;
  return { voci: vociDaAggiornatiPreP4(raw), url: `${baseUrl}/api/v1/ricerca/aggiornati` };
}

/**
 * Lista con split onesto: se il server rifiuta l'intervallo perche' oltre il
 * limite di 7000 atti, l'intervallo viene dimezzato ricorsivamente (stessa
 * API, stessi parametri) e le voci unite con dedup URN. Mai oltre i cap.
 */
async function listaFinestraConSplit(
  overrides: Partial<NormattivaConfig>,
  inizio: string,
  fine: string,
): Promise<{ voci: VoceFinestraPreP4[]; url: string }> {
  const baseUrl = defaultNormattivaConfig(overrides).baseUrl;
  const url = `${baseUrl}/api/v1/ricerca/aggiornati`;
  const coda: Array<[string, string]> = [[inizio, fine]];
  const voci: VoceFinestraPreP4[] = [];
  const visti = new Set<string>();
  while (coda.length > 0) {
    const [ini, fin] = coda.shift() as [string, string];
    try {
      const { voci: trovate } = await listaFinestra(overrides, ini, fin);
      for (const voce of trovate) {
        if (visti.has(voce.urn)) continue;
        visti.add(voce.urn);
        voci.push(voce);
      }
    } catch (cause) {
      const parti = dividiIntervalloPreP4(ini, fin);
      if (isErroreLimiteAttiPreP4(cause) && parti) {
        console.log(`Split intervallo ${ini}..${fin} (oltre limite 7000 atti).`);
        coda.unshift(...parti);
        continue;
      }
      throw cause;
    }
  }
  return { voci, url };
}

/**
 * Percorsi esistenti per dedup: tutti i normattiva-*.json su disco tranne i
 * propri output (mai rileggere i propri output). Non lancia mai.
 */
export async function percorsiDedupPreP4(escludi: readonly string[]): Promise<string[]> {
  const esclusi = new Set(escludi.map((p) => path.resolve(p)));
  try {
    const dir = path.resolve(path.join("data", "reali"));
    const nomi = await readdir(dir);
    return nomi
      .filter((n) => n.startsWith("normattiva-") && n.endsWith(".json"))
      .map((n) => path.join("data", "reali", n))
      .filter((p) => !esclusi.has(path.resolve(p)));
  } catch {
    return [];
  }
}

/**
 * Carica gli ELI/nir/chiave gia' presenti nei file esistenti (lower+trim).
 * Non lancia mai: se un file manca o e' invalido viene saltato.
 */
export async function caricaChiaviEsistentiPreP4(percorsi: readonly string[]): Promise<Set<string>> {
  const chiavi = new Set<string>();
  for (const percorso of percorsi) {
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
        for (const campo of ["eli", "nir", "chiave"] as const) {
          const chiave = chiaveEliFinestraPreP4(item[campo]);
          if (chiave) chiavi.add(chiave);
        }
      }
    } catch {
      continue;
    }
  }
  return chiavi;
}

/** ELI candidati di una voce (reale osservato + derivato da URN/codice). */
export function eliCandidatiPreP4(voce: VoceFinestraPreP4): string[] {
  const candidati = new Set<string>();
  const reale = chiaveEliFinestraPreP4(voce.eliReale);
  if (reale) candidati.add(reale);
  if (voce.codice) {
    const derivato = chiaveEliFinestraPreP4(eliFromUrn(voce.urn, voce.codice));
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

  const limite = intero("limite", MAX_ATTI_FINESTRA, 1, MAX_ATTI_FINESTRA);
  const testoMax = intero("testo-max", 2000, 1000, 61440);
  const anniGrezzi = (argomento("anni") ?? [...ORDINE_DEFAULT].join(","))
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a in FINESTRE_DISPONIBILI) as NomeFinestraPreP4[];
  const vistiAnni = new Set<string>();
  const anni: NomeFinestraPreP4[] = [];
  for (const a of anniGrezzi.length > 0 ? anniGrezzi : [...ORDINE_DEFAULT]) {
    const nome = String(a) as NomeFinestraPreP4;
    if (!(nome in FINESTRE_DISPONIBILI) || vistiAnni.has(nome)) continue;
    vistiAnni.add(nome);
    anni.push(nome);
  }
  const outPerAnno = new Map<NomeFinestraPreP4, string>();
  for (const anno of anni) {
    outPerAnno.set(anno, argomento(`out-${anno}`) ?? OUT_DEFAULT_FINESTRA[anno]);
  }
  const apiBase = argomento("api-base");

  const overridesPost: Partial<NormattivaConfig> = {
    timeoutMs: TIMEOUT_POST_MS,
    retries: RETRIES,
    ...(apiBase ? { baseUrl: apiBase } : {}),
  };

  const finestre = anni.map((anno) => FINESTRE_DISPONIBILI[anno]);
  console.log(
    `Ingest finestre pre-P4 (1935-1947 Regno d'Italia) Normattiva: ${finestre.map((f) => `${f.inizio}..${f.fine}`).join(" + ")} (max ${limite}/finestra).`,
  );

  // Dedup vs tutti i normattiva-*.json esistenti tranne i propri output.
  const propriOutput = anni.map((a) => OUT_DEFAULT_FINESTRA[a]);
  const percorsiDedup = await percorsiDedupPreP4(propriOutput);
  const conosciuti = await caricaChiaviEsistentiPreP4(percorsiDedup);
  console.log(
    `Dedup: ${conosciuti.size} chiavi ELI/nir gia' presenti nei file esistenti (${percorsiDedup.length} percorsi).`,
  );

  const escludiConosciute = (voci: VoceFinestraPreP4[]): VoceFinestraPreP4[] =>
    voci.filter((voce) => {
      if (chiaveEliFinestraPreP4(voce.urn) && conosciuti.has(chiaveEliFinestraPreP4(voce.urn)))
        return false;
      for (const candidato of eliCandidatiPreP4(voce)) {
        if (conosciuti.has(candidato)) return false;
      }
      return true;
    });

  // Liste per finestra (bounded: max 80 atti), con dedup incrociata cumulativa.
  const vociPerAnno = new Map<NomeFinestraPreP4, VoceFinestraPreP4[]>();
  const urlPerAnno = new Map<NomeFinestraPreP4, string>();
  const urnViste = new Set<string>();
  const eliViste = new Set<string>();
  for (const finestra of finestre) {
    const nome = finestra.nome as NomeFinestraPreP4;
    try {
      const { voci, url } = await listaFinestraConSplit(overridesPost, finestra.inizio, finestra.fine);
      urlPerAnno.set(nome, url);
      console.log(`Finestra ${nome}: ${voci.length} voci reali.`);
      const filtrate = escludiConosciute(voci).filter((voce) => {
        const urnChiave = chiaveEliFinestraPreP4(voce.urn);
        if (urnChiave && urnViste.has(urnChiave)) return false;
        if (eliCandidatiPreP4(voce).some((c) => eliViste.has(c))) return false;
        return true;
      });
      console.log(`Finestra ${nome}: ${voci.length} voci, ${voci.length - filtrate.length} duplicate escluse.`);
      const selezionate = filtrate.slice(0, limite);
      vociPerAnno.set(nome, selezionate);
      for (const voce of selezionate) {
        urnViste.add(chiaveEliFinestraPreP4(voce.urn));
        for (const c of eliCandidatiPreP4(voce)) eliViste.add(c);
      }
    } catch (cause) {
      console.log(`Finestra ${nome} fallita (${messaggioDi(cause)}).`);
      if (erroreDefinitivo(cause)) {
        console.log(`Errore definitivo (403/409/ERR_409) sulla finestra ${nome}.`);
      }
      vociPerAnno.set(nome, []);
    }
  }

  const daDettagliare: Array<{ voce: VoceFinestraPreP4; gruppo: NomeFinestraPreP4 }> = [];
  for (const finestra of finestre) {
    const nome = finestra.nome as NomeFinestraPreP4;
    for (const voce of vociPerAnno.get(nome) ?? []) daDettagliare.push({ voce, gruppo: nome });
  }
  if (daDettagliare.length === 0) {
    console.error("Nessuna voce reale da dettagliare: nessun file scritto.");
    process.exitCode = 1;
    return;
  }
  console.log(`Recupero dettagli per ${daDettagliare.length} atti (batch da ${DETTAGLI_PER_BATCH}).`);

  const attiPerAnno = new Map<NomeFinestraPreP4, LawRecord[]>();
  for (const finestra of finestre) attiPerAnno.set(finestra.nome as NomeFinestraPreP4, []);
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
        const record = dettaglioToRecordFinestraPreP4(voce, raw, testoMax);
        if (!record) {
          errori.push(`dettaglio senza titolo/chiave: ${voce.urn}`);
          continue;
        }
        // Dedup finale: mai due record per lo stesso atto (chiave + ELI/nir
        // contro gli esistenti e contro i record gia' raccolti).
        const impronte = [
          chiaveEliFinestraPreP4(record.chiave),
          chiaveEliFinestraPreP4(record.eli),
          chiaveEliFinestraPreP4(record.nir),
        ].filter(Boolean);
        if (impronte.some((impronta) => visti.has(impronta) || conosciuti.has(impronta))) {
          errori.push(`duplicato escluso: ${voce.urn}`);
          continue;
        }
        for (const impronta of impronte) visti.add(impronta);
        attiPerAnno.get(gruppo)?.push(record);
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
    `Dettagli OK: ${finestre.map((f) => `finestra${f.nome}=${attiPerAnno.get(f.nome as NomeFinestraPreP4)?.length ?? 0}`).join(" ")}; scarti/errori: ${errori.length}.`,
  );
  // Pre-1948: atti 1800/primi-900 spesso senza dettaglio servito, scarti onesti
  // attesi. Anni a zero => NESSUN file per quell'anno (lista onesta). Esce 1
  // SENZA scrivere alcun file solo se TUTTE le finestre sono vuote.
  const vuote = finestre.filter((f) => (attiPerAnno.get(f.nome as NomeFinestraPreP4)?.length ?? 0) === 0);
  const piene = finestre.filter((f) => (attiPerAnno.get(f.nome as NomeFinestraPreP4)?.length ?? 0) > 0);
  if (vuote.length > 0) {
    console.log(`Anni vuoti onesti (nessun file): ${vuote.map((f) => f.nome).join(",")}.`);
  }
  if (piene.length === 0) {
    console.error(`Tutte le finestre senza atti reali (${vuote.map((f) => f.nome).join(",")}): nessun file scritto.`);
    for (const e of errori.slice(0, 10)) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  const recuperatoIl = new Date().toISOString();
  const jsonPerAnno = new Map<NomeFinestraPreP4, string>();
  for (const finestra of piene) {
    const nome = finestra.nome as NomeFinestraPreP4;
    const envelope: Envelope = {
      provenance: {
        fonte: "normattiva",
        url: urlPerAnno.get(nome) ?? "",
        recuperatoIl,
        licenza: LICENZA,
      },
      atti: attiPerAnno.get(nome) ?? [],
    };
    jsonPerAnno.set(nome, JSON.stringify(envelope, null, 2));
  }

  for (const finestra of piene) {
    const nome = finestra.nome as NomeFinestraPreP4;
    const kb = Buffer.byteLength(jsonPerAnno.get(nome) ?? "", "utf8") / DIM_KB;
    if (kb > LIMITE_FILE_KB) {
      console.error(
        `File oltre il limite di ${LIMITE_FILE_KB} KB ` +
          `(${piene.map((f) => `${f.nome}=${(Buffer.byteLength(jsonPerAnno.get(f.nome as NomeFinestraPreP4) ?? "", "utf8") / DIM_KB).toFixed(1)} KB`).join(", ")}): nessun file scritto.`,
      );
      process.exitCode = 1;
      return;
    }
  }

  for (const finestra of piene) {
    const nome = finestra.nome as NomeFinestraPreP4;
    const dest = path.resolve(outPerAnno.get(nome) ?? OUT_DEFAULT_FINESTRA[nome]);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, jsonPerAnno.get(nome) ?? "", "utf8");
  }
  console.log(
    piene
      .map((f) => {
        const nome = f.nome as NomeFinestraPreP4;
        const kb = Buffer.byteLength(jsonPerAnno.get(nome) ?? "", "utf8") / DIM_KB;
        return `Scritti ${(attiPerAnno.get(nome) ?? []).length} atti ${nome} in ${path.resolve(outPerAnno.get(nome) ?? "")} (${kb.toFixed(1)} KB).`;
      })
      .join(" "),
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
  (process.argv[1] ?? "").endsWith("ingest-reale-pre-P4.ts");

if (eseguitoComeScript) {
  main().catch((cause: unknown) => {
    console.error(`Ingest finestre fallito: ${messaggioDi(cause)}`);
    process.exitCode = 1;
  });
}
