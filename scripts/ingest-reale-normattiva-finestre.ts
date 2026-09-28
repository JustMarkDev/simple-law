/**
 * Ingest finestre storiche Normattiva -> data/reali/normattiva-storico-<anno>.json.
 *
 * Finestre supportate via --anni (default "1990,2000" per compatibilita'):
 * 1990, 2000, 2010, 1970, 2020, 1960. Ogni finestra e' bounded come le originarie
 * (max 80 atti, dettagli a batch di 5 con pausa di 2000 ms).
 *
 * Legge atti VERI dalle API Open Data di Normattiva (bff-opendata v1) e li
 * salva con envelope di provenance. Nessun dato dimostrativo: ogni campo del
 * record deriva dalla risposta HTTP (lista + dettaglio) oppure il record
 * viene scartato. Mai inventati: codici redazionali, numeri, URL, date, stati.
 *
 * Sorgenti (bounded, MAI oltre i cap):
 *   - finestra <anno>: POST /api/v1/ricerca/aggiornati su <anno>-01-01..<anno>-12-31
 *     (max 80 atti).
 * Dettaglio per ogni URN: POST /api/v1/atto/dettaglio-atto-urn {urn} con il
 * prefisso `urn:` obbligatorio, a batch di 5 con pausa di 2000 ms. Timeout
 * 15000 ms per le POST, retry solo su 429/5xx (gestiti da lib/normattiva.ts);
 * stop su 403/409/ERR_409.
 *
 * Dedup: gli ELI/nir gia' presenti in normattiva-recenti.json,
 * normattiva-storico-1980.json, normattiva-storico-collezioni.json,
 * normattiva-leggi.json e nelle finestre esistenti NON selezionate
 * (es. 1990/2000 quando si ingeriscono 2010/1970; mai rileggere i propri
 * output) e i duplicati tra le finestre selezionate vengono esclusi:
 * mai due record per lo stesso atto.
 *
 * Stato onesto: `articoloDataFineVigenza` esplicita del dettaglio
 * (`99999999` = in vigore, data passata = abrogato) oppure intestazione
 * formale Art. 1 (`DECRETO DECADUTO` / `PROVVEDIMENTO ABROGATO` = status
 * ufficiale), altrimenti in_vigore. Mai inferito dal corpo del testo.
 *
 * Uso:
 *   npx tsx scripts/ingest-reale-normattiva-finestre.ts [--limite=80]
 *     [--testo-max=2000] [--anni=1990,2000] [--out-1990=...] [--out-2000=...]
 *     [--out-2010=...] [--out-1970=...] [--out-2020=...] [--out-1960=...]
 *     [--api-base=...] [--help]
 *
 * Esce con codice 1 (SENZA scrivere file parziali) se una delle finestre
 * selezionate restituisce zero atti reali o se un JSON supera 950 KB.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
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

export interface VoceFinestra {
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
const PAUSA_BATCH_MS = 2000;
const DETTAGLI_PER_BATCH = 5;
const TIMEOUT_POST_MS = 15000;
const RETRIES = 2;
const MAX_ATTI_FINESTRA = 80;

const FINESTRA_1990 = { nome: "1990", inizio: "1990-01-01", fine: "1990-12-31" } as const;
const FINESTRA_2000 = { nome: "2000", inizio: "2000-01-01", fine: "2000-12-31" } as const;
const FINESTRA_2010 = { nome: "2010", inizio: "2010-01-01", fine: "2010-12-31" } as const;
const FINESTRA_1970 = { nome: "1970", inizio: "1970-01-01", fine: "1970-12-31" } as const;
const FINESTRA_2020 = { nome: "2020", inizio: "2020-01-01", fine: "2020-12-31" } as const;
const FINESTRA_1960 = { nome: "1960", inizio: "1960-01-01", fine: "1960-12-31" } as const;

/** Finestre selezionabili via --anni (stesso bounded: max 80 atti). */
const FINESTRE_DISPONIBILI = {
  "1990": FINESTRA_1990,
  "2000": FINESTRA_2000,
  "2010": FINESTRA_2010,
  "1970": FINESTRA_1970,
  "2020": FINESTRA_2020,
  "1960": FINESTRA_1960,
} as const;

type NomeFinestra = keyof typeof FINESTRE_DISPONIBILI;

