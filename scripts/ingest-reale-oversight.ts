/**
 * Ingest reale oversight — ANAC contratti 2025 (via OCP) + Giustizia
 * Amministrativa Focus 2026. UN solo script, funzioni separate per fonte.
 *
 * Fonte A — ANAC/OCP 2025 (CC BY 4.0):
 *   download `.jsonl.gz` 2025 da `https://data.open-contracting.org/en/publication/117`
 *   (mirror OCP dei dati ANAC/BDNCP, licenza CC BY 4.0 dichiarata nella pagina
 *   di pubblicazione). Slice bounded via header `Range` (primi 400KB gzip) +
 *   decompressione streaming: si tengono le righe complete, max 400 righe
 *   scansionate, max 60 record validi. Ogni campo proviene dalle chiavi OCDS
 *   osservate (`ocid/id/buyer/tender/awards`): nessun URL costruito — `url` di
 *   ogni voce e' l'URL reale della risorsa bulk da cui la riga e' stata letta.
 *
 * Fonte B — Giustizia Amministrativa (Focus di Giurisprudenza 2026):
 *   max 2 GET HTML (`/web/guest/ricerca` + `?searchGenericaTheme=appalti`) con
 *   pausa >=3s, throttle e parsing dei soli articoli `Focus di Giurisprudenza`
 *   con link provvedimento osservato (`portali…/visualizza/` o `/documents/…
 *   .pdf`). Solo metadati + URL, nessun mirror di PDF/schede, nessuna scheda
 *   visitata oltre le 2 pagine di ricerca. La pagina non dichiara una licenza
 *   CC: la provenance lo registra onestamente. Voci senza titolo, senza data
 *   italiana valida (anno 2026) o senza URL assoluto si scartano, mai
 *   ricostruite. `stato`/vigenza mai assegnati (non sono leggi).
 *
 * Bound comuni: timeout 15s, retry solo su 429/5xx x3 con backoff, file
 * <=950KB, exit 1 senza scrivere alcun file in caso di fallimento (mai
 * parziali: i file si scrivono solo dopo che tutte le fonti richieste hanno
 * prodotto payload validi).
 *
 * Uso: npx tsx scripts/ingest-reale-oversight.ts [--solo=anac|ga] [--max=60]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";

// ---------------------------------------------------------------- ANAC/OCP

const ANAC_DOWNLOAD_URL =
  "https://data.open-contracting.org/en/publication/117/download?name=2025.jsonl.gz";
const ANAC_PAGINA_DATI = "https://data.open-contracting.org/en/publication/117";
const ANAC_FONTE = "data.open-contracting.org (ANAC/BDNCP via OCP Data Registry)";
const ANAC_LICENZA = "CC BY 4.0";
const ANAC_RANGE_BYTE = 400_000;
const ANAC_MAX_RIGHE = 400;

// ---------------------------------------------------------------------- GA

const GA_RICERCA_URL = "https://www.giustizia-amministrativa.it/web/guest/ricerca";
const GA_QUERY = "appalti";
const GA_FONTE = "giustizia-amministrativa.it — ricerca Focus di Giurisprudenza";
const GA_LICENZA =
  "solo metadati + link ufficiali, nessun mirror (licenza non dichiarata nella pagina)";
const GA_PAUSA_MS = 3000;
const GA_MAX_VOCI = 50;

// ------------------------------------------------------------------ comuni

const TIMEOUT_MS = 15000;
const MAX_BYTE = 950 * 1024;

const DIR_REALI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "reali");
const FILE_ANAC = resolve(DIR_REALI, "oversight-anac-2025.json");
const FILE_GA = resolve(DIR_REALI, "oversight-ga-2026.json");

export interface VoceOversight {
  readonly id: string;
  readonly titolo: string;
  readonly data: string;
  readonly oggetto?: string;
  readonly url: string;
  readonly ente: string;
  readonly numero?: string;
}

function argomenti(): { aiuto: boolean; solo: "anac" | "ga" | "tutte"; max: number } {
  let solo: "anac" | "ga" | "tutte" = "tutte";
  let max = 60;
  let aiuto = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === "--help" || arg === "-h") aiuto = true;
    else if (arg === "--solo=anac") solo = "anac";
    else if (arg === "--solo=ga") solo = "ga";
    else if (arg.startsWith("--max=")) {
      const n = Number.parseInt(arg.slice("--max=".length), 10);
      if (Number.isFinite(n)) max = Math.min(100, Math.max(1, Math.floor(n)));
    }
  }
  return { aiuto, solo, max };
}

function dormi(ms: number): Promise<void> {
  return new Promise((risolvi) => setTimeout(risolvi, ms));
}

function ritentabile(stato: number): boolean {
  return stato === 429 || (stato >= 500 && stato <= 599);
}

/** GET bounded con timeout + retry solo su 429/5xx (max 3 tentativi). */
export async function scarica(
  url: string,
  intestazioni: Record<string, string>,
): Promise<{ risposta: Response; corpo: Buffer }> {
  let ultimoErrore = "";
  for (let tentativo = 0; tentativo < 3; tentativo += 1) {
    if (tentativo > 0) await dormi(1000 * 2 ** (tentativo - 1));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const risposta = await fetch(url, { signal: controller.signal, headers: intestazioni });
      if (!risposta.ok) {
        ultimoErrore = `HTTP ${risposta.status}`;
        if (!ritentabile(risposta.status)) throw new Error(`GET ${url}: ${ultimoErrore}`);
        continue;
      }
      const corpo = Buffer.from(await risposta.arrayBuffer());
      if (corpo.length === 0) throw new Error(`GET ${url}: corpo vuoto`);
      return { risposta, corpo };
    } catch (errore) {
      const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
      if (tentativo === 2) throw new Error(`GET ${url} fallita dopo 3 tentativi (${messaggio})`);
      ultimoErrore = messaggio;
      if (/^GET .*HTTP (?!429|5)/.test(`GET ${url}: ${messaggio}`)) throw errore;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`GET ${url} fallita (${ultimoErrore})`);
}

