/**
 * Densificazione TAG C2 -> APPEND a data/reali/normattiva-storico-{1991,1994,1996,1997,1998,2001,2002,2003}.json
 *
 * Secondo passaggio dopo ingest-reale-finestra-anni-D.ts (limite 80/finestra annuale):
 * pagina PIU A FONDO nei risultati aggiornati con split mensili
 * (12x POST /api/v1/ricerca/aggiornati per anno + split su limite 7000),
 * poi dettaglio per URN e APPEND con dedup.
 *
 * Stesse regole d'onesta del pattern 2021-2025 / TAG D:
 * - solo atti VERI da API bff-opendata v1, mai inventati;
 * - stato solo da articoloDataFineVigenza esplicita o intestazione formale Art.1,
 *   mai inferito dal corpo; default in_vigore;
 * - zero em-dash/en-dash, max 1 middle-dot per riga;
 * - dedup ELI/nir/chiave contro TUTTI i data/reali/*.json + intra-file.
 *
 * Bound: max +120 atti per file, file finale SEMPRE <= 950 KB, APPEND
 * (legge, unisce con dedup, riscrive). Se un anno non rende altro: zero
 * aggiunte oneste, mai riempire con inventati.
 *
 * Uso:
 *   npx tsx scripts/dense-C2.ts [--anni=1991,1994,1996,1997,1998,2001,2002,2003]
 *     [--max-nuovi=120] [--testo-max=2000] [--api-base=...] [--help]
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
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

export interface VoceDenseC2 {
  urn: string;
  codice: string;
  dataGU: string;
  numeroGU: string;
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

const ANNI_C2 = ["1991", "1994", "1996", "1997", "1998", "2001", "2002", "2003"] as const;
type NomeC2 = (typeof ANNI_C2)[number];

const OUT_DEFAULT: Record<NomeC2, string> = {
  "1991": path.join("data", "reali", "normattiva-storico-1991.json"),
  "1994": path.join("data", "reali", "normattiva-storico-1994.json"),
  "1996": path.join("data", "reali", "normattiva-storico-1996.json"),
  "1997": path.join("data", "reali", "normattiva-storico-1997.json"),
  "1998": path.join("data", "reali", "normattiva-storico-1998.json"),
  "2001": path.join("data", "reali", "normattiva-storico-2001.json"),
  "2002": path.join("data", "reali", "normattiva-storico-2002.json"),
  "2003": path.join("data", "reali", "normattiva-storico-2003.json"),
};

const LICENZA =
  "riproduzione consentita con menzione di fonte, carattere non autentico e gratuito " +
  "(Note legali dati.normattiva.it; solo la Gazzetta Ufficiale a stampa e' autentica)";

/* ------------------------------------------------------- utility interne */