/** Output default per finestra (mai fuori data/reali senza --out esplicito). */
const OUT_DEFAULT_FINESTRA: Record<NomeFinestra, string> = {
  "1990": path.join("data", "reali", "normattiva-storico-1990.json"),
  "2000": path.join("data", "reali", "normattiva-storico-2000.json"),
  "2010": path.join("data", "reali", "normattiva-storico-2010.json"),
  "1970": path.join("data", "reali", "normattiva-storico-1970.json"),
  "2020": path.join("data", "reali", "normattiva-storico-2020.json"),
  "1960": path.join("data", "reali", "normattiva-storico-1960.json"),
};

/** File esistenti contro cui fare dedup ELI/URN (mai rileggere i propri output). */
const PERCORSI_ESISTENTI = [
  path.join("data", "reali", "normattiva-recenti.json"),
  path.join("data", "reali", "normattiva-storico-1980.json"),
  path.join("data", "reali", "normattiva-storico-collezioni.json"),
  path.join("data", "reali", "normattiva-leggi.json"),
] as const;

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

export function normalizzaFinestra(testo: string): string {
  return (testo ?? "").replace(/\s+/g, " ").trim();
}

export function stringaFinestra(voce: unknown): string {
  if (typeof voce === "string") return voce.trim();
  if (typeof voce === "number" && Number.isFinite(voce)) return String(voce);
  return "";
}

