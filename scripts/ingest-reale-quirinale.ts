/**
 * Ingest reale Quirinale — comunicati + atti da quirinale.it (HTML leggero).
 *
 * Sorgenti (solo GET pagina 1, mai POST/paginazione con token):
 *   - comunicati: GET `https://www.quirinale.it/ricerca/comunicati`
 *     selettore `a.card[href^="/it/comunicato/"]`
 *   - atti:       GET `https://www.quirinale.it/ricerca/atti`
 *     selettore `a.card[href^="/elementi/"]`
 *   In ogni card: `div.q-box-search-text > div.titolo + span.tipoRicerca
 *   + span.descrizione`. Data con regex difensiva `(\d{2}/\d{2}/\d{4})`.
 *
 * Regole ferree:
 * - MAI costruire URL: solo `href` osservati, risolti contro
 *   `https://www.quirinale.it`; scarta voci senza data+titolo+link assoluto.
 * - MAI numero/stato dagli atti: il dettaglio `/elementi/<id>` riporta solo
 *   titolo + 1 riga (spesso «In attesa di pubblicazione»), quindi il record
 *   atto contiene solo titolo/sottotipo/descrizione/data/url. Niente testo
 *   integrale, niente mirroring.
 * - Rinvii/rinunce: esclusi (non elencabili in queste liste).
 * - Bounded: timeout 15s, retry 3 con backoff solo su errori di rete/5xx;
 *   stop immediato a 403/409; max 25 voci per file; file <= 1MB.
 * - Fallimento (rete, challenge anti-bot, zero voci valide, file > 1MB):
 *   exit 1 SENZA scrivere alcun file parziale (entrambi i file si scrivono
 *   solo insieme a fine ingest riuscito).
 *
 * Uso:
 *   npx tsx scripts/ingest-reale-quirinale.ts [--help]
 *
 * Nota operativa: quirinale.it applica un check anti-bot per IP. Da reti
 * bloccate la pagina risponde «Pagina di errore / check di verifica»: lo
 * script lo rileva e fallisce con exit 1 senza scrivere nulla.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://www.quirinale.it";
const URL_COMUNICATI = "https://www.quirinale.it/ricerca/comunicati";
const URL_ATTI = "https://www.quirinale.it/ricerca/atti";
const FONTE = "quirinale.it";
const LICENZA = "uso non commerciale con attribuzione, fa fede la Gazzetta Ufficiale";
const TIMEOUT_MS = 15000;
const RETRY = 3;
const MAX_VOCI = 25;
const MAX_SINTESI = 600;
const MAX_BYTE = 1_048_576;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const DIR_REALI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "reali");
const FILE_COMUNICATI = resolve(DIR_REALI, "quirinale-comunicati.json");
const FILE_ATTI = resolve(DIR_REALI, "quirinale-atti.json");

const DATA_RE = /(\d{2})\/(\d{2})\/(\d{4})/;
const HREF_COMUNICATO_RE = /^\/it\/comunicato\/[a-z0-9-]+$/i;
const HREF_ATTO_RE = /^\/elementi\/\d+$/;

interface Comunicato {
  readonly id: string;
  readonly tipo: "comunicato-quirinale";
  readonly titolo: string;
  readonly data: string;
  readonly sintesi: string;
  readonly url: string;
}

interface Atto {
  readonly id: string;
  readonly tipo: "atto-quirinale";
  readonly titolo: string;
  readonly sottotipo: string;
  readonly descrizione: string;
  readonly data: string;
  readonly url: string;
}

function decodificaEntita(testo: string): string {
  return testo
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
  return decodificaEntita(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDaTesto(testo: string): string {
  const m = DATA_RE.exec(testo);
  if (!m) return "";
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return "";
  return iso;
}

function pausa(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function erroreDefinitivo(status: number): boolean {
  return status === 403 || status === 409;
}

async function scarica(url: string): Promise<string> {
  let ultimoErrore = "";
  for (let tentativo = 0; tentativo <= RETRY; tentativo += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const risposta = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": UA,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "it-IT,it;q=0.9,en;q=0.5",
          referer: "https://www.quirinale.it/",
        },
      });
      if (!risposta.ok) {
        if (erroreDefinitivo(risposta.status)) {
          throw new Error(`stop definitivo: ${url} HTTP ${risposta.status}`);
        }
        throw new Error(`${url}: HTTP ${risposta.status}`);
      }
      const html = await risposta.text();
      if (!html.trim()) throw new Error(`${url}: corpo vuoto`);
      if (/Pagina di errore|check di verifica/i.test(html.slice(0, 20000))) {
        throw new Error(`${url}: challenge anti-bot (Pagina di errore), riprovare da altra rete`);
      }
      return html;
    } catch (errore) {
      const messaggio = errore instanceof Error ? errore.message : String(errore);
      if (/stop definitivo|anti-bot/i.test(messaggio)) throw errore;
      ultimoErrore = messaggio;
      if (tentativo < RETRY) await pausa(1000 * 2 ** tentativo);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`GET ${url} fallita dopo ${RETRY + 1} tentativi: ${ultimoErrore}`);
}

interface Card {
  href: string;
  titolo: string;
  tipoRicerca: string;
  descrizione: string;
}

function estraiCard(html: string, accettaHref: (href: string) => boolean): Card[] {
  const cards: Card[] = [];
  const re = /<a\s+class="card"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = (m[1] ?? "").trim();
    if (!accettaHref(href)) continue;
    const inner = m[2] ?? "";
    const titolo = toTesto(/<div class="titolo">([\s\S]*?)<\/div>/i.exec(inner)?.[1] ?? "");
    const tipoRicerca = toTesto(/<span class="tipoRicerca">([\s\S]*?)<\/span>/i.exec(inner)?.[1] ?? "");
    const descrizione = toTesto(/<span class="descrizione">([\s\S]*?)<\/span>/i.exec(inner)?.[1] ?? "");
    cards.push({ href, titolo, tipoRicerca, descrizione });
  }
  return cards;
}

function parseComunicati(html: string): Comunicato[] {
  const cards = estraiCard(html, (h) => HREF_COMUNICATO_RE.test(h));
  const risultati: Comunicato[] = [];
  const visti = new Set<string>();
  for (const card of cards.slice(0, MAX_VOCI)) {
    // Validazione stretta: titolo>=10ch + data esplicita + href consentito.
    if (card.titolo.length < 10) continue;
    const data = isoDaTesto(`${card.tipoRicerca} ${card.titolo}`);
    if (!data) continue;
    const url = `${BASE}${card.href}`;
    if (visti.has(url)) continue;
    visti.add(url);
    risultati.push({
      id: url,
      tipo: "comunicato-quirinale",
      titolo: card.titolo,
      data,
      sintesi: card.descrizione.slice(0, MAX_SINTESI),
      url,
    });
  }
  return risultati;
}

function parseAtti(html: string): Atto[] {
  const cards = estraiCard(html, (h) => HREF_ATTO_RE.test(h));
  const risultati: Atto[] = [];
  const visti = new Set<string>();
  for (const card of cards.slice(0, MAX_VOCI)) {
    // Validazione stretta: titolo>=10ch + data esplicita + href consentito.
    // MAI numero/stato: solo titolo + sottotipo raw + 1 riga di descrizione.
    if (card.titolo.length < 10) continue;
    const data = isoDaTesto(`${card.titolo} ${card.tipoRicerca}`);
    if (!data) continue;
    const url = `${BASE}${card.href}`;
    if (visti.has(url)) continue;
    visti.add(url);
    risultati.push({
      id: url,
      tipo: "atto-quirinale",
      titolo: card.titolo,
      sottotipo: card.tipoRicerca.slice(0, 200),
      descrizione: card.descrizione.slice(0, MAX_SINTESI),
      data,
      url,
    });
  }
  return risultati;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(
      [
        "Ingest reale Quirinale (solo GET pagina 1, mai POST).",
        "",
        "Uso:",
        "  npx tsx scripts/ingest-reale-quirinale.ts",
        "",
        "Scrive (solo insieme, mai parziali):",
        `  data/reali/quirinale-comunicati.json (max ${MAX_VOCI})`,
        `  data/reali/quirinale-atti.json (max ${MAX_VOCI})`,
      ].join("\n"),
    );
    return;
  }
  const recuperatoIl = new Date().toISOString();
  const htmlCom = await scarica(URL_COMUNICATI);
  const comunicati = parseComunicati(htmlCom);
  if (comunicati.length === 0) throw new Error("nessun comunicato valido in pagina 1");
  const htmlAtti = await scarica(URL_ATTI);
  const atti = parseAtti(htmlAtti);
  if (atti.length === 0) throw new Error("nessun atto valido in pagina 1");

  const envCom = {
    provenance: { fonte: FONTE, url: URL_COMUNICATI, recuperatoIl, licenza: LICENZA },
    comunicati,
  };
  const envAtti = {
    provenance: { fonte: FONTE, url: URL_ATTI, recuperatoIl, licenza: LICENZA },
    atti,
  };
  const jsonCom = `${JSON.stringify(envCom, null, 2)}\n`;
  const jsonAtti = `${JSON.stringify(envAtti, null, 2)}\n`;
  if (Buffer.byteLength(jsonCom, "utf8") > MAX_BYTE) throw new Error("quirinale-comunicati.json oltre 1MB");
  if (Buffer.byteLength(jsonAtti, "utf8") > MAX_BYTE) throw new Error("quirinale-atti.json oltre 1MB");

  // Solo dopo entrambi i successi: mai file parziali.
  mkdirSync(DIR_REALI, { recursive: true });
  writeFileSync(FILE_COMUNICATI, jsonCom, "utf8");
  writeFileSync(FILE_ATTI, jsonAtti, "utf8");
  console.log(
    `Quirinale: ${comunicati.length} comunicati + ${atti.length} atti (pagina 1 sola). File scritti.`,
  );
}

main().catch((errore: unknown) => {
  const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
  console.error(`Ingest Quirinale fallito, nessun file scritto: ${messaggio}`);
  process.exit(1);
});
