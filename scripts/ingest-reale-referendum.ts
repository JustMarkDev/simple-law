/**
 * Ingest reale referendum 2025 (livello comunale, SOLO aggregati SI/NO).
 *
 * Sorgente: ZIP DAIT/Eligendo
 * `https://dait.interno.gov.it/documenti/opendata/referendum/referendum-20250608.zip`
 * (redirect 301 da `elezionistorico.interno.gov.it`, 20.677.784 B), file
 * `OPENDATA_LivComune.xlsx` (2.663.093 B, `Foglio1`, 39.481 righe, 13 colonne).
 * Se l'XLSX e' presente in `/tmp/elezioni/` viene usato quello (offline
 * deterministico); altrimenti estrazione dallo ZIP locale o un solo download
 * con cap byte, timeout e disciplina 1 richiesta / 2s.
 *
 * Parser XLSX nuovo (mai CSV `;` riusato): `xl/sharedStrings.xml` intero
 * (216KB) + `xl/worksheets/sheet1.xml` in streaming via `unzip -p`
 * (20MB, mai caricato intero in memoria). Filtro `DATAELEZIONE=45816`
 * (=2025-06-08, unico valore numerico Excel). `no=VOTIVALIDI-VOTIVALIDI_SI`
 * derivato. MAI nominativi: il tracciato non li contiene e il parser non
 * legge altre chiavi.
 *
 * Output: `data/reali/referendum-2025.json` (SOLO aggregati: nazionale +
 * 5 quesiti + regioni con per-quesito SI/NO + comuni con sola affluenza
 * massima tra i quesiti, mai per-quesito comunale). Ogni numero e' somma
 * del parser, mai calcolato a mano. Cap hard <=950KB: oltre, exit 1 senza
 * parziali (nessun file scritto).
 *
 * Uso: `tsx scripts/ingest-reale-referendum.ts [--limite-righe N] [--xlsx PATH] [--help]`
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { stat, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const URL_ZIP_FINALE =
  "https://dait.interno.gov.it/documenti/opendata/referendum/referendum-20250608.zip";
export const NOME_XLSX = "OPENDATA_LivComune.xlsx";
export const XLSX_LOCALE = "/tmp/elezioni/OPENDATA_LivComune.xlsx";
export const XLSX_LOCALE_ALT = "/tmp/elezioni/ref-tmp/OPENDATA_LivComune.xlsx";
export const ZIP_LOCALE = "/tmp/elezioni/referendum-20250608.zip";
export const FONTE = "Ministero Interno DAIT — Eligendo Open Data";
export const LICENZA =
  "open-data ministeriale da confermare, info_opendata senza stringa CC-BY";
export const METODOLOGIA =
  "streaming XLSX (sharedStrings + sheet1.xml via unzip -p), filtro DATAELEZIONE=45816 (=2025-06-08), " +
  "no=validi-si, p_si 1 decimale; e 1x/comune, v=max votanti tra i 5 quesiti per comune, a 1 decimale";
export const AVVERTENZE =
  "Solo aggregati SI/NO per quesito. Comuni con sola affluenza massima, mai per-quesito comunale. " +
  "Votanti differiscono tra quesiti (schede separate). Solo Italia (estero in file separato). Seggi assenti.";
export const TIPO = "referendum";
export const DATA_ISO = "2025-06-08";
/** Valore numerico Excel di 2025-06-08 (unico valore in colonna A). */
export const DATA_TARGET_XLSX = "45816";

export const HEADER_ATTESO = [
  "DATAELEZIONE",
  "NUMQUESITO",
  "QUESITOREFERENDUM",
  "ELETTORITOT",
  "ELETTORIM",
  "VOTANTITOT",
  "VOTANTIM",
  "SKBIANCHE",
  "VOTIVALIDI",
  "VOTIVALIDI_SI",
  "REGIONE",
  "PROVINCIA",
  "COMUNE",
] as const;

export const MAX_BYTE_OUT = 950 * 1024;
export const MAX_BYTE_DOWNLOAD = 30 * 1024 * 1024;
export const TIMEOUT_MS = 120_000;
export const PAUSA_RETE_MS = 2000;

const DIR_REALI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "reali");
const FILE_OUT = resolve(DIR_REALI, "referendum-2025.json");

/* ------------------------------------------------------------------ */
/* Helper puri (esportati per i test, mai rete).                        */
/* ------------------------------------------------------------------ */