export function isIsoDateFinestra(testo: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testo)) return false;
  const parsed = new Date(`${testo}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === testo;
}

function isoDaParti(anno: unknown, mese: unknown, giorno: unknown): string {
  const a = stringaFinestra(anno).padStart(4, "0");
  const m = stringaFinestra(mese).padStart(2, "0");
  const g = stringaFinestra(giorno).padStart(2, "0");
  const iso = `${a}-${m}-${g}`;
  return isIsoDateFinestra(iso) ? iso : "";
}

/** Chiave di dedup ELI: trim + lowercase (stessa regola del resto dell'app). */
export function chiaveEliFinestra(eli: unknown): string {
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
export function statoDaFineVigenzaFinestre(
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
export function statoDaIntestazioneArt1Finestre(
  testo: string,
): "decaduto" | "abrogato" | null {
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
export function urnDaVoceFinestra(voce: unknown): string {
  if (!isRecord(voce)) return "";
  const denominazione = stringaFinestra(
    voce["denominazioneAtto"] ?? voce["tipoProvvedimentoDescrizione"],
  );
  const tipo = tipoFromDenominazione(denominazione);
  const numero = stringaFinestra(
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
export function dettaglioToRecordFinestra(
  voce: VoceFinestra,
  raw: unknown,
  testoMax: number,
): LawRecord | null {
  const interno = attoInterno(raw);
  if (!interno) return null;
  const dto: AttoDto | null = parseAttoDto(interno);

  const titolo =
    normalizzaFinestra(dto?.titolo ?? "") ||
    normalizzaFinestra(stringaFinestra(interno["titolo"])) ||
    normalizzaFinestra(stringaFinestra(interno["descrizioneAtto"]));
  if (!titolo) return null;

  const tipo =
    dto?.tipo ||
    tipoFromDenominazione(
      stringaFinestra(interno["tipoProvvedimentoDescrizione"]) ||
        stringaFinestra(interno["denominazioneAtto"]),
    ) ||
    "atto";

  const numero =
    dto?.numero ||
    stringaFinestra(interno["numeroProvvedimento"]) ||
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

  const codice = dto?.codiceRedazionale || stringaFinestra(interno["codiceRedazionale"]) || voce.codice;

  const html = dto?.articoloHtml || stringaFinestra(interno["articoloHtml"]);
  const testoIntegrale = dto?.testo || stripHtml(html);
  const sottoTitolo =
    dto?.sottoTitolo || normalizzaFinestra(stringaFinestra(interno["sottoTitolo"]));
  // Vigenza onesta, in ordine di affidabilita':
  // 1) data di fine vigenza esplicita del dettaglio (passata = abrogato);
  // 2) intestazione formale Art. 1 di Normattiva (DECRETO DECADUTO /
  //    PROVVEDIMENTO ABROGATO = status ufficiale, non citazione nel corpo);
  // 3) default in_vigore. MAI inferire dal corpo del testo.
  const fineVigenzaGrezza = stringaFinestra(interno["articoloDataFineVigenza"]);
  const daData = statoDaFineVigenzaFinestre(fineVigenzaGrezza, oggiCompact());
  const daIntestazione = statoDaIntestazioneArt1Finestre(testoIntegrale);
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
    (isIsoDateFinestra(voce.dataGU) ? voce.dataGU : "");
  const numeroGU =
    stringaFinestra(interno["numeroGU"]) || (/^\d+$/.test(voce.numeroGU) ? voce.numeroGU : "");

  const fonti = buildFonti({
    tipo,
    numero,
    dataEmanazione,
    codiceRedazionale: codice || undefined,
    dataGU: dataGU || undefined,
    numeroGU: numeroGU || undefined,
  });

  const sintesi = normalizzaFinestra(
    law.sintesi || sottoTitolo || testoIntegrale || titolo,
  ).slice(0, 600);
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
    "Ingest finestre storiche Normattiva (dati ufficiali, mai dimostrativi).",
    "",
    "Uso:",
    "  npx tsx scripts/ingest-reale-normattiva-finestre.ts [opzioni]",
    "",
    "Opzioni:",
    "  --anni=A,B            finestre da ingerire (default 1990,2000; ammessi 1990,2000,2010,1970,2020,1960)",
    "  --limite=N            atti per finestra (default 80, MAI oltre 80)",
    "  --testo-max=N         caratteri max per testo (default 2000, max 61440)",
    "  --out-1990=PATH       file JSON finestra 1990 (default data/reali/normattiva-storico-1990.json)",
    "  --out-2000=PATH       file JSON finestra 2000 (default data/reali/normattiva-storico-2000.json)",
    "  --out-2010=PATH       file JSON finestra 2010 (default data/reali/normattiva-storico-2010.json)",
    "  --out-1970=PATH       file JSON finestra 1970 (default data/reali/normattiva-storico-1970.json)",
    "  --out-2020=PATH       file JSON finestra 2020 (default data/reali/normattiva-storico-2020.json)",
    "  --out-1960=PATH       file JSON finestra 1960 (default data/reali/normattiva-storico-1960.json)",
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
export function vociDaAggiornatiFinestra(raw: unknown): VoceFinestra[] {
  const voci = arrayDa(unwrapData(raw), ["listaAtti", "atti", "risultati", "hits"]);
  const risultato: VoceFinestra[] = [];
  const visti = new Set<string>();
  for (const voce of voci) {
    const urn = urnDaVoceFinestra(voce);
    if (!urn || visti.has(urn)) continue;
    visti.add(urn);
    if (!isRecord(voce)) continue;
    const dataGUCandidata = normalizzaData(voce["dataGU"]);
    const eliGrezzo = stringaFinestra(voce["eli"]);
    const eliCandidato = eliGrezzo.startsWith("/") ? eliGrezzo : eliGrezzo ? `/${eliGrezzo}` : "";
    risultato.push({
      urn,
      codice: stringaFinestra(voce["codiceRedazionale"]),
      dataGU: isIsoDateFinestra(dataGUCandidata) ? dataGUCandidata : "",
      numeroGU: stringaFinestra(voce["numeroGU"]),
      eliReale: eliCandidato && parseELI(eliCandidato) ? eliCandidato : "",
    });
  }
  return risultato;
}

/** Errore "troppi atti" del server (limite 7000): va raffinata la ricerca. */
export function isErroreLimiteAttiFinestra(cause: unknown): boolean {
  return /superiore al limite|7000|raffinare la ricerca/i.test(messaggioDi(cause));
}

/** Dimezza un intervallo ISO [inizio..fine] in due sotto-intervalli per giorni. */
export function dividiIntervalloFinestra(inizio: string, fine: string): Array<[string, string]> | null {
  if (!isIsoDateFinestra(inizio) || !isIsoDateFinestra(fine) || inizio >= fine) return null;
  const t0 = Date.parse(`${inizio}T00:00:00Z`);
  const t1 = Date.parse(`${fine}T00:00:00Z`);
  const giorni = Math.round((t1 - t0) / 86400000);
  if (!Number.isFinite(giorni) || giorni < 1) return null;
  const mid = new Date(t0 + Math.floor(giorni / 2) * 86400000).toISOString().slice(0, 10);
  const dopoMid = new Date(Date.parse(`${mid}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  if (!(inizio <= mid && dopoMid <= fine && mid < dopoMid)) return null;
  return [[inizio, mid], [dopoMid, fine]];
}

