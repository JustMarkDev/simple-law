/**
 * Sorgenti dati pubbliche italiane.
 *
 * Tutte le funzioni di rete hanno timeout e fallback: non lanciano mai errori
 * verso i route handler. Quando la rete o il DB non sono disponibili si usano
 * i dati seed inclusi nel bundle.
 */

import { normalizeEli } from "./nir";
import { buildFonti } from "./fonti";
import { calcGulpease } from "./readability";
import { SEED_CDM, SEED_LAWS, SEED_MINISTERS } from "./seed-data";
import type { CdmItem, LawRecord, MinisterRecord } from "./seed-data";
// Corpus unificato (unico punto di I/O per il corpus grande). Contratto anti-ciclo:
// `corpus-unificato` non importa mai `sources` (solo seed-data-espansa, fonti,
// readability e tipi seed-data), quindi questo import top-level non crea
// dipendenze circolari.
import { getCorpusUnificato } from "./corpus-unificato";

export const SOURCE_URLS = {
  normattiva: "https://www.normattiva.it",
  normattivaEli: "https://www.normattiva.it/eli/id",
  gazzetta: "https://www.gazzettaufficiale.it",
  governo: "https://www.governo.it",
  governoFeed: "https://www.governo.it/en/feed",
  camera: "https://www.camera.it",
  cameraSparql: "https://dati.camera.it/sparql",
  senato: "https://www.senato.it",
  senatoSparql: "https://dati.senato.it/sparql",
  eligendo: "https://elezioni.interno.gov.it",
} as const;

export type SparqlResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8000;

async function fetchConTimeout(url: string, options: FetchOptions, init?: RequestInit): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Costruisce l'URL Normattiva per un ELI (sincrono, nessuna rete).
 * Nota: Normattiva non usa il suffisso di versione `/sg` della Gazzetta
 * (usa `/CONSOLIDATED`), quindi viene rimosso per evitare link rotti.
 */
export function fetchNormattivaELI(eli: string): string {
  const path = normalizeEli(eli || "");
  if (!path || path === "/") return SOURCE_URLS.normattiva;
  const senzaVersioneSg = path.replace(/\/sg$/i, "");
  if (senzaVersioneSg.startsWith("/eli/")) return `${SOURCE_URLS.normattiva}${senzaVersioneSg}`;
  return `${SOURCE_URLS.normattiva}/eli/id${senzaVersioneSg}`;
}

