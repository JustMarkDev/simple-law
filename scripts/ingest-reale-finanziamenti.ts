/**
 * Ingest reale finanziamenti ai partiti politici 2024-2026 (SOLO aggregati).
 *
 * Fonte: Camera dei deputati — Erogazioni ai partiti politici iscritti nel
 * registro nazionale (art. 5, comma 3, DL 149/2013), pagina indice
 * `https://parlamento18.camera.it/199` che elenca i PDF annuali:
 * - 2024 `.../006/...2024_agg.13052025.pdf` (LM 13/05/2025, ~5,0 MB);
 * - 2025 `.../007/...2025_agg._11062026.pdf` (LM 11/06/2026, ~5,3 MB);
 * - 2026 `.../008/...2026_v._65.pdf` (LM 28/09/2026, ~4,2 MB).
 * Hub di contesto (solo fonte-link, mai scaricati):
 * `https://www.camera.it/leg19/1384`, relazioni
 * `https://www.camera.it/leg19/1234`.
 *
 * Metodo (nessun numero/URL/data inventati, zero nominativi eroganti):
 * - 1 GET indice + 3 GET PDF (transienti, mai salvati su disco);
 * - i PDF NON vengono mai ingeriti integralmente: se ne estraggono via
 *   content-stream (inflate + stringhe Tj con coordinate Tm, regola
 *   last-wins per (x,y)) solo data/anno/importo di riga e intestazione
 *   beneficiario; il nominativo del soggetto erogante e' scartato dal
 *   parser (mai catturato, mai emesso);
 * - una riga pubblicata = 1 erogazione comunicata (`n_erogazioni` = righe,
 *   `totale_euro` = somma algebrica: righe a 0/rettifiche negative incluse
 *   cosi' come pubblicate, senza giudizi);
 * - merge (beneficiario, anno) tra file (trasmissioni tardive/annulli a 0
 *   degli anni precedenti): `fonte_pdf` = PDF con piu' righe per la coppia
 *   (parita' -> piu' recente), `lastModified` = suo header HTTP reale in
 *   forma ISO (stesso istante, mai inventato);
 * - scope anni 2024-2026 (direttiva + test trasversali REALI-14): le righe
 *   con anno fuori intervallo (trasmissioni tardive di anni precedenti,
 *   consultabili nei PDF) sono scartate e conteggiate, mai aggregate;
 * - top-50 coppie per `totale_euro` desc (criterio deterministico
 *   documentato; spareggio: beneficiario asc, anno asc).
 *
 * Bound comuni: timeout 15s indice / 30s PDF, retry solo su 429/5xx x3 con
 * backoff, cap 8MB per PDF, file <=1MB, exit 1 senza scrivere alcun file in
 * caso di fallimento (mai parziali: il JSON si scrive solo dopo che tutti
 * e 3 i PDF hanno prodotto aggregati validi).
 *
 * Licenza envelope: `camera.it — solo riuso non commerciale con citazione
 * fonte` (obbligatoria da direttiva REALI-14).
 *
 * Uso: npx tsx scripts/ingest-reale-finanziamenti.ts [--max=50] [--help]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

// ---------------------------------------------------------------- costanti

const INDICE_URL = "https://parlamento18.camera.it/199";
const FONTE = "Camera dei deputati — Erogazioni ai partiti politici (art. 5, DL 149/2013)";
const LICENZA = "camera.it — solo riuso non commerciale con citazione fonte";
const HUB_URL = "https://www.camera.it/leg19/1384";
const RELAZIONI_URL = "https://www.camera.it/leg19/1234";

/** Marcatore di periodo atteso nell'href di ogni PDF (dal nome ufficiale). */
const PERIODI_ATTESI = ["dal_01012024", "dal_01012025", "dal_01012026"] as const;

const TIMEOUT_INDICE_MS = 15000;
const TIMEOUT_PDF_MS = 30000;
const MAX_PDF_BYTE = 8_000_000;
const MAX_JSON_BYTE = 1024 * 1024;

const DIR_REALI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "reali");
const FILE_OUT = resolve(DIR_REALI, "finanziamenti-erogazioni-2024-2026.json");

