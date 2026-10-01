/**
 * Ingest reale oversight — CNEL (pareri UE + osservazioni + rapporti).
 *
 * UNA fonte = CNEL. VIA LIBERA ristretta: solo metadati
 * (titolo/data/link/abstract) dalle 3 librerie documenti ufficiali via
 * `POST /api/cnel/content/getItems` (itemsType 30, sort DataApprovazione
 * desc), nessun PDF scaricato, nessun mirror di schede, nessun bulk.
 *
 * Librerie osservate (librariesIds reali dalle pagine /documenti):
 * - osservazioni: `019aeec1-23e0-4e93-ba62-a4e04dc54f71` (468 voci totali)
 * - rapporti:     `22da642d-a708-4181-9a65-1020ea5a57a4` (240 voci totali)
 * - pareri-ue:    `3ec183a9-ab63-4913-97a4-a9d05b059d60` (193 voci totali)
 *
 * Bound: timeout 15s, retry solo su 429/5xx x3 con backoff, pausa >=2s tra
 * richieste (1 richiesta / 2s), max 3 POST, pageSize <=20 per categoria,
 * documenti totali <=50, file <=950KB, exit 1 senza scrivere alcun file in
 * caso di fallimento (mai parziali: il file si scrive solo dopo che tutte
 * le categorie richieste hanno prodotto payload validi).
 *
 * Archivio CCNL: ricerca interattiva su SPA esterna
 * (`archiviocontratti.cnel.it`), non bounded via HTML/API semplice:
 * nessuna scheda bulk importata (solo metadati documenti sopra).
 *
 * Uso: bunx tsx scripts/ingest-reale-cnel.ts [--max=50] [--solo=osservazioni|rapporti|pareri-ue]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CNEL_BASE = "https://www.cnel.it";
export const CNEL_API =
  "https://www.cnel.it/api/cnel/content/getItems?sortField=DataApprovazione&sortDirection=desc";
export const CNEL_INDICE_DOCUMENTI = "https://www.cnel.it/documenti";
export const CNEL_FONTE = "CNEL — Consiglio Nazionale dell'Economia e del Lavoro";
export const CNEL_LICENZA =
  "solo metadati + link ufficiali, nessun mirror (licenza aperta non dichiarata nelle pagine)";
export const CNEL_METODOLOGIA =
  "3 POST /api/cnel/content/getItems (itemsType 30, sort DataApprovazione desc, pageSize<=20/categoria), pausa >=2s, solo metadati titolo/data/link/abstract, nessun PDF scaricato";
export const CNEL_AVVERTENZE =
  "Solo metadati con link alle schede ufficiali, nessun mirror di PDF/schede. Archivio CCNL consultabile solo via ricerca interattiva (archiviocontratti.cnel.it): nessuna scheda bulk importata. Date solo se dd/mm/yyyy valide osservate, mai ricostruite. Non sono leggi: stato/vigenza mai assegnati.";

export const CNEL_MAX_DOC = 50;
export const CNEL_PER_CATEGORIA = 20;
export const MAX_BYTE_OUT = 950 * 1024;
const TIMEOUT_MS = 15000;
const PAUSA_RETE_MS = 2000;

const DIR_REALI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "reali");
const FILE_OUT = resolve(DIR_REALI, "oversight-cnel-2026.json");

export type TipoCnel = "osservazione" | "rapporto" | "parere-ue";

export interface CategoriaCnel {
  readonly chiave: "osservazioni" | "rapporti" | "pareri-ue";
  readonly tipo: TipoCnel;
  readonly libraryId: string;
  readonly pagina: string;
}

export const CATEGORIE: readonly CategoriaCnel[] = [
  {
    chiave: "osservazioni",
    tipo: "osservazione",
    libraryId: "019aeec1-23e0-4e93-ba62-a4e04dc54f71",
    pagina:
      "https://www.cnel.it/documenti/osservazioni-e-proposte-legge-30-dicembre-1986-n-936-articolo-10-comma-1-lettera-g",
  },
  {
    chiave: "rapporti",
    tipo: "rapporto",
    libraryId: "22da642d-a708-4181-9a65-1020ea5a57a4",
    pagina:
      "https://www.cnel.it/documenti/rapporti-legge-30-dicembre-1986-n-936-articolo-10-comma-1-lettera-c",
  },
  {
    chiave: "pareri-ue",
    tipo: "parere-ue",
    libraryId: "3ec183a9-ab63-4913-97a4-a9d05b059d60",
    pagina:
      "https://www.cnel.it/documenti/pareri-su-atti-ue-legge-24-dicembre-2012-n-234-articolo-28-comma-2",
  },
] as const;

export interface DocumentoCnel {
  readonly id: string;
  readonly titolo: string;
  readonly data: string;
  readonly url: string;
  readonly tipo: TipoCnel;
  readonly abstract: string;
}

function dormi(ms: number): Promise<void> {
  return new Promise((risolvi) => setTimeout(risolvi, ms));
}

function ritentabile(stato: number): boolean {
  return stato === 429 || (stato >= 500 && stato <= 599);
}

/** POST bounded con timeout + retry solo su 429/5xx (max 3 tentativi). */
export async function posta(
  url: string,
  corpo: Record<string, unknown>,
): Promise<{ risposta: Response; json: unknown }> {
  let ultimoErrore = "";
  for (let tentativo = 0; tentativo < 3; tentativo += 1) {
    if (tentativo > 0) await dormi(1000 * 2 ** (tentativo - 1));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const risposta = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) simple-law-oversight/1.0",
        },
        body: JSON.stringify(corpo),
      });
      if (!risposta.ok) {
        ultimoErrore = `HTTP ${risposta.status}`;
        if (!ritentabile(risposta.status)) throw new Error(`POST ${url}: ${ultimoErrore}`);
        continue;
      }
      const testo = await risposta.text();
      if (!testo.trim()) throw new Error(`POST ${url}: corpo vuoto`);
      return { risposta, json: JSON.parse(testo) as unknown };
    } catch (errore) {
      const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
      if (tentativo === 2) throw new Error(`POST ${url} fallita dopo 3 tentativi (${messaggio})`);
      ultimoErrore = messaggio;
      if (/^POST .*HTTP (?!429|5)/.test(`POST ${url}: ${messaggio}`)) throw errore;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`POST ${url} fallita (${ultimoErrore})`);
}

