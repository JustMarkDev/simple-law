/**
 * Densificazione TAG-B2: secondo passaggio su 1971,1972,1973,1974,1976,1982,1983,1988.
 *
 * Il primo passaggio (scripts/ingest-reale-finestra-anni-B/C.ts) ha preso solo i
 * primi 80 atti della finestra annuale `POST /api/v1/ricerca/aggiornati`, ma le
 * liste annuali rendono 400+ voci reali ciascuna: questo script pagina PIU A
 * FONDO gli stessi risultati aggiornati (unione di 12 split mensili + finestra
 * annuale, con split di dimezzamento se il server segnala oltre-limite) e
 * dettaglia gli URN mai archiviati, in APPEND ai file esistenti.
 *
 * Stesse regole d'onesta del primo passaggio: ogni campo deriva dalla risposta
 * HTTP (lista + dettaglio) oppure il record viene scartato. Mai inventati.
 * Stato solo da `articoloDataFineVigenza` esplicita (`99999999` = in vigore,
 * data passata = abrogato) oppure intestazione formale Art. 1
 * (`DECRETO DECADUTO` / `PROVVEDIMENTO ABROGATO`), altrimenti in_vigore.
 * Mai inferito dal corpo. Zero em-dash/en-dash, max 1 middle-dot per riga.
 *
 * Dedup ELI contro TUTTI i data/reali/normattiva-*.json su disco + intra-file +
 * intra-run: mai due record per lo stesso atto.
 *
 * Bound: max +120 atti NUOVI per file, file finale SEMPRE <= 950 KB, APPEND
 * (legge gli atti esistenti, unisce con dedup, riscrive). Se un anno non rende
 * altro di reale: zero aggiunte oneste, MAI riempire con inventati.
 *
 * Uso:
 *   npx tsx scripts/dense-B2.ts [--anni=1971,1972] [--per-anno=120]
 *     [--testo-max=2000] [--api-base=...] [--help]
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

export interface VoceDenseB2 {
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
/** Max atti NUOVI aggiunti per file in questo secondo passaggio. */
const MAX_NUOVI_PER_ANNO = 120;

const ORDINE_DEFAULT = ["1971", "1972", "1973", "1974", "1976", "1982", "1983", "1988"] as const;
type NomeDenseB2 = (typeof ORDINE_DEFAULT)[number];

const OUT_DEFAULT: Record<NomeDenseB2, string> = {
  "1971": path.join("data", "reali", "normattiva-storico-1971.json"),
  "1972": path.join("data", "reali", "normattiva-storico-1972.json"),
  "1973": path.join("data", "reali", "normattiva-storico-1973.json"),
  "1974": path.join("data", "reali", "normattiva-storico-1974.json"),
  "1976": path.join("data", "reali", "normattiva-storico-1976.json"),
  "1982": path.join("data", "reali", "normattiva-storico-1982.json"),
  "1983": path.join("data", "reali", "normattiva-storico-1983.json"),
  "1988": path.join("data", "reali", "normattiva-storico-1988.json"),
};

const LICENZA =
  "riproduzione consentita con menzione di fonte, carattere non autentico e gratuito " +
  "(Note legali dati.normattiva.it; solo la Gazzetta Ufficiale a stampa e' autentica)";

/* ------------------------------------------------------- utility interne */

export function normalizzaDenseB2(testo: string): string {
  return (testo ?? "").replace(/\s+/g, " ").trim();
}

export function stringaDenseB2(voce: unknown): string {
  if (typeof voce === "string") return voce.trim();
  if (typeof voce === "number" && Number.isFinite(voce)) return String(voce);
  return "";
}

