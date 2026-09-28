/**
 * Ingest finestre storiche Normattiva -> data/reali/normattiva-storico-1990.json
 * e data/reali/normattiva-storico-2000.json.
 *
 * Legge atti VERI dalle API Open Data di Normattiva (bff-opendata v1) e li
 * salva con envelope di provenance. Nessun dato dimostrativo: ogni campo del
 * record deriva dalla risposta HTTP (lista + dettaglio) oppure il record
 * viene scartato. Mai inventati: codici redazionali, numeri, URL, date, stati.
 *
 * Sorgenti (bounded, MAI oltre i cap):
 *   - finestra 1990: POST /api/v1/ricerca/aggiornati su 1990-01-01..1990-12-31
 *     (max 80 atti);
 *   - finestra 2000: POST /api/v1/ricerca/aggiornati su 2000-01-01..2000-12-31
 *     (max 80 atti).
 * Dettaglio per ogni URN: POST /api/v1/atto/dettaglio-atto-urn {urn} con il
 * prefisso `urn:` obbligatorio, a batch di 5 con pausa di 2000 ms. Timeout
 * 15000 ms per le POST, retry solo su 429/5xx (gestiti da lib/normattiva.ts);
 * stop su 403/409/ERR_409.
 *
 * Dedup: gli ELI/nir gia' presenti in normattiva-recenti.json,
 * normattiva-storico-1980.json e normattiva-storico-collezioni.json
 * (match su `eli` lower+trim, fallback `nir`/`chiave`) e i duplicati tra le
 * due nuove finestre vengono esclusi: mai due record per lo stesso atto.
 *
 * Stato onesto: `articoloDataFineVigenza` esplicita del dettaglio
 * (`99999999` = in vigore, data passata = abrogato) oppure intestazione
 * formale Art. 1 (`DECRETO DECADUTO` / `PROVVEDIMENTO ABROGATO` = status
 * ufficiale), altrimenti in_vigore. Mai inferito dal corpo del testo.
 *
 * Uso:
 *   npx tsx scripts/ingest-reale-normattiva-finestre.ts [--limite=80]
 *     [--testo-max=2000] [--out-1990=...] [--out-2000=...]
 *     [--api-base=...] [--help]
 *
 * Esce con codice 1 (SENZA scrivere file parziali) se una delle due finestre
 * restituisce zero atti reali o se un JSON supera 950 KB.
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
    "Ingest finestre storiche Normattiva 1990 + 2000 (dati ufficiali, mai dimostrativi).",
    "",
    "Uso:",
    "  npx tsx scripts/ingest-reale-normattiva-finestre.ts [opzioni]",
    "",
    "Opzioni:",
    "  --limite=N            atti per finestra (default 80, MAI oltre 80)",
    "  --testo-max=N         caratteri max per testo (default 2000, max 61440)",
    "  --out-1990=PATH       file JSON finestra 1990 (default data/reali/normattiva-storico-1990.json)",
    "  --out-2000=PATH       file JSON finestra 2000 (default data/reali/normattiva-storico-2000.json)",
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
  const out1990 =
    argomento("out-1990") ?? path.join("data", "reali", "normattiva-storico-1990.json");
  const out2000 =
    argomento("out-2000") ?? path.join("data", "reali", "normattiva-storico-2000.json");
  const apiBase = argomento("api-base");

  const overridesPost: Partial<NormattivaConfig> = {
    timeoutMs: TIMEOUT_POST_MS,
    retries: RETRIES,
    ...(apiBase ? { baseUrl: apiBase } : {}),
  };

  console.log(
    `Ingest finestre Normattiva: ${FINESTRA_1990.inizio}..${FINESTRA_1990.fine} + ${FINESTRA_2000.inizio}..${FINESTRA_2000.fine} (max ${limite}/finestra).`,
  );

  const conosciuti = await caricaChiaviEsistenti(PERCORSI_ESISTENTI);
  console.log(
    `Dedup: ${conosciuti.size} chiavi ELI/nir gia' presenti nei file esistenti (${PERCORSI_ESISTENTI.length} percorsi).`,
  );

  const escludiConosciute = (voci: VoceFinestra[]): VoceFinestra[] =>
    voci.filter((voce) => {
      if (chiaveEliFinestra(voce.urn) && conosciuti.has(chiaveEliFinestra(voce.urn))) return false;
      for (const candidato of eliCandidatiFinestra(voce)) {
        if (conosciuti.has(candidato)) return false;
      }
      return true;
    });

  // 1) Finestra 1990 (bounded: max 80 atti).
  let voci1990: VoceFinestra[] = [];
  let url1990 = "";
  try {
    const { voci, url } = await listaFinestra(overridesPost, FINESTRA_1990.inizio, FINESTRA_1990.fine);
    url1990 = url;
    console.log(`Finestra 1990: ${voci.length} voci reali.`);
    const filtrate = escludiConosciute(voci);
    console.log(`Finestra 1990: ${voci.length} voci, ${voci.length - filtrate.length} duplicate escluse.`);
    voci1990 = filtrate.slice(0, limite);
  } catch (cause) {
    console.log(`Finestra 1990 fallita (${messaggioDi(cause)}).`);
    if (erroreDefinitivo(cause)) {
      console.log("Errore definitivo (403/409/ERR_409) sulla finestra 1990.");
    }
  }

  // Dedup incrociata: le voci 2000 non devono collidere con le 1990 selezionate.
  const urn1990 = new Set(voci1990.map((v) => chiaveEliFinestra(v.urn)));
  const eli1990 = new Set(voci1990.flatMap((v) => eliCandidatiFinestra(v)));

  // 2) Finestra 2000 (bounded: max 80 atti).
  let voci2000: VoceFinestra[] = [];
  let url2000 = "";
  try {
    const { voci, url } = await listaFinestra(overridesPost, FINESTRA_2000.inizio, FINESTRA_2000.fine);
    url2000 = url;
    console.log(`Finestra 2000: ${voci.length} voci reali.`);
    const filtrate = escludiConosciute(voci).filter((voce) => {
      if (urn1990.has(chiaveEliFinestra(voce.urn))) return false;
      return !eliCandidatiFinestra(voce).some((c) => eli1990.has(c));
    });
    console.log(
      `Finestra 2000: ${voci.length} voci, ${voci.length - filtrate.length} duplicate escluse (esistenti + 1990).`,
    );
    voci2000 = filtrate.slice(0, limite);
  } catch (cause) {
    console.log(`Finestra 2000 fallita (${messaggioDi(cause)}).`);
    if (erroreDefinitivo(cause)) {
      console.log("Errore definitivo (403/409/ERR_409) sulla finestra 2000.");
    }
  }

  const daDettagliare: Array<{ voce: VoceFinestra; gruppo: "1990" | "2000" }> = [
    ...voci1990.map((voce) => ({ voce, gruppo: "1990" as const })),
    ...voci2000.map((voce) => ({ voce, gruppo: "2000" as const })),
  ];
  if (daDettagliare.length === 0) {
    console.error("Nessuna voce reale da dettagliare: nessun file scritto.");
    process.exitCode = 1;
    return;
  }
  console.log(`Recupero dettagli per ${daDettagliare.length} atti (batch da ${DETTAGLI_PER_BATCH}).`);

  const atti1990: LawRecord[] = [];
  const atti2000: LawRecord[] = [];
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
        if (gruppo === "1990") atti1990.push(record);
        else atti2000.push(record);
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
    `Dettagli OK: finestra1990=${atti1990.length} finestra2000=${atti2000.length}; scarti/errori: ${errori.length}.`,
  );
  // Niente parziali: entrambe le finestre devono aver prodotto atti reali.
  if (atti1990.length === 0 || atti2000.length === 0) {
    console.error("Una finestra ha prodotto zero atti reali: nessun file scritto.");
    for (const e of errori.slice(0, 10)) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  const recuperatoIl = new Date().toISOString();
  const envelope1990: Envelope = {
    provenance: {
      fonte: "normattiva",
      url: url1990,
      recuperatoIl,
      licenza: LICENZA,
    },
    atti: atti1990,
  };
  const envelope2000: Envelope = {
    provenance: {
      fonte: "normattiva",
      url: url2000,
      recuperatoIl,
      licenza: LICENZA,
    },
    atti: atti2000,
  };

  const json1990 = JSON.stringify(envelope1990, null, 2);
  const json2000 = JSON.stringify(envelope2000, null, 2);
  const kb1990 = Buffer.byteLength(json1990, "utf8") / DIM_KB;
  const kb2000 = Buffer.byteLength(json2000, "utf8") / DIM_KB;
  if (kb1990 > LIMITE_FILE_KB || kb2000 > LIMITE_FILE_KB) {
    console.error(
      `File oltre il limite di ${LIMITE_FILE_KB} KB ` +
        `(1990=${kb1990.toFixed(1)} KB, 2000=${kb2000.toFixed(1)} KB): nessun file scritto.`,
    );
    process.exitCode = 1;
    return;
  }

  const dest1990 = path.resolve(out1990);
  const dest2000 = path.resolve(out2000);
  await mkdir(path.dirname(dest1990), { recursive: true });
  await mkdir(path.dirname(dest2000), { recursive: true });
  await writeFile(dest1990, json1990, "utf8");
  await writeFile(dest2000, json2000, "utf8");
  console.log(
    `Scritti ${atti1990.length} atti 1990 in ${dest1990} (${kb1990.toFixed(1)} KB) ` +
      `e ${atti2000.length} atti 2000 in ${dest2000} (${kb2000.toFixed(1)} KB).`,
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