function testoOsservato(valore: unknown, limite: number): string {
  if (typeof valore !== "string") return "";
  return valore.replace(/\s+/g, " ").trim().slice(0, limite);
}

/** "23/07/2026" -> "2026-07-23". Solo date dd/mm/yyyy valide, mai inventate. */
export function parseDataIt(grezza: unknown): string {
  try {
    if (typeof grezza !== "string") return "";
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(grezza.trim());
    if (!m) return "";
    const g = Number(m[1]);
    const mo = Number(m[2]);
    const a = Number(m[3]);
    if (a < 1900 || a > 2100 || mo < 1 || mo > 12 || g < 1 || g > 31) return "";
    const iso = `${String(a).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return "";
    if (d.getUTCFullYear() !== a || d.getUTCMonth() + 1 !== mo || d.getUTCDate() !== g) return "";
    return iso;
  } catch {
    return "";
  }
}

/** `true` solo per schede https su www.cnel.it (mai PDF/media, mai esterni). */
export function isUrlSchedaCnel(url: string): boolean {
  try {
    if (!url || typeof url !== "string") return false;
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname.toLowerCase() !== "www.cnel.it") return false;
    if (/\/media\/docs\//i.test(parsed.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function risolviUrlScheda(grezzo: unknown): string {
  try {
    const t = typeof grezzo === "string" ? grezzo.trim() : "";
    if (!t) return "";
    if (/^https?:\/\//i.test(t)) return t;
    if (t.startsWith("/")) return `${CNEL_BASE}${t}`;
    return "";
  } catch {
    return "";
  }
}

/**
 * Normalizza una voce grezza dell'API CNEL in DocumentoCnel.
 * Restituisce null se mancano titolo, data valida o URL scheda assoluto
 * (mai inventare, mai ricostruire). Non lancia mai.
 */
export function normalizzaVoceCnel(item: unknown, tipo: TipoCnel): DocumentoCnel | null {
  try {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    if (tipo !== "osservazione" && tipo !== "rapporto" && tipo !== "parere-ue") return null;
    const o = item as Record<string, unknown>;
    const titolo = testoOsservato(o["title"], 280);
    if (!titolo) return null;
    const data = parseDataIt(o["publicationDate"]);
    if (!data) return null;
    const url = risolviUrlScheda(o["url"]);
    if (!isUrlSchedaCnel(url)) return null;
    const abstract = testoOsservato(o["summary"], 500);
    return { id: url, titolo, data, url, tipo, abstract };
  } catch {
    return null;
  }
}

/** Estrae la lista voci da envelope API (`{items}`) o array diretto. Non lancia mai. */
export function estraiVociGrezze(grezzo: unknown): unknown[] {
  try {
    if (Array.isArray(grezzo)) return grezzo;
    if (grezzo && typeof grezzo === "object") {
      const o = grezzo as Record<string, unknown>;
      if (Array.isArray(o["items"])) return o["items"] as unknown[];
    }
    return [];
  } catch {
    return [];
  }
}

async function ingerisciCategoria(
  categoria: CategoriaCnel,
  perCategoria: number,
): Promise<DocumentoCnel[]> {
  const { json } = await posta(CNEL_API, {
    searchText: "",
    searchRelatore: "",
    searchOrganoDeliberante: "",
    currentPage: 1,
    pageSize: perCategoria,
    culture: "it",
    itemsType: 30,
    librariesIds: [categoria.libraryId],
  });
  const voci: DocumentoCnel[] = [];
  const visti = new Set<string>();
  for (const grezza of estraiVociGrezze(json).slice(0, perCategoria)) {
    let voce: DocumentoCnel | null = null;
    try {
      voce = normalizzaVoceCnel(grezza, categoria.tipo);
    } catch {
      continue;
    }
    if (!voce || visti.has(voce.id)) continue;
    visti.add(voce.id);
    voci.push(voce);
  }
  if (voci.length === 0)
    throw new Error(`CNEL ${categoria.chiave}: nessuna voce valida nella risposta`);
  return voci;
}

function argomenti(): { aiuto: boolean; solo: string | null; max: number } {
  let solo: string | null = null;
  let max = CNEL_MAX_DOC;
  let aiuto = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === "--help" || arg === "-h") aiuto = true;
    else if (arg.startsWith("--solo=")) {
      const v = arg.slice("--solo=".length);
      if (v === "osservazioni" || v === "rapporti" || v === "pareri-ue") solo = v;
      else {
        console.error("--solo accetta osservazioni|rapporti|pareri-ue");
        process.exit(2);
      }
    } else if (arg.startsWith("--max=")) {
      const n = Number.parseInt(arg.slice("--max=".length), 10);
      if (!Number.isFinite(n)) {
        console.error("--max richiede un intero 1..50");
        process.exit(2);
      }
      max = Math.min(CNEL_MAX_DOC, Math.max(1, Math.floor(n)));
    } else {
      console.error(`Argomento sconosciuto: ${arg}`);
      process.exit(2);
    }
  }
  return { aiuto, solo, max };
}

async function main(): Promise<void> {
  const { aiuto, solo, max } = argomenti();
  if (aiuto) {
    console.log(
      "Uso: bunx tsx scripts/ingest-reale-cnel.ts [--max=50] [--solo=osservazioni|rapporti|pareri-ue]\n" +
        "Ingerisce CNEL (osservazioni + rapporti + pareri UE) via 3 POST API, solo metadati.\n" +
        "Scrive data/reali/oversight-cnel-2026.json (<=50 voci, <=950KB). Fallimento -> exit 1 senza file parziali.",
    );
    return;
  }
  const categorie = CATEGORIE.filter((c) => (solo ? c.chiave === solo : true));
  const perCategoria = Math.min(CNEL_PER_CATEGORIA, max);
  // Tutte le categorie richieste vengono costruite in memoria PRIMA di
  // scrivere: se una fallisce, nessun file viene toccato (mai parziali).
  const tutte: DocumentoCnel[] = [];
  for (let i = 0; i < categorie.length; i += 1) {
    if (i > 0) await dormi(PAUSA_RETE_MS);
    const voci = await ingerisciCategoria(categorie[i], perCategoria);
    for (const v of voci) tutte.push(v);
  }
  const visti = new Set<string>();
  const dedup = tutte.filter((v) => {
    if (visti.has(v.id)) return false;
    visti.add(v.id);
    return true;
  });
  dedup.sort((a, b) =>
    a.data < b.data ? 1 : a.data > b.data ? -1 : a.titolo.localeCompare(b.titolo, "it"),
  );
  const documenti = dedup.slice(0, max);
  if (documenti.length === 0) throw new Error("CNEL: nessun documento valido");
  const recuperatoIl = new Date().toISOString();
  const json = `${JSON.stringify(
    {
      provenance: {
        fonte: CNEL_FONTE,
        url: CNEL_INDICE_DOCUMENTI,
        recuperatoIl,
        licenza: CNEL_LICENZA,
      },
      documenti,
      metodologia: CNEL_METODOLOGIA,
      avvertenze: CNEL_AVVERTENZE,
    },
    null,
    2,
  )}\n`;
  if (Buffer.byteLength(json, "utf8") > MAX_BYTE_OUT) {
    throw new Error(`envelope oltre ${MAX_BYTE_OUT} byte`);
  }
  if (documenti.length > CNEL_MAX_DOC) throw new Error(`documenti oltre il cap di ${CNEL_MAX_DOC}`);
  mkdirSync(DIR_REALI, { recursive: true });
  writeFileSync(FILE_OUT, json, "utf8");
  console.log(
    `CNEL: ${documenti.length} documenti ` +
      `(${categorie.map((c) => c.chiave).join("+")}), ${Buffer.byteLength(json, "utf8")} byte. File scritto: data/reali/oversight-cnel-2026.json.`,
  );
}

const eseguitoDiretto =
  typeof process !== "undefined" &&
  typeof process.argv?.[1] === "string" &&
  process.argv[1].endsWith("ingest-reale-cnel.ts");

if (eseguitoDiretto) {
  main().catch((errore: unknown) => {
    const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
    console.error(`Ingest CNEL fallito, nessun file scritto: ${messaggio}`);
    process.exit(1);
  });
}