// ------------------------------------------------------- mapping OCDS/ANAC

function testoOsservato(valore: unknown, limite: number): string {
  if (typeof valore !== "string") return "";
  return valore.replace(/\s+/g, " ").trim().slice(0, limite);
}

function dataIsoDaStringa(valore: unknown): string {
  if (typeof valore !== "string") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valore.trim());
  if (!m) return "";
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : iso;
}

/** Prima data valida osservata: awards[].date, poi tenderPeriod start/end. */
export function ocdsDataIso(release: Record<string, unknown>): string {
  const awards = release["awards"];
  if (Array.isArray(awards)) {
    for (const a of awards) {
      if (a && typeof a === "object" && !Array.isArray(a)) {
        const d = dataIsoDaStringa((a as Record<string, unknown>)["date"]);
        if (d) return d;
      }
    }
  }
  const tender = release["tender"];
  if (tender && typeof tender === "object" && !Array.isArray(tender)) {
    const periodo = (tender as Record<string, unknown>)["tenderPeriod"];
    if (periodo && typeof periodo === "object" && !Array.isArray(periodo)) {
      const p = periodo as Record<string, unknown>;
      const inizio = dataIsoDaStringa(p["startDate"]);
      if (inizio) return inizio;
      const fine = dataIsoDaStringa(p["endDate"]);
      if (fine) return fine;
    }
  }
  return "";
}