export function isIsoDateDenseB2(testo: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testo)) return false;
  const parsed = new Date(`${testo}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === testo;
}

export function pulisciTestoVisibileDenseB2(testo: string): string {
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
  const a = stringaDenseB2(anno).padStart(4, "0");
  const m = stringaDenseB2(mese).padStart(2, "0");
  const g = stringaDenseB2(giorno).padStart(2, "0");
  const iso = `${a}-${m}-${g}`;
  return isIsoDateDenseB2(iso) ? iso : "";
}

export function chiaveEliDenseB2(eli: unknown): string {
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

function oggiCompact(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

export function statoDaFineVigenzaDenseB2(
  fineVigenza: string,
  oggiYYYYMMDD: string,
): "in_vigore" | "abrogato" {
  const valida = /^(\d{4})(\d{2})(\d{2})$/.exec((fineVigenza ?? "").trim());
  if (valida && valida[0] !== "99999999" && valida[0] < oggiYYYYMMDD) return "abrogato";
  return "in_vigore";
}

export function statoDaIntestazioneArt1DenseB2(testo: string): "decaduto" | "abrogato" | null {
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

export function urnDaVoceDenseB2(voce: unknown): string {
  if (!isRecord(voce)) return "";
  const denominazione = stringaDenseB2(
    voce["denominazioneAtto"] ?? voce["tipoProvvedimentoDescrizione"],
  );
  const tipo = tipoFromDenominazione(denominazione);
  const numero = stringaDenseB2(
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

export function dettaglioToRecordDenseB2(
  voce: VoceDenseB2,
  raw: unknown,
  testoMax: number,
): LawRecord | null {
  const interno = attoInterno(raw);
  if (!interno) return null;
  const dto: AttoDto | null = parseAttoDto(interno);

  const titoloGrezzo =
    normalizzaDenseB2(dto?.titolo ?? "") ||
    normalizzaDenseB2(stringaDenseB2(interno["titolo"])) ||
    normalizzaDenseB2(stringaDenseB2(interno["descrizioneAtto"]));
  if (!titoloGrezzo) return null;
  const titolo = pulisciTestoVisibileDenseB2(titoloGrezzo);
  if (!titolo) return null;

  const tipo =
    dto?.tipo ||
    tipoFromDenominazione(
      stringaDenseB2(interno["tipoProvvedimentoDescrizione"]) ||
        stringaDenseB2(interno["denominazioneAtto"]),
    ) ||
    "atto";

  const numero =
    dto?.numero ||
    stringaDenseB2(interno["numeroProvvedimento"]) ||
    (parseNIR(voce.urn)?.numero ?? "");
  if (!numero) return null;

  const dataEmanazione =
    dto?.dataEmanazione ||
    isoDaParti(interno["annoProvvedimento"], interno["meseProvvedimento"], interno["giornoProvvedimento"]) ||
    normalizzaData(interno["dataEmanazione"]) ||
    (parseNIR(voce.urn)?.data ?? "");
  if (!dataEmanazione) return null;

  const codice = dto?.codiceRedazionale || stringaDenseB2(interno["codiceRedazionale"]) || voce.codice;

  const html = dto?.articoloHtml || stringaDenseB2(interno["articoloHtml"]);
  const testoIntegrale = dto?.testo || stripHtml(html);
  const sottoTitolo =
    dto?.sottoTitolo || normalizzaDenseB2(stringaDenseB2(interno["sottoTitolo"]));
  const fineVigenzaGrezza = stringaDenseB2(interno["articoloDataFineVigenza"]);
  const daData = statoDaFineVigenzaDenseB2(fineVigenzaGrezza, oggiCompact());
  const daIntestazione = statoDaIntestazioneArt1DenseB2(testoIntegrale);
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
    (isIsoDateDenseB2(voce.dataGU) ? voce.dataGU : "");
  const numeroGU =
    stringaDenseB2(interno["numeroGU"]) || (/^\d+$/.test(voce.numeroGU) ? voce.numeroGU : "");

  const fonti = buildFonti({
    tipo,
    numero,
    dataEmanazione,
    codiceRedazionale: codice || undefined,
    dataGU: dataGU || undefined,
    numeroGU: numeroGU || undefined,
  });

  const sintesi = pulisciTestoVisibileDenseB2(
    normalizzaDenseB2(law.sintesi || sottoTitolo || testoIntegrale || titolo),
  ).slice(0, 600);
  if (!sintesi) return null;

  const testoPieno = pulisciTestoVisibileDenseB2((law.testo ?? "").trim());
  const troncato = testoPieno.length > testoMax;
  const record: LawRecord = {
    chiave,
    titolo: pulisciTestoVisibileDenseB2(law.titolo),
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
    "Densificazione TAG-B2 anni 1971,1972,1973,1974,1976,1982,1983,1988 (APPEND, dati ufficiali, mai dimostrativi).",
    "",
    "Uso:",
    "  npx tsx scripts/dense-B2.ts [opzioni]",
    "",
    "Opzioni:",
    "  --anni=A,B            anni da densificare (default tutti gli 8)",
    "  --per-anno=N          max atti NUOVI per file (default 120, MAI oltre 120)",
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

export function vociDaAggiornatiDenseB2(raw: unknown): VoceDenseB2[] {
  const voci = arrayDa(unwrapData(raw), ["listaAtti", "atti", "risultati", "hits"]);
  const risultato: VoceDenseB2[] = [];
  const visti = new Set<string>();
  for (const voce of voci) {
    const urn = urnDaVoceDenseB2(voce);
    if (!urn || visti.has(urn)) continue;
    visti.add(urn);
    if (!isRecord(voce)) continue;
    const dataGUCandidata = normalizzaData(voce["dataGU"]);
    const eliGrezzo = stringaDenseB2(voce["eli"]);
    const eliCandidato = eliGrezzo.startsWith("/") ? eliGrezzo : eliGrezzo ? `/${eliGrezzo}` : "";
    risultato.push({
      urn,
      codice: stringaDenseB2(voce["codiceRedazionale"]),
      dataGU: isIsoDateDenseB2(dataGUCandidata) ? dataGUCandidata : "",
      numeroGU: stringaDenseB2(voce["numeroGU"]),
      eliReale: eliCandidato && parseELI(eliCandidato) ? eliCandidato : "",
    });
  }
  return risultato;
}

export function isErroreLimiteAttiDenseB2(cause: unknown): boolean {
  return /superiore al limite|superiore a 12 mesi|periodo di esportazione|7000|1501|raffinare la ricerca/i.test(
    messaggioDi(cause),
  );
}

export function dividiIntervalloDenseB2(inizio: string, fine: string): Array<[string, string]> | null {
  if (!isIsoDateDenseB2(inizio) || !isIsoDateDenseB2(fine) || inizio >= fine) return null;
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
): Promise<VoceDenseB2[]> {
  const raw = await postJson(overrides, "/api/v1/ricerca/aggiornati", {
    dataInizioAggiornamento: inizio,
    dataFineAggiornamento: fine,
  });
  return vociDaAggiornatiDenseB2(raw);
}

async function listaFinestraConSplit(
  overrides: Partial<NormattivaConfig>,
  inizio: string,
  fine: string,
): Promise<VoceDenseB2[]> {
  const coda: Array<[string, string]> = [[inizio, fine]];
  const voci: VoceDenseB2[] = [];
  const visti = new Set<string>();
  while (coda.length > 0) {
    const [ini, fin] = coda.shift() as [string, string];
    try {
      const trovate = await listaFinestra(overrides, ini, fin);
      for (const voce of trovate) {
        if (visti.has(voce.urn)) continue;
        visti.add(voce.urn);
        voci.push(voce);
      }
    } catch (cause) {
      const parti = dividiIntervalloDenseB2(ini, fin);
      if (isErroreLimiteAttiDenseB2(cause) && parti) {
        console.log(`Split intervallo ${ini}..${fin} (oltre limite 7000 atti).`);
        coda.unshift(...parti);
        continue;
      }
      throw cause;
    }
  }
  return voci;
}

/** Ultimo giorno del mese (gestisce bisestili). */
export function ultimoGiornoMeseDenseB2(anno: string, mese: number): string {
  const ultimo = new Date(Date.UTC(Number(anno), mese, 0)).toISOString().slice(0, 10);
  return ultimo;
}

/**
 * Lista profonda: unione di 12 split mensili + finestra annuale, dedup URN.
 * I mensili vengono prima (scoprono voci oltre eventuali cap annuali).
 */
export async function listaProfondaAnnoDenseB2(
  overrides: Partial<NormattivaConfig>,
  anno: string,
): Promise<VoceDenseB2[]> {
  const unite: VoceDenseB2[] = [];
  const visti = new Set<string>();
  const aggiungi = (voci: VoceDenseB2[]): void => {
    for (const voce of voci) {
      if (visti.has(voce.urn)) continue;
      visti.add(voce.urn);
      unite.push(voce);
    }
  };
  for (let mese = 1; mese <= 12; mese += 1) {
    const mm = String(mese).padStart(2, "0");
    const ini = `${anno}-${mm}-01`;
    const fin = ultimoGiornoMeseDenseB2(anno, mese);
    try {
      aggiungi(await listaFinestraConSplit(overrides, ini, fin));
    } catch (cause) {
      if (erroreDefinitivo(cause)) throw cause;
      console.log(`Mese ${ini}..${fin} fallito (${messaggioDi(cause)}), riprovo dopo pausa.`);
      await pausa(2000);
      try {
        aggiungi(await listaFinestraConSplit(overrides, ini, fin));
      } catch (cause2) {
        console.log(`Mese ${ini}..${fin} fallito di nuovo (${messaggioDi(cause2)}), continuo.`);
        if (erroreDefinitivo(cause2)) throw cause2;
      }
    }
    await pausa(300);
  }
  try {
    aggiungi(await listaFinestraConSplit(overrides, `${anno}-01-01`, `${anno}-12-31`));
  } catch (cause) {
    console.log(`Finestra annuale ${anno} fallita (${messaggioDi(cause)}).`);
    if (erroreDefinitivo(cause)) throw cause;
  }
  return unite;
}

export async function percorsiDedupDenseB2(): Promise<string[]> {
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

export async function caricaChiaviEsistentiDenseB2(percorsi: readonly string[]): Promise<Set<string>> {
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
          const chiave = chiaveEliDenseB2(item[campo]);
          if (chiave) chiavi.add(chiave);
        }
      }
    } catch {
      continue;
    }
  }
  return chiavi;
}

export function eliCandidatiDenseB2(voce: VoceDenseB2): string[] {
  const candidati = new Set<string>();
  const reale = chiaveEliDenseB2(voce.eliReale);
  if (reale) candidati.add(reale);
  if (voce.codice) {
    const derivato = chiaveEliDenseB2(eliFromUrn(voce.urn, voce.codice));
    if (derivato) candidati.add(derivato);
  }
  return [...candidati];
}

async function leggiAttiEsistenti(percorso: string): Promise<{ atti: LawRecord[]; provenance: Provenance | null }> {
  try {
    const raw = await readFile(path.resolve(percorso), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return { atti: [], provenance: null };
    const lista = arrayDa(parsed["atti"] ?? [], []);
    const atti: LawRecord[] = [];
    for (const item of Array.isArray(lista) ? lista : []) {
      if (isRecord(item) && typeof item["chiave"] === "string" && typeof item["titolo"] === "string") {
        atti.push(item as unknown as LawRecord);
      }
    }
    const prov = isRecord(parsed["provenance"]) ? (parsed["provenance"] as unknown as Provenance) : null;
    return { atti, provenance: prov };
  } catch {
    return { atti: [], provenance: null };
  }
}

/* --------------------------------------------------------------- main */

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(aiuto());
    return;
  }
  const perAnno = intero("per-anno", MAX_NUOVI_PER_ANNO, 1, MAX_NUOVI_PER_ANNO);
  const testoMax = intero("testo-max", 2000, 1000, 61440);
  const anniGrezzi = (argomento("anni") ?? [...ORDINE_DEFAULT].join(","))
    .split(",")
    .map((a) => a.trim())
    .filter((a) => (ORDINE_DEFAULT as readonly string[]).includes(a)) as NomeDenseB2[];
  const vistiAnni = new Set<string>();
  const anni: NomeDenseB2[] = [];
  for (const a of anniGrezzi.length > 0 ? anniGrezzi : [...ORDINE_DEFAULT]) {
    if (vistiAnni.has(a)) continue;
    vistiAnni.add(a);
    anni.push(a);
  }
  const apiBase = argomento("api-base");
  const overridesPost: Partial<NormattivaConfig> = {
    timeoutMs: TIMEOUT_POST_MS,
    retries: RETRIES,
    ...(apiBase ? { baseUrl: apiBase } : {}),
  };

  console.log(`Densificazione TAG-B2 (APPEND, max +${perAnno}/file): ${anni.join(", ")}.`);
  const percorsiDedup = await percorsiDedupDenseB2();
  const conosciuti = await caricaChiaviEsistentiDenseB2(percorsiDedup);
  console.log(`Dedup globale: ${conosciuti.size} chiavi ELI/nir in ${percorsiDedup.length} file.`);

  const baseUrl = defaultNormattivaConfig(overridesPost).baseUrl;
  const urlLista = `${baseUrl}/api/v1/ricerca/aggiornati`;
  const riepilogo: Array<{ anno: string; prima: number; dopo: number; nuovi: number }> = [];

  for (const anno of anni) {
    const dest = path.resolve(OUT_DEFAULT[anno]);
    const { atti: esistenti } = await leggiAttiEsistenti(dest);
    const prima = esistenti.length;
    console.log(`--- Anno ${anno}: ${prima} atti esistenti, lista profonda...`);

    let unite: VoceDenseB2[];
    try {
      unite = await listaProfondaAnnoDenseB2(overridesPost, anno);
    } catch (cause) {
      console.log(`Anno ${anno}: lista interrotta (${messaggioDi(cause)}), zero aggiunte oneste.`);
      riepilogo.push({ anno, prima, dopo: prima, nuovi: 0 });
      continue;
    }
    console.log(`Anno ${anno}: ${unite.length} voci reali uniche (12 mesi + annuale).`);

    // Solo URN mai archiviate (dedup globale + intra-run cumulativa).
    const candidate = unite.filter((voce) => {
      if (chiaveEliDenseB2(voce.urn) && conosciuti.has(chiaveEliDenseB2(voce.urn))) return false;
      return !eliCandidatiDenseB2(voce).some((c) => conosciuti.has(c));
    });
    console.log(`Anno ${anno}: ${candidate.length} candidate nuove su ${unite.length}.`);
    if (candidate.length === 0) {
      riepilogo.push({ anno, prima, dopo: prima, nuovi: 0 });
      continue;
    }

    const nuovi: LawRecord[] = [];
    const vistiRun = new Set<string>();
    const errori: string[] = [];
    let interrotto = false;
    // Dettaglia finche' non si raccolgono perAnno record (o si esauriscono).
    // Scorre a finestre per non superare il bound di dettaglio inutilmente:
    // stima scarti ~50%, pagina in blocchi finche' serve.
    let indice = 0;
    while (nuovi.length < perAnno && indice < candidate.length && !interrotto) {
      const blocco = candidate.slice(indice, indice + 60);
      indice += blocco.length;
      for (let i = 0; i < blocco.length && nuovi.length < perAnno && !interrotto; i += DETTAGLI_PER_BATCH) {
        const batch = blocco.slice(i, i + DETTAGLI_PER_BATCH);
        for (const voce of batch) {
          if (nuovi.length >= perAnno) break;
          try {
            const raw = await postJson(overridesPost, "/api/v1/atto/dettaglio-atto-urn", {
              urn: voce.urn,
            });
            const record = dettaglioToRecordDenseB2(voce, raw, testoMax);
            if (!record) {
              errori.push(`dettaglio senza titolo/chiave: ${voce.urn}`);
              continue;
            }
            const impronte = [
              chiaveEliDenseB2(record.chiave),
              chiaveEliDenseB2(record.eli),
              chiaveEliDenseB2(record.nir),
            ].filter(Boolean);
            if (impronte.some((im) => vistiRun.has(im) || conosciuti.has(im))) {
              errori.push(`duplicato escluso: ${voce.urn}`);
              continue;
            }
            for (const im of impronte) {
              vistiRun.add(im);
              conosciuti.add(im);
            }
            nuovi.push(record);
          } catch (cause) {
            errori.push(`dettaglio ${voce.urn}: ${messaggioDi(cause)}`);
            if (erroreDefinitivo(cause)) {
              console.log("Stop su errore definitivo (403/409/ERR_409).");
              interrotto = true;
              break;
            }
          }
        }
        if (!interrotto && (nuovi.length < perAnno || indice < candidate.length)) {
          await pausa(PAUSA_BATCH_MS);
        }
      }
      console.log(`Anno ${anno}: raccolti ${nuovi.length}/${perAnno} (scansionate ${Math.min(indice, candidate.length)}/${candidate.length} candidate).`);
      if (!interrotto) await pausa(PAUSA_BATCH_MS);
    }

    if (nuovi.length === 0) {
      console.log(`Anno ${anno}: API esaurita o solo duplicati/scarti, zero aggiunte oneste.`);
      riepilogo.push({ anno, prima, dopo: prima, nuovi: 0 });
      continue;
    }

    // APPEND con dedup intra-file, size guard <= 950 KB (taglia in coda se serve).
    const merge: LawRecord[] = [...esistenti];
    const impronteFile = new Set<string>();
    for (const a of esistenti) {
      for (const c of [a.chiave, a.eli, a.nir]) {
        const k = chiaveEliDenseB2(c);
        if (k) impronteFile.add(k);
      }
    }
    let aggiunti = 0;
    for (const r of nuovi) {
      const impronte = [r.chiave, r.eli, r.nir].map(chiaveEliDenseB2).filter(Boolean);
      if (impronte.some((im) => impronteFile.has(im))) continue;
      for (const im of impronte) impronteFile.add(im);
      merge.push(r);
      aggiunti += 1;
    }
    const envelope: Envelope = {
      provenance: { fonte: "normattiva", url: urlLista, recuperatoIl: new Date().toISOString(), licenza: LICENZA },
      atti: merge,
    };
    let json = JSON.stringify(envelope, null, 2);
    while (Buffer.byteLength(json, "utf8") / DIM_KB > LIMITE_FILE_KB && envelope.atti.length > esistenti.length) {
      envelope.atti.pop();
      aggiunti -= 1;
      json = JSON.stringify(envelope, null, 2);
    }
    const kbFinale = Buffer.byteLength(json, "utf8") / DIM_KB;
    if (kbFinale > LIMITE_FILE_KB) {
      console.log(`Anno ${anno}: oltre ${LIMITE_FILE_KB} KB anche senza aggiunte? File invariato.`);
      riepilogo.push({ anno, prima, dopo: prima, nuovi: 0 });
      continue;
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, json, "utf8");
    console.log(`Anno ${anno}: +${aggiunti} atti (tot ${envelope.atti.length}, ${kbFinale.toFixed(1)} KB). Scarti: ${errori.length}.`);
    riepilogo.push({ anno, prima, dopo: envelope.atti.length, nuovi: aggiunti });
  }

  console.log("RIEPILOGO TAG-B2 (anno: prima -> dopo, +nuovi):");
  for (const r of riepilogo) console.log(`  ${r.anno}: ${r.prima} -> ${r.dopo} (+${r.nuovi})`);
}

const eseguitoComeScript =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv.length > 1 &&
  (process.argv[1] ?? "").endsWith("dense-B2.ts");

if (eseguitoComeScript) {
  main().catch((cause: unknown) => {
    console.error(`Densificazione TAG-B2 fallita: ${messaggioDi(cause)}`);
    process.exitCode = 1;
  });
}