export function interoNonNegativo(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

export function unaDecimale(percentuale: number): number {
  return Math.round(percentuale * 10) / 10;
}

export function affluenza(v: number, e: number): number {
  if (e <= 0) return 0;
  return unaDecimale((v / e) * 100);
}

/** True se la cella DATAELEZIONE e' il valore target (filtro file cumulativi). */
export function isDataTarget(raw: string): boolean {
  return raw.trim() === DATA_TARGET_XLSX;
}

/** Normalizza quesito: id 1..5 + titolo verbatim trimmato (max 300 ch). */
export function normalizzaQuesito(
  numRaw: string,
  titoloRaw: string,
): { id: number; titolo: string } | null {
  const id = interoNonNegativo(numRaw);
  const titolo = titoloRaw.trim().replace(/\s+/g, " ").slice(0, 300);
  if (id === null || id < 1 || id > 5 || !titolo) return null;
  return { id, titolo };
}

/** Deriva no + quota SI (no=validi-si, p_si a 1 decimale). Null se incoerente. */
export function quotaSi(
  siRaw: string,
  validiRaw: string,
): { si: number; no: number; validi: number; p_si: number } | null {
  const si = interoNonNegativo(siRaw);
  const validi = interoNonNegativo(validiRaw);
  if (si === null || validi === null || si > validi) return null;
  const no = validi - si;
  const p_si = validi > 0 ? unaDecimale((si / validi) * 100) : 0;
  return { si, no, validi, p_si };
}

export interface RigaReferendum {
  q: number;
  titolo: string;
  elettori: number;
  votanti: number;
  bianche: number;
  validi: number;
  si: number;
  no: number;
  regione: string;
  provincia: string;
  comune: string;
}

export function isHeaderReferendum(campi: readonly string[]): boolean {
  return (
    campi.length === HEADER_ATTESO.length &&
    HEADER_ATTESO.every((atteso, i) => campi[i] === atteso)
  );
}

/**
 * Parser puro di una riga dati (13 celle stringa gia' risolte).
 * Ritorna null se riga non target (DATAELEZIONE diverso); lancia se
 * malformata. Non legge MAI colonne nominativo (il tracciato non ne ha).
 */
export function parseRigaReferendum(
  campi: readonly string[],
  numeroRiga: number,
): RigaReferendum | null {
  if (campi.length !== HEADER_ATTESO.length) {
    throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 13`);
  }
  const [dataRaw, numRaw, titoloRaw, elettoriRaw, , votantiRaw, , biancheRaw, validiRaw, siRaw, regioneRaw, provinciaRaw, comuneRaw] =
    campi as unknown as string[];
  if (!isDataTarget(dataRaw ?? "")) return null;
  const quesito = normalizzaQuesito(numRaw ?? "", titoloRaw ?? "");
  const elettori = interoNonNegativo(elettoriRaw ?? "");
  const votanti = interoNonNegativo(votantiRaw ?? "");
  const bianche = interoNonNegativo(biancheRaw ?? "");
  const quota = quotaSi(siRaw ?? "", validiRaw ?? "");
  const regione = (regioneRaw ?? "").trim();
  const provincia = (provinciaRaw ?? "").trim();
  const comune = (comuneRaw ?? "").trim();
  if (!quesito) throw new Error(`riga ${numeroRiga}: quesito non valido`);
  if (elettori === null || votanti === null || bianche === null || !quota) {
    throw new Error(`riga ${numeroRiga}: numerico non valido`);
  }
  if (!regione || !provincia || !comune) {
    throw new Error(`riga ${numeroRiga}: campo testuale vuoto`);
  }
  return {
    q: quesito.id,
    titolo: quesito.titolo,
    elettori,
    votanti,
    bianche,
    validi: quota.validi,
    si: quota.si,
    no: quota.no,
    regione,
    provincia,
    comune,
  };
}

/* ------------------------------------------------------------------ */
/* XLSX: sharedStrings + streaming sheet1.xml (mai DOM intero).         */
/* ------------------------------------------------------------------ */

function decodificaEntitaXml(testo: string): string {
  return testo
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Legge sharedStrings via `unzip -p` (file piccolo, ~216KB). */
export function caricaSharedStrings(xlsx: string): string[] {
  const esito = spawnSync("unzip", ["-p", xlsx, "xl/sharedStrings.xml"], {
    encoding: "utf-8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (esito.status !== 0) throw new Error("sharedStrings.xml non leggibile");
  const xml = String(esito.stdout ?? "");
  const out: string[] = [];
  const reSi = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = reSi.exec(xml)) !== null) {
    const dentro = m[1] ?? "";
    const reT = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let testo = "";
    let t: RegExpExecArray | null;
    while ((t = reT.exec(dentro)) !== null) testo += t[1] ?? "";
    out.push(decodificaEntitaXml(testo));
  }
  return out;
}

const LETTERA_COLONNA: Record<string, number> = {
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12,
};

/** Risolve le celle di un XML `<row>` in 13 stringhe (sparse -> ""). */
export function celleRiga(rowXml: string, condivise: readonly string[]): string[] {
  const celle: string[] = new Array(13).fill("");
  const reC = /<c r="([A-M])\d+"([^>]*)>(?:<v>([\s\S]*?)<\/v>)?/g;
  let m: RegExpExecArray | null;
  while ((m = reC.exec(rowXml)) !== null) {
    const lettera = m[1] ?? "";
    const attr = m[2] ?? "";
    const valore = m[3] ?? "";
    const idx = LETTERA_COLONNA[lettera];
    if (idx === undefined) continue;
    if (attr.includes('t="s"')) {
      const si = Number(valore);
      celle[idx] = Number.isSafeInteger(si) && si >= 0 && si < condivise.length
        ? (condivise[si] ?? "")
        : "";
    } else {
      celle[idx] = decodificaEntitaXml(valore.trim());
    }
  }
  return celle;
}

export interface EsitoParse {
  righeLette: number;
  righeAggregate: number;
  righeScartateData: number;
  titoli: Map<number, string>;
  perQuesito: Map<number, { si: number; validi: number; bianche: number }>;
  perRegioneQ: Map<string, Map<number, { si: number; no: number }>>;
  comuni: Map<string, { c: string; p: string; r: string; e: number; vMax: number; bAlMax: number }>;
  elettoriUnici: number;
}

function nuovoEsito(): EsitoParse {
  return {
    righeLette: 0,
    righeAggregate: 0,
    righeScartateData: 0,
    titoli: new Map(),
    perQuesito: new Map(),
    perRegioneQ: new Map(),
    comuni: new Map(),
    elettoriUnici: 0,
  };
}

function applicaRiga(esito: EsitoParse, riga: RigaReferendum): void {
  esito.righeAggregate += 1;
  if (!esito.titoli.has(riga.q)) esito.titoli.set(riga.q, riga.titolo);
  let q = esito.perQuesito.get(riga.q);
  if (!q) {
    q = { si: 0, validi: 0, bianche: 0 };
    esito.perQuesito.set(riga.q, q);
  }
  q.si += riga.si;
  q.validi += riga.validi;
  q.bianche += riga.bianche;
  let reg = esito.perRegioneQ.get(riga.regione);
  if (!reg) {
    reg = new Map();
    esito.perRegioneQ.set(riga.regione, reg);
  }
  let rq = reg.get(riga.q);
  if (!rq) {
    rq = { si: 0, no: 0 };
    reg.set(riga.q, rq);
  }
  rq.si += riga.si;
  rq.no += riga.no;
  const chiave = `${riga.regione}||${riga.provincia}||${riga.comune}`;
  let com = esito.comuni.get(chiave);
  if (!com) {
    com = { c: riga.comune, p: riga.provincia, r: riga.regione, e: riga.elettori, vMax: riga.votanti, bAlMax: riga.bianche };
    esito.comuni.set(chiave, com);
    esito.elettoriUnici += riga.elettori;
  } else if (riga.votanti > com.vMax) {
    com.vMax = riga.votanti;
    com.bAlMax = riga.bianche;
  }
}

/** Streaming di sheet1.xml via `unzip -p` con estrazione incrementale `<row>`. */
export async function parseXlsx(
  xlsx: string,
  limiteRighe: number | null,
  esito: EsitoParse = nuovoEsito(),
): Promise<EsitoParse> {
  const condivise = caricaSharedStrings(xlsx);
  if (condivise.length === 0) throw new Error("sharedStrings vuote");
  const figlio = spawn("unzip", ["-p", xlsx, "xl/worksheets/sheet1.xml"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  let residuo = "";
  let numeroRiga = 0;
  let headerVerificato = false;
  const accoda = (pezzo: string): void => {
    residuo += pezzo;
  };
  await new Promise<void>((risolvi, rigetta) => {
    if (!figlio.stdout) {
      rigetta(new Error("stream sheet1.xml non disponibile"));
      return;
    }
    figlio.stdout.setEncoding("utf-8");
    figlio.stdout.on("data", (pezzo: string) => {
      try {
        accoda(pezzo);
        for (;;) {
          const inizio = residuo.indexOf("<row");
          if (inizio === -1) {
            if (residuo.length > 64 * 1024) residuo = residuo.slice(-1024);
            break;
          }
          const fine = residuo.indexOf("</row>", inizio);
          if (fine === -1) {
            if (inizio > 0) residuo = residuo.slice(inizio);
            break;
          }
          const rowXml = residuo.slice(inizio, fine + "</row>".length);
          residuo = residuo.slice(fine + "</row>".length);
          if (limiteRighe !== null && esito.righeLette >= limiteRighe && headerVerificato) continue;
          numeroRiga += 1;
          const celle = celleRiga(rowXml, condivise);
          if (!headerVerificato) {
            if (!isHeaderReferendum(celle)) {
              throw new Error(`header inatteso (riga 1): ${celle.join("|").slice(0, 120)}`);
            }
            headerVerificato = true;
            continue;
          }
          esito.righeLette += 1;
          const parsed = parseRigaReferendum(celle, numeroRiga);
          if (!parsed) {
            esito.righeScartateData += 1;
            continue;
          }
          applicaRiga(esito, parsed);
        }
      } catch (errore) {
        try {
          figlio.kill();
        } catch {
          // gia' terminato
        }
        rigetta(errore);
      }
    });
    figlio.stdout.on("end", () => risolvi());
    figlio.stdout.on("error", (e: unknown) => rigetta(e));
    figlio.on("error", (e: unknown) => rigetta(e));
    figlio.on("close", (codice: number | null) => {
      if (codice !== 0 && codice !== null) rigetta(new Error(`unzip -p uscito con codice ${codice}`));
      else risolvi();
    });
  });
  if (!headerVerificato) throw new Error("XLSX vuoto o senza header");
  if (esito.righeAggregate === 0) throw new Error("nessuna riga con DATAELEZIONE=45816");
  return esito;
}

/* ------------------------------------------------------------------ */
/* Rete e orchestrazione (pattern europee-2024).                        */
/* ------------------------------------------------------------------ */

function dormi(ms: number): Promise<void> {
  return new Promise((risolvi) => setTimeout(risolvi, ms));
}

function aiuto(): string {
  return [
    "Ingest reale referendum 2025 (aggregati SI/NO DAIT/Eligendo).",
    "",
    "Uso:",
    "  tsx scripts/ingest-reale-referendum.ts [--limite-righe N] [--xlsx PATH] [--help]",
    "",
    "Opzioni:",
    "  --limite-righe N   smoke test: legge solo le prime N righe dati,",
    "                     stampa le statistiche e NON scrive il file JSON.",
    "  --xlsx PATH        usa un XLSX locale invece dei percorsi /tmp/elezioni.",
    "  --help             mostra questo aiuto.",
    "",
    `Sorgente: ${XLSX_LOCALE} o ${XLSX_LOCALE_ALT} se presenti, altrimenti ZIP ${ZIP_LOCALE} o download di ${URL_ZIP_FINALE}.`,
    `Output: data/reali/referendum-2025.json (cap ${MAX_BYTE_OUT} byte).`,
  ].join("\n");
}

interface Opzioni {
  limiteRighe: number | null;
  xlsx: string | null;
}

export function parseArgomenti(argv: string[]): Opzioni | "help" | null {
  let limiteRighe: number | null = null;
  let xlsx: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--help" || arg === "-h") return "help";
    if (arg === "--limite-righe") {
      const raw = argv[i + 1] ?? "";
      i += 1;
      if (!/^\d+$/.test(raw) || Number(raw) < 1) {
        console.error("--limite-righe richiede un intero >= 1");
        return null;
      }
      limiteRighe = Number(raw);
      continue;
    }
    if (arg.startsWith("--limite-righe=")) {
      const raw = arg.slice("--limite-righe=".length);
      if (!/^\d+$/.test(raw) || Number(raw) < 1) {
        console.error("--limite-righe richiede un intero >= 1");
        return null;
      }
      limiteRighe = Number(raw);
      continue;
    }
    if (arg === "--xlsx") {
      const raw = argv[i + 1] ?? "";
      i += 1;
      if (!raw) {
        console.error("--xlsx richiede un percorso");
        return null;
      }
      xlsx = raw;
      continue;
    }
    if (arg.startsWith("--xlsx=")) {
      xlsx = arg.slice("--xlsx=".length);
      if (!xlsx) {
        console.error("--xlsx richiede un percorso");
        return null;
      }
      continue;
    }
    console.error(`Argomento sconosciuto: ${arg}`);
    return null;
  }
  return { limiteRighe, xlsx };
}

async function scaricaZip(destinazione: string): Promise<string> {
  await dormi(PAUSA_RETE_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const risposta = await fetch(URL_ZIP_FINALE, { signal: controller.signal, redirect: "follow" });
    if (!risposta.ok || !risposta.body) throw new Error(`download HTTP ${risposta.status}`);
    const dichiarato = Number.parseInt(risposta.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(dichiarato) && dichiarato > MAX_BYTE_DOWNLOAD) {
      throw new Error(`download dichiarato oltre il cap di ${MAX_BYTE_DOWNLOAD} byte`);
    }
    const finale = risposta.url.startsWith("http") ? risposta.url : URL_ZIP_FINALE;
    let scaricati = 0;
    const guardiano = new Transform({
      transform(pezzo: Buffer, _codifica, ok) {
        scaricati += pezzo.length;
        if (scaricati > MAX_BYTE_DOWNLOAD) {
          ok(new Error(`download oltre il cap di ${MAX_BYTE_DOWNLOAD} byte`));
          return;
        }
        ok(null, pezzo);
      },
    });
    try {
      await pipeline(Readable.fromWeb(risposta.body as never), guardiano, createWriteStream(destinazione));
    } catch (errore) {
      try {
        await unlink(destinazione);
      } catch {
        // parziale gia' rimosso
      }
      throw errore;
    }
    const info = await stat(destinazione);
    if (info.size > MAX_BYTE_DOWNLOAD) {
      await unlink(destinazione);
      throw new Error(`download oltre il cap di ${MAX_BYTE_DOWNLOAD} byte`);
    }
    return finale;
  } finally {
    clearTimeout(timer);
  }
}

function estraiXlsx(zip: string, destinazione: string): void {
  const esito = spawnSync("unzip", ["-o", "-j", zip, NOME_XLSX, "-d", dirname(destinazione)], {
    encoding: "utf-8",
  });
  if (esito.status !== 0) throw new Error("estrazione XLSX dallo ZIP fallita");
  const estratto = resolve(dirname(destinazione), NOME_XLSX);
  if (estratto !== destinazione && existsSync(estratto)) {
    const mv = spawnSync("mv", [estratto, destinazione]);
    if (mv.status !== 0) throw new Error("spostamento XLSX estratto fallito");
  }
  if (!existsSync(destinazione)) throw new Error("XLSX estratto non trovato");
}

async function risolviXlsx(xlsxOverride: string | null, scaricati: string[]): Promise<{ xlsx: string; urlProvenance: string }> {
  if (xlsxOverride && existsSync(xlsxOverride)) return { xlsx: xlsxOverride, urlProvenance: URL_ZIP_FINALE };
  if (existsSync(XLSX_LOCALE)) return { xlsx: XLSX_LOCALE, urlProvenance: URL_ZIP_FINALE };
  if (existsSync(XLSX_LOCALE_ALT)) return { xlsx: XLSX_LOCALE_ALT, urlProvenance: URL_ZIP_FINALE };
  if (existsSync(ZIP_LOCALE)) {
    // estrai in tmpdir poi usa il percorso atteso
    const tmpDir = resolve(tmpdir(), `ref-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    estraiXlsx(ZIP_LOCALE, resolve(tmpDir, NOME_XLSX));
    scaricati.push(resolve(tmpDir, NOME_XLSX));
    return { xlsx: resolve(tmpDir, NOME_XLSX), urlProvenance: URL_ZIP_FINALE };
  }
  const zipTmp = resolve(tmpdir(), `referendum-20250608-${Date.now()}.zip`);
  const finale = await scaricaZip(zipTmp);
  scaricati.push(zipTmp);
  const tmpDir = resolve(tmpdir(), `ref-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  estraiXlsx(zipTmp, resolve(tmpDir, NOME_XLSX));
  scaricati.push(resolve(tmpDir, NOME_XLSX));
  return { xlsx: resolve(tmpDir, NOME_XLSX), urlProvenance: finale };
}

async function main(): Promise<void> {
  const opzioni = parseArgomenti(process.argv.slice(2));
  if (opzioni === "help") {
    console.log(aiuto());
    return;
  }
  if (opzioni === null) process.exit(2);
  const scaricati: string[] = [];
  const rimuoviTmp = async (): Promise<void> => {
    for (const f of scaricati) {
      try {
        await unlink(f);
      } catch {
        // best-effort
      }
    }
  };
  const { xlsx, urlProvenance } = await risolviXlsx(opzioni.xlsx, scaricati);
  const recuperatoIl = new Date().toISOString().slice(0, 10);
  let esito: EsitoParse;
  try {
    esito = await parseXlsx(xlsx, opzioni.limiteRighe);
  } finally {
    await rimuoviTmp();
  }
  const quesitiOrdinati = [...esito.perQuesito.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([q, agg]) => {
      const no = agg.validi - agg.si;
      return {
        q,
        titolo: esito.titoli.get(q) ?? `Quesito ${q}`,
        si: agg.si,
        no,
        validi: agg.validi,
        bianche: agg.bianche,
        p_si: agg.validi > 0 ? unaDecimale((agg.si / agg.validi) * 100) : 0,
      };
    });
  const topQ = quesitiOrdinati.map((q) => `q${q.q}:si=${q.si},no=${q.no}`).join(" ");
  console.log(
    `[ingest-referendum-2025] righe lette=${esito.righeLette} aggregate=${esito.righeAggregate} ` +
      `scartate-data=${esito.righeScartateData} comuni=${esito.comuni.size} ` +
      `quesiti=${quesitiOrdinati.length} e=${esito.elettoriUnici} ${topQ}`,
  );
  if (opzioni.limiteRighe !== null) {
    console.log("[ingest-referendum-2025] smoke --limite-righe: file JSON non scritto.");
    return;
  }
  if (quesitiOrdinati.length === 0) throw new Error("nessun quesito aggregato");
  // Regioni: e/v da max-per-comune + per-quesito si/no.
  const perRegioneBase = new Map<string, { e: number; v: number }>();
  for (const com of esito.comuni.values()) {
    let b = perRegioneBase.get(com.r);
    if (!b) {
      b = { e: 0, v: 0 };
      perRegioneBase.set(com.r, b);
    }
    b.e += com.e;
    b.v += com.vMax;
  }
  const regioni = [...perRegioneBase.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "it"))
    .map(([r, base]) => ({
      r,
      e: base.e,
      v: base.v,
      a: affluenza(base.v, base.e),
      quesiti: [1, 2, 3, 4, 5]
        .map((q) => {
          const rq = esito.perRegioneQ.get(r)?.get(q);
          if (!rq) return null;
          return { q, si: rq.si, no: rq.no };
        })
        .filter((x): x is { q: number; si: number; no: number } => x !== null),
    }));
  const vTot = [...esito.comuni.values()].reduce((s, c) => s + c.vMax, 0);
  const bTot = [...esito.comuni.values()].reduce((s, c) => s + c.bAlMax, 0);
  const comuni = [...esito.comuni.values()]
    .sort((a, b) => a.r.localeCompare(b.r, "it") || a.p.localeCompare(b.p, "it") || a.c.localeCompare(b.c, "it"))
    .map((c) => ({ c: c.c, p: c.p, r: c.r, e: c.e, v: c.vMax, a: affluenza(c.vMax, c.e) }));
  const envelope = {
    provenance: { fonte: FONTE, url: urlProvenance, recuperatoIl, licenza: LICENZA },
    elezione: {
      tipo: TIPO,
      data: DATA_ISO,
      e: esito.elettoriUnici,
      v: vTot,
      b: bTot,
      a: affluenza(vTot, esito.elettoriUnici),
    },
    quesiti: quesitiOrdinati,
    regioni,
    comuni,
    metodologia: METODOLOGIA,
    avvertenze: AVVERTENZE,
  };
  const json = `${JSON.stringify(envelope)}\n`;
  const byte = Buffer.byteLength(json, "utf8");
  console.log(`[ingest-referendum-2025] output ${byte} byte (cap ${MAX_BYTE_OUT}).`);
  if (byte > MAX_BYTE_OUT) {
    throw new Error(`output ${byte} byte oltre il cap di ${MAX_BYTE_OUT}: nessun file scritto`);
  }
  mkdirSync(DIR_REALI, { recursive: true });
  writeFileSync(FILE_OUT, json, "utf8");
  console.log(`[ingest-referendum-2025] scritto data/reali/referendum-2025.json (${byte} byte).`);
}

const eseguitoDiretto =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("ingest-reale-referendum.ts");
if (eseguitoDiretto) {
  main().catch((errore: unknown) => {
    const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
    console.error(`Ingest referendum-2025 fallito, nessun file scritto: ${messaggio}`);
    process.exit(1);
  });
}
