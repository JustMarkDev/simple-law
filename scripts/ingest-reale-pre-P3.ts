/**
 * Ingest backfill pre-1948 P3 (Regno d'Italia 1920-1934) Normattiva
 * -> data/reali/normattiva-storico-{anno}.json per 1920..1934.
 *
 * Legge atti VERI dalle API Open Data di Normattiva (bff-opendata v1) e li
 * salva con envelope di provenance. Nessun dato dimostrativo: ogni campo del
 * record deriva dalla risposta HTTP (lista + dettaglio) oppure il record
 * viene scartato. Mai inventati: codici redazionali, numeri, URL, date, stati.
 *
 * Attenzione storica: gli atti del 1800/primi-900 spesso non hanno dettaglio
 * servito -> scarti onesti attesi, MAI inventare. Anni a zero atti reali:
 * NESSUN file scritto per quell'anno (lista anni vuoti onesta in output).
 *
 * Sorgenti (bounded, MAI oltre i cap):
 *   - finestra <anno>: POST /api/v1/ricerca/aggiornati su <anno>-01-01..<anno>-12-31
 *     (max 80 atti per finestra).
 * Dettaglio per ogni URN: POST /api/v1/atto/dettaglio-atto-urn {urn} con il
 * prefisso `urn:` obbligatorio, a batch di 5 con pausa di 400 ms. Timeout
 * 15000 ms per le POST, retry solo su 429/5xx (gestiti da lib/normattiva.ts);
 * stop su 403/409/ERR_409.
 *
 * Dedup: gli ELI/nir/chiave gia' presenti in TUTTI i data/reali/*.json
 * esistenti su disco (tutti i normattiva-*.json tranne i propri output, letti
 * via readdir: mai rileggere i propri output) e i duplicati intra-file / tra
 * le finestre selezionate vengono esclusi: mai due record per lo stesso atto.
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
 *   bunx tsx scripts/ingest-reale-pre-P3.ts [--anni=1920,1921,1922,1923,1924,1925,1926,1927,1928,1929,1930,1931,1932,1933,1934]
 *     [--limite=80] [--testo-max=2000] [--api-base=...] [--help]
 *
 * Esce con codice 1 (SENZA scrivere file parziali) se TUTTE le finestre
 * selezionate restituiscono zero atti reali o se un JSON supera 950 KB.
 * Le finestre con zero atti reali non producono alcun file; le finestre con
 * atti>0 vengono scritte normalmente (anni vuoti riportati in output).
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

export interface VoceFinestraPreP3 {
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

const FINESTRA_1920 = { nome: "1920", inizio: "1920-01-01", fine: "1920-12-31" } as const;
const FINESTRA_1921 = { nome: "1921", inizio: "1921-01-01", fine: "1921-12-31" } as const;
const FINESTRA_1922 = { nome: "1922", inizio: "1922-01-01", fine: "1922-12-31" } as const;
const FINESTRA_1923 = { nome: "1923", inizio: "1923-01-01", fine: "1923-12-31" } as const;
const FINESTRA_1924 = { nome: "1924", inizio: "1924-01-01", fine: "1924-12-31" } as const;
const FINESTRA_1925 = { nome: "1925", inizio: "1925-01-01", fine: "1925-12-31" } as const;
const FINESTRA_1926 = { nome: "1926", inizio: "1926-01-01", fine: "1926-12-31" } as const;
const FINESTRA_1927 = { nome: "1927", inizio: "1927-01-01", fine: "1927-12-31" } as const;
const FINESTRA_1928 = { nome: "1928", inizio: "1928-01-01", fine: "1928-12-31" } as const;
const FINESTRA_1929 = { nome: "1929", inizio: "1929-01-01", fine: "1929-12-31" } as const;
const FINESTRA_1930 = { nome: "1930", inizio: "1930-01-01", fine: "1930-12-31" } as const;
const FINESTRA_1931 = { nome: "1931", inizio: "1931-01-01", fine: "1931-12-31" } as const;
const FINESTRA_1932 = { nome: "1932", inizio: "1932-01-01", fine: "1932-12-31" } as const;
const FINESTRA_1933 = { nome: "1933", inizio: "1933-01-01", fine: "1933-12-31" } as const;
const FINESTRA_1934 = { nome: "1934", inizio: "1934-01-01", fine: "1934-12-31" } as const;

/** Ordine di default: backfill pre-1948 P3 Regno d'Italia (1920 primo, 1934 ultimo). */
const ORDINE_DEFAULT = [
  "1920",
  "1921",
  "1922",
  "1923",
  "1924",
  "1925",
  "1926",
  "1927",
  "1928",
  "1929",
  "1930",
  "1931",
  "1932",
  "1933",
  "1934",
] as const;