/** Finestra aggiornati: POST /api/v1/ricerca/aggiornati su [inizio..fine]. */
async function listaFinestra(
  overrides: Partial<NormattivaConfig>,
  inizio: string,
  fine: string,
): Promise<{ voci: VoceFinestra[]; url: string }> {
  const raw = await postJson(overrides, "/api/v1/ricerca/aggiornati", {
    dataInizioAggiornamento: inizio,
    dataFineAggiornamento: fine,
  });
  const baseUrl = defaultNormattivaConfig(overrides).baseUrl;
  return { voci: vociDaAggiornatiFinestra(raw), url: `${baseUrl}/api/v1/ricerca/aggiornati` };
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
): Promise<{ voci: VoceFinestra[]; url: string }> {
  const baseUrl = defaultNormattivaConfig(overrides).baseUrl;
  const url = `${baseUrl}/api/v1/ricerca/aggiornati`;
  const coda: Array<[string, string]> = [[inizio, fine]];
  const voci: VoceFinestra[] = [];
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
      const parti = dividiIntervalloFinestra(ini, fin);
      if (isErroreLimiteAttiFinestra(cause) && parti) {
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
 * Carica gli ELI/nir/chiave gia' presenti nei file esistenti (lower+trim).
 * Non lancia mai: se un file manca o e' invalido viene saltato.
 */
export async function caricaChiaviEsistenti(percorsi: readonly string[]): Promise<Set<string>> {
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
          const chiave = chiaveEliFinestra(item[campo]);
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
export function eliCandidatiFinestra(voce: VoceFinestra): string[] {
  const candidati = new Set<string>();
  const reale = chiaveEliFinestra(voce.eliReale);
  if (reale) candidati.add(reale);
  if (voce.codice) {
    const derivato = chiaveEliFinestra(eliFromUrn(voce.urn, voce.codice));
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
  const anniGrezzi = (argomento("anni") ?? "1990,2000")
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a in FINESTRE_DISPONIBILI) as NomeFinestra[];
  const anni: NomeFinestra[] = [...new Set(anniGrezzi.length > 0 ? anniGrezzi : ["1990", "2000"] as NomeFinestra[])];
  const outPerAnno = new Map<NomeFinestra, string>();
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
    `Ingest finestre Normattiva: ${finestre.map((f) => `${f.inizio}..${f.fine}`).join(" + ")} (max ${limite}/finestra).`,
  );

  // Dedup vs base + finestre esistenti NON selezionate (mai i propri output).
  const percorsiDedup: string[] = [...PERCORSI_ESISTENTI];
  for (const nome of Object.keys(FINESTRE_DISPONIBILI) as NomeFinestra[]) {
    if (!outPerAnno.has(nome)) percorsiDedup.push(OUT_DEFAULT_FINESTRA[nome]);
  }
  const conosciuti = await caricaChiaviEsistenti(percorsiDedup);
  console.log(
    `Dedup: ${conosciuti.size} chiavi ELI/nir gia' presenti nei file esistenti (${percorsiDedup.length} percorsi).`,
  );

  const escludiConosciute = (voci: VoceFinestra[]): VoceFinestra[] =>
    voci.filter((voce) => {
      if (chiaveEliFinestra(voce.urn) && conosciuti.has(chiaveEliFinestra(voce.urn))) return false;
      for (const candidato of eliCandidatiFinestra(voce)) {
        if (conosciuti.has(candidato)) return false;
      }
      return true;
    });

  // Liste per finestra (bounded: max 80 atti), con dedup incrociata cumulativa.
  const vociPerAnno = new Map<NomeFinestra, VoceFinestra[]>();
  const urlPerAnno = new Map<NomeFinestra, string>();
  const urnViste = new Set<string>();
  const eliViste = new Set<string>();
  for (const finestra of finestre) {
    const nome = finestra.nome as NomeFinestra;
    try {
      const { voci, url } = await listaFinestraConSplit(overridesPost, finestra.inizio, finestra.fine);
      urlPerAnno.set(nome, url);
      console.log(`Finestra ${nome}: ${voci.length} voci reali.`);
      const filtrate = escludiConosciute(voci).filter((voce) => {
        const urnChiave = chiaveEliFinestra(voce.urn);
        if (urnChiave && urnViste.has(urnChiave)) return false;
        if (eliCandidatiFinestra(voce).some((c) => eliViste.has(c))) return false;
        return true;
      });
      console.log(`Finestra ${nome}: ${voci.length} voci, ${voci.length - filtrate.length} duplicate escluse.`);
      const selezionate = filtrate.slice(0, limite);
      vociPerAnno.set(nome, selezionate);
      for (const voce of selezionate) {
        urnViste.add(chiaveEliFinestra(voce.urn));
        for (const c of eliCandidatiFinestra(voce)) eliViste.add(c);
      }
    } catch (cause) {
      console.log(`Finestra ${nome} fallita (${messaggioDi(cause)}).`);
      if (erroreDefinitivo(cause)) {
        console.log(`Errore definitivo (403/409/ERR_409) sulla finestra ${nome}.`);
      }
      vociPerAnno.set(nome, []);
    }
  }

  const daDettagliare: Array<{ voce: VoceFinestra; gruppo: NomeFinestra }> = [];
  for (const finestra of finestre) {
    const nome = finestra.nome as NomeFinestra;
    for (const voce of vociPerAnno.get(nome) ?? []) daDettagliare.push({ voce, gruppo: nome });
  }
  if (daDettagliare.length === 0) {
    console.error("Nessuna voce reale da dettagliare: nessun file scritto.");
    process.exitCode = 1;
    return;
  }
  console.log(`Recupero dettagli per ${daDettagliare.length} atti (batch da ${DETTAGLI_PER_BATCH}).`);

  const attiPerAnno = new Map<NomeFinestra, LawRecord[]>();
  for (const finestra of finestre) attiPerAnno.set(finestra.nome as NomeFinestra, []);
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
        const record = dettaglioToRecordFinestra(voce, raw, testoMax);
        if (!record) {
          errori.push(`dettaglio senza titolo/chiave: ${voce.urn}`);
          continue;
        }
        // Dedup finale: mai due record per lo stesso atto (chiave + ELI/nir
        // contro gli esistenti e contro i record gia' raccolti).
        const impronte = [
          chiaveEliFinestra(record.chiave),
          chiaveEliFinestra(record.eli),
          chiaveEliFinestra(record.nir),
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
    `Dettagli OK: ${finestre.map((f) => `finestra${f.nome}=${attiPerAnno.get(f.nome as NomeFinestra)?.length ?? 0}`).join(" ")}; scarti/errori: ${errori.length}.`,
  );
  // Niente parziali: OGNI finestra selezionata deve aver prodotto atti reali.
  const vuote = finestre.filter((f) => (attiPerAnno.get(f.nome as NomeFinestra)?.length ?? 0) === 0);
  if (vuote.length > 0) {
    console.error(`Finestre senza atti reali (${vuote.map((f) => f.nome).join(",")}): nessun file scritto.`);
    for (const e of errori.slice(0, 10)) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  const recuperatoIl = new Date().toISOString();
  const jsonPerAnno = new Map<NomeFinestra, string>();
  for (const finestra of finestre) {
    const nome = finestra.nome as NomeFinestra;
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

  for (const finestra of finestre) {
    const nome = finestra.nome as NomeFinestra;
    const kb = Buffer.byteLength(jsonPerAnno.get(nome) ?? "", "utf8") / DIM_KB;
    if (kb > LIMITE_FILE_KB) {
      console.error(
        `File oltre il limite di ${LIMITE_FILE_KB} KB ` +
          `(${finestre.map((f) => `${f.nome}=${(Buffer.byteLength(jsonPerAnno.get(f.nome as NomeFinestra) ?? "", "utf8") / DIM_KB).toFixed(1)} KB`).join(", ")}): nessun file scritto.`,
      );
      process.exitCode = 1;
      return;
    }
  }

  for (const finestra of finestre) {
    const nome = finestra.nome as NomeFinestra;
    const dest = path.resolve(outPerAnno.get(nome) ?? OUT_DEFAULT_FINESTRA[nome]);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, jsonPerAnno.get(nome) ?? "", "utf8");
  }
  console.log(
    finestre.map((f) => {
      const nome = f.nome as NomeFinestra;
      const kb = Buffer.byteLength(jsonPerAnno.get(nome) ?? "", "utf8") / DIM_KB;
      return `Scritti ${(attiPerAnno.get(nome) ?? []).length} atti ${nome} in ${path.resolve(outPerAnno.get(nome) ?? "")} (${kb.toFixed(1)} KB).`;
    }).join(" "),
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
  (process.argv[1] ?? "").endsWith("ingest-reale-normattiva-finestre.ts");

if (eseguitoComeScript) {
  main().catch((cause: unknown) => {
    console.error(`Ingest finestre fallito: ${messaggioDi(cause)}`);
    process.exitCode = 1;
  });
}
