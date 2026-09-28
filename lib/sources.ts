/**
 * Sorgenti dati pubbliche italiane.
 *
 * Tutte le funzioni di rete hanno timeout e fallback: non lanciano mai errori
 * verso i route handler. Quando la rete o il DB non sono disponibili si usano
 * i dati seed inclusi nel bundle.
 */

import { normalizeEli } from "./nir";
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

/**
 * Copia difensiva del corpus unificato: i 5 seed (SEED_LAWS) restano sempre i
 * primi record e vincono la dedup per ELI. Thin-wrapper sincrono su
 * `getCorpusUnificato()`: non lancia mai, in caso di errore o corpus vuoto
 * ricade sui soli seed.
 */
export function getSeedLaws(): LawRecord[] {
  try {
    const unificato = getCorpusUnificato();
    if (!Array.isArray(unificato) || unificato.length === 0) {
      return SEED_LAWS.map(clonaLegge);
    }
    const visti = new Set<string>();
    const risultato: LawRecord[] = [];
    const accoda = (legge: unknown): void => {
      if (!legge || typeof legge !== "object") return;
      const chiave = chiaveEli((legge as LawRecord).eli);
      if (!chiave || visti.has(chiave)) return;
      visti.add(chiave);
      risultato.push(clonaLegge(legge as LawRecord));
    };
    for (const seed of SEED_LAWS) accoda(seed);
    for (const legge of unificato) accoda(legge);
    return risultato.length > 0 ? risultato : SEED_LAWS.map(clonaLegge);
  } catch {
    return SEED_LAWS.map(clonaLegge);
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

/** Copia difensiva dei comunicati CdM seed. */
export function getSeedCdm(): CdmItem[] {
  return SEED_CDM.map((c) => ({ ...c }));
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