function oggiCompact(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

export function normalizzaDenseC2(testo: string): string {
  return (testo ?? "").replace(/\s+/g, " ").trim();
}

export function stringaDenseC2(voce: unknown): string {
  if (typeof voce === "string") return voce.trim();
  if (typeof voce === "number" && Number.isFinite(voce)) return String(voce);
  return "";
}

export function isIsoDateDenseC2(testo: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testo)) return false;
  const parsed = new Date(`${testo}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === testo;
}

export function pulisciTestoVisibileC2(testo: string): string {
  const senzaTrattini = String(testo ?? "").replace(/[—–]/g, "-");
  return senzaTrattini
    .split("\n")
    .map((riga) => {
      let visti = 0;
      return riga
        .split("")
        .map((ch) => {
          if (ch !== "·") return ch;
          visti += 1;
          return visti <= 1 ? ch : "-";
        })
        .join("");
    })
    .join("\n");
}

function isoDaParti(anno: unknown, mese: unknown, giorno: unknown): string {
  const a = stringaDenseC2(anno).padStart(4, "0");
  const m = stringaDenseC2(mese).padStart(2, "0");
  const g = stringaDenseC2(giorno).padStart(2, "0");
  const iso = `${a}-${m}-${g}`;
  return isIsoDateDenseC2(iso) ? iso : "";
}

export function chiaveEliDenseC2(eli: unknown): string {
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

export function statoDaFineVigenzaC2(
  fineVigenza: string,
  oggiYYYYMMDD: string,
): "in_vigore" | "abrogato" {
  const valida = /^(\d{4})(\d{2})(\d{2})$/.exec((fineVigenza ?? "").trim());
  if (valida && valida[0] !== "99999999" && valida[0] < oggiYYYYMMDD) return "abrogato";
  return "in_vigore";
}

export function statoDaIntestazioneArt1C2(testo: string): "decaduto" | "abrogato" | null {
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

export function urnDaVoceDenseC2(voce: unknown): string {
  if (!isRecord(voce)) return "";
  const denominazione = stringaDenseC2(
    voce["denominazioneAtto"] ?? voce["tipoProvvedimentoDescrizione"],
  );
  const tipo = tipoFromDenominazione(denominazione);
  const numero = stringaDenseC2(
    voce["numeroProvvedimento"] ?? voce["numero"] ?? voce["numeroAttoAlfanumerico"],
  );
  const iso = isoDaParti(voce["annoProvvedimento"], voce["meseProvvedimento"], voce["giornoProvvedimento"]);
  if (!tipo || !numero || !iso) return "";
  const urn = formatNIR({ tipo, data: iso, numero });
  return parseNIR(urn) ? urn : "";
}

function attoInterno(raw: unknown): Record<string, unknown> | null {
  const involucro = unwrapData(raw);
  if (isRecord(involucro)) {
    const interno = involucro["atto"];
    if (isRecord(interno)) return interno;
    return involucro;
  }
  return null;
}

export function dettaglioToRecordDenseC2(
  voce: VoceDenseC2,
  raw: unknown,
  testoMax: number,
): LawRecord | null {
  const interno = attoInterno(raw);
  if (!interno) return null;
  const dto: AttoDto | null = parseAttoDto(interno);

  const titoloGrezzo =
    normalizzaDenseC2(dto?.titolo ?? "") ||
    normalizzaDenseC2(stringaDenseC2(interno["titolo"])) ||
    normalizzaDenseC2(stringaDenseC2(interno["descrizioneAtto"]));
  if (!titoloGrezzo) return null;
  const titolo = pulisciTestoVisibileC2(titoloGrezzo);
  if (!titolo) return null;

  const tipo =
    dto?.tipo ||
    tipoFromDenominazione(
      stringaDenseC2(interno["tipoProvvedimentoDescrizione"]) ||
        stringaDenseC2(interno["denominazioneAtto"]),
    ) ||
    "atto";

  const numero =
    dto?.numero ||
    stringaDenseC2(interno["numeroProvvedimento"]) ||
    (parseNIR(voce.urn)?.numero ?? "");
  if (!numero) return null;

  const dataEmanazione =
    dto?.dataEmanazione ||
    isoDaParti(interno["annoProvvedimento"], interno["meseProvvedimento"], interno["giornoProvvedimento"]) ||
    normalizzaData(interno["dataEmanazione"]) ||
    (parseNIR(voce.urn)?.data ?? "");
  if (!dataEmanazione) return null;

  const codice = dto?.codiceRedazionale || stringaDenseC2(interno["codiceRedazionale"]) || voce.codice;

  const html = dto?.articoloHtml || stringaDenseC2(interno["articoloHtml"]);
  const testoIntegrale = dto?.testo || stripHtml(html);
  const sottoTitolo =
    dto?.sottoTitolo || normalizzaDenseC2(stringaDenseC2(interno["sottoTitolo"]));
  const fineVigenzaGrezza = stringaDenseC2(interno["articoloDataFineVigenza"]);
  const daData = statoDaFineVigenzaC2(fineVigenzaGrezza, oggiCompact());
  const daIntestazione = statoDaIntestazioneArt1C2(testoIntegrale);
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
    (isIsoDateDenseC2(voce.dataGU) ? voce.dataGU : "");
  const numeroGU =
    stringaDenseC2(interno["numeroGU"]) || (/^\d+$/.test(voce.numeroGU) ? voce.numeroGU : "");

  const fonti = buildFonti({
    tipo,
    numero,
    dataEmanazione,
    codiceRedazionale: codice || undefined,
    dataGU: dataGU || undefined,
    numeroGU: numeroGU || undefined,
  });

  const sintesi = pulisciTestoVisibileC2(
    normalizzaDenseC2(law.sintesi || sottoTitolo || testoIntegrale || titolo),
  ).slice(0, 600);
  if (!sintesi) return null;

  const testoPieno = pulisciTestoVisibileC2((law.testo ?? "").trim());
  const troncato = testoPieno.length > testoMax;
  const record: LawRecord = {
    chiave,
    titolo: pulisciTestoVisibileC2(law.titolo),
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
    "Densificazione TAG C2: secondo passaggio mensile profondo + APPEND (dati ufficiali, mai dimostrativi).",
    "",
    "Uso:",
    "  npx tsx scripts/dense-C2.ts [opzioni]",
    "",
    "Opzioni:",
    "  --anni=A,B            anni da densificare (default 1991,1994,1996,1997,1998,2001,2002,2003)",
    "  --max-nuovi=N         nuovi atti max per file (default 120, MAI oltre 120)",
    "  --testo-max=N         caratteri max per testo (default 2000, max 61440)",
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

async function postJson(
  overrides: Partial<NormattivaConfig>,
  reqPath: string,
  body: unknown,
): Promise<unknown> {
  return runNormattiva(
    Effect.gen(function* () {
      const http = yield* Normattiva;
      return yield* http.request("POST", reqPath, body);
    }),
    overrides,
  );
}

export function vociDaAggiornatiC2(raw: unknown): VoceDenseC2[] {
  const voci = arrayDa(unwrapData(raw), ["listaAtti", "atti", "risultati", "hits"]);
  const risultato: VoceDenseC2[] = [];
  const visti = new Set<string>();
  for (const voce of voci) {
    const urn = urnDaVoceDenseC2(voce);
    if (!urn || visti.has(urn)) continue;
    visti.add(urn);
    if (!isRecord(voce)) continue;
    const dataGUCandidata = normalizzaData(voce["dataGU"]);
    const eliGrezzo = stringaDenseC2(voce["eli"]);
    const eliCandidato = eliGrezzo.startsWith("/") ? eliGrezzo : eliGrezzo ? `/${eliGrezzo}` : "";
    risultato.push({
      urn,
      codice: stringaDenseC2(voce["codiceRedazionale"]),
      dataGU: isIsoDateDenseC2(dataGUCandidata) ? dataGUCandidata : "",
      numeroGU: stringaDenseC2(voce["numeroGU"]),
      eliReale: eliCandidato && parseELI(eliCandidato) ? eliCandidato : "",
    });
  }
  return risultato;
}

export function isErroreLimiteAttiC2(cause: unknown): boolean {
  return /superiore al limite|superiore a 12 mesi|periodo di esportazione|7000|1501|raffinare la ricerca/i.test(
    messaggioDi(cause),
  );
}

export function dividiIntervalloC2(inizio: string, fine: string): Array<[string, string]> | null {
  if (!isIsoDateDenseC2(inizio) || !isIsoDateDenseC2(fine) || inizio >= fine) return null;
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

async function listaFinestra(
  overrides: Partial<NormattivaConfig>,
  inizio: string,
  fine: string,
): Promise<{ voci: VoceDenseC2[]; url: string }> {
  const raw = await postJson(overrides, "/api/v1/ricerca/aggiornati", {
    dataInizioAggiornamento: inizio,
    dataFineAggiornamento: fine,
  });
  const baseUrl = defaultNormattivaConfig(overrides).baseUrl;
  return { voci: vociDaAggiornatiC2(raw), url: `${baseUrl}/api/v1/ricerca/aggiornati` };
}

async function listaFinestraConSplit(
  overrides: Partial<NormattivaConfig>,
  inizio: string,
  fine: string,
): Promise<{ voci: VoceDenseC2[]; url: string }> {
  const baseUrl = defaultNormattivaConfig(overrides).baseUrl;
  const url = `${baseUrl}/api/v1/ricerca/aggiornati`;
  const coda: Array<[string, string]> = [[inizio, fine]];
  const voci: VoceDenseC2[] = [];
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
      const parti = dividiIntervalloC2(ini, fin);
      if (isErroreLimiteAttiC2(cause) && parti) {
        console.log(`Split intervallo ${ini}..${fin} (oltre limite 7000 atti).`);
        coda.unshift(...parti);
        continue;
      }
      throw cause;
    }
  }
  return { voci, url };
}

/** 12 intervalli mensili [primo..ultimo] per un anno. Pura. */
export function mesiAnnoC2(anno: string): Array<[string, string]> {
  const y = Number.parseInt(anno, 10);
  if (!Number.isFinite(y)) return [];
  const out: Array<[string, string]> = [];
  for (let m = 1; m <= 12; m += 1) {
    const mm = String(m).padStart(2, "0");
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    out.push([`${anno}-${mm}-01`, `${anno}-${mm}-${String(ultimo).padStart(2, "0")}`]);
  }
  return out;
}

export async function percorsiDedupC2(): Promise<string[]> {
  try {
    const dir = path.resolve(path.join("data", "reali"));
    const nomi = await readdir(dir);
    return nomi
      .filter((n) => n.startsWith("normattiva-") && n.endsWith(".json"))
      .map((n) => path.join("data", "reali", n));
  } catch {
    return [];
  }
}

export async function caricaChiaviEsistentiC2(percorsi: readonly string[]): Promise<Set<string>> {
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
          const chiave = chiaveEliDenseC2(item[campo]);
          if (chiave) chiavi.add(chiave);
        }
      }
    } catch {
      continue;
    }
  }
  return chiavi;
}

export function eliCandidatiC2(voce: VoceDenseC2): string[] {
  const candidati = new Set<string>();
  const reale = chiaveEliDenseC2(voce.eliReale);
  if (reale) candidati.add(reale);
  if (voce.codice) {
    const derivato = chiaveEliDenseC2(eliFromUrn(voce.urn, voce.codice));
    if (derivato) candidati.add(derivato);
  }
  return [...candidati];
}

async function leggiEnvelope(percorso: string): Promise<Envelope | null> {
  try {
    const raw = await readFile(path.resolve(percorso), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const atti = arrayDa(parsed["atti"], []);
    return {
      provenance: {
        fonte: "normattiva",
        url: typeof parsed["provenance"] === "object" && parsed["provenance"] !== null
          ? String((parsed["provenance"] as Record<string, unknown>)["url"] ?? "")
          : "",
        recuperatoIl: new Date().toISOString(),
        licenza: LICENZA,
      },
      atti: (Array.isArray(atti) ? atti : []).filter((a): a is LawRecord => isRecord(a)) as LawRecord[],
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
  const anniGrezzi = (argomento("anni") ?? [...ANNI_C2].join(","))
    .split(",")
    .map((a) => a.trim())
    .filter((a) => (ANNI_C2 as readonly string[]).includes(a));
  const anni: NomeC2[] = (
    anniGrezzi.length > 0 ? anniGrezzi : [...ANNI_C2]
  ).filter((a, i, arr) => arr.indexOf(a) === i) as NomeC2[];
  const apiBase = argomento("api-base");

  const overridesPost: Partial<NormattivaConfig> = {
    timeoutMs: TIMEOUT_POST_MS,
    retries: RETRIES,
    ...(apiBase ? { baseUrl: apiBase } : {}),
  };

  console.log(`Densificazione TAG C2 mensile profonda: ${anni.join(",")} (max +${maxNuovi}/file).`);

  const percorsiDedup = await percorsiDedupC2();
  const conosciuti = await caricaChiaviEsistentiC2(percorsiDedup);
  console.log(`Dedup globale: ${conosciuti.size} chiavi in ${percorsiDedup.length} percorsi.`);

  const riepilogo: Array<{ anno: NomeC2; prima: number; dopo: number; nuovi: number }> = [];

  for (const anno of anni) {
    const dest = OUT_DEFAULT[anno];
    const esistente = await leggiEnvelope(dest);
    if (!esistente) {
      console.log(`Anno ${anno}: file esistente illeggibile, salto onesto (zero aggiunte).`);
      riepilogo.push({ anno, prima: 0, dopo: 0, nuovi: 0 });
      continue;
    }
    const prima = esistente.atti.length;

    // Secondo passaggio: 12 query mensili invece di 1 annuale.
    const raccolte: VoceDenseC2[] = [];
    const vistiUrn = new Set<string>();
    let urlAnno = esistente.provenance.url;
    for (const [ini, fin] of mesiAnnoC2(anno)) {
      try {
        const { voci, url } = await listaFinestraConSplit(overridesPost, ini, fin);
        urlAnno = url;
        console.log(`Anno ${anno} mese ${ini.slice(0, 7)}: ${voci.length} voci reali.`);
        for (const voce of voci) {
          if (vistiUrn.has(voce.urn)) continue;
          vistiUrn.add(voce.urn);
          raccolte.push(voce);
        }
      } catch (cause) {
        console.log(`Anno ${anno} mese ${ini.slice(0, 7)} fallito (${messaggioDi(cause)}).`);
        if (erroreDefinitivo(cause)) {
          console.log("Stop su errore definitivo (403/409).");
          break;
        }
      }
    }
    console.log(`Anno ${anno}: ${raccolte.length} voci mensili aggregate.`);

    // Filtra gia' noti globalmente + intra-raccolta ELI.
    const eliViste = new Set<string>();
    const candidate = raccolte.filter((voce) => {
      if (chiaveEliDenseC2(voce.urn) && conosciuti.has(chiaveEliDenseC2(voce.urn))) return false;
      const cand = eliCandidatiC2(voce);
      if (cand.some((c) => conosciuti.has(c) || eliViste.has(c))) return false;
      for (const c of cand) eliViste.add(c);
      return true;
    });
    console.log(`Anno ${anno}: ${candidate.length} candidate nuove dopo dedup.`);
    const selezionate = candidate.slice(0, maxNuovi);

    const nuovi: LawRecord[] = [];
    const visti = new Set<string>();
    const errori: string[] = [];
    let interrotto = false;
    for (let i = 0; i < selezionate.length && !interrotto; i += DETTAGLI_PER_BATCH) {
      const batch = selezionate.slice(i, i + DETTAGLI_PER_BATCH);
      for (const voce of batch) {
        try {
          const raw = await postJson(overridesPost, "/api/v1/atto/dettaglio-atto-urn", {
            urn: voce.urn,
          });
          const record = dettaglioToRecordDenseC2(voce, raw, testoMax);
          if (!record) {
            errori.push(`dettaglio senza titolo/chiave: ${voce.urn}`);
            continue;
          }
          const impronte = [
            chiaveEliDenseC2(record.chiave),
            chiaveEliDenseC2(record.eli),
            chiaveEliDenseC2(record.nir),
          ].filter(Boolean);
          if (impronte.some((im) => visti.has(im) || conosciuti.has(im))) {
            errori.push(`duplicato escluso: ${voce.urn}`);
            continue;
          }
          for (const im of impronte) {
            visti.add(im);
            conosciuti.add(im);
          }
          nuovi.push(record);
        } catch (cause) {
          errori.push(`dettaglio ${voce.urn}: ${messaggioDi(cause)}`);
          if (erroreDefinitivo(cause)) {
            console.log("Stop su errore definitivo durante i dettagli.");
            interrotto = true;
            break;
          }
        }
      }
      if (i + DETTAGLI_PER_BATCH < selezionate.length && !interrotto) await pausa(PAUSA_BATCH_MS);
    }
    console.log(`Anno ${anno}: dettagli OK ${nuovi.length}, scarti/errori ${errori.length}.`);

    // APPEND con dedup intra-file + rispetto 950 KB (trim dalla coda se serve).
    const uniti: LawRecord[] = [...esistente.atti];
    const impronteFile = new Set<string>();
    for (const a of uniti) {
      for (const c of [a.chiave, a.eli, a.nir]) {
        const k = chiaveEliDenseC2(c);
        if (k) impronteFile.add(k);
      }
    }
    const aggiunti: LawRecord[] = [];
    for (const r of nuovi) {
      const impronte = [r.chiave, r.eli, r.nir].map(chiaveEliDenseC2).filter(Boolean);
      if (impronte.some((im) => impronteFile.has(im))) continue;
      for (const im of impronte) impronteFile.add(im);
      uniti.push(r);
      aggiunti.push(r);
    }

    let envelope: Envelope = {
      provenance: {
        fonte: "normattiva",
        url: urlAnno,
        recuperatoIl: new Date().toISOString(),
        licenza: LICENZA,
      },
      atti: uniti,
    };
    let json = JSON.stringify(envelope, null, 2);
    while (Buffer.byteLength(json, "utf8") / DIM_KB > LIMITE_FILE_KB && aggiunti.length > 0) {
      const tolto = aggiunti.pop() as LawRecord;
      envelope = { ...envelope, atti: envelope.atti.filter((a) => a !== tolto) };
      json = JSON.stringify(envelope, null, 2);
    }
    const kbFinale = Buffer.byteLength(json, "utf8") / DIM_KB;
    if (kbFinale > LIMITE_FILE_KB) {
      console.log(`Anno ${anno}: oltre 950 KB anche senza aggiunte, salto scrittura.`);
      riepilogo.push({ anno, prima, dopo: prima, nuovi: 0 });
      continue;
    }
    await writeFile(path.resolve(dest), json, "utf8");
    console.log(`Anno ${anno}: ${prima} -> ${envelope.atti.length} (+${aggiunti.length}), ${kbFinale.toFixed(1)} KB.`);
    riepilogo.push({ anno, prima, dopo: envelope.atti.length, nuovi: aggiunti.length });
  }

  console.log("Riepilogo C2:");
  for (const r of riepilogo) console.log(`  ${r.anno}: ${r.prima} -> ${r.dopo} (+${r.nuovi})`);
}

const eseguitoComeScript =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv.length > 1 &&
  (process.argv[1] ?? "").endsWith("dense-C2.ts");

if (eseguitoComeScript) {
  main().catch((cause: unknown) => {
    console.error(`Densificazione C2 fallita: ${messaggioDi(cause)}`);
    process.exitCode = 1;
  });
}
