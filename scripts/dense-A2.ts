/**
 * Densificazione TAG-A2: secondo passaggio su
 * 1951,1952,1957,1958,1966,1967,1968,1969 -> data/reali/normattiva-storico-{anno}.json
 *
 * Il primo passaggio (scripts/ingest-reale-finestra-anni-A/B, limite 80 per
 * finestra annuale) ha scartato dettagli: la stessa finestra annuale rende
 * centinaia di voci reali (es. 1951 = 661 voci). Questo script pagina PIU A
 * FONDO gli stessi risultati aggiornati con split MENSILI (12 sotto-finestre
 * per anno, con ulteriore dimezzamento onesto su errore limite 7000 atti) e
 * dettaglia atti reali aggiuntivi.
 *
 * Legge atti VERI dalle API Open Data di Normattiva (bff-opendata v1) e li
 * ACCODA ai file esistenti (leggi, unisci con dedup, riscrivi). Nessun dato
 * dimostrativo: ogni campo del record deriva dalla risposta HTTP (lista +
 * dettaglio) oppure il record viene scartato. Mai inventati: codici
 * redazionali, numeri, URL, date, stati.
 *
 * Sorgenti (bounded, MAI oltre i cap):
 *   - 12 finestre mensili per anno: POST /api/v1/ricerca/aggiornati su
 *     <anno>-<mese>-01..<anno>-<mese>-<ultimo giorno>
 *     (max 120 NUOVI atti dettagliati per file).
 * Dettaglio per ogni URN: POST /api/v1/atto/dettaglio-atto-urn {urn} con il
 * prefisso `urn:` obbligatorio, a batch di 5 con pausa di 400 ms. Timeout
 * 15000 ms per le POST, retry solo su 429/5xx (gestiti da lib/normattiva.ts);
 * stop su 403/409/ERR_409.
 *
 * Dedup: gli ELI/nir/chiave gia' presenti in TUTTI i data/reali/*.json su
 * disco (inclusi i file A2 stessi, letti prima dell'append) e i duplicati
 * intra-file e tra gli 8 anni vengono esclusi: mai due record per lo stesso
 * atto, ELI unici globali.
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
 *   npx tsx scripts/dense-A2.ts [--anni=1951,1952,1957,1958,1966,1967,1968,1969]
 *     [--max-nuovi=120] [--testo-max=2000] [--probe] [--api-base=...] [--help]
 *
 * Bound: max +120 atti per file, file finale SEMPRE <= 950 KB (se l'unione
 * supera il limite, le aggiunte vengono potate dalla coda fino a rientrare;
 * se nulla rientra il file resta invariato). Un anno che non rende altro
 * resta invariato con zero aggiunte oneste (exit 0). MAI riempire con inventati.
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

export interface VoceDenseA2 {
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
const MAX_NUOVI_PER_FILE = 120;

/** Anni TAG-A2 (1951/1952/1957/1958 da script-A, 1966-1969 da script-B). */
const ANNI_DEFAULT = ["1951", "1952", "1957", "1958", "1966", "1967", "1968", "1969"] as const;

type NomeAnnoDenseA2 = (typeof ANNI_DEFAULT)[number];

const ANNI_AMMESSI = new Set<string>(ANNI_DEFAULT);

/** Output per anno (solo data/reali/normattiva-storico-{anni A2}.json). */
function outDefaultDenseA2(anno: NomeAnnoDenseA2): string {
  return path.join("data", "reali", `normattiva-storico-${anno}.json`);
}

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

export function normalizzaDenseA2(testo: string): string {
  return (testo ?? "").replace(/\s+/g, " ").trim();
}

export function stringaDenseA2(voce: unknown): string {
  if (typeof voce === "string") return voce.trim();
  if (typeof voce === "number" && Number.isFinite(voce)) return String(voce);
  return "";
}