export function normalizzaOcdsVoce(voce: unknown, risorsaUrl: string): VoceOversight | null {
  if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
  const r = voce as Record<string, unknown>;
  const ocid = testoOsservato(r["ocid"], 120);
  const idRelease = testoOsservato(r["id"], 160);
  const id = ocid || idRelease;
  if (!id) return null;
  const buyer = r["buyer"];
  const ente =
    buyer && typeof buyer === "object" && !Array.isArray(buyer)
      ? testoOsservato((buyer as Record<string, unknown>)["name"], 200)
      : "";
  if (!ente) return null;
  const tender = r["tender"];
  if (!tender || typeof tender !== "object" || Array.isArray(tender)) return null;
  const t = tender as Record<string, unknown>;
  const titolo = testoOsservato(t["description"], 280);
  if (!titolo) return null;
  const data = ocdsDataIso(r);
  if (!data) return null;
  if (!/^https?:\/\//i.test(risorsaUrl)) return null;
  const record: { -readonly [K in keyof VoceOversight]: VoceOversight[K] } = {
    id,
    titolo,
    data,
    url: risorsaUrl,
    ente,
  } as { -readonly [K in keyof VoceOversight]: VoceOversight[K] };
  const items = t["items"];
  if (Array.isArray(items) && items.length > 0) {
    const primo = items[0];
    if (primo && typeof primo === "object" && !Array.isArray(primo)) {
      const dettaglio = testoOsservato((primo as Record<string, unknown>)["description"], 280);
      if (dettaglio && dettaglio !== titolo) record.oggetto = dettaglio;
    }
  }
  const numero = testoOsservato(t["id"], 60);
  if (numero) record.numero = numero;
  return record as VoceOversight;
}

function gunzipTroncato(grezzo: Buffer): Promise<{ testo: string; troncato: boolean }> {
  // Lo slice Range tronca il gzip a meta' stream: gunzipSync fallirebbe.
  // Si raccoglie l'output incrementale; in caso di troncamento l'ultima
  // riga (parziale) si scarta, le precedenti sono integre.
  return new Promise((risolvi) => {
    const gunzip = createGunzip();
    let testo = "";
    let troncato = false;
    let finita = false;
    const fine = () => {
      if (finita) return;
      finita = true;
      risolvi({ testo, troncato });
    };
    gunzip.on("data", (pezzo: Buffer) => {
      testo += pezzo.toString("utf8");
    });
    gunzip.on("error", () => {
      troncato = true;
      fine();
    });
    gunzip.on("end", fine);
    gunzip.end(grezzo);
  });
}

async function righeCompleteDaGzip(grezzo: Buffer, maxRighe: number): Promise<string[]> {
  const { testo, troncato } = await gunzipTroncato(grezzo);
  if (!testo.trim()) throw new Error("slice gzip inutilizzabile");
  const righe = testo.split("\n").filter((l) => l.trim().length > 0);
  if (troncato) righe.pop();
  const complete = righe.slice(0, maxRighe);
  if (complete.length === 0) throw new Error("slice gzip inutilizzabile");
  return complete;
}

async function ingerisciAnac(max: number): Promise<{ voci: VoceOversight[]; recuperatoIl: string }> {
  const recuperatoIl = new Date().toISOString();
  const { corpo } = await scarica(ANAC_DOWNLOAD_URL, {
    accept: "application/gzip, application/octet-stream",
    "accept-encoding": "gzip, deflate",
    Range: `bytes=0-${ANAC_RANGE_BYTE}`,
  });
  // fetch decomprime in automatico se il server ignora Range e invia gzip
  // intero con content-encoding: in tal caso il corpo e' gia' jsonl.
  let righe: string[];
  const avvio = corpo.subarray(0, 2);
  if (avvio.length === 2 && avvio[0] === 0x1f && avvio[1] === 0x8b) {
    righe = await righeCompleteDaGzip(corpo, ANAC_MAX_RIGHE);
  } else {
    righe = corpo
      .toString("utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .slice(0, ANAC_MAX_RIGHE);
  }
  if (righe.length === 0) throw new Error("ANAC/OCP: nessuna riga utilizzabile nello slice");
  const voci: VoceOversight[] = [];
  const visti = new Set<string>();
  for (const riga of righe) {
    if (voci.length >= max) break;
    let parsed: unknown;
    try {
      parsed = JSON.parse(riga) as unknown;
    } catch {
      continue;
    }
    const voce = normalizzaOcdsVoce(parsed, ANAC_DOWNLOAD_URL);
    if (!voce || visti.has(voce.id)) continue;
    visti.add(voce.id);
    voci.push(voce);
  }
  if (voci.length === 0) throw new Error("ANAC/OCP: nessun record valido nello slice");
  return { voci, recuperatoIl };
}

// ------------------------------------------------------------- mapping GA

const MESI: Record<string, string> = {
  gennaio: "01",
  febbraio: "02",
  marzo: "03",
  aprile: "04",
  maggio: "05",
  giugno: "06",
  luglio: "07",
  agosto: "08",
  settembre: "09",
  ottobre: "10",
  novembre: "11",
  dicembre: "12",
};

function decodificaEntita(testo: string): string {
  return testo
    .replace(/&#(\d+);/g, (_m, codice: string) => {
      const n = Number(codice);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, codice: string) => {
      const n = parseInt(codice, 16);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : "";
    })
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function toTesto(html: string): string {
  return decodificaEntita(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** "28 agosto 2026" -> "2026-08-28", solo se anno 2026 e data valida. */
export function gaDataIso(testo: string): string {
  const m =
    /(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i.exec(
      testo,
    );
  if (!m) return "";
  if (m[3] !== "2026") return "";
  const mese = MESI[m[2].toLowerCase()];
  if (!mese) return "";
  const giorno = Number(m[1]);
  if (giorno < 1 || giorno > 31) return "";
  const iso = `2026-${mese}-${String(giorno).padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : iso;
}

export function parseGaArticoli(html: string): string[] {
  return html.match(/<article class="ricerca--item">[\s\S]*?<\/article>/gi) ?? [];
}

function gaSchedaETitolo(articolo: string): { scheda: string; titolo: string } | null {
  const m = /<a\s[^>]*href="([^"]+)"[^>]*class="item-title"[^>]*>([\s\S]*?)<\/a>/i.exec(articolo);
  if (!m) return null;
  const scheda = decodificaEntita(m[1]).trim();
  if (!/^https?:\/\//i.test(scheda)) return null;
  const titolo = toTesto(m[2]).slice(0, 280);
  if (!titolo) return null;
  return { scheda, titolo };
}

function gaTipologia(articolo: string): string {
  const m = /Tipologia:\s*<\/strong>\s*<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/i.exec(articolo);
  return m ? toTesto(m[1]) : "";
}

function gaMateria(articolo: string): string {
  const m = /Materia:\s*<\/strong>[\s\S]*?<\/div>\s*<div[^>]*>([\s\S]*?)<br/i.exec(articolo);
  return m ? toTesto(m[1]).slice(0, 200) : "";
}

function gaProvvedimento(articolo: string): { testo: string; href: string } | null {
  const ancore = articolo.match(/<a\s[^>]*href="[^"]+"[^>]*>[\s\S]*?<\/a>/gi) ?? [];
  for (const a of ancore) {
    if (/class="item-title"/i.test(a)) continue;
    const hm = /href="([^"]+)"/i.exec(a);
    if (!hm) continue;
    const href = decodificaEntita(hm[1]).trim();
    if (!/^https?:\/\//i.test(href)) continue;
    if (!/visualizza|\/documents\/|\.pdf|portali\.giustizia-amministrativa\.it/i.test(href)) continue;
    const testo = toTesto(a.replace(/^<a\s[^>]*>/i, "").replace(/<\/a>\s*$/i, "")).slice(0, 280);
    if (!testo) continue;
    return { testo, href };
  }
  return null;
}

function gaEnte(testoProvvedimento: string, dataIso: string): string {
  // Ente = porzione osservata prima della data ("T.a.r. … sezione I,",
  // "Consiglio di Stato, sezione V, ordinanza …"): si rimuovono solo
  // separatori finali e il tipo di provvedimento in coda, mai si aggiunge.
  const m =
    /(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i.exec(
      testoProvvedimento,
    );
  if (!m || !dataIso) return "";
  let ente = testoProvvedimento.slice(0, m.index).trim();
  ente = ente
    .replace(/[\s,;:\-–—]+$/g, "")
    .replace(/\s+(sentenza|sentenze|ordinanza|ordinanze|decreto|decreti|parere|pareri)$/i, "")
    .replace(/[\s,;:\-–—]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return ente;
}

export function normalizzaGaVoce(articolo: unknown): VoceOversight | null {
  if (typeof articolo !== "string" || !articolo) return null;
  if (!/focus/i.test(gaTipologia(articolo))) return null;
  const scheda = gaSchedaETitolo(articolo);
  if (!scheda) return null;
  const prov = gaProvvedimento(articolo);
  if (!prov) return null;
  const data = gaDataIso(prov.testo);
  if (!data) return null;
  const ente = gaEnte(prov.testo, data);
  if (!ente) return null;
  const record: { -readonly [K in keyof VoceOversight]: VoceOversight[K] } = {
    id: scheda.scheda,
    titolo: scheda.titolo,
    data,
    url: scheda.scheda,
    ente,
  } as { -readonly [K in keyof VoceOversight]: VoceOversight[K] };
  const materia = gaMateria(articolo);
  if (materia) record.oggetto = materia;
  const num = /n\.\s*(\d+)/i.exec(prov.testo);
  if (num) record.numero = num[1];
  return record as VoceOversight;
}

async function ingerisciGa(max: number): Promise<{ voci: VoceOversight[]; recuperatoIl: string }> {
  const recuperatoIl = new Date().toISOString();
  const pagine = [
    GA_RICERCA_URL,
    `${GA_RICERCA_URL}?searchGenericaTheme=${encodeURIComponent(GA_QUERY)}`,
  ];
  const voci: VoceOversight[] = [];
  const visti = new Set<string>();
  for (let i = 0; i < pagine.length; i += 1) {
    if (i > 0) await dormi(GA_PAUSA_MS);
    const { corpo } = await scarica(pagine[i], {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) simple-law-oversight/1.0",
    });
    for (const articolo of parseGaArticoli(corpo.toString("utf8"))) {
      if (voci.length >= Math.min(max, GA_MAX_VOCI)) break;
      let voce: VoceOversight | null = null;
      try {
        voce = normalizzaGaVoce(articolo);
      } catch {
        continue;
      }
      if (!voce || visti.has(voce.id)) continue;
      visti.add(voce.id);
      voci.push(voce);
    }
    if (voci.length >= Math.min(max, GA_MAX_VOCI)) break;
  }
  if (voci.length === 0) throw new Error("GA: nessun Focus 2026 utilizzabile nelle pagine di ricerca");
  return { voci, recuperatoIl };
}

// ------------------------------------------------------------------ main

function envelope(
  fonte: string,
  url: string,
  recuperatoIl: string,
  licenza: string,
  paginaDati: string,
  voci: VoceOversight[],
): string {
  const json = `${JSON.stringify(
    { provenance: { fonte, url, paginaDati, recuperatoIl, licenza }, voci },
    null,
    2,
  )}\n`;
  if (Buffer.byteLength(json, "utf8") > MAX_BYTE) throw new Error(`envelope oltre ${MAX_BYTE} byte`);
  return json;
}

async function main(): Promise<void> {
  const { aiuto, solo, max } = argomenti();
  if (aiuto) {
    console.log(
      "Uso: npx tsx scripts/ingest-reale-oversight.ts [--solo=anac|ga] [--max=60]\n" +
        "Ingerisce ANAC/OCP 2025 (Range slice) e GA Focus 2026 (2 GET, pausa >=3s).\n" +
        "Scrive data/reali/oversight-anac-2025.json e data/reali/oversight-ga-2026.json\n" +
        "(solo i file richiesti da --solo). Fallimento -> exit 1 senza file parziali.",
    );
    return;
  }
  // Tutte le fonti richieste vengono costruite in memoria PRIMA di scrivere:
  // se una fallisce, nessun file viene toccato (mai parziali).
  const payloads: Array<{ file: string; json: string; etichetta: string }> = [];
  if (solo === "anac" || solo === "tutte") {
    const { voci, recuperatoIl } = await ingerisciAnac(Math.min(max, 100));
    payloads.push({
      file: FILE_ANAC,
      json: envelope(ANAC_FONTE, ANAC_DOWNLOAD_URL, recuperatoIl, ANAC_LICENZA, ANAC_PAGINA_DATI, voci),
      etichetta: `ANAC/OCP 2025: ${voci.length} voci`,
    });
  }
  if (solo === "ga" || solo === "tutte") {
    if (solo === "tutte") await dormi(GA_PAUSA_MS);
    const { voci, recuperatoIl } = await ingerisciGa(Math.min(max, GA_MAX_VOCI));
    payloads.push({
      file: FILE_GA,
      json: envelope(
        GA_FONTE,
        GA_RICERCA_URL,
        recuperatoIl,
        GA_LICENZA,
        `${GA_RICERCA_URL}?searchGenericaTheme=${GA_QUERY}`,
        voci,
      ),
      etichetta: `GA Focus 2026: ${voci.length} voci`,
    });
  }
  mkdirSync(DIR_REALI, { recursive: true });
  for (const p of payloads) writeFileSync(p.file, p.json, "utf8");
  console.log(`${payloads.map((p) => p.etichetta).join(" + ")}. File scritti: ${payloads.length}.`);
}

const eseguitoDiretto =
  typeof process !== "undefined" &&
  typeof process.argv?.[1] === "string" &&
  process.argv[1].endsWith("ingest-reale-oversight.ts");

if (eseguitoDiretto) {
  main().catch((errore: unknown) => {
    const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
    console.error(`Ingest oversight fallito, nessun file scritto: ${messaggio}`);
    process.exit(1);
  });
}
