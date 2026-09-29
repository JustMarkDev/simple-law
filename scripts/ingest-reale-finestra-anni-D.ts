/**
 * Ingest finestre storiche Normattiva TAG D -> data/reali/normattiva-storico-1991.json,
 * normattiva-storico-1994.json, normattiva-storico-1996.json,
 * normattiva-storico-1997.json, normattiva-storico-1998.json,
 * normattiva-storico-1999.json, normattiva-storico-2001.json,
 * normattiva-storico-2002.json, normattiva-storico-2003.json,
 * normattiva-storico-2004.json (backfill TAG D, stesso pattern 2021-2025).
 *
 * Legge atti VERI dalle API Open Data di Normattiva (bff-opendata v1) e li
 * salva con envelope di provenance. Nessun dato dimostrativo: ogni campo del
 * record deriva dalla risposta HTTP (lista + dettaglio) oppure il record
 * viene scartato. Mai inventati: codici redazionali, numeri, URL, date, stati.
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
 *   npx tsx scripts/ingest-reale-finestra-anni-D.ts [--anni=2004,2003,2002,2001,1999,1998,1997,1996,1994,1991]
 *     [--limite=80] [--testo-max=2000] [--api-base=...] [--help]
 *
 * Esce con codice 1 (SENZA scrivere file parziali) se una delle finestre
 * selezionate restituisce zero atti reali o se un JSON supera 950 KB.
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

export interface VoceFinestraD {
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

const FINESTRA_1991 = { nome: "1991", inizio: "1991-01-01", fine: "1991-12-31" } as const;
const FINESTRA_1994 = { nome: "1994", inizio: "1994-01-01", fine: "1994-12-31" } as const;
const FINESTRA_1996 = { nome: "1996", inizio: "1996-01-01", fine: "1996-12-31" } as const;
const FINESTRA_1997 = { nome: "1997", inizio: "1997-01-01", fine: "1997-12-31" } as const;
const FINESTRA_1998 = { nome: "1998", inizio: "1998-01-01", fine: "1998-12-31" } as const;
const FINESTRA_1999 = { nome: "1999", inizio: "1999-01-01", fine: "1999-12-31" } as const;
const FINESTRA_2001 = { nome: "2001", inizio: "2001-01-01", fine: "2001-12-31" } as const;
const FINESTRA_2002 = { nome: "2002", inizio: "2002-01-01", fine: "2002-12-31" } as const;
const FINESTRA_2003 = { nome: "2003", inizio: "2003-01-01", fine: "2003-12-31" } as const;
const FINESTRA_2004 = { nome: "2004", inizio: "2004-01-01", fine: "2004-12-31" } as const;

/** Ordine di default: TAG D discendente (2004 prima, 1991 ultima). */
const ORDINE_DEFAULT = ["2004", "2003", "2002", "2001", "1999", "1998", "1997", "1996", "1994", "1991"] as const;

/** Finestre selezionabili via --anni (stesso bounded: max 80 atti). */
const FINESTRE_DISPONIBILI = {
  "1991": FINESTRA_1991,
  "1994": FINESTRA_1994,
  "1996": FINESTRA_1996,
  "1997": FINESTRA_1997,
  "1998": FINESTRA_1998,
  "1999": FINESTRA_1999,
  "2001": FINESTRA_2001,
  "2002": FINESTRA_2002,
  "2003": FINESTRA_2003,
  "2004": FINESTRA_2004,
} as const;

type NomeFinestraD = keyof typeof FINESTRE_DISPONIBILI;

