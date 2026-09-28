/**
 * Ingest reale elezioni europee 2024 (livello comunale, aggregati).
 *
 * Sorgente: CSV DAIT/Eligendo
 * `https://dait.interno.gov.it/documenti/opendata/catalogoagid/europee-2024-italia-livcomune.csv`
 * (redirect 301 da `elezionistorico.interno.gov.it`, formato `;` quotato,
 * 15 colonne, date `d/m/yyyy`). Se il file e' presente in
 * `/tmp/elezioni/europee-2024-italia-livcomune.csv` viene usato quello
 * (offline deterministico); altrimenti un solo download con cap byte,
 * timeout e disciplina 1 richiesta / 2s.
 *
 * Output: `data/reali/elezioni-europee-2024.json` (SOLO aggregati:
 * nazionale + per-lista + per-regione + comuni con sola affluenza,
 * mai righe candidato/nominativi). Ogni numero e' somma del parser,
 * mai calcolato a mano. Cap hard <=950KB: oltre, exit 1 senza parziali
 * (nessun file scritto).
 *
 * Uso: `tsx scripts/ingest-reale-elezioni-europee-2024.ts [--limite-righe N] [--help]`
 */

import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { stat, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const URL_FINALE =
  "https://dait.interno.gov.it/documenti/opendata/catalogoagid/europee-2024-italia-livcomune.csv";
const CSV_LOCALE = "/tmp/elezioni/europee-2024-italia-livcomune.csv";
const FONTE = "Ministero Interno DAIT \u2014 Eligendo Open Data";
const LICENZA =
  "open-data ministeriale da confermare, info_opendata senza stringa CC-BY";
const METODOLOGIA =
  "streaming ';' quotato, filtro DATA_ELEZIONE=9/6/2024, e/v/b/k presi 1x/comune, liste sommate; a/p 1 decimale";
const AVVERTENZE =
  "Solo aggregati. Seggi assenti nel file. RV/SVP/DSP/Animalista solo locali.";
const TIPO = "europee";
const DATA_ISO = "2024-06-09";

const HEADER_ATTESO = [
  "DATA_ELEZIONE",
  "DESCCIRCEUROPEA",
  "DESCREGIONE",
  "DESCPROVINCIA",
  "DESCCOMUNE",
  "ELETTORI",
  "ELETTORI_M",
  "ELETTORI_F",
  "VOTANTI",
  "VOTANTI_M",
  "VOTANTI_F",
  "NUMSCHEDEBIANCHE",
  "NUMSCHEDECONTESTAT",
  "DESCLISTA",
  "NUMVOTI",
] as const;

const MAX_BYTE_OUT = 950 * 1024;
const MAX_BYTE_DOWNLOAD = 25 * 1024 * 1024;
const TIMEOUT_MS = 60_000;
const PAUSA_RETE_MS = 2000;

const DIR_REALI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "reali");
const FILE_OUT = resolve(DIR_REALI, "elezioni-europee-2024.json");

const DATA_RE = /^9\/6\/2024\b/;

interface AggComune {
  c: string;
  p: string;
  r: string;
  e: number;
  v: number;
  b: number;
  k: number;
}

interface AggRegione {
  e: number;
  v: number;
  b: number;
  k: number;
  liste: Map<string, number>;
}