function decodificaEntita(testo: string): string {
  return testo
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_m, codice: string) => String.fromCodePoint(Number(codice)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, codice: string) => String.fromCodePoint(parseInt(codice, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function pulisciHtml(testo: string): string {
  return decodificaEntita(testo.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function estraiTag(item: string, nome: string): string {
  const re = new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, "i");
  const match = re.exec(item);
  return match?.[1] ? pulisciHtml(match[1]) : "";
}

function dataIso(grezza: string): string {
  if (!grezza) return "";
  const parsed = new Date(grezza);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function estraiNumero(titolo: string): string {
  const match = /\bn\.?\s*(\d+)/i.exec(titolo);
  return match?.[1] ?? "";
}

/** Converte gli item di un feed RSS in CdmItem. */
function parseRss(xml: string, limit: number): CdmItem[] {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  const risultati: CdmItem[] = [];
  for (const item of items.slice(0, limit)) {
    const titolo = estraiTag(item, "title");
    if (!titolo) continue;
    const link = estraiTag(item, "link");
    const guid = estraiTag(item, "guid");
    const descrizione = estraiTag(item, "description");
    risultati.push({
      id: guid || link || `governo-${risultati.length + 1}`,
      data: dataIso(estraiTag(item, "pubDate")),
      numero: estraiNumero(titolo),
      titolo,
      sintesi: descrizione.slice(0, 400),
      url: link || SOURCE_URLS.governo,
    });
  }
  return risultati;
}

/**
 * Recupera i comunicati dal feed del Governo. In caso di errore o feed vuoto
 * ricade sui comunicati seed.
 */
export async function fetchGovernoComunicati(
  limit = 10,
  options: FetchOptions = {},
): Promise<CdmItem[]> {
  const quanti = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
  try {
    const response = await fetchConTimeout(SOURCE_URLS.governoFeed, options, {
      headers: { accept: "application/rss+xml, application/xml, text/xml" },
    });
    if (!response.ok) throw new Error(`Feed governo: ${response.status}`);
    const xml = await response.text();
    const items = parseRss(xml, quanti);
    if (items.length === 0) throw new Error("Feed governo vuoto");
    return items;
  } catch {
    return getSeedCdm().slice(0, quanti);
  }
}

async function eseguiSparql(endpoint: string, query: string, options: FetchOptions): Promise<SparqlResult> {
  if (!query || !query.trim()) {
    return { ok: false, error: "Query SPARQL vuota" };
  }
  try {
    const url = `${endpoint}?query=${encodeURIComponent(query)}&format=application%2Fsparql-results%2Bjson`;
    const response = await fetchConTimeout(url, options, {
      headers: { accept: "application/sparql-results+json, application/json" },
    });
    if (!response.ok) {
      return { ok: false, error: `SPARQL ${endpoint} ha risposto ${response.status}` };
    }
    return { ok: true, data: (await response.json()) as unknown };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Errore SPARQL sconosciuto" };
  }
}

/** Interroga l'endpoint SPARQL della Camera. Fallisce in modo controllato. */
export function sparqlCamera(query: string, options: FetchOptions = {}): Promise<SparqlResult> {
  return eseguiSparql(SOURCE_URLS.cameraSparql, query, options);
}

/** Interroga l'endpoint SPARQL del Senato. Fallisce in modo controllato. */
export function sparqlSenato(query: string, options: FetchOptions = {}): Promise<SparqlResult> {
  return eseguiSparql(SOURCE_URLS.senatoSparql, query, options);
}

function clonaLegge(law: LawRecord): LawRecord {
  const fonti = Array.isArray((law as unknown as { fonti?: unknown }).fonti)
    ? null
    : law.fonti
      ? { ...law.fonti }
      : null;
  return {
    ...law,
    fonti,
    attuativi: law.attuativi ? { ...law.attuativi } : undefined,
  };
}

/** Chiave di dedup per ELI (stessa regola di `normalizzaChiaveEli`: trim+lowercase). */
function chiaveEli(eli: unknown): string {
  return String(eli ?? "").trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Wiring REALI -> app (difensivo: i file data/reali/ potrebbero non esistere).
// Contratto: mai lanciare, mai inventare codici/numeri/URL/date. Se i file sono
// assenti o invalidi, il comportamento precedente resta invariato.
// ---------------------------------------------------------------------------

/** Percorsi degli atti reali: TUTTI i file esistenti e validi si uniscono
 * (dedup per ELI nel chiamante). Mai primo-file-vince: ogni nuovo batch
 * storico deve entrare nel corpus. */
const PERCORSI_ATTI_REALI = [
  "data/reali/normattiva-recenti.json",
  "data/reali/normattiva-leggi.json",
  "data/reali/normattiva-storico-collezioni.json",
  "data/reali/normattiva-storico-1980.json",
  "data/reali/normattiva-storico-1990.json",
  "data/reali/normattiva-storico-2000.json",
  "data/reali/normattiva-storico-2010.json",
  "data/reali/normattiva-storico-1970.json",
  "data/reali/normattiva-storico-2020.json",
  "data/reali/normattiva-storico-1960.json",
] as const;

/** Percorsi candidati per i comunicati reali (primo esistente e valido vince). */
const PERCORSI_CDM_REALI = [
  "data/reali/governo-comunicati.json",
  "data/reali/governo-cdm.json",
] as const;

function stringaPulita(valore: unknown): string {
  return typeof valore === "string" ? valore.trim() : "";
}

function dataIsoReale(grezza: unknown): string {
  try {
    const testo = stringaPulita(grezza);
    if (!testo) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(testo)) return testo;
    const parsed = new Date(testo);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function gulpeaseReale(testo: string, sintesi: string): number | null {
  try {
    const indice = calcGulpease(testo || sintesi || "norma").indice;
    return Number.isFinite(indice) ? indice : null;
  } catch {
    return null;
  }
}

/** Domini ufficiali ammessi per gli URL provenienti dai file reali. */
const DOMINI_FONTUANTE_AMMESSI = [
  "normattiva.it",
  "www.normattiva.it",
  "dati.normattiva.it",
  "gazzettaufficiale.it",
  "www.gazzettaufficiale.it",
  "governo.it",
  "www.governo.it",
  "camera.it",
  "www.camera.it",
  "dati.camera.it",
  "senato.it",
  "www.senato.it",
  "dati.senato.it",
  "parlamento.it",
  "www.parlamento.it",
  "quirinale.it",
  "www.quirinale.it",
  "eur-lex.europa.eu",
  "cortecostituzionale.it",
  "www.cortecostituzionale.it",
] as const;

/** `true` solo per URL https verso domini ufficiali (anti-spoofing dei file). */
function urlFonteAmmesso(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return (DOMINI_FONTUANTE_AMMESSI as readonly string[]).includes(host);
  } catch {
    return false;
  }
}

function fontiReali(input: Record<string, unknown>, tipo: string, numero: string, dataEmanazione: string): LawRecord["fonti"] {
  try {
    const costruite = buildFonti({
      tipo,
      numero,
      dataEmanazione,
      codiceRedazionale: stringaPulita(input["codiceRedazionale"]) || undefined,
      dataGU: stringaPulita(input["dataGU"]) || undefined,
      numeroGU: stringaPulita(input["numeroGU"]) || undefined,
      legislatura: stringaPulita(input["legislatura"]) || undefined,
      cameraId: stringaPulita(input["cameraId"]) || undefined,
      senatoDid: stringaPulita(input["senatoDid"]) || undefined,
    });
    // Conserva solo URL verificati verso domini ufficiali eventualmente
    // già presenti nel file (un file manomesso non può iniettare URL esterni).
    const grezze = input["fonti"];
    if (grezze && typeof grezze === "object" && !Array.isArray(grezze)) {
      const g = grezze as Record<string, unknown>;
      for (const chiave of ["normattiva", "gazzetta", "camera", "senato", "governo"] as const) {
        const url = stringaPulita(g[chiave]);
        if (urlFonteAmmesso(url) && !(costruite as Record<string, string | undefined>)[chiave]) {
          (costruite as Record<string, string>)[chiave] = url;
        }
      }
    }
    return costruite;
  } catch {
    try {
      return buildFonti({ tipo, numero, dataEmanazione });
    } catch {
      return { governo: SOURCE_URLS.governo };
    }
  }
}

/**
 * Normalizza un atto reale in `LawRecord`. Restituisce `null` se mancano i
 * campi minimi verificati (`titolo` + `eli`). `dimostrativo=false` forzato.
 * Non lancia mai, non inventa mai codici/numeri/URL/date.
 */
export function normalizzaAttoReale(input: unknown): LawRecord | null {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const o = input as Record<string, unknown>;
    const titolo = stringaPulita(o["titolo"]);
    const eli = stringaPulita(o["eli"]);
    if (!titolo || !eli) return null;
    const tipo = stringaPulita(o["tipo"]) || "legge";
    const numero = stringaPulita(o["numero"]);
    const dataEmanazione = dataIsoReale(o["dataEmanazione"]);
    const nir = stringaPulita(o["nir"]);
    const sintesiGrezza = stringaPulita(o["sintesi"]);
    const sintesi = (sintesiGrezza || titolo).slice(0, 600);
    const testoGrezzo = typeof o["testo"] === "string" && o["testo"].trim() ? o["testo"] : sintesi;
    // Stati onesti: abrogato/decaduto solo da segnali espliciti, mai default
    // inventati. `decaduto` (DL non convertito) e' uno stato reale distinto.
    const statoGrezzo = stringaPulita(o["stato"]).toLowerCase();
    const fineVigenza = stringaPulita(
      o["articoloDataFineVigenza"] ?? o["fineVigenza"] ?? o["dataFineVigenza"],
    );
    const fineValida = /^(\d{4})(\d{2})(\d{2})$/.exec(fineVigenza.replace(/-/g, ""));
    const oggi = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const finePassata =
      !!fineValida && fineValida[0] !== "99999999" && fineValida[0] < oggi;
    const stato =
      /abrog/.test(statoGrezzo) || finePassata
        ? "abrogato"
        : /decad/.test(statoGrezzo)
          ? "decaduto"
          : "in_vigore";
    const record: LawRecord = {
      eli,
      nir,
      tipo,
      numero,
      dataEmanazione,
      titolo,
      sintesi,
      stato,
      gulpease: gulpeaseReale(testoGrezzo, sintesi),
      fonti: fontiReali(o, tipo, numero, dataEmanazione),
      dimostrativo: false,
    };
    const testo = typeof o["testo"] === "string" && o["testo"].trim() ? o["testo"] : undefined;
    if (testo) record.testo = testo;
    for (const chiave of ["codiceRedazionale", "dataGU", "numeroGU", "legislatura", "cameraId", "senatoDid"] as const) {
      const v = stringaPulita(o[chiave]);
      if (v) (record as unknown as Record<string, unknown>)[chiave] = v;
    }
    return record;
  } catch {
    return null;
  }
}

/**
 * Normalizza un comunicato reale in `CdmItem`. Restituisce `null` se mancano
 * `id`, `titolo` o `url`. Non lancia mai, non inventa mai URL/date.
 */
export function normalizzaComunicatoReale(input: unknown): CdmItem | null {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const o = input as Record<string, unknown>;
    const id = stringaPulita(o["id"]);
    const titolo = stringaPulita(o["titolo"]);
    const url = stringaPulita(o["url"] ?? o["link"]);
    if (!id || !titolo || !url) return null;
    if (!/^https?:\/\//i.test(url)) return null;
    return {
      id,
      data: dataIsoReale(o["data"]),
      numero: stringaPulita(o["numero"]),
      titolo,
      sintesi: stringaPulita(o["sintesi"]).slice(0, 2000),
      url,
    };
  } catch {
    return null;
  }
}

/**
 * Estrae la lista di atti da envelope (`{leggi}` / `{dati}` / `{atti}`) o da
 * array diretto. Non lancia mai.
 */
export function estraiListaAttiReali(grezzo: unknown): unknown[] {
  try {
    if (Array.isArray(grezzo)) return grezzo;
    if (grezzo && typeof grezzo === "object") {
      const o = grezzo as Record<string, unknown>;
      if (Array.isArray(o["leggi"])) return o["leggi"] as unknown[];
      if (Array.isArray(o["dati"])) return o["dati"] as unknown[];
      if (Array.isArray(o["atti"])) return o["atti"] as unknown[];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Estrae la lista di comunicati da envelope (`{comunicati}` / `{dati}` /
 * `{items}`) o da array diretto. Non lancia mai.
 */
export function estraiListaComunicatiReali(grezzo: unknown): unknown[] {
  try {
    if (Array.isArray(grezzo)) return grezzo;
    if (grezzo && typeof grezzo === "object") {
      const o = grezzo as Record<string, unknown>;
      if (Array.isArray(o["comunicati"])) return o["comunicati"] as unknown[];
      if (Array.isArray(o["dati"])) return o["dati"] as unknown[];
      if (Array.isArray(o["items"])) return o["items"] as unknown[];
    }
    return [];
  } catch {
    return [];
  }
}

function moduliNode(): { fs: { existsSync(p: string): boolean; readFileSync(p: string, enc: string): string }; path: { join(...p: string[]): string } } | null {
  try {
    if (typeof process === "undefined") return null;
    if (typeof window !== "undefined") return null;
    const g = globalThis as unknown as { process?: { getBuiltinModule?: (m: string) => unknown }; require?: (m: string) => unknown };
    try {
      const proc = g.process;
      if (proc && typeof proc.getBuiltinModule === "function") {
        const fs = proc.getBuiltinModule("node:fs") as { existsSync(p: string): boolean; readFileSync(p: string, enc: string): string };
        const path = proc.getBuiltinModule("node:path") as { join(...p: string[]): string };
        if (fs && path && typeof fs.readFileSync === "function") return { fs, path };
      }
    } catch {
      // continua con require
    }
    try {
      const req = g.require;
      if (typeof req === "function") {
        const fs = req("node:fs") as { existsSync(p: string): boolean; readFileSync(p: string, enc: string): string };
        const path = req("node:path") as { join(...p: string[]): string };
        if (fs && path) return { fs, path };
      }
    } catch {
      // nessun modulo node disponibile (es. browser): comportamento precedente
    }
    return null;
  } catch {
    return null;
  }
}

/** Legge TUTTI i JSON esistenti e validi dai percorsi (unione, mai throw). */
function leggiTuttiJsonDaDisco(percorsiRelativi: readonly string[]): unknown[] {
  const risultati: unknown[] = [];
  try {
    const mod = moduliNode();
    if (!mod) return risultati;
    let base = "";
    try {
      base = typeof process !== "undefined" && process.cwd ? process.cwd() : "";
    } catch {
      return risultati;
    }
    if (!base) return risultati;
    for (const rel of percorsiRelativi) {
      try {
        const ass = mod.path.join(base, rel);
        if (!mod.fs.existsSync(ass)) continue;
        const raw = mod.fs.readFileSync(ass, "utf8");
        if (!raw || raw.length > 2_000_000) continue;
        risultati.push(JSON.parse(raw) as unknown);
      } catch {
        continue;
      }
    }
    return risultati;
  } catch {
    return risultati;
  }
}

/** Carica gli atti reali da disco (mai lancia, [] se assenti/invalidi). */
function caricaAttiReali(): LawRecord[] {
  try {
    // Unione di tutti i batch (recenti + storici): nessuno resta escluso.
    const documenti = leggiTuttiJsonDaDisco(PERCORSI_ATTI_REALI);
    if (documenti.length === 0) return [];
    const risultato: LawRecord[] = [];
    for (const grezzo of documenti) {
      const lista = estraiListaAttiReali(grezzo);
      for (const item of lista.slice(0, 500)) {
        try {
          const record = normalizzaAttoReale(item);
          if (record) risultato.push(record);
        } catch {
          continue;
        }
      }
    }
    return risultato;
  } catch {
    return [];
  }
}

/** Carica i comunicati reali da disco (unione dei file, mai lancia). */
function caricaComunicatiReali(): CdmItem[] {
  try {
    const documenti = leggiTuttiJsonDaDisco(PERCORSI_CDM_REALI);
    if (documenti.length === 0) return [];
    const risultato: CdmItem[] = [];
    for (const grezzo of documenti) {
      const lista = estraiListaComunicatiReali(grezzo);
      for (const item of lista.slice(0, 100)) {
        try {
          const comunicato = normalizzaComunicatoReale(item);
          if (comunicato) risultato.push(comunicato);
        } catch {
          continue;
        }
      }
    }
    return risultato;
  } catch {
    return [];
  }
}

/**
 * Copia difensiva del corpus unificato + atti reali: i 5 seed (SEED_LAWS)
 * restano sempre i primi record e vincono la dedup per ELI, seguono gli atti
 * reali (`dimostrativo=false` forzato, solo se con titolo+eli verificati) e
 * poi il resto sintetico come prima. Thin-wrapper sincrono: non lancia mai,
 * in caso di errore o corpus vuoto ricade sui soli seed. Se i file
 * `data/reali/` sono assenti o invalidi, il comportamento precedente resta
 * invariato.
 */
export function getSeedLaws(): LawRecord[] {
  try {
    const unificato = getCorpusUnificato();
    const reali = caricaAttiReali();
    if (!Array.isArray(unificato) || unificato.length === 0) {
      if (reali.length === 0) {
        return SEED_LAWS.map(clonaLegge);
      }
      return unisciCorpus(SEED_LAWS, reali, []);
    }
    return unisciCorpus(SEED_LAWS, reali, unificato);
  } catch {
    return SEED_LAWS.map(clonaLegge);
  }
}

/**
 * Unisce seed + reali + sintetico con dedup per ELI (i primi vincono).
 * Eccezione onesta: se un atto reale collide con un seed di riferimento
 * (stesso decreto, es. DL 133/2026), il seed tiene sintesi curata e box
 * esplicativi ma eredita il `testo` ufficiale (e ricalcolo Gulpease).
 * Non lancia mai. Esportata per i test.
 */
export function unisciCorpus(
  seeds: LawRecord[],
  reali: LawRecord[],
  sintetico: LawRecord[],
): LawRecord[] {
  const visti = new Set<string>();
  const risultato: LawRecord[] = [];
  const perChiave = new Map<string, LawRecord>();
  const accoda = (legge: unknown, reale: boolean): void => {
    try {
      if (!legge || typeof legge !== "object") return;
      const chiave = chiaveEli((legge as LawRecord).eli);
      if (!chiave) return;
      const esistente = perChiave.get(chiave);
      if (esistente) {
        // Stesso atto in seed e reali: testo ufficiale nel seed curato.
        if (reale && esistente.testo !== (legge as LawRecord).testo) {
          const testoUfficiale = (legge as LawRecord).testo;
          if (typeof testoUfficiale === "string" && testoUfficiale.trim()) {
            esistente.testo = testoUfficiale;
            esistente.gulpease = null;
          }
        }
        return;
      }
      visti.add(chiave);
      const copia = clonaLegge(legge as LawRecord);
      perChiave.set(chiave, copia);
      risultato.push(copia);
    } catch {
      // salta il singolo record malformato
    }
  };
  const liste: Array<unknown> = [seeds, reali, sintetico];
  const realeFlags = [false, true, false];
  for (let li = 0; li < liste.length; li += 1) {
    const lista = liste[li];
    if (!Array.isArray(lista)) continue;
    const reale = realeFlags[li] === true;
    for (const legge of lista) accoda(legge, reale);
  }
  try {
    return risultato.length > 0 ? risultato : seeds.map(clonaLegge);
  } catch {
    return [];
  }
}

/** Informazioni sintetiche sul corpus (base 5 seed + espansi). Non lancia mai. */
export interface InfoCorpus {
  base: number;
  espansi: number;
  totale: number;
}

export function getCorpusInfo(): InfoCorpus {
  try {
    const base = SEED_LAWS.length;
    const totale = getSeedLaws().length;
    return { base, espansi: Math.max(0, totale - base), totale };
  } catch {
    const base = SEED_LAWS.length;
    return { base, espansi: 0, totale: base };
  }
}

/** Copia difensiva dei ministri seed. */
export function getSeedMinisters(): MinisterRecord[] {
  return SEED_MINISTERS.map((m) => ({ ...m, competenze: [...m.competenze], provvedimenti: [...m.provvedimenti] }));
}

/** Copia difensiva dei comunicati CdM: reali primi se presenti e validi, altrimenti seed. Non lancia mai. */
export function getSeedCdm(): CdmItem[] {
  try {
    const reali = caricaComunicatiReali();
    if (reali.length > 0) return reali.map((c) => ({ ...c }));
    return SEED_CDM.map((c) => ({ ...c }));
  } catch {
    return SEED_CDM.map((c) => ({ ...c }));
  }
}

/** Ricerca testuale (case-insensitive) nelle leggi seed. */
export function searchSeedLaws(q: string): LawRecord[] {
  const query = (q ?? "").trim().toLowerCase();
  const leggi = getSeedLaws();
  if (!query) return leggi;
  return leggi.filter((law) =>
    [law.titolo, law.sintesi, law.numero, law.tipo, law.nir, law.eli]
      .filter(Boolean)
      .some((campo) => campo.toLowerCase().includes(query)),
  );
}