export interface ErogazioneAggregata {
  readonly beneficiario: string;
  readonly anno: number;
  readonly n_erogazioni: number;
  readonly totale_euro: number;
  readonly fonte_pdf: string;
  readonly lastModified: string;
}

// ------------------------------------------------------------ fetch bounded

function dormi(ms: number): Promise<void> {
  return new Promise((risolvi) => setTimeout(risolvi, ms));
}

function ritentabile(stato: number): boolean {
  return stato === 429 || (stato >= 500 && stato <= 599);
}

/** GET bounded con timeout + retry solo su 429/5xx (max 3 tentativi). */
export async function scaricaFinanziamenti(
  url: string,
  timeoutMs: number,
): Promise<{ corpo: Buffer; lastModified: string }> {
  let ultimoErrore = "";
  for (let tentativo = 0; tentativo < 3; tentativo += 1) {
    if (tentativo > 0) await dormi(1000 * 2 ** (tentativo - 1));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const risposta = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "*/*", "user-agent": "simple-law-finanziamenti/1.0" },
      });
      if (!risposta.ok) {
        ultimoErrore = `HTTP ${risposta.status}`;
        if (!ritentabile(risposta.status)) {
          throw new Error(`GET ${url}: ${ultimoErrore}`);
        }
        continue;
      }
      const corpo = Buffer.from(await risposta.arrayBuffer());
      if (corpo.length === 0) throw new Error(`GET ${url}: corpo vuoto`);
      const lastModified = (risposta.headers.get("last-modified") ?? "").trim();
      return { corpo, lastModified };
    } catch (errore) {
      const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
      if (/^GET .*HTTP (?!429|5)/.test(`GET ${url}: ${messaggio}`)) throw errore;
      ultimoErrore = messaggio;
      if (tentativo === 2) {
        throw new Error(`GET ${url} fallita dopo 3 tentativi (${ultimoErrore})`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`GET ${url} fallita (${ultimoErrore})`);
}

// ------------------------------------------------------- indice -> PDF href

/** Estrae gli href dei PDF annuali dalla pagina indice (mai inventati). */
export function estraiHrefPdfFinanziamenti(html: string, base: string): string[] {
  const hrefs: string[] = [];
  const visti = new Set<string>();
  const re =
    /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]{0,200}?)<\/a\s*>/gi;
  let m: RegExpExecArray | null;
  for (;;) {
    m = re.exec(html);
    if (!m) break;
    const href = (m[1] ?? "").trim();
    if (!/\/uploads\//i.test(href) || !/\.pdf(\?|#|$)/i.test(href)) continue;
    let assoluto = "";
    try {
      assoluto = new URL(href, base).toString();
    } catch {
      continue;
    }
    if (!/^https:\/\/parlamento18\.camera\.it\//i.test(assoluto)) continue;
    if (visti.has(assoluto)) continue;
    visti.add(assoluto);
    hrefs.push(assoluto);
  }
  return hrefs;
}

/**
 * Seleziona un PDF per periodo dai link estratti (uno per periodo, mai
 * ambigui: piu' link per stesso periodo -> errore, mai scelta arbitraria).
 */
export function selezionaPdfPerPeriodo(hrefs: string[]): Map<string, string> {
  const perPeriodo = new Map<string, string>();
  for (const periodo of PERIODI_ATTESI) {
    const candidati = hrefs.filter((h) => h.includes(periodo));
    if (candidati.length === 0) {
      throw new Error(`indice senza PDF per periodo ${periodo}`);
    }
    if (candidati.length > 1) {
      throw new Error(`indice ambiguo: ${candidati.length} PDF per periodo ${periodo}`);
    }
    perPeriodo.set(periodo, candidati[0]);
  }
  return perPeriodo;
}

// ------------------------------------------------- decodifica PDF low-level

/** Tabella Windows-1252 per i byte 0x80-0x9F (il resto e' Latin-1 1:1). */
const CP1252_ALTI: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†",
  0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ",
  0x8e: "Ž", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•",
  0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›",
  0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

/** Decodifica byte PDF (WinAnsi/Windows-1252) in stringa. Mai throw. */
export function decodificaCp1252(byte: Uint8Array | Buffer | number[]): string {
  try {
    let out = "";
    for (const b of byte) {
      const v = b & 0xff;
      if (v < 0x80 || v >= 0xa0) out += String.fromCharCode(v);
      else out += CP1252_ALTI[v] ?? "";
    }
    return out;
  } catch {
    return "";
  }
}

const ESCAPE_SEMPLICI: Record<string, number> = {
  n: 0x0a, r: 0x0d, t: 0x09, b: 0x08, f: 0x0c, "(": 0x28, ")": 0x29, "\\": 0x5c,
};

/**
 * Scioglie gli escape di una stringa PDF letterale (corpo senza parentesi)
 * in byte, poi decodifica WinAnsi. Mai throw.
 */
export function decodificaStringaPdf(corpo: string): string {
  try {
    const byte: number[] = [];
    let i = 0;
    while (i < corpo.length) {
      const c = corpo[i];
      if (c !== "\\") {
        const code = corpo.charCodeAt(i);
        byte.push(code <= 0xff ? code : 0x3f);
        i += 1;
        continue;
      }
      const next = corpo[i + 1] ?? "";
      if (next in ESCAPE_SEMPLICI) {
        byte.push(ESCAPE_SEMPLICI[next]);
        i += 2;
        continue;
      }
      const ottale = /^[0-7]{1,3}/.exec(corpo.slice(i + 1, i + 4));
      if (ottale) {
        byte.push(parseInt(ottale[0], 8) & 0xff);
        i += 1 + ottale[0].length;
        continue;
      }
      // escape sconosciuto: salta la backslash, tiene il carattere
      const code = corpo.charCodeAt(i + 1);
      byte.push(Number.isFinite(code) && code <= 0xff ? code : 0x3f);
      i += 2;
    }
    return decodificaCp1252(byte);
  } catch {
    return "";
  }
}

interface CellaPdf {
  readonly x: number;
  readonly y: number;
  readonly testo: string;
}

const RE_TM =
  /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm/g;
const RE_TJ = /\((?:[^()\\]|\\.)*\)Tj|\[(?:[^\[\]])*\]TJ|<[0-9A-Fa-f]+>Tj/g;
const RE_PARTI_TJ = /\((?:[^()\\]|\\.)*\)/g;

function arrotonda1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Estrae le celle di testo di un content-stream gia' inflato, con regola
 * last-wins per (x,y): le rigenerazioni sovrastampano il testo stantio
 * nella stessa posizione (verificato via render). Mai throw.
 */
export function celleDaContentStream(inflato: string): CellaPdf[] {
  try {
    const tm: Array<{ pos: number; x: number; y: number }> = [];
    RE_TM.lastIndex = 0;
    let mt: RegExpExecArray | null;
    for (;;) {
      mt = RE_TM.exec(inflato);
      if (!mt) break;
      const x = Number(mt[5]);
      const y = Number(mt[6]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      tm.push({ pos: mt.index, x, y });
    }
    const viste = new Map<string, CellaPdf>();
    RE_TJ.lastIndex = 0;
    let mj: RegExpExecArray | null;
    for (;;) {
      mj = RE_TJ.exec(inflato);
      if (!mj) break;
      const tok = mj[0];
      let x: number | null = null;
      let y: number | null = null;
      for (const t of tm) {
        if (t.pos < mj.index) {
          x = t.x;
          y = t.y;
        } else break;
      }
      if (x === null || y === null) continue;
      let testo = "";
      if (tok.startsWith("(")) {
        testo = decodificaStringaPdf(tok.slice(1, -3));
      } else if (tok.startsWith("<")) {
        try {
          const hex = tok.slice(1, -3);
          const buf = Buffer.from(hex.length % 2 === 0 ? hex : `${hex}0`, "hex");
          testo = decodificaCp1252(buf);
        } catch {
          testo = "";
        }
      } else {
        const parti: string[] = [];
        RE_PARTI_TJ.lastIndex = 0;
        let mp: RegExpExecArray | null;
        for (;;) {
          mp = RE_PARTI_TJ.exec(tok);
          if (!mp) break;
          parti.push(decodificaStringaPdf(mp[0].slice(1, -1)));
        }
        testo = parti.join("");
      }
      viste.set(`${arrotonda1(x)}|${arrotonda1(y)}`, {
        x: arrotonda1(x),
        y: arrotonda1(y),
        testo,
      });
    }
    return [...viste.values()];
  } catch {
    return [];
  }
}

/** Righe di una pagina: celle raggruppate per y desc, ordinate per x. */
export function righeDaCelle(celle: readonly CellaPdf[]): Array<{ y: number; x: number[]; testi: string[]; riga: string }> {
  try {
    const perY = new Map<number, CellaPdf[]>();
    for (const c of celle) {
      const lista = perY.get(c.y) ?? [];
      lista.push(c);
      perY.set(c.y, lista);
    }
    const righe: Array<{ y: number; x: number[]; testi: string[]; riga: string }> = [];
    for (const y of [...perY.keys()].sort((a, b) => b - a)) {
      const ordinate = (perY.get(y) ?? []).slice().sort((a, b) => a.x - b.x);
      const testi = ordinate.map((c) => c.testo);
      righe.push({ y, x: ordinate.map((c) => c.x), testi, riga: testi.join(" ").trim() });
    }
    return righe;
  } catch {
    return [];
  }
}

/** Scansiona gli stream del PDF e li infla (try/catch per stream). */
export function contentStreamInflati(pdf: Buffer): string[] {
  const out: string[] = [];
  try {
    let pos = 0;
    for (;;) {
      const iStream = pdf.indexOf("stream", pos, "latin1");
      if (iStream < 0) break;
      let inizio = iStream + 6;
      if (pdf[inizio] === 0x0d && pdf[inizio + 1] === 0x0a) inizio += 2;
      else if (pdf[inizio] === 0x0a || pdf[inizio] === 0x0d) inizio += 1;
      else {
        pos = iStream + 6;
        continue;
      }
      const iEnd = pdf.indexOf("endstream", inizio, "latin1");
      if (iEnd < 0) break;
      const grezzo = pdf.subarray(inizio, iEnd);
      pos = iEnd + 9;
      if (!grezzo.length) continue;
      try {
        const inflato = inflateSync(grezzo);
        const testo = inflato.toString("latin1");
        if (testo.includes("BT") && testo.includes("Tj")) out.push(testo);
      } catch {
        // stream non-deflate o troncato: si salta, mai parziali inventati
      }
    }
  } catch {
    // mai throw: ritorna gli stream validi trovati fin qui
  }
  return out;
}

// ------------------------------------------------------- classificazione

const RE_RIGA_FINANZIAMENTI =
  /^(\d{2}\/\d{2}\/\d{4})\s+(\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+.+?\s+(\d+)\s+€\s+(-?[\d.]+,\d{2})\s+(s[iì]|no)(?=\s|$)\s*(.*)$/i;
const RE_PIE_PAGINA = /^-\s*\d+\s*-$/;

export interface RigaErogazione {
  readonly anno: number;
  readonly n: number;
  readonly centesimi: number;
}

/**
 * Riga di erogazione (data, anno, trasmissione, [erogante scartato], n,
 * importo, non-in-denaro, [annotazioni scartate]). Il nominativo erogante
 * non e' catturato (non-capturing). Ritorna null se non riga. Mai throw.
 */
export function parseRigaErogazione(riga: string, nCelle: number): RigaErogazione | null {
  try {
    if (nCelle < 5) return null;
    const m = RE_RIGA_FINANZIAMENTI.exec(riga.trim().normalize("NFC"));
    if (!m) return null;
    const anno = Number.parseInt(m[2], 10);
    if (!Number.isFinite(anno) || anno < 2000 || anno > 2100) return null;
    const n = Number.parseInt(m[4], 10);
    if (!Number.isFinite(n) || n < 1 || n > 1000) return null;
    const centesimi = Math.round(Number(m[5].replace(/\./g, "").replace(",", ".")) * 100);
    if (!Number.isFinite(centesimi) || Math.abs(centesimi) > 1_000_000_000_00) return null;
    return { anno, n, centesimi };
  } catch {
    return null;
  }
}

/** Rapporto lettere maiuscole/totale (soglia 0.85 per intestazioni). */
export function rapportoMaiuscole(testo: string): number {
  try {
    const lettere = testo.replace(/[^A-Za-zÀ-Þà-þ]/g, "");
    if (lettere.length < 3) return 0;
    let maiusc = 0;
    for (const c of lettere) {
      if (c === c.toUpperCase()) maiusc += 1;
    }
    return maiusc / lettere.length;
  } catch {
    return 0;
  }
}

/**
 * Intestazione beneficiario: riga monocella a margine sinistro, senza
 * importi/date, a maggioranza maiuscola (denominazioni ufficiali).
 * Le righe di continuazione (erogante/annotazioni a capo, x>=150) e il
 * pie' di pagina sono esclusi. Mai throw.
 */
export function isIntestazioneBeneficiario(
  testi: readonly string[],
  x: readonly number[],
  riga: string,
): boolean {
  try {
    if (testi.length !== 1 || x.length !== 1) return false;
    if (x[0] >= 150) return false;
    const t = riga.trim();
    if (!t || t.length < 3 || t.includes("€")) return false;
    if (/^\d{2}\/\d{2}\/\d{4}/.test(t)) return false;
    if (RE_PIE_PAGINA.test(t)) return false;
    if (t.startsWith("Data erogazione")) return false;
    return rapportoMaiuscole(t) >= 0.85;
  } catch {
    return false;
  }
}

/** Anni in scope REALI-14 (il file si chiama 2024-2026). */
export const ANNO_MIN_FINANZIAMENTI = 2024;
export const ANNO_MAX_FINANZIAMENTI = 2026;

export interface AggregatiFile {
  /** chiave `${beneficiario}|||${anno}` -> [n, centesimi] */
  readonly coppie: Map<string, { beneficiario: string; anno: number; n: number; centesimi: number }>;
  readonly righe: number;
  readonly scartateFuoriAnno: number;
}

/** Aggrega un PDF (buffer) in coppie (beneficiario, anno 2024-2026). Mai throw. */
export function aggregaPdfFinanziamenti(pdf: Buffer): AggregatiFile {
  const coppie = new Map<string, { beneficiario: string; anno: number; n: number; centesimi: number }>();
  let righe = 0;
  let scartateFuoriAnno = 0;
  try {
    let beneficiario: string | null = null;
    let parti: string[] = [];
    let ultimo: "thead" | "ben" | "row" | "cont" | "altro" | null = null;
    let theadVisto = false;
    for (const inflato of contentStreamInflati(pdf)) {
      for (const { testi, x, riga } of righeDaCelle(celleDaContentStream(inflato))) {
        if (!riga) continue;
        if (testi.length >= 4 && testi[0].startsWith("Data erogazione")) {
          parti = [];
          ultimo = "thead";
          theadVisto = true;
          continue;
        }
        const parsed = parseRigaErogazione(riga, testi.length);
        if (parsed) {
          if (parsed.anno < ANNO_MIN_FINANZIAMENTI || parsed.anno > ANNO_MAX_FINANZIAMENTI) {
            scartateFuoriAnno += 1;
            ultimo = "row";
            continue;
          }
          if (beneficiario !== null) {
            const chiave = `${beneficiario}|||${parsed.anno}`;
            const prev = coppie.get(chiave);
            if (prev) {
              prev.n += 1;
              prev.centesimi += parsed.centesimi;
            } else {
              coppie.set(chiave, {
                beneficiario,
                anno: parsed.anno,
                n: 1,
                centesimi: parsed.centesimi,
              });
            }
            righe += 1;
          }
          ultimo = "row";
          continue;
        }
        if (theadVisto && isIntestazioneBeneficiario(testi, x, riga)) {
          const t = riga.trim();
          if (ultimo === "ben") {
            if (parti[parti.length - 1] !== t) parti.push(t);
          } else {
            parti = [t];
          }
          beneficiario = parti.join(" ");
          ultimo = "ben";
          continue;
        }
        if (RE_PIE_PAGINA.test(riga.trim())) {
          ultimo = "altro";
          continue;
        }
        if (ultimo === "row") ultimo = "cont";
      }
    }
  } catch {
    // mai throw: ritorna gli aggregati parziali (il chiamante richiede >0)
  }
  return { coppie, righe, scartateFuoriAnno };
}

// ------------------------------------------------------------------ merge

export interface VoceUnita {
  readonly beneficiario: string;
  readonly anno: number;
  readonly n: number;
  readonly centesimi: number;
  readonly indiceFile: number;
}

/**
 * Unisce gli aggregati dei file in voci (beneficiario, anno): la fonte e'
 * il file con piu' righe per la coppia (parita' -> piu' recente).
 * Ordinamento top: totale desc, beneficiario asc, anno asc. Mai throw.
 */
export function unisciEOrdinaFinanziamenti(
  perFile: readonly AggregatiFile[],
  max: number,
): VoceUnita[] {
  try {
    const unite = new Map<string, VoceUnita>();
    perFile.forEach((file, indiceFile) => {
      for (const coppia of file.coppie.values()) {
        const chiave = `${coppia.beneficiario}|||${coppia.anno}`;
        const prev = unite.get(chiave);
        if (prev) {
          const n = prev.n + coppia.n;
          const centesimi = prev.centesimi + coppia.centesimi;
          // file con piu' righe per la coppia (parita' -> piu' recente)
          let indice = prev.indiceFile;
          const nPrevFile = perFile[prev.indiceFile]?.coppie.get(chiave)?.n ?? 0;
          if (coppia.n > nPrevFile || (coppia.n === nPrevFile && indiceFile > prev.indiceFile)) {
            indice = indiceFile;
          }
          unite.set(chiave, {
            beneficiario: coppia.beneficiario,
            anno: coppia.anno,
            n,
            centesimi,
            indiceFile: indice,
          });
        } else {
          unite.set(chiave, {
            beneficiario: coppia.beneficiario,
            anno: coppia.anno,
            n: coppia.n,
            centesimi: coppia.centesimi,
            indiceFile,
          });
        }
      }
    });
    const limite = Number.isFinite(max) ? Math.min(50, Math.max(1, Math.floor(max))) : 50;
    return [...unite.values()]
      .sort(
        (a, b) =>
          b.centesimi - a.centesimi ||
          a.beneficiario.localeCompare(b.beneficiario, "it") ||
          a.anno - b.anno,
      )
      .slice(0, limite);
  } catch {
    return [];
  }
}

/**
 * Normalizza un header HTTP Last-Modified in ISO 8601 (stesso istante).
 * Header assente o non datato -> errore (mai inventare date). Mai throw
 * oltre l'errore esplicito.
 */
export function lastModifiedIso(header: string, url: string): string {
  const grezzo = (header ?? "").trim();
  if (!grezzo) throw new Error(`PDF senza header Last-Modified: ${url}`);
  const t = Date.parse(grezzo);
  if (!Number.isFinite(t)) throw new Error(`PDF con Last-Modified non datato: ${url}`);
  return new Date(t).toISOString();
}

// -------------------------------------------------------------------- main

function argomenti(): { aiuto: boolean; max: number } {
  let aiuto = false;
  let max = 50;
  for (const arg of process.argv.slice(2)) {
    if (arg === "--help" || arg === "-h") aiuto = true;
    else if (arg.startsWith("--max=")) {
      const n = Number.parseInt(arg.slice("--max=".length), 10);
      if (Number.isFinite(n)) max = Math.min(50, Math.max(1, Math.floor(n)));
    }
  }
  return { aiuto, max };
}

async function main(): Promise<void> {
  const { aiuto, max } = argomenti();
  if (aiuto) {
    console.log(
      "Uso: npx tsx scripts/ingest-reale-finanziamenti.ts [--max=50]\n" +
        "Ingerisce le erogazioni ai partiti 2024-2026 da parlamento18.camera.it/199\n" +
        "(1 GET indice + 3 GET PDF transienti, solo aggregati beneficiario×anno,\n" +
        "zero nominativi eroganti, top-50 per totale). Fallimento -> exit 1\n" +
        "senza file parziali.",
    );
    return;
  }
  const recuperatoIl = new Date().toISOString();
  // 1) Indice: link PDF reali (mai inventati).
  const { corpo: indiceHtml } = await scaricaFinanziamenti(INDICE_URL, TIMEOUT_INDICE_MS);
  if (indiceHtml.length > MAX_PDF_BYTE) throw new Error("indice oltre il cap di 8MB");
  const hrefs = estraiHrefPdfFinanziamenti(indiceHtml.toString("latin1"), INDICE_URL);
  const perPeriodo = selezionaPdfPerPeriodo(hrefs);
  // 2) PDF transienti (mai salvati): HEAD reale via header GET + parse.
  const urls = PERIODI_ATTESI.map((p) => perPeriodo.get(p) as string);
  const scaricati: Array<{ url: string; lastModified: string; aggregati: AggregatiFile }> = [];
  for (const url of urls) {
    const { corpo, lastModified } = await scaricaFinanziamenti(url, TIMEOUT_PDF_MS);
    if (corpo.length > MAX_PDF_BYTE) {
      throw new Error(`PDF oltre il cap di 8MB: ${url}`);
    }
    if (!lastModified) throw new Error(`PDF senza header Last-Modified: ${url}`);
    const lastModifiedIsoStr = lastModifiedIso(lastModified, url);
    const aggregati = aggregaPdfFinanziamenti(corpo);
    if (aggregati.righe === 0 || aggregati.coppie.size === 0) {
      throw new Error(`PDF senza righe utilizzabili: ${url}`);
    }
    scaricati.push({ url, lastModified: lastModifiedIsoStr, aggregati });
  }
  // 3) Merge + top-max (deterministico, documentato).
  const voci = unisciEOrdinaFinanziamenti(
    scaricati.map((s) => s.aggregati),
    max,
  );
  if (voci.length === 0) throw new Error("nessuna coppia (beneficiario, anno) utilizzabile");
  const erogazioni: ErogazioneAggregata[] = voci.map((v) => ({
    beneficiario: v.beneficiario,
    anno: v.anno,
    n_erogazioni: v.n,
    totale_euro: Math.round(v.centesimi) / 100,
    fonte_pdf: scaricati[v.indiceFile].url,
    lastModified: scaricati[v.indiceFile].lastModified,
  }));
  const json =
    `${JSON.stringify(
      {
        provenance: {
          fonte: FONTE,
          url: INDICE_URL,
          recuperatoIl,
          licenza: LICENZA,
          hub: HUB_URL,
          relazioni: RELAZIONI_URL,
        },
        erogazioni,
      },
      null,
      2,
    )}\n`;
  if (Buffer.byteLength(json, "utf8") > MAX_JSON_BYTE) {
    throw new Error("envelope oltre 1MB");
  }
  // 4) Scrittura solo dopo che tutte le fonti hanno prodotto payload validi.
  mkdirSync(DIR_REALI, { recursive: true });
  writeFileSync(FILE_OUT, json, "utf8");
  const righeTotali = scaricati.reduce((acc, s) => acc + s.aggregati.righe, 0);
  const scartate = scaricati.reduce((acc, s) => acc + s.aggregati.scartateFuoriAnno, 0);
  console.log(
    `Finanziamenti 2024-2026: ${righeTotali} righe in ${voci.length} coppie pubblicate (top-${max}, ${scartate} righe fuori anni 2024-2026 scartate). File scritto: ${FILE_OUT}.`,
  );
}

const eseguitoDiretto =
  typeof process !== "undefined" &&
  typeof process.argv?.[1] === "string" &&
  process.argv[1].endsWith("ingest-reale-finanziamenti.ts");

if (eseguitoDiretto) {
  main().catch((errore: unknown) => {
    const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
    console.error(`Ingest finanziamenti fallito, nessun file scritto: ${messaggio}`);
    process.exit(1);
  });
}