/** Split su `;` con state-machine sulle virgolette (mai split(";") naive). */
function spezzaRiga(riga: string): string[] {
  const campi: string[] = [];
  let campo = "";
  let inVirgolette = false;
  for (let i = 0; i < riga.length; i += 1) {
    const ch = riga[i];
    if (ch === '"') {
      if (inVirgolette && riga[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else {
        inVirgolette = !inVirgolette;
      }
    } else if (ch === ";" && !inVirgolette) {
      campi.push(campo);
      campo = "";
    } else {
      campo += ch;
    }
  }
  campi.push(campo);
  return campi;
}

function normalizzaLista(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}

function interoNonNegativo(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

function unaDecimale(percentuale: number): number {
  return Math.round(percentuale * 10) / 10;
}

function affluenza(v: number, e: number): number {
  if (e <= 0) return 0;
  return unaDecimale((v / e) * 100);
}

function dormi(ms: number): Promise<void> {
  return new Promise((resolveAttesa) => setTimeout(resolveAttesa, ms));
}

function aiuto(): string {
  return [
    "Ingest reale elezioni europee 2024 (aggregati comunali DAIT/Eligendo).",
    "",
    "Uso:",
    "  tsx scripts/ingest-reale-elezioni-europee-2024.ts [--limite-righe N] [--help]",
    "",
    "Opzioni:",
    "  --limite-righe N   smoke test: legge solo le prime N righe dati,",
    "                     stampa le statistiche e NON scrive il file JSON.",
    "  --help             mostra questo aiuto.",
    "",
    `Sorgente: ${CSV_LOCALE} se presente, altrimenti download di ${URL_FINALE}.`,
    `Output: data/reali/elezioni-europee-2024.json (cap ${MAX_BYTE_OUT} byte).`,
  ].join("\n");
}

interface Opzioni {
  limiteRighe: number | null;
}

/** Ritorna null se gli argomenti non sono validi (con messaggio su stderr). */
function parseArgomenti(argv: string[]): Opzioni | "help" | null {
  let limiteRighe: number | null = null;
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
    console.error(`Argomento sconosciuto: ${arg}`);
    return null;
  }
  return { limiteRighe };
}

async function scaricaCsv(destinazione: string): Promise<string> {
  await dormi(PAUSA_RETE_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const risposta = await fetch(URL_FINALE, {
      signal: controller.signal,
      redirect: "follow",
    });
    if (!risposta.ok || !risposta.body) {
      throw new Error(`download HTTP ${risposta.status}`);
    }
    // Fail-fast su content-length dichiarato oltre il cap.
    const dichiarato = Number.parseInt(risposta.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(dichiarato) && dichiarato > MAX_BYTE_DOWNLOAD) {
      throw new Error(`download dichiarato oltre il cap di ${MAX_BYTE_DOWNLOAD} byte`);
    }
    const finale = risposta.url.startsWith("http") ? risposta.url : URL_FINALE;
    // Cap applicato DURANTE lo streaming: abortisce oltre soglia.
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
      await pipeline(
        Readable.fromWeb(risposta.body as never),
        guardiano,
        createWriteStream(destinazione),
      );
    } catch (errore) {
      try {
        await unlink(destinazione);
      } catch {
        // file parziale gia rimosso o mai creato
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

interface EsitoParse {
  righeLette: number;
  righeAggregate: number;
  righeScartateData: number;
  comuni: Map<string, AggComune>;
  regioni: Map<string, AggRegione>;
  liste: Map<string, number>;
  votiListe: number;
  e: number;
  v: number;
  b: number;
  k: number;
}

async function parseCsv(percorso: string, limiteRighe: number | null): Promise<EsitoParse> {
  const esito: EsitoParse = {
    righeLette: 0,
    righeAggregate: 0,
    righeScartateData: 0,
    comuni: new Map(),
    regioni: new Map(),
    liste: new Map(),
    votiListe: 0,
    e: 0,
    v: 0,
    b: 0,
    k: 0,
  };
  // Il CSV DAIT e' Latin-1 (es. VALDÔTAIN=0xD4, SÜDTIROLER=0xDC): decodifica latin1.
  const flusso = createReadStream(percorso, { encoding: "latin1" });
  const righe = createInterface({ input: flusso, crlfDelay: Infinity });
  let numeroRiga = 0;
  let headerVerificato = false;

  for await (const riga of righe) {
    if (riga.trim() === "") continue;
    numeroRiga += 1;
    const campi = spezzaRiga(riga);
    if (!headerVerificato) {
      if (
        campi.length !== HEADER_ATTESO.length ||
        !HEADER_ATTESO.every((atteso, i) => campi[i] === atteso)
      ) {
        throw new Error(`header inatteso (riga 1): ${campi.length} colonne`);
      }
      headerVerificato = true;
      continue;
    }
    if (limiteRighe !== null && esito.righeLette >= limiteRighe) break;
    if (campi.length !== HEADER_ATTESO.length) {
      throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 15`);
    }
    esito.righeLette += 1;
    const dataElezione = (campi[0] ?? "").trim();
    if (!DATA_RE.test(dataElezione)) {
      esito.righeScartateData += 1;
      continue;
    }
    const regione = (campi[2] ?? "").trim();
    const provincia = (campi[3] ?? "").trim();
    const comune = (campi[4] ?? "").trim();
    const elettori = interoNonNegativo(campi[5] ?? "");
    const votanti = interoNonNegativo(campi[8] ?? "");
    const bianche = interoNonNegativo(campi[11] ?? "");
    const contestate = interoNonNegativo(campi[12] ?? "");
    const lista = normalizzaLista(campi[13] ?? "");
    const voti = interoNonNegativo(campi[14] ?? "");
    if (elettori === null || votanti === null || bianche === null || contestate === null || voti === null) {
      throw new Error(`riga ${numeroRiga}: numerico non valido`);
    }
    if (!regione || !provincia || !comune || !lista) {
      throw new Error(`riga ${numeroRiga}: campo testuale vuoto`);
    }
    esito.righeAggregate += 1;
    esito.votiListe += voti;
    esito.liste.set(lista, (esito.liste.get(lista) ?? 0) + voti);

    // e/v/b/k presi 1 sola volta per comune (prima riga vista).
    const chiave = `${regione} ${provincia} ${comune}`;
    let agg = esito.comuni.get(chiave);
    if (!agg) {
      agg = { c: comune, p: provincia, r: regione, e: elettori, v: votanti, b: bianche, k: contestate };
      esito.comuni.set(chiave, agg);
      esito.e += elettori;
      esito.v += votanti;
      esito.b += bianche;
      esito.k += contestate;
      let reg = esito.regioni.get(regione);
      if (!reg) {
        reg = { e: 0, v: 0, b: 0, k: 0, liste: new Map() };
        esito.regioni.set(regione, reg);
      }
      reg.e += elettori;
      reg.v += votanti;
      reg.b += bianche;
      reg.k += contestate;
    }
    const reg = esito.regioni.get(regione);
    if (!reg) throw new Error(`riga ${numeroRiga}: regione non registrata`);
    reg.liste.set(lista, (reg.liste.get(lista) ?? 0) + voti);
  }

  if (!headerVerificato) throw new Error("CSV vuoto o senza header");
  if (esito.righeAggregate === 0) throw new Error("nessuna riga con DATA_ELEZIONE=9/6/2024");
  return esito;
}

async function main(): Promise<void> {
  const opzioni = parseArgomenti(process.argv.slice(2));
  if (opzioni === "help") {
    console.log(aiuto());
    return;
  }
  if (opzioni === null) process.exit(2);

  let sorgente = CSV_LOCALE;
  let urlProvenance = URL_FINALE;
  let scaricatoTmp: string | null = null;
  if (!existsSync(CSV_LOCALE)) {
    scaricatoTmp = join(tmpdir(), `europee-2024-livcomune-${Date.now()}.csv`);
    urlProvenance = await scaricaCsv(scaricatoTmp);
    sorgente = scaricatoTmp;
  }

  // Il tmp scaricato va rimosso in ogni caso (successo o errore).
  const rimuoviTmp = async (): Promise<void> => {
    if (!scaricatoTmp) return;
    try {
      await unlink(scaricatoTmp);
    } catch {
      // file gia assente: niente da fare
    }
  };

  const recuperatoIl = new Date().toISOString().slice(0, 10);
  let esito;
  try {
    esito = await parseCsv(sorgente, opzioni.limiteRighe);
  } finally {
    await rimuoviTmp();
  }

  const top = [...esito.liste.entries()].sort((a, b) => b[1] - a[1]);
  const top3 = top
    .slice(0, 3)
    .map(([n, voti]) => `${n}=${voti}`)
    .join(", ");
  console.log(
    `[ingest-europee-2024] righe lette=${esito.righeLette} aggregate=${esito.righeAggregate} ` +
      `scartate-data=${esito.righeScartateData} comuni=${esito.comuni.size} ` +
      `regioni=${esito.regioni.size} liste=${esito.liste.size} e=${esito.e} v=${esito.v} ` +
      `top3: ${top3}`,
  );

  if (opzioni.limiteRighe !== null) {
    console.log("[ingest-europee-2024] smoke --limite-righe: file JSON non scritto.");
    return;
  }

  const listeOrdinate = top.map(([n, voti]) => ({
    n,
    v: voti,
    p: esito.votiListe > 0 ? unaDecimale((voti / esito.votiListe) * 100) : 0,
  }));
  const regioni = [...esito.regioni.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "it"))
    .map(([r, agg]) => {
      const totReg = [...agg.liste.values()].reduce((s, x) => s + x, 0);
      return {
        r,
        e: agg.e,
        v: agg.v,
        b: agg.b,
        k: agg.k,
        a: affluenza(agg.v, agg.e),
        liste: [...agg.liste.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([n, voti]) => ({
            n,
            v: voti,
            p: totReg > 0 ? unaDecimale((voti / totReg) * 100) : 0,
          })),
      };
    });

  const comuni = [...esito.comuni.values()]
    .sort(
      (a, b) =>
        a.r.localeCompare(b.r, "it") || a.p.localeCompare(b.p, "it") || a.c.localeCompare(b.c, "it"),
    )
    .map((c) => ({ c: c.c, p: c.p, r: c.r, e: c.e, v: c.v, a: affluenza(c.v, c.e) }));

  const envelope = {
    provenance: { fonte: FONTE, url: urlProvenance, recuperatoIl, licenza: LICENZA },
    elezione: {
      tipo: TIPO,
      data: DATA_ISO,
      e: esito.e,
      v: esito.v,
      b: esito.b,
      k: esito.k,
      a: affluenza(esito.v, esito.e),
    },
    liste: listeOrdinate,
    regioni,
    comuni,
    metodologia: METODOLOGIA,
    avvertenze: AVVERTENZE,
  };

  const json = `${JSON.stringify(envelope)}\n`;
  const byte = Buffer.byteLength(json, "utf8");
  console.log(`[ingest-europee-2024] output ${byte} byte (cap ${MAX_BYTE_OUT}).`);
  if (byte > MAX_BYTE_OUT) {
    throw new Error(`output ${byte} byte oltre il cap di ${MAX_BYTE_OUT}: nessun file scritto`);
  }
  mkdirSync(DIR_REALI, { recursive: true });
  writeFileSync(FILE_OUT, json, "utf8");
  console.log(`[ingest-europee-2024] scritto data/reali/elezioni-europee-2024.json (${byte} byte).`);
}

main().catch((errore: unknown) => {
  const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
  console.error(`Ingest europee-2024 fallito, nessun file scritto: ${messaggio}`);
  process.exit(1);
});