export function isIsoDateDenseA2(testo: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testo)) return false;
  const parsed = new Date(`${testo}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === testo;
}

/**
 * Pulizia testi visibili: em-dash (U+2014) ed en-dash (U+2013) diventano `-`;
 * max 1 middle-dot (U+00B7) per riga, i successivi diventano `-`. Pura.
 */
export function pulisciTestoVisibileDenseA2(testo: string): string {
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
  const a = stringaDenseA2(anno).padStart(4, "0");
  const m = stringaDenseA2(mese).padStart(2, "0");
  const g = stringaDenseA2(giorno).padStart(2, "0");
  const iso = `${a}-${m}-${g}`;
  return isIsoDateDenseA2(iso) ? iso : "";
}

/** Chiave di dedup ELI: trim + lowercase (stessa regola del resto dell'app). */
export function chiaveEliDenseA2(eli: unknown): string {
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
export function statoDaFineVigenzaDenseA2(
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
export function statoDaIntestazioneArt1DenseA2(testo: string): "decaduto" | "abrogato" | null {
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
export function urnDaVoceDenseA2(voce: unknown): string {
  if (!isRecord(voce)) return "";
  const denominazione = stringaDenseA2(
    voce["denominazioneAtto"] ?? voce["tipoProvvedimentoDescrizione"],
  );
  const tipo = tipoFromDenominazione(denominazione);
  const numero = stringaDenseA2(
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
export function dettaglioToRecordDenseA2(
  voce: VoceDenseA2,
  raw: unknown,
  testoMax: number,
): LawRecord | null {
  const interno = attoInterno(raw);
  if (!interno) return null;
  const dto: AttoDto | null = parseAttoDto(interno);

  const titoloGrezzo =
    normalizzaDenseA2(dto?.titolo ?? "") ||
    normalizzaDenseA2(stringaDenseA2(interno["titolo"])) ||
    normalizzaDenseA2(stringaDenseA2(interno["descrizioneAtto"]));
  if (!titoloGrezzo) return null;
  const titolo = pulisciTestoVisibileDenseA2(titoloGrezzo);
  if (!titolo) return null;

  const tipo =
    dto?.tipo ||
    tipoFromDenominazione(
      stringaDenseA2(interno["tipoProvvedimentoDescrizione"]) ||
        stringaDenseA2(interno["denominazioneAtto"]),
    ) ||
    "atto";

  const numero =
    dto?.numero ||
    stringaDenseA2(interno["numeroProvvedimento"]) ||
    (parseNIR(voce.urn)?.numero ?? "");
  if (!numero) return null;

  const dataEmanazione =
    dto?.dataEmanazione ||
    isoDaParti(interno["annoProvvedimento"], interno["meseProvvedimento"], interno["giornoProvvedimento"]) ||
    normalizzaData(interno["dataEmanazione"]) ||
    (parseNIR(voce.urn)?.data ?? "");
  if (!dataEmanazione) return null;

  const codice = dto?.codiceRedazionale || stringaDenseA2(interno["codiceRedazionale"]) || voce.codice;

  const html = dto?.articoloHtml || stringaDenseA2(interno["articoloHtml"]);
  const testoIntegrale = dto?.testo || stripHtml(html);
  const sottoTitolo =
    dto?.sottoTitolo || normalizzaDenseA2(stringaDenseA2(interno["sottoTitolo"]));
  // Vigenza onesta, in ordine di affidabilita':
  // 1) data di fine vigenza esplicita del dettaglio (passata = abrogato);
  // 2) intestazione formale Art. 1 di Normattiva (DECRETO DECADUTO /
  //    PROVVEDIMENTO ABROGATO = status ufficiale, non citazione nel corpo);
  // 3) default in_vigore. MAI inferire dal corpo del testo.
  const fineVigenzaGrezza = stringaDenseA2(interno["articoloDataFineVigenza"]);
  const daData = statoDaFineVigenzaDenseA2(fineVigenzaGrezza, oggiCompact());
  const daIntestazione = statoDaIntestazioneArt1DenseA2(testoIntegrale);
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
    (isIsoDateDenseA2(voce.dataGU) ? voce.dataGU : "");
  const numeroGU =
    stringaDenseA2(interno["numeroGU"]) || (/^\d+$/.test(voce.numeroGU) ? voce.numeroGU : "");

  const fonti = buildFonti({
    tipo,
    numero,
    dataEmanazione,
    codiceRedazionale: codice || undefined,
    dataGU: dataGU || undefined,
    numeroGU: numeroGU || undefined,
  });

  const sintesi = pulisciTestoVisibileDenseA2(
    normalizzaDenseA2(law.sintesi || sottoTitolo || testoIntegrale || titolo),
  ).slice(0, 600);
  if (!sintesi) return null;

  const testoPieno = pulisciTestoVisibileDenseA2((law.testo ?? "").trim());
  const troncato = testoPieno.length > testoMax;
  const record: LawRecord = {
    chiave,
    titolo: pulisciTestoVisibileDenseA2(law.titolo),
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
    "Densificazione TAG-A2 Normattiva 1951/1952/1957/1958/1966/1967/1968/1969 (dati ufficiali, mai dimostrativi).",
    "",
    "Uso:",
    "  npx tsx scripts/dense-A2.ts [opzioni]",
    "",
    "Opzioni:",
    "  --anni=A,B            anni da densificare (default 1951,1952,1957,1958,1966,1967,1968,1969)",
    "  --max-nuovi=N         nuovi atti max per file (default 120, MAI oltre 120)",
    "  --testo-max=N         caratteri max per testo (default 2000, max 61440)",
    "  --probe               solo liste mensili, nessun dettaglio e nessuna scrittura",
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
  pathApi: string,
  body: unknown,
): Promise<unknown> {
  return runNormattiva(
    Effect.gen(function* () {
      const http = yield* Normattiva;
      return yield* http.request("POST", pathApi, body);
    }),
    overrides,
  );
}

/** Voci reali da una risposta di `POST /ricerca/aggiornati` (dedup per URN). */
export function vociDaAggiornatiDenseA2(raw: unknown): VoceDenseA2[] {
  const voci = arrayDa(unwrapData(raw), ["listaAtti", "atti", "risultati", "hits"]);
  const risultato: VoceDenseA2[] = [];
  const visti = new Set<string>();
  for (const voce of voci) {
    const urn = urnDaVoceDenseA2(voce);
    if (!urn || visti.has(urn)) continue;
    visti.add(urn);
    if (!isRecord(voce)) continue;
    const dataGUCandidata = normalizzaData(voce["dataGU"]);
    const eliGrezzo = stringaDenseA2(voce["eli"]);
    const eliCandidato = eliGrezzo.startsWith("/") ? eliGrezzo : eliGrezzo ? `/${eliGrezzo}` : "";
    risultato.push({
      urn,
      codice: stringaDenseA2(voce["codiceRedazionale"]),
      dataGU: isIsoDateDenseA2(dataGUCandidata) ? dataGUCandidata : "",
      numeroGU: stringaDenseA2(voce["numeroGU"]),
      eliReale: eliCandidato && parseELI(eliCandidato) ? eliCandidato : "",
    });
  }
  return risultato;
}

/** Errore "troppi atti" del server (limite 7000): va raffinata la ricerca. */
export function isErroreLimiteAttiDenseA2(cause: unknown): boolean {
  return /superiore al limite|superiore a 12 mesi|periodo di esportazione|7000|1501|raffinare la ricerca/i.test(
    messaggioDi(cause),
  );
}

/** Dimezza un intervallo ISO [inizio..fine] in due sotto-intervalli per giorni. */
export function dividiIntervalloDenseA2(inizio: string, fine: string): Array<[string, string]> | null {
  if (!isIsoDateDenseA2(inizio) || !isIsoDateDenseA2(fine) || inizio >= fine) return null;
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
): Promise<{ voci: VoceDenseA2[]; url: string }> {
  const raw = await postJson(overrides, "/api/v1/ricerca/aggiornati", {
    dataInizioAggiornamento: inizio,
    dataFineAggiornamento: fine,
  });
  const baseUrl = defaultNormattivaConfig(overrides).baseUrl;
  return { voci: vociDaAggiornatiDenseA2(raw), url: `${baseUrl}/api/v1/ricerca/aggiornati` };
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
): Promise<{ voci: VoceDenseA2[]; url: string }> {
  const baseUrl = defaultNormattivaConfig(overrides).baseUrl;
  const url = `${baseUrl}/api/v1/ricerca/aggiornati`;
  const coda: Array<[string, string]> = [[inizio, fine]];
  const voci: VoceDenseA2[] = [];
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
      const parti = dividiIntervalloDenseA2(ini, fin);
      if (isErroreLimiteAttiDenseA2(cause) && parti) {
        console.log(`Split intervallo ${ini}..${fin} (oltre limite 7000 atti).`);
        coda.unshift(...parti);
        continue;
      }
      throw cause;
    }
  }
  return { voci, url };
}

/** 12 finestre mensili [inizio..fine] per un anno (ultimo giorno reale). */
export function mesiDenseA2(anno: string): Array<[string, string]> {
  const risultato: Array<[string, string]> = [];
  const y = Number.parseInt(anno, 10);
  if (!Number.isFinite(y)) return risultato;
  for (let m = 1; m <= 12; m += 1) {
    const mm = String(m).padStart(2, "0");
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    risultato.push([`${anno}-${mm}-01`, `${anno}-${mm}-${String(ultimo).padStart(2, "0")}`]);
  }
  return risultato;
}

/**
 * Carica gli ELI/nir/chiave gia' presenti in TUTTI i data/reali/*.json su
 * disco (inclusi i file A2: in append mode vanno esclusi). Non lancia mai.
 */
export async function caricaChiaviEsistentiDenseA2(): Promise<Set<string>> {
  const chiavi = new Set<string>();
  let nomi: string[] = [];
  try {
    const dir = path.resolve(path.join("data", "reali"));
    nomi = await readdir(dir);
  } catch {
    return chiavi;
  }
  for (const nome of nomi.filter((n) => n.startsWith("normattiva-") && n.endsWith(".json"))) {
    try {
      const raw = await readFile(path.resolve(path.join("data", "reali", nome)), "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const lista = arrayDa(
        isRecord(parsed) ? (parsed["atti"] ?? parsed["leggi"] ?? parsed["dati"] ?? []) : parsed,
        [],
      );
      const voci = Array.isArray(lista) ? lista : [];
      for (const item of voci) {
        if (!isRecord(item)) continue;
        for (const campo of ["eli", "nir", "chiave"] as const) {
          const chiave = chiaveEliDenseA2(item[campo]);
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
export function eliCandidatiDenseA2(voce: VoceDenseA2): string[] {
  const candidati = new Set<string>();
  const reale = chiaveEliDenseA2(voce.eliReale);
  if (reale) candidati.add(reale);
  if (voce.codice) {
    const derivato = chiaveEliDenseA2(eliFromUrn(voce.urn, voce.codice));
    if (derivato) candidati.add(derivato);
  }
  return [...candidati];
}

/** Atti esistenti di un file A2 (envelope conservata per l'append). */
async function leggiFileEsistente(percorso: string): Promise<Envelope | null> {
  try {
    const raw = await readFile(path.resolve(percorso), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const lista = arrayDa(parsed["atti"] ?? [], []);
    const atti = (Array.isArray(lista) ? lista : []).filter((a): a is LawRecord => isRecord(a));
    const prov = isRecord(parsed["provenance"]) ? (parsed["provenance"] as Record<string, unknown>) : {};
    return {
      provenance: {
        fonte: typeof prov["fonte"] === "string" ? prov["fonte"] : "normattiva",
        url: typeof prov["url"] === "string" ? prov["url"] : "",
        recuperatoIl: typeof prov["recuperatoIl"] === "string" ? prov["recuperatoIl"] : oggiIso(),
        licenza: typeof prov["licenza"] === "string" ? prov["licenza"] : LICENZA,
      },
      atti,
    };
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- main */

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(aiuto());
    return;
  }

  const maxNuovi = intero("max-nuovi", MAX_NUOVI_PER_FILE, 1, MAX_NUOVI_PER_FILE);
  const testoMax = intero("testo-max", 2000, 1000, 61440);
  const probe = process.argv.includes("--probe");
  const anniGrezzi = (argomento("anni") ?? [...ANNI_DEFAULT].join(","))
    .split(",")
    .map((a) => a.trim())
    .filter((a) => ANNI_AMMESSI.has(a));
  const vistiAnni = new Set<string>();
  const anni: NomeAnnoDenseA2[] = [];
  for (const a of anniGrezzi.length > 0 ? anniGrezzi : [...ANNI_DEFAULT]) {
    if (!ANNI_AMMESSI.has(a) || vistiAnni.has(a)) continue;
    vistiAnni.add(a);
    anni.push(a as NomeAnnoDenseA2);
  }
  const apiBase = argomento("api-base");

  const overridesPost: Partial<NormattivaConfig> = {
    timeoutMs: TIMEOUT_POST_MS,
    retries: RETRIES,
    ...(apiBase ? { baseUrl: apiBase } : {}),
  };

  console.log(
    `Densificazione TAG-A2 (split mensili): ${anni.join(", ")} (max +${maxNuovi}/file).`,
  );

  const conosciuti = await caricaChiaviEsistentiDenseA2();
  console.log(`Dedup globale: ${conosciuti.size} chiavi ELI/nir gia' presenti in data/reali/*.json.`);

  // Esistenti per l'append (prima).
  const esistenti = new Map<NomeAnnoDenseA2, Envelope>();
  for (const anno of anni) {
    const env = await leggiFileEsistente(outDefaultDenseA2(anno));
    if (env) esistenti.set(anno, env);
    else console.log(`Anno ${anno}: file esistente illeggibile o assente, verra' creato solo con atti nuovi.`);
  }

  // Liste mensili per anno (secondo passaggio piu' a fondo).
  const vociPerAnno = new Map<NomeAnnoDenseA2, VoceDenseA2[]>();
  const urnVisteAnno = new Map<NomeAnnoDenseA2, number>();
  for (const anno of anni) {
    const voci: VoceDenseA2[] = [];
    const visti = new Set<string>();
    let falliti = 0;
    for (const [ini, fin] of mesiDenseA2(anno)) {
      try {
        const { voci: trovate } = await listaFinestraConSplit(overridesPost, ini, fin);
        for (const voce of trovate) {
          if (visti.has(voce.urn)) continue;
          visti.add(voce.urn);
          voci.push(voce);
        }
      } catch (cause) {
        falliti += 1;
        console.log(`Mese ${ini}..${fin} fallito (${messaggioDi(cause)}).`);
        if (erroreDefinitivo(cause)) {
          console.log("Stop liste su errore definitivo (403/409/ERR_409).");
          break;
        }
      }
    }
    urnVisteAnno.set(anno, voci.length);
    // Escludi conosciuti globali + dedup intra-run tra gli 8 anni.
    const filtrate = voci.filter((voce) => {
      if (chiaveEliDenseA2(voce.urn) && conosciuti.has(chiaveEliDenseA2(voce.urn))) return false;
      for (const candidato of eliCandidatiDenseA2(voce)) {
        if (conosciuti.has(candidato)) return false;
      }
      return true;
    });
    console.log(
      `Anno ${anno}: ${voci.length} voci mensili uniriche (${falliti} mesi falliti), ${filtrate.length} nuove dopo dedup globale.`,
    );
    const selezionate = filtrate.slice(0, maxNuovi);
    vociPerAnno.set(anno, selezionate);
    // Blocca subito le selezionate contro gli altri anni del run.
    for (const voce of selezionate) {
      conosciuti.add(chiaveEliDenseA2(voce.urn));
      for (const c of eliCandidatiDenseA2(voce)) conosciuti.add(c);
    }
  }

  if (probe) {
    console.log("Probe: nessuna scrittura. Riepilogo candidati nuovi per anno:");
    for (const anno of anni) {
      console.log(`  - ${anno}: ${vociPerAnno.get(anno)?.length ?? 0} candidati (su ${urnVisteAnno.get(anno) ?? 0} voci).`);
    }
    return;
  }

  const daDettagliare: Array<{ voce: VoceDenseA2; gruppo: NomeAnnoDenseA2 }> = [];
  for (const anno of anni) {
    for (const voce of vociPerAnno.get(anno) ?? []) daDettagliare.push({ voce, gruppo: anno });
  }
  if (daDettagliare.length === 0) {
    console.log("Nessuna voce nuova da dettagliare: tutti i file restano invariati (zero aggiunte oneste).");
    for (const anno of anni) {
      const prima = esistenti.get(anno)?.atti.length ?? 0;
      console.log(`  - ${anno}: ${prima} -> ${prima} (+0, API esaurita o tutto duplicato).`);
    }
    return;
  }
  console.log(`Recupero dettagli per ${daDettagliare.length} atti (batch da ${DETTAGLI_PER_BATCH}).`);

  const nuoviPerAnno = new Map<NomeAnnoDenseA2, LawRecord[]>();
  for (const anno of anni) nuoviPerAnno.set(anno, []);
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
        const record = dettaglioToRecordDenseA2(voce, raw, testoMax);
        if (!record) {
          errori.push(`dettaglio senza titolo/chiave: ${voce.urn}`);
          continue;
        }
        const impronte = [
          chiaveEliDenseA2(record.chiave),
          chiaveEliDenseA2(record.eli),
          chiaveEliDenseA2(record.nir),
        ].filter(Boolean);
        if (impronte.some((impronta) => visti.has(impronta))) {
          errori.push(`duplicato intra-run escluso: ${voce.urn}`);
          continue;
        }
        for (const impronta of impronte) visti.add(impronta);
        nuoviPerAnno.get(gruppo)?.push(record);
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
    `Dettagli OK: ${anni.map((a) => `${a}=${nuoviPerAnno.get(a)?.length ?? 0}`).join(" ")}; scarti/errori: ${errori.length}.`,
  );

  // Append con bound di size: leggi, unisci con dedup, riscrivi.
  const recuperatoIl = new Date().toISOString();
  const baseUrl = defaultNormattivaConfig(overridesPost).baseUrl;
  for (const anno of anni) {
    const env = esistenti.get(anno);
    const nuovi = nuoviPerAnno.get(anno) ?? [];
    const prima = env?.atti.length ?? 0;
    if (!env || nuovi.length === 0) {
      console.log(`Anno ${anno}: ${prima} -> ${prima} (+0 oneste, nessuna scrittura).`);
      continue;
    }
    // Dedup intra-file finale contro gli esistenti.
    const impronteEsistenti = new Set<string>();
    for (const a of env.atti) {
      for (const campo of [a.chiave, a.eli, a.nir]) {
        const k = chiaveEliDenseA2(campo);
        if (k) impronteEsistenti.add(k);
      }
    }
    const utili = nuovi.filter((r) => {
      const impronte = [r.chiave, r.eli, r.nir].map(chiaveEliDenseA2).filter(Boolean);
      return !impronte.some((k) => impronteEsistenti.has(k));
    });
    const scartatiIntra = nuovi.length - utili.length;
    // Bound size: pota dalla coda finche' il file rientra nei 950 KB.
    let tenuti = utili;
    let json = "";
    while (tenuti.length > 0) {
      const envelope: Envelope = {
        provenance: {
          fonte: "normattiva",
          url: `${baseUrl}/api/v1/ricerca/aggiornati`,
          recuperatoIl,
          licenza: LICENZA,
        },
        atti: [...env.atti, ...tenuti],
      };
      json = JSON.stringify(envelope, null, 2);
      if (Buffer.byteLength(json, "utf8") / DIM_KB <= LIMITE_FILE_KB) break;
      tenuti = tenuti.slice(0, -1);
    }
    if (tenuti.length === 0) {
      console.log(`Anno ${anno}: ${prima} -> ${prima} (+0, bound 950KB: nessuna aggiunta rientra).`);
      continue;
    }
    const dest = path.resolve(outDefaultDenseA2(anno));
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, json, "utf8");
    const kb = Buffer.byteLength(json, "utf8") / DIM_KB;
    const stati = tenuti.reduce(
      (acc, r) => ({ ...acc, [r.stato]: (acc[r.stato] ?? 0) + 1 }),
      {} as Record<string, number>,
    );
    console.log(
      `Anno ${anno}: ${prima} -> ${prima + tenuti.length} (+${tenuti.length}, scarti intra-file ${scartatiIntra}, potati size ${utili.length - tenuti.length}) ${kb.toFixed(1)} KB stati=${JSON.stringify(stati)}.`,
    );
  }
  if (errori.length > 0) {
    console.log(`Note (${errori.length}):`);
    for (const e of errori.slice(0, 10)) console.log(`  - ${e}`);
  }
}

const eseguitoComeScript =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv.length > 1 &&
  (process.argv[1] ?? "").endsWith("dense-A2.ts");

if (eseguitoComeScript) {
  main().catch((cause: unknown) => {
    console.error(`Densificazione A2 fallita: ${messaggioDi(cause)}`);
    process.exitCode = 1;
  });
}
