/**
 * Ingest reale Gazzetta Ufficiale diretta — Ultime (RSS Serie Generale).
 *
 * Sorgente unica (verificata 2026-09-28, HTTP 200):
 * - RSS: `https://www.gazzettaufficiale.it/rss/SG` (rss+xml, 32 item,
 *   Serie Generale n. 225 del 28-09-2026).
 * Indice di riscontro (mai scaricato dallo script):
 * - `https://www.gazzettaufficiale.it/30giorni/serie_generale`
 *
 * Regole ferree:
 * - SOLO poll RSS dell'ultimo numero SG: title + link ELI + pubDate.
 *   NESSUN archivio, NESSUN mirror atti, NESSUN dettaglio ELI scaricato.
 * - MAI costruire URL: solo <link> osservati nel feed, normalizzati
 *   http -> https; scarta voci senza titolo o senza link ELI https valido.
 * - MAI inventare numeri/date/stati: numero/serie/data solo da
 *   <description> del channel ("... n. 225 del 28-09-2026"), se il parse
 *   fallisce i campi restano stringa vuota. `data` del singolo atto solo
 *   da pubDate reale (ISO YYYY-MM-DD), mai dal titolo.
 * - Bounded: timeout 15000 ms, max 2 tentativi (1 retry) con pausa 2000 ms
 *   (1 richiesta / 2s), cap XML 1MB, max 84 item/serie, output <= 1MB.
 * - Fallimento (rete, feed vuoto, zero voci valide, output > 1MB):
 *   exit 1 SENZA scrivere alcun file parziale.
 *
 * Output: `data/reali/gazzetta-ultime.json` con envelope
 * `{provenance{fonte,url,recuperatoIl,licenza},serie,numero,data,atti[]}`.
 *
 * Uso:
 *   npx tsx scripts/ingest-reale-gu-diretta.ts [--help]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RSS_SG = "https://www.gazzettaufficiale.it/rss/SG";
const FONTE = "gazzettaufficiale.it RSS Serie Generale";
const LICENZA =
  "solo metadati + link ufficiali, nessun mirror (fa fede la GU a stampa)";
const TIMEOUT_MS = 15000;
const TENTATIVI = 2;
const PAUSA_RETE_MS = 2000;
const MAX_BYTE_XML = 1_048_576;
const MAX_ITEM = 84;
const MAX_BYTE_OUT = 1_048_576;

const DIR_REALI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "reali");
const FILE_OUT = resolve(DIR_REALI, "gazzetta-ultime.json");

const ELI_RE = /^https:\/\/www\.gazzettaufficiale\.it\/eli\//i;
const DESCR_RE = /Serie\s+Generale\s+n\.\s*(\d+)\s+del\s+(\d{2})-(\d{2})-(\d{4})/i;

export interface AttoGu {
  readonly titolo: string;
  readonly url: string;
  readonly data: string;
  readonly pubDate: string;
}

export interface NumeroGu {
  readonly serie: string;
  readonly numero: string;
  readonly data: string;
  readonly atti: AttoGu[];
}

/** Normalizza http -> https; ritorna "" se non e' un ELI GU valido. Mai lancia. */
export function normalizzaUrlGu(grezzo: unknown): string {
  try {
    const t = String(grezzo ?? "").trim();
    if (!t) return "";
    const https = t.replace(/^http:\/\//i, "https://");
    if (!ELI_RE.test(https)) return "";
    // Evita URL con spazi o caratteri non navigabili.
    if (/\s/.test(https)) return "";
    return https;
  } catch {
    return "";
  }
}

/** ISO YYYY-MM-DD da pubDate RSS; "" se non parsabile. Mai lancia. */
export function dataIsoGu(pubDate: unknown): string {
  try {
    const t = String(pubDate ?? "").trim();
    if (!t) return "";
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function decodificaEntita(testo: string): string {
  try {
    return testo
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&#(\d+);/g, (_m, codice: string) => {
        const n = Number(codice);
        return Number.isFinite(n) ? String.fromCodePoint(n) : "";
      })
      .replace(/&#x([0-9a-f]+);/gi, (_m, codice: string) => {
        const n = parseInt(codice, 16);
        return Number.isFinite(n) ? String.fromCodePoint(n) : "";
      })
      .replace(/&nbsp;/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  } catch {
    return "";
  }
}

function toTesto(html: string): string {
  try {
    return decodificaEntita(html)
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

function estraiTag(blocco: string, nome: string): string {
  try {
    const re = new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, "i");
    const m = re.exec(blocco);
    return m?.[1] ? toTesto(m[1]) : "";
  } catch {
    return "";
  }
}

function estraiGrezzo(blocco: string, nome: string): string {
  try {
    const re = new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, "i");
    const m = re.exec(blocco);
    return m?.[1] ? decodificaEntita(m[1]).trim() : "";
  } catch {
    return "";
  }
}

/** Estrae numero/data SG da <description> channel; mai lancia, mai inventa. */
export function parseTestataGu(descrizione: unknown): { numero: string; data: string } {
  try {
    const t = String(descrizione ?? "");
    const m = DESCR_RE.exec(t);
    if (!m) return { numero: "", data: "" };
    const numero = (m[1] ?? "").trim();
    const gg = m[2] ?? "";
    const mm = m[3] ?? "";
    const aa = m[4] ?? "";
    const iso = `${aa}-${mm}-${gg}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { numero: "", data: "" };
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) {
      return { numero: "", data: "" };
    }
    return { numero, data: iso };
  } catch {
    return { numero: "", data: "" };
  }
}

/** Parser RSS puro: solo title + link ELI https + pubDate. Mai lancia, mai rete. */
export function parseRssGu(xml: unknown, limite: number): { atti: AttoGu[]; testata: string } {
  try {
    const testo = String(xml ?? "");
    if (!testo.trim()) return { atti: [], testata: "" };
    const channel = /<channel[\s>][\s\S]*?<\/channel>/i.exec(testo)?.[0] ?? testo;
    const description = estraiTag(channel, "description");
    const blocchi = channel.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
    const atti: AttoGu[] = [];
    const visti = new Set<string>();
    for (const blocco of blocchi.slice(0, limite)) {
      const titolo = estraiTag(blocco, "title");
      if (!titolo) continue;
      const url = normalizzaUrlGu(estraiGrezzo(blocco, "link"));
      if (!url) continue;
      if (visti.has(url)) continue;
      visti.add(url);
      const pubDate = estraiGrezzo(blocco, "pubDate");
      atti.push({ titolo, url, data: dataIsoGu(pubDate), pubDate });
    }
    return { atti, testata: description };
  } catch {
    return { atti: [], testata: "" };
  }
}

function dormi(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scaricaFeed(): Promise<string> {
  let ultimoErrore = "";
  for (let tentativo = 1; tentativo <= TENTATIVI; tentativo += 1) {
    if (tentativo > 1) await dormi(PAUSA_RETE_MS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const risposta = await fetch(RSS_SG, {
        signal: controller.signal,
        headers: { accept: "application/rss+xml, application/xml, text/xml" },
      });
      if (!risposta.ok) throw new Error(`feed GU SG: HTTP ${risposta.status}`);
      const tipo = risposta.headers.get("content-type") ?? "";
      if (tipo && !/rss|xml/i.test(tipo)) {
        throw new Error(`feed GU SG: content-type inatteso (${tipo})`);
      }
      const xml = await risposta.text();
      if (!xml.trim()) throw new Error("feed GU SG vuoto");
      if (Buffer.byteLength(xml, "utf8") > MAX_BYTE_XML) {
        throw new Error("feed GU SG oltre il cap di 1MB");
      }
      return xml;
    } catch (errore) {
      ultimoErrore = errore instanceof Error ? errore.message : String(errore);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`download feed GU SG fallito dopo ${TENTATIVI} tentativi: ${ultimoErrore}`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(
      [
        "Ingest reale Gazzetta Ufficiale diretta — Ultime (RSS Serie Generale).",
        "",
        "Uso:",
        "  npx tsx scripts/ingest-reale-gu-diretta.ts",
        "",
        `Sorgente: ${RSS_SG} (ultimo numero SG, max ${MAX_ITEM} item).`,
        "Output: data/reali/gazzetta-ultime.json (<= 1MB).",
        "Solo title + link ELI https + pubDate; nessun archivio, nessun mirror.",
      ].join("\n"),
    );
    return;
  }
  const recuperatoIl = new Date().toISOString();
  const xml = await scaricaFeed();
  const { atti, testata } = parseRssGu(xml, MAX_ITEM);
  if (atti.length === 0) throw new Error("nessun atto utilizzabile nel feed SG");
  const { numero, data } = parseTestataGu(testata);

  const envelope = {
    provenance: { fonte: FONTE, url: RSS_SG, recuperatoIl, licenza: LICENZA },
    serie: "Serie Generale",
    numero,
    data,
    testata,
    atti,
  };
  const json = `${JSON.stringify(envelope, null, 2)}\n`;
  const byte = Buffer.byteLength(json, "utf8");
  console.log(`[ingest-gu] SG n.${numero || "?"} del ${data || "?"}: ${atti.length} atti (${byte} byte, cap ${MAX_BYTE_OUT}).`);
  if (byte > MAX_BYTE_OUT) {
    throw new Error(`gazzetta-ultime.json ${byte} byte oltre 1MB: nessun file scritto`);
  }
  mkdirSync(DIR_REALI, { recursive: true });
  writeFileSync(FILE_OUT, json, "utf8");
  console.log(`Gazzetta Ufficiale SG: ${atti.length} atti. File scritto: data/reali/gazzetta-ultime.json.`);
}

const eseguitoDiretto =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("ingest-reale-gu-diretta.ts");
if (eseguitoDiretto) {
  main().catch((errore: unknown) => {
    const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
    console.error(`Ingest GU diretta fallito, nessun file scritto: ${messaggio}`);
    process.exit(1);
  });
}