/** Finestre selezionabili via --anni (stesso bounded: max 80 atti). */
const FINESTRE_DISPONIBILI = {
  "1920": FINESTRA_1920,
  "1921": FINESTRA_1921,
  "1922": FINESTRA_1922,
  "1923": FINESTRA_1923,
  "1924": FINESTRA_1924,
  "1925": FINESTRA_1925,
  "1926": FINESTRA_1926,
  "1927": FINESTRA_1927,
  "1928": FINESTRA_1928,
  "1929": FINESTRA_1929,
  "1930": FINESTRA_1930,
  "1931": FINESTRA_1931,
  "1932": FINESTRA_1932,
  "1933": FINESTRA_1933,
  "1934": FINESTRA_1934,
} as const;

type NomeFinestraPreP3 = keyof typeof FINESTRE_DISPONIBILI;

/** Output default per finestra (mai fuori data/reali senza --out esplicito). */
const OUT_DEFAULT_FINESTRA: Record<NomeFinestraPreP3, string> = {
  "1920": path.join("data", "reali", "normattiva-storico-1920.json"),
  "1921": path.join("data", "reali", "normattiva-storico-1921.json"),
  "1922": path.join("data", "reali", "normattiva-storico-1922.json"),
  "1923": path.join("data", "reali", "normattiva-storico-1923.json"),
  "1924": path.join("data", "reali", "normattiva-storico-1924.json"),
  "1925": path.join("data", "reali", "normattiva-storico-1925.json"),
  "1926": path.join("data", "reali", "normattiva-storico-1926.json"),
  "1927": path.join("data", "reali", "normattiva-storico-1927.json"),
  "1928": path.join("data", "reali", "normattiva-storico-1928.json"),
  "1929": path.join("data", "reali", "normattiva-storico-1929.json"),
  "1930": path.join("data", "reali", "normattiva-storico-1930.json"),
  "1931": path.join("data", "reali", "normattiva-storico-1931.json"),
  "1932": path.join("data", "reali", "normattiva-storico-1932.json"),
  "1933": path.join("data", "reali", "normattiva-storico-1933.json"),
  "1934": path.join("data", "reali", "normattiva-storico-1934.json"),
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

export function normalizzaFinestraPreP3(testo: string): string {
  return (testo ?? "").replace(/\s+/g, " ").trim();
}

export function stringaFinestraPreP3(voce: unknown): string {
  if (typeof voce === "string") return voce.trim();
  if (typeof voce === "number" && Number.isFinite(voce)) return String(voce);
  return "";
}

export function isIsoDateFinestraPreP3(testo: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testo)) return false;
  const parsed = new Date(`${testo}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === testo;
}

/**
 * Pulizia testi visibili: em-dash (U+2014) ed en-dash (U+2013) diventano `-`;
 * max 1 middle-dot (U+00B7) per riga, i successivi diventano `-`. Pura.
 */
export function pulisciTestoVisibilePreP3(testo: string): string {
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
  const a = stringaFinestraPreP3(anno).padStart(4, "0");
  const m = stringaFinestraPreP3(mese).padStart(2, "0");
  const g = stringaFinestraPreP3(giorno).padStart(2, "0");
  const iso = `${a}-${m}-${g}`;
  return isIsoDateFinestraPreP3(iso) ? iso : "";
}

/** Chiave di dedup ELI: trim + lowercase (stessa regola del resto dell'app). */
export function chiaveEliFinestraPreP3(eli: unknown): string {
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
export function statoDaFineVigenzaPreP3(
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
export function statoDaIntestazioneArt1PreP3(testo: string): "decaduto" | "abrogato" | null {
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
export function urnDaVoceFinestraPreP3(voce: unknown): string {
  if (!isRecord(voce)) return "";
  const denominazione = stringaFinestraPreP3(
    voce["denominazioneAtto"] ?? voce["tipoProvvedimentoDescrizione"],
  );
  const tipo = tipoFromDenominazione(denominazione);
  const numero = stringaFinestraPreP3(
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
export function dettaglioToRecordFinestraPreP3(
  voce: VoceFinestraPreP3,
  raw: unknown,
  testoMax: number,
): LawRecord | null {
  const interno = attoInterno(raw);
  if (!interno) return null;
  const dto: AttoDto | null = parseAttoDto(interno);

  const titoloGrezzo =
    normalizzaFinestraPreP3(dto?.titolo ?? "") ||
    normalizzaFinestraPreP3(stringaFinestraPreP3(interno["titolo"])) ||
    normalizzaFinestraPreP3(stringaFinestraPreP3(interno["descrizioneAtto"]));
  if (!titoloGrezzo) return null;
  const titolo = pulisciTestoVisibilePreP3(titoloGrezzo);
  if (!titolo) return null;

  const tipo =
    dto?.tipo ||
    tipoFromDenominazione(
      stringaFinestraPreP3(interno["tipoProvvedimentoDescrizione"]) ||
        stringaFinestraPreP3(interno["denominazioneAtto"]),
    ) ||
    "atto";

  const numero =
    dto?.numero ||
    stringaFinestraPreP3(interno["numeroProvvedimento"]) ||
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
    dto?.codiceRedazionale || stringaFinestraPreP3(interno["codiceRedazionale"]) || voce.codice;

  const html = dto?.articoloHtml || stringaFinestraPreP3(interno["articoloHtml"]);
  const testoIntegrale = dto?.testo || stripHtml(html);
  const sottoTitolo =
    dto?.sottoTitolo || normalizzaFinestraPreP3(stringaFinestraPreP3(interno["sottoTitolo"]));
  // Vigenza onesta, in ordine di affidabilita':
  // 1) data di fine vigenza esplicita del dettaglio (passata = abrogato);
  // 2) intestazione formale Art. 1 di Normattiva (DECRETO DECADUTO /
  //    PROVVEDIMENTO ABROGATO = status ufficiale, non citazione nel corpo);
  // 3) default in_vigore. MAI inferire dal corpo del testo.
  const fineVigenzaGrezza = stringaFinestraPreP3(interno["articoloDataFineVigenza"]);
  const daData = statoDaFineVigenzaPreP3(fineVigenzaGrezza, oggiCompact());
  const daIntestazione = statoDaIntestazioneArt1PreP3(testoIntegrale);
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
    (isIsoDateFinestraPreP3(voce.dataGU) ? voce.dataGU : "");
  const numeroGU =
    stringaFinestraPreP3(interno["numeroGU"]) || (/^\d+$/.test(voce.numeroGU) ? voce.numeroGU : "");

  const fonti = buildFonti({
    tipo,
    numero,
    dataEmanazione,
    codiceRedazionale: codice || undefined,
    dataGU: dataGU || undefined,
    numeroGU: numeroGU || undefined,
  });

  const sintesi = pulisciTestoVisibilePreP3(
    normalizzaFinestraPreP3(law.sintesi || sottoTitolo || testoIntegrale || titolo),
  ).slice(0, 600);
  if (!sintesi) return null;

  const testoPieno = pulisciTestoVisibilePreP3((law.testo ?? "").trim());
  const troncato = testoPieno.length > testoMax;
  const record: LawRecord = {
    chiave,
    titolo: pulisciTestoVisibilePreP3(law.titolo),
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
    "Ingest backfill pre-1948 P3 (Regno d'Italia 1920-1934) Normattiva 1920/1921/1922/1923/1924/1925/1926/1927/1928/1929/1930/1931/1932/1933/1934 (dati ufficiali, mai dimostrativi).",
    "Atti 1800/primi-900 spesso senza dettaglio servito: scarti onesti attesi, MAI inventare. Anni a zero: NESSUN file.",
    "",
    "Uso:",
    "  bunx tsx scripts/ingest-reale-pre-P3.ts [opzioni]",
    "",
    "Opzioni:",
    "  --anni=A,B            finestre da ingerire (default 1920,1921,1922,1923,1924,1925,1926,1927,1928,1929,1930,1931,1932,1933,1934; ammessi 1920,1921,1922,1923,1924,1925,1926,1927,1928,1929,1930,1931,1932,1933,1934)",
    "  --limite=N            atti per finestra (default 80, MAI oltre 80)",
    "  --testo-max=N         caratteri max per testo (default 2000, max 61440)",
    "  --out-1920=PATH       file JSON finestra 1920 (default data/reali/normattiva-storico-1920.json)",
    "  --out-1921=PATH       file JSON finestra 1921 (default data/reali/normattiva-storico-1921.json)",
    "  --out-1922=PATH       file JSON finestra 1922 (default data/reali/normattiva-storico-1922.json)",
    "  --out-1923=PATH       file JSON finestra 1923 (default data/reali/normattiva-storico-1923.json)",
    "  --out-1924=PATH       file JSON finestra 1924 (default data/reali/normattiva-storico-1924.json)",
    "  --out-1925=PATH       file JSON finestra 1925 (default data/reali/normattiva-storico-1925.json)",
    "  --out-1926=PATH       file JSON finestra 1926 (default data/reali/normattiva-storico-1926.json)",
    "  --out-1927=PATH       file JSON finestra 1927 (default data/reali/normattiva-storico-1927.json)",
    "  --out-1928=PATH       file JSON finestra 1928 (default data/reali/normattiva-storico-1928.json)",
    "  --out-1929=PATH       file JSON finestra 1929 (default data/reali/normattiva-storico-1929.json)",
    "  --out-1930=PATH       file JSON finestra 1930 (default data/reali/normattiva-storico-1930.json)",
    "  --out-1931=PATH       file JSON finestra 1931 (default data/reali/normattiva-storico-1931.json)",
    "  --out-1932=PATH       file JSON finestra 1932 (default data/reali/normattiva-storico-1932.json)",
    "  --out-1933=PATH       file JSON finestra 1933 (default data/reali/normattiva-storico-1933.json)",
    "  --out-1934=PATH       file JSON finestra 1934 (default data/reali/normattiva-storico-1934.json)",
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
export function vociDaAggiornatiPreP3(raw: unknown): VoceFinestraPreP3[] {
  const voci = arrayDa(unwrapData(raw), ["listaAtti", "atti", "risultati", "hits"]);
  const risultato: VoceFinestraPreP3[] = [];
  const visti = new Set<string>();
  for (const voce of voci) {
    const urn = urnDaVoceFinestraPreP3(voce);
    if (!urn || visti.has(urn)) continue;
    visti.add(urn);
    if (!isRecord(voce)) continue;
    const dataGUCandidata = normalizzaData(voce["dataGU"]);
    const eliGrezzo = stringaFinestraPreP3(voce["eli"]);
    const eliCandidato = eliGrezzo.startsWith("/") ? eliGrezzo : eliGrezzo ? `/${eliGrezzo}` : "";
    risultato.push({
      urn,
      codice: stringaFinestraPreP3(voce["codiceRedazionale"]),
      dataGU: isIsoDateFinestraPreP3(dataGUCandidata) ? dataGUCandidata : "",
      numeroGU: stringaFinestraPreP3(voce["numeroGU"]),
      eliReale: eliCandidato && parseELI(eliCandidato) ? eliCandidato : "",
    });
  }
  return risultato;
}

/** Errore "troppi atti" del server (limite 7000): va raffinata la ricerca. */
export function isErroreLimiteAttiPreP3(cause: unknown): boolean {
  return /superiore al limite|superiore a 12 mesi|periodo di esportazione|7000|1501|raffinare la ricerca/i.test(
    messaggioDi(cause),
  );
}

/** Dimezza un intervallo ISO [inizio..fine] in due sotto-intervalli per giorni. */
export function dividiIntervalloPreP3(
  inizio: string,
  fine: string,
): Array<[string, string]> | null {
  if (!isIsoDateFinestraPreP3(inizio) || !isIsoDateFinestraPreP3(fine) || inizio >= fine)
    return null;
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
): Promise<{ voci: VoceFinestraPreP3[]; url: string }> {
  const raw = await postJson(overrides, "/api/v1/ricerca/aggiornati", {
    dataInizioAggiornamento: inizio,
    dataFineAggiornamento: fine,
  });
  const baseUrl = defaultNormattivaConfig(overrides).baseUrl;
  return { voci: vociDaAggiornatiPreP3(raw), url: `${baseUrl}/api/v1/ricerca/aggiornati` };
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
): Promise<{ voci: VoceFinestraPreP3[]; url: string }> {
  const baseUrl = defaultNormattivaConfig(overrides).baseUrl;
  const url = `${baseUrl}/api/v1/ricerca/aggiornati`;
  const coda: Array<[string, string]> = [[inizio, fine]];
  const voci: VoceFinestraPreP3[] = [];
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
      const parti = dividiIntervalloPreP3(ini, fin);
      if (isErroreLimiteAttiPreP3(cause) && parti) {
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
export async function percorsiDedupPreP3(escludi: readonly string[]): Promise<string[]> {
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
export async function caricaChiaviEsistentiPreP3(
  percorsi: readonly string[],
): Promise<Set<string>> {
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
          const chiave = chiaveEliFinestraPreP3(item[campo]);
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
export function eliCandidatiPreP3(voce: VoceFinestraPreP3): string[] {
  const candidati = new Set<string>();
  const reale = chiaveEliFinestraPreP3(voce.eliReale);
  if (reale) candidati.add(reale);
  if (voce.codice) {
    const derivato = chiaveEliFinestraPreP3(eliFromUrn(voce.urn, voce.codice));
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
    .filter((a) => a in FINESTRE_DISPONIBILI) as NomeFinestraPreP3[];
  const vistiAnni = new Set<string>();
  const anni: NomeFinestraPreP3[] = [];
  for (const a of anniGrezzi.length > 0 ? anniGrezzi : [...ORDINE_DEFAULT]) {
    const nome = String(a) as NomeFinestraPreP3;
    if (!(nome in FINESTRE_DISPONIBILI) || vistiAnni.has(nome)) continue;
    vistiAnni.add(nome);
    anni.push(nome);
  }
  const outPerAnno = new Map<NomeFinestraPreP3, string>();
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
    `Ingest backfill pre-1948 P3 (Regno d'Italia 1920-1934) Normattiva: ${finestre.map((f) => `${f.inizio}..${f.fine}`).join(" + ")} (max ${limite}/finestra).`,
  );

  // Dedup vs tutti i normattiva-*.json esistenti tranne i propri output.
  const propriOutput = anni.map((a) => OUT_DEFAULT_FINESTRA[a]);
  const percorsiDedup = await percorsiDedupPreP3(propriOutput);
  const conosciuti = await caricaChiaviEsistentiPreP3(percorsiDedup);
  console.log(
    `Dedup: ${conosciuti.size} chiavi ELI/nir gia' presenti nei file esistenti (${percorsiDedup.length} percorsi).`,
  );

  const escludiConosciute = (voci: VoceFinestraPreP3[]): VoceFinestraPreP3[] =>
    voci.filter((voce) => {
      if (chiaveEliFinestraPreP3(voce.urn) && conosciuti.has(chiaveEliFinestraPreP3(voce.urn)))
        return false;
      for (const candidato of eliCandidatiPreP3(voce)) {
        if (conosciuti.has(candidato)) return false;
      }
      return true;
    });

  // Liste per finestra (bounded: max 80 atti), con dedup incrociata cumulativa.
  const vociPerAnno = new Map<NomeFinestraPreP3, VoceFinestraPreP3[]>();
  const urlPerAnno = new Map<NomeFinestraPreP3, string>();
  const urnViste = new Set<string>();
  const eliViste = new Set<string>();
  for (const finestra of finestre) {
    const nome = finestra.nome as NomeFinestraPreP3;
    try {
      const { voci, url } = await listaFinestraConSplit(
        overridesPost,
        finestra.inizio,
        finestra.fine,
      );
      urlPerAnno.set(nome, url);
      console.log(`Finestra ${nome}: ${voci.length} voci reali.`);
      const filtrate = escludiConosciute(voci).filter((voce) => {
        const urnChiave = chiaveEliFinestraPreP3(voce.urn);
        if (urnChiave && urnViste.has(urnChiave)) return false;
        if (eliCandidatiPreP3(voce).some((c) => eliViste.has(c))) return false;
        return true;
      });
      console.log(
        `Finestra ${nome}: ${voci.length} voci, ${voci.length - filtrate.length} duplicate escluse.`,
      );
      const selezionate = filtrate.slice(0, limite);
      vociPerAnno.set(nome, selezionate);
      for (const voce of selezionate) {
        urnViste.add(chiaveEliFinestraPreP3(voce.urn));
        for (const c of eliCandidatiPreP3(voce)) eliViste.add(c);
      }
    } catch (cause) {
      console.log(`Finestra ${nome} fallita (${messaggioDi(cause)}).`);
      if (erroreDefinitivo(cause)) {
        console.log(`Errore definitivo (403/409/ERR_409) sulla finestra ${nome}.`);
      }
      vociPerAnno.set(nome, []);
    }
  }

  const daDettagliare: Array<{ voce: VoceFinestraPreP3; gruppo: NomeFinestraPreP3 }> = [];
  for (const finestra of finestre) {
    const nome = finestra.nome as NomeFinestraPreP3;
    for (const voce of vociPerAnno.get(nome) ?? []) daDettagliare.push({ voce, gruppo: nome });
  }
  if (daDettagliare.length === 0) {
    console.error("Nessuna voce reale da dettagliare: nessun file scritto.");
    process.exitCode = 1;
    return;
  }
  console.log(
    `Recupero dettagli per ${daDettagliare.length} atti (batch da ${DETTAGLI_PER_BATCH}).`,
  );

  const attiPerAnno = new Map<NomeFinestraPreP3, LawRecord[]>();
  for (const finestra of finestre) attiPerAnno.set(finestra.nome as NomeFinestraPreP3, []);
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
        const record = dettaglioToRecordFinestraPreP3(voce, raw, testoMax);
        if (!record) {
          errori.push(`dettaglio senza titolo/chiave: ${voce.urn}`);
          continue;
        }
        // Dedup finale: mai due record per lo stesso atto (chiave + ELI/nir
        // contro gli esistenti e contro i record gia' raccolti).
        const impronte = [
          chiaveEliFinestraPreP3(record.chiave),
          chiaveEliFinestraPreP3(record.eli),
          chiaveEliFinestraPreP3(record.nir),
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
    `Dettagli OK: ${finestre.map((f) => `finestra${f.nome}=${attiPerAnno.get(f.nome as NomeFinestraPreP3)?.length ?? 0}`).join(" ")}; scarti/errori: ${errori.length}.`,
  );
  // Backfill pre-1948: anni a zero atti reali -> NESSUN file per
  // quell'anno (lista onesta in output). Exit 1 senza parziali SOLO se
  // TUTTE le finestre sono vuote o se un JSON supera 950 KB.
  const vuote = finestre.filter(
    (f) => (attiPerAnno.get(f.nome as NomeFinestraPreP3)?.length ?? 0) === 0,
  );
  const piene = finestre.filter(
    (f) => (attiPerAnno.get(f.nome as NomeFinestraPreP3)?.length ?? 0) > 0,
  );
  if (piene.length === 0) {
    console.error(
      `Finestre senza atti reali (${vuote.map((f) => f.nome).join(",")}): nessun file scritto.`,
    );
    for (const e of errori.slice(0, 10)) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }
  if (vuote.length > 0) {
    console.log(`Anni vuoti onesti (nessun file): ${vuote.map((f) => f.nome).join(",")}.`);
  }

  const recuperatoIl = new Date().toISOString();
  const jsonPerAnno = new Map<NomeFinestraPreP3, string>();
  for (const finestra of piene) {
    const nome = finestra.nome as NomeFinestraPreP3;
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
    const nome = finestra.nome as NomeFinestraPreP3;
    const kb = Buffer.byteLength(jsonPerAnno.get(nome) ?? "", "utf8") / DIM_KB;
    if (kb > LIMITE_FILE_KB) {
      console.error(
        `File oltre il limite di ${LIMITE_FILE_KB} KB ` +
          `(${piene.map((f) => `${f.nome}=${(Buffer.byteLength(jsonPerAnno.get(f.nome as NomeFinestraPreP3) ?? "", "utf8") / DIM_KB).toFixed(1)} KB`).join(", ")}): nessun file scritto.`,
      );
      process.exitCode = 1;
      return;
    }
  }

  for (const finestra of piene) {
    const nome = finestra.nome as NomeFinestraPreP3;
    const dest = path.resolve(outPerAnno.get(nome) ?? OUT_DEFAULT_FINESTRA[nome]);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, jsonPerAnno.get(nome) ?? "", "utf8");
  }
  console.log(
    piene
      .map((f) => {
        const nome = f.nome as NomeFinestraPreP3;
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
  (process.argv[1] ?? "").endsWith("ingest-reale-pre-P3.ts");

if (eseguitoComeScript) {
  main().catch((cause: unknown) => {
    console.error(`Ingest finestre fallito: ${messaggioDi(cause)}`);
    process.exitCode = 1;
  });
}