/** Output default per finestra (mai fuori data/reali senza --out esplicito). */
const OUT_DEFAULT_FINESTRA: Record<NomeFinestraD, string> = {
  "1991": path.join("data", "reali", "normattiva-storico-1991.json"),
  "1994": path.join("data", "reali", "normattiva-storico-1994.json"),
  "1996": path.join("data", "reali", "normattiva-storico-1996.json"),
  "1997": path.join("data", "reali", "normattiva-storico-1997.json"),
  "1998": path.join("data", "reali", "normattiva-storico-1998.json"),
  "1999": path.join("data", "reali", "normattiva-storico-1999.json"),
  "2001": path.join("data", "reali", "normattiva-storico-2001.json"),
  "2002": path.join("data", "reali", "normattiva-storico-2002.json"),
  "2003": path.join("data", "reali", "normattiva-storico-2003.json"),
  "2004": path.join("data", "reali", "normattiva-storico-2004.json"),
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

export function normalizzaFinestraD(testo: string): string {
  return (testo ?? "").replace(/\s+/g, " ").trim();
}

export function stringaFinestraD(voce: unknown): string {
  if (typeof voce === "string") return voce.trim();
  if (typeof voce === "number" && Number.isFinite(voce)) return String(voce);
  return "";
}

export function isIsoDateFinestraD(testo: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testo)) return false;
  const parsed = new Date(`${testo}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === testo;
}

/**
 * Pulizia testi visibili: em-dash (U+2014) ed en-dash (U+2013) diventano `-`;
 * max 1 middle-dot (U+00B7) per riga, i successivi diventano `-`. Pura.
 */
export function pulisciTestoVisibileD(testo: string): string {
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
  const a = stringaFinestraD(anno).padStart(4, "0");
  const m = stringaFinestraD(mese).padStart(2, "0");
  const g = stringaFinestraD(giorno).padStart(2, "0");
  const iso = `${a}-${m}-${g}`;
  return isIsoDateFinestraD(iso) ? iso : "";
}

/** Chiave di dedup ELI: trim + lowercase (stessa regola del resto dell'app). */
export function chiaveEliFinestraD(eli: unknown): string {
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
export function statoDaFineVigenzaD(
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
export function statoDaIntestazioneArt1D(testo: string): "decaduto" | "abrogato" | null {
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
export function urnDaVoceFinestraD(voce: unknown): string {
  if (!isRecord(voce)) return "";
  const denominazione = stringaFinestraD(
    voce["denominazioneAtto"] ?? voce["tipoProvvedimentoDescrizione"],
  );
  const tipo = tipoFromDenominazione(denominazione);
  const numero = stringaFinestraD(
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
export function dettaglioToRecordFinestraD(
  voce: VoceFinestraD,
  raw: unknown,
  testoMax: number,
): LawRecord | null {
  const interno = attoInterno(raw);
  if (!interno) return null;
  const dto: AttoDto | null = parseAttoDto(interno);

  const titoloGrezzo =
    normalizzaFinestraD(dto?.titolo ?? "") ||
    normalizzaFinestraD(stringaFinestraD(interno["titolo"])) ||
    normalizzaFinestraD(stringaFinestraD(interno["descrizioneAtto"]));
  if (!titoloGrezzo) return null;
  const titolo = pulisciTestoVisibileD(titoloGrezzo);
  if (!titolo) return null;

  const tipo =
    dto?.tipo ||
    tipoFromDenominazione(
      stringaFinestraD(interno["tipoProvvedimentoDescrizione"]) ||
        stringaFinestraD(interno["denominazioneAtto"]),
    ) ||
    "atto";

  const numero =
    dto?.numero ||
    stringaFinestraD(interno["numeroProvvedimento"]) ||
    (parseNIR(voce.urn)?.numero ?? "");
  if (!numero) return null;

  const dataEmanazione =
    dto?.dataEmanazione ||
    isoDaParti(interno["annoProvvedimento"], interno["meseProvvedimento"], interno["giornoProvvedimento"]) ||
    normalizzaData(interno["dataEmanazione"]) ||
    (parseNIR(voce.urn)?.data ?? "");
  if (!dataEmanazione) return null;

  const codice = dto?.codiceRedazionale || stringaFinestraD(interno["codiceRedazionale"]) || voce.codice;

  const html = dto?.articoloHtml || stringaFinestraD(interno["articoloHtml"]);
  const testoIntegrale = dto?.testo || stripHtml(html);
  const sottoTitolo =
    dto?.sottoTitolo || normalizzaFinestraD(stringaFinestraD(interno["sottoTitolo"]));
  // Vigenza onesta, in ordine di affidabilita':
  // 1) data di fine vigenza esplicita del dettaglio (passata = abrogato);
  // 2) intestazione formale Art. 1 di Normattiva (DECRETO DECADUTO /
  //    PROVVEDIMENTO ABROGATO = status ufficiale, non citazione nel corpo);
  // 3) default in_vigore. MAI inferire dal corpo del testo.
  const fineVigenzaGrezza = stringaFinestraD(interno["articoloDataFineVigenza"]);
  const daData = statoDaFineVigenzaD(fineVigenzaGrezza, oggiCompact());
  const daIntestazione = statoDaIntestazioneArt1D(testoIntegrale);
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
    (isIsoDateFinestraD(voce.dataGU) ? voce.dataGU : "");
  const numeroGU =
    stringaFinestraD(interno["numeroGU"]) || (/^\d+$/.test(voce.numeroGU) ? voce.numeroGU : "");

  const fonti = buildFonti({
    tipo,
    numero,
    dataEmanazione,
    codiceRedazionale: codice || undefined,
    dataGU: dataGU || undefined,
    numeroGU: numeroGU || undefined,
  });

  const sintesi = pulisciTestoVisibileD(
    normalizzaFinestraD(law.sintesi || sottoTitolo || testoIntegrale || titolo),
  ).slice(0, 600);
  if (!sintesi) return null;

  const testoPieno = pulisciTestoVisibileD((law.testo ?? "").trim());
  const troncato = testoPieno.length > testoMax;
  const record: LawRecord = {
    chiave,
    titolo: pulisciTestoVisibileD(law.titolo),
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
    "Ingest finestre storiche Normattiva TAG D 1991/1994/1996/1997/1998/1999/2001/2002/2003/2004 (dati ufficiali, mai dimostrativi).",
    "",
    "Uso:",
    "  npx tsx scripts/ingest-reale-finestra-anni-D.ts [opzioni]",
    "",
    "Opzioni:",
    "  --anni=A,B            finestre da ingerire (default 2004,2003,2002,2001,1999,1998,1997,1996,1994,1991; ammessi gli stessi)",
    "  --limite=N            atti per finestra (default 80, MAI oltre 80)",
    "  --testo-max=N         caratteri max per testo (default 2000, max 61440)",
    "  --out-1991=PATH       file JSON finestra 1991 (default data/reali/normattiva-storico-1991.json)",
    "  --out-1994=PATH       file JSON finestra 1994 (default data/reali/normattiva-storico-1994.json)",
    "  --out-1996=PATH       file JSON finestra 1996 (default data/reali/normattiva-storico-1996.json)",
    "  --out-1997=PATH       file JSON finestra 1997 (default data/reali/normattiva-storico-1997.json)",
    "  --out-1998=PATH       file JSON finestra 1998 (default data/reali/normattiva-storico-1998.json)",
    "  --out-1999=PATH       file JSON finestra 1999 (default data/reali/normattiva-storico-1999.json)",
    "  --out-2001=PATH       file JSON finestra 2001 (default data/reali/normattiva-storico-2001.json)",
    "  --out-2002=PATH       file JSON finestra 2002 (default data/reali/normattiva-storico-2002.json)",
    "  --out-2003=PATH       file JSON finestra 2003 (default data/reali/normattiva-storico-2003.json)",
    "  --out-2004=PATH       file JSON finestra 2004 (default data/reali/normattiva-storico-2004.json)",
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
export function vociDaAggiornatiD(raw: unknown): VoceFinestraD[] {
  const voci = arrayDa(unwrapData(raw), ["listaAtti", "atti", "risultati", "hits"]);
  const risultato: VoceFinestraD[] = [];
  const visti = new Set<string>();
  for (const voce of voci) {
    const urn = urnDaVoceFinestraD(voce);
    if (!urn || visti.has(urn)) continue;
    visti.add(urn);
    if (!isRecord(voce)) continue;
    const dataGUCandidata = normalizzaData(voce["dataGU"]);
    const eliGrezzo = stringaFinestraD(voce["eli"]);
    const eliCandidato = eliGrezzo.startsWith("/") ? eliGrezzo : eliGrezzo ? `/${eliGrezzo}` : "";
    risultato.push({
      urn,
      codice: stringaFinestraD(voce["codiceRedazionale"]),
      dataGU: isIsoDateFinestraD(dataGUCandidata) ? dataGUCandidata : "",
      numeroGU: stringaFinestraD(voce["numeroGU"]),
      eliReale: eliCandidato && parseELI(eliCandidato) ? eliCandidato : "",
    });
  }
  return risultato;
}

/** Errore "troppi atti" del server (limite 7000): va raffinata la ricerca. */
export function isErroreLimiteAttiD(cause: unknown): boolean {
  return /superiore al limite|superiore a 12 mesi|periodo di esportazione|7000|1501|raffinare la ricerca/i.test(
    messaggioDi(cause),
  );
}

/** Dimezza un intervallo ISO [inizio..fine] in due sotto-intervalli per giorni. */
export function dividiIntervalloD(inizio: string, fine: string): Array<[string, string]> | null {
  if (!isIsoDateFinestraD(inizio) || !isIsoDateFinestraD(fine) || inizio >= fine) return null;
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
): Promise<{ voci: VoceFinestraD[]; url: string }> {
  const raw = await postJson(overrides, "/api/v1/ricerca/aggiornati", {
    dataInizioAggiornamento: inizio,
    dataFineAggiornamento: fine,
  });
  const baseUrl = defaultNormattivaConfig(overrides).baseUrl;
  return { voci: vociDaAggiornatiD(raw), url: `${baseUrl}/api/v1/ricerca/aggiornati` };
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
): Promise<{ voci: VoceFinestraD[]; url: string }> {
  const baseUrl = defaultNormattivaConfig(overrides).baseUrl;
  const url = `${baseUrl}/api/v1/ricerca/aggiornati`;
  const coda: Array<[string, string]> = [[inizio, fine]];
  const voci: VoceFinestraD[] = [];
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
      const parti = dividiIntervalloD(ini, fin);
      if (isErroreLimiteAttiD(cause) && parti) {
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
export async function percorsiDedupD(escludi: readonly string[]): Promise<string[]> {
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
export async function caricaChiaviEsistentiD(percorsi: readonly string[]): Promise<Set<string>> {
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
          const chiave = chiaveEliFinestraD(item[campo]);
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
export function eliCandidatiD(voce: VoceFinestraD): string[] {
  const candidati = new Set<string>();
  const reale = chiaveEliFinestraD(voce.eliReale);
  if (reale) candidati.add(reale);
  if (voce.codice) {
    const derivato = chiaveEliFinestraD(eliFromUrn(voce.urn, voce.codice));
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
    .filter((a) => a in FINESTRE_DISPONIBILI) as NomeFinestraD[];
  const vistiAnni = new Set<string>();
  const anni: NomeFinestraD[] = [];
  for (const a of anniGrezzi.length > 0 ? anniGrezzi : [...ORDINE_DEFAULT]) {
    const nome = String(a) as NomeFinestraD;
    if (!(nome in FINESTRE_DISPONIBILI) || vistiAnni.has(nome)) continue;
    vistiAnni.add(nome);
    anni.push(nome);
  }
  const outPerAnno = new Map<NomeFinestraD, string>();
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
    `Ingest finestre storiche TAG D Normattiva: ${finestre.map((f) => `${f.inizio}..${f.fine}`).join(" + ")} (max ${limite}/finestra).`,
  );

  // Dedup vs tutti i normattiva-*.json esistenti tranne i propri output.
  const propriOutput = anni.map((a) => OUT_DEFAULT_FINESTRA[a]);
  const percorsiDedup = await percorsiDedupD(propriOutput);
  const conosciuti = await caricaChiaviEsistentiD(percorsiDedup);
  console.log(
    `Dedup: ${conosciuti.size} chiavi ELI/nir gia' presenti nei file esistenti (${percorsiDedup.length} percorsi).`,
  );

  const escludiConosciute = (voci: VoceFinestraD[]): VoceFinestraD[] =>
    voci.filter((voce) => {
      if (chiaveEliFinestraD(voce.urn) && conosciuti.has(chiaveEliFinestraD(voce.urn)))
        return false;
      for (const candidato of eliCandidatiD(voce)) {
        if (conosciuti.has(candidato)) return false;
      }
      return true;
    });

  // Liste per finestra (bounded: max 80 atti), con dedup incrociata cumulativa.
  const vociPerAnno = new Map<NomeFinestraD, VoceFinestraD[]>();
  const urlPerAnno = new Map<NomeFinestraD, string>();
  const urnViste = new Set<string>();
  const eliViste = new Set<string>();
  for (const finestra of finestre) {
    const nome = finestra.nome as NomeFinestraD;
    try {
      const { voci, url } = await listaFinestraConSplit(overridesPost, finestra.inizio, finestra.fine);
      urlPerAnno.set(nome, url);
      console.log(`Finestra ${nome}: ${voci.length} voci reali.`);
      const filtrate = escludiConosciute(voci).filter((voce) => {
        const urnChiave = chiaveEliFinestraD(voce.urn);
        if (urnChiave && urnViste.has(urnChiave)) return false;
        if (eliCandidatiD(voce).some((c) => eliViste.has(c))) return false;
        return true;
      });
      console.log(`Finestra ${nome}: ${voci.length} voci, ${voci.length - filtrate.length} duplicate escluse.`);
      const selezionate = filtrate.slice(0, limite);
      vociPerAnno.set(nome, selezionate);
      for (const voce of selezionate) {
        urnViste.add(chiaveEliFinestraD(voce.urn));
        for (const c of eliCandidatiD(voce)) eliViste.add(c);
      }
    } catch (cause) {
      console.log(`Finestra ${nome} fallita (${messaggioDi(cause)}).`);
      if (erroreDefinitivo(cause)) {
        console.log(`Errore definitivo (403/409/ERR_409) sulla finestra ${nome}.`);
      }
      vociPerAnno.set(nome, []);
    }
  }

  const daDettagliare: Array<{ voce: VoceFinestraD; gruppo: NomeFinestraD }> = [];
  for (const finestra of finestre) {
    const nome = finestra.nome as NomeFinestraD;
    for (const voce of vociPerAnno.get(nome) ?? []) daDettagliare.push({ voce, gruppo: nome });
  }
  if (daDettagliare.length === 0) {
    console.error("Nessuna voce reale da dettagliare: nessun file scritto.");
    process.exitCode = 1;
    return;
  }
  console.log(`Recupero dettagli per ${daDettagliare.length} atti (batch da ${DETTAGLI_PER_BATCH}).`);

  const attiPerAnno = new Map<NomeFinestraD, LawRecord[]>();
  for (const finestra of finestre) attiPerAnno.set(finestra.nome as NomeFinestraD, []);
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
        const record = dettaglioToRecordFinestraD(voce, raw, testoMax);
        if (!record) {
          errori.push(`dettaglio senza titolo/chiave: ${voce.urn}`);
          continue;
        }
        // Dedup finale: mai due record per lo stesso atto (chiave + ELI/nir
        // contro gli esistenti e contro i record gia' raccolti).
        const impronte = [
          chiaveEliFinestraD(record.chiave),
          chiaveEliFinestraD(record.eli),
          chiaveEliFinestraD(record.nir),
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
    `Dettagli OK: ${finestre.map((f) => `finestra${f.nome}=${attiPerAnno.get(f.nome as NomeFinestraD)?.length ?? 0}`).join(" ")}; scarti/errori: ${errori.length}.`,
  );
  // Niente parziali: OGNI finestra selezionata deve aver prodotto atti reali.
  const vuote = finestre.filter((f) => (attiPerAnno.get(f.nome as NomeFinestraD)?.length ?? 0) === 0);
  if (vuote.length > 0) {
    console.error(`Finestre senza atti reali (${vuote.map((f) => f.nome).join(",")}): nessun file scritto.`);
    for (const e of errori.slice(0, 10)) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  const recuperatoIl = new Date().toISOString();
  const jsonPerAnno = new Map<NomeFinestraD, string>();
  for (const finestra of finestre) {
    const nome = finestra.nome as NomeFinestraD;
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
    const nome = finestra.nome as NomeFinestraD;
    const kb = Buffer.byteLength(jsonPerAnno.get(nome) ?? "", "utf8") / DIM_KB;
    if (kb > LIMITE_FILE_KB) {
      console.error(
        `File oltre il limite di ${LIMITE_FILE_KB} KB ` +
          `(${finestre.map((f) => `${f.nome}=${(Buffer.byteLength(jsonPerAnno.get(f.nome as NomeFinestraD) ?? "", "utf8") / DIM_KB).toFixed(1)} KB`).join(", ")}): nessun file scritto.`,
      );
      process.exitCode = 1;
      return;
    }
  }

  for (const finestra of finestre) {
    const nome = finestra.nome as NomeFinestraD;
    const dest = path.resolve(outPerAnno.get(nome) ?? OUT_DEFAULT_FINESTRA[nome]);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, jsonPerAnno.get(nome) ?? "", "utf8");
  }
  console.log(
    finestre
      .map((f) => {
        const nome = f.nome as NomeFinestraD;
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
  (process.argv[1] ?? "").endsWith("ingest-reale-finestra-anni-D.ts");

if (eseguitoComeScript) {
  main().catch((cause: unknown) => {
    console.error(`Ingest finestre fallito: ${messaggioDi(cause)}`);
    process.exitCode = 1;
  });
}
