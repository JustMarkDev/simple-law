/**
 * Ingest reale Governo — comunicati dal feed RSS ufficiale.
 *
 * Sorgente unica: `https://www.governo.it/it/feed/rss` (RSS 2.0, risposta
 * `application/rss+xml`). Ogni campo proviene dai tag osservati
 * (`title/link/guid/pubDate/description`): nessun URL costruito, nessun
 * numero inventato (`numero` solo se `/\bn\.?\s*(\d+)/i` trova
 * corrispondenza nel titolo, altrimenti stringa vuota).
 *
 * Parser RSS autonomo con timeout; ultimi 30 item al massimo.
 * Fallimento di rete o feed vuoto -> exit 1 senza scrivere alcun file.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GOVERNO_RSS = "https://www.governo.it/it/feed/rss";
const FONTE = "governo.it/it/feed/rss";
const LICENZA = "riuso titolo/link/descrizione";
const TIMEOUT_MS = 12000;
const MAX_ITEM = 30;
const MAX_SINTESI = 600;
const MAX_BYTE = 1_048_576;

const DIR_REALI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "reali");
const FILE_COMUNICATI = resolve(DIR_REALI, "governo-comunicati.json");

const NUMERO_RE = /\bn\.?\s*(\d+)/i;

interface Comunicato {
  readonly id: string;
  readonly data: string;
  readonly numero: string;
  readonly titolo: string;
  readonly sintesi: string;
  readonly url: string;
}

function decodificaEntita(testo: string): string {
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
}

function toTesto(html: string): string {
  // Le description del feed contengono HTML escapato (`&lt;p&gt;`): prima si
  // decodificano le entita', poi si rimuovono i tag ottenuti.
  return decodificaEntita(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function estraiTag(blocco: string, nome: string): string {
  const re = new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, "i");
  const match = re.exec(blocco);
  return match?.[1] ? toTesto(match[1]) : "";
}

function estraiGrezzo(blocco: string, nome: string): string {
  const re = new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, "i");
  const match = re.exec(blocco);
  return match?.[1] ? decodificaEntita(match[1]).trim() : "";
}

function dataIso(pubDate: string): string {
  if (!pubDate) return "";
  const parsed = new Date(pubDate);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function parseRss(xml: string, limite: number): Comunicato[] {
  const blocchi = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  const risultati: Comunicato[] = [];
  for (const blocco of blocchi.slice(0, limite)) {
    const titolo = estraiTag(blocco, "title");
    if (!titolo) continue;
    const link = estraiGrezzo(blocco, "link");
    // Solo URL assoluti navigabili: un link relativo non e' utilizzabile
    // come fonte e verrebbe scartato dal wiring (coerenza ingest->app).
    if (!/^https?:\/\//i.test(link)) continue;
    const guid = estraiGrezzo(blocco, "guid");
    const id = /^https?:\/\//i.test(guid) ? guid : link;
    const descrizione = estraiTag(blocco, "description");
    const numeroMatch = NUMERO_RE.exec(titolo);
    risultati.push({
      id,
      data: dataIso(estraiGrezzo(blocco, "pubDate")),
      numero: numeroMatch?.[1] ?? "",
      titolo,
      sintesi: descrizione.slice(0, MAX_SINTESI),
      url: link,
    });
  }
  return risultati;
}

async function scaricaFeed(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const risposta = await fetch(GOVERNO_RSS, {
      signal: controller.signal,
      headers: { accept: "application/rss+xml, application/xml, text/xml" },
    });
    if (!risposta.ok) throw new Error(`feed governo: HTTP ${risposta.status}`);
    const tipo = risposta.headers.get("content-type") ?? "";
    if (!/rss|xml/i.test(tipo)) throw new Error(`feed governo: content-type inatteso (${tipo})`);
    const xml = await risposta.text();
    if (!xml.trim()) throw new Error("feed governo vuoto");
    return xml;
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const recuperatoIl = new Date().toISOString();
  const xml = await scaricaFeed();
  const comunicati = parseRss(xml, MAX_ITEM);
  if (comunicati.length === 0) throw new Error("nessun comunicato utilizzabile nel feed");

  const envelope = {
    provenance: {
      fonte: FONTE,
      url: GOVERNO_RSS,
      recuperatoIl,
      licenza: LICENZA,
    },
    comunicati,
  };
  const json = `${JSON.stringify(envelope, null, 2)}\n`;
  if (Buffer.byteLength(json, "utf8") > MAX_BYTE) {
    throw new Error("governo-comunicati.json oltre 1MB");
  }

  mkdirSync(DIR_REALI, { recursive: true });
  writeFileSync(FILE_COMUNICATI, json, "utf8");

  const conNumero = comunicati.filter((c) => c.numero).length;
  console.log(
    `Governo: ${comunicati.length} comunicati dal feed (${conNumero} con numero nel titolo). ` +
      `File scritto: data/reali/governo-comunicati.json.`,
  );
}

main().catch((errore: unknown) => {
  const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
  console.error(`Ingest Governo fallito, nessun file scritto: ${messaggio}`);
  process.exit(1);
});
