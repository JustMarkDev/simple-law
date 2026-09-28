/**
 * Ingest reale elezioni politiche 2022 (Camera + Senato, solo aggregati).
 *
 * Sorgenti (Ministero Interno DAIT — Eligendo Open Data, `;` quotato):
 * - Camera Italia:  `.../catalogoagid/camera-2022-Italia-livcomune.csv`
 * - Camera VdA:     `.../catalogoagid/Camera_VAosta_LivComune.csv`
 * - Senato Italia:  `.../catalogoagid/senato-2022-italia-livcomune.csv`
 * - Senato VdA+TAA: `.../catalogoagid/Senato_VAosta&Trentino_LivComune.csv`
 * Se i 4 file sono presenti in `/tmp/elezioni/` vengono usati quelli
 * (offline deterministico); altrimenti un download per file mancante con
 * cap byte, timeout e disciplina 1 richiesta / 2s.
 *
 * Differenze rispetto alle europee 2024 (stesso scheletro di ingest,
 * riuso ~70%): header 19 colonne (non 15), due schede C/S in file
 * separati, SOLO `SKBIANCHE` (nessuna colonna contestate), solo totali
 * (colonne M ignorate), colonne nominativo 14-18 MAI lette, 12 comuni
 * divisi in piu' collegi U con elettori distinti per porzione (es. ROMA
 * 7 porzioni: sommati per (comune,collegioU), NON 1x/nome), file di merge
 * VdA/Trentino in formato candidati 12 colonne (solo TOTVOTI per
 * contrassegno, senza affluenza).
 *
 * Output: `data/reali/elezioni-politiche-2022-camera.json` +
 * `data/reali/elezioni-politiche-2022-senato.json` (SOLO aggregati:
 * nazionale + liste + circoscrizioni con per-lista + collegi U +
 * comuni con sola affluenza della rispettiva scheda, MAI nominativi). Ogni numero
 * e' somma del parser, mai calcolato a mano. Cap hard <=950KB: oltre,
 * exit 1 senza parziali (nessun file scritto).
 *
 * Uso: `tsx scripts/ingest-reale-elezioni-politiche-2022.ts [--limite-righe N] [--help]`
 */

import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { stat, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const BASE_CATALOGO = "https://dait.interno.gov.it/documenti/opendata/catalogoagid";
const URL_CAMERA_ITALIA = `${BASE_CATALOGO}/camera-2022-Italia-livcomune.csv`;
const URL_CAMERA_VDA = `${BASE_CATALOGO}/Camera_VAosta_LivComune.csv`;
const URL_SENATO_ITALIA = `${BASE_CATALOGO}/senato-2022-italia-livcomune.csv`;
const URL_SENATO_MERGE = `${BASE_CATALOGO}/Senato_VAosta&Trentino_LivComune.csv`;

const CSV_CAMERA_ITALIA = "/tmp/elezioni/camera-2022-Italia-livcomune.csv";
const CSV_CAMERA_VDA = "/tmp/elezioni/Camera_VAosta_LivComune.csv";
const CSV_SENATO_ITALIA = "/tmp/elezioni/senato-2022-italia-livcomune.csv";
const CSV_SENATO_MERGE = "/tmp/elezioni/Senato_VAosta_Trentino_LivComune.csv";

const FONTE = "Ministero Interno DAIT — Eligendo Open Data";
const LICENZA = "open-data ministeriale da confermare, info_opendata senza stringa CC-BY";
const METODOLOGIA =
  "streaming ';' quotato latin1; filtro DATAELEZIONE=25/9/2022 + CODTIPOELEZIONE C/S; " +
  "file Italia 19 col: e/v/b 1x/(comune,collegioU), VOTILISTA 1x/(comune,collegioU,lista), " +
  "solo SKBIANCHE, solo totali (M ignorati), nominativi mai letti, p=COLLPLURI (nessuna provincia nel tracciato); " +
  "12 comuni su piu' collegi U con elettori distinti per porzione sommati (es. ROMA 7 porzioni); " +
  "merge VdA/TAA 12 col formato candidati: voti lista = somma TOTVOTI per (comune,collegio,contrassegno), " +
  "nominativi mai letti; a = v/e*100 a 1 decimale; null = dato non pubblicato nei file DAIT";
const AVVERTENZE =
  "Solo aggregati, zero nominativi. Solo voti Italia (esclusa circoscrizione Estero). " +
  "Affluenza VdA (Camera) e VdA+TAA (Senato) assente nei file DAIT: comuni/circoscrizioni marcati null, " +
  "e/v/b nazionali = soli file Italia. Schede contestate non pubblicate (solo bianche). Seggi assenti.";
const DATA_ISO = "2022-09-25";

const HEADER_ITALIA = [
  "DATAELEZIONE",
  "CODTIPOELEZIONE",
  "CIRC-REG",
  "COLLPLURI",
  "COLLUNINOM",
  "COMUNE",
  "ELETTORITOT",
  "ELETTORIM",
  "VOTANTITOT",
  "VOTANTIM",
  "SKBIANCHE",
  "VOTILISTA",
  "DESCRLISTA",
  "COGNOME",
  "NOME",
  "LUOGONASCITA",
  "DATANASCITA",
  "SESSO",
  "VOTICANDIDATO",
] as const;

const HEADER_MERGE = [
  "DATAELEZIONE",
  "CODTIPOELEZIONE",
  "REGIONE",
  "COLLEGIO",
  "COMUNE",
  "COGNOME",
  "NOME",
  "DATANASCITA",
  "LUOGONASCITA",
  "SESSO",
  "TOTVOTI",
  "CONTRASSEGNO",
] as const;

const MAX_BYTE_OUT = 950 * 1024;
const MAX_BYTE_DOWNLOAD = 30 * 1024 * 1024;
const TIMEOUT_MS = 120_000;
const PAUSA_RETE_MS = 2000;

const DIR_REALI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "reali");
const FILE_OUT_CAMERA = resolve(DIR_REALI, "elezioni-politiche-2022-camera.json");
const FILE_OUT_SENATO = resolve(DIR_REALI, "elezioni-politiche-2022-senato.json");

const DATA_RE = /^25\/9\/2022\b/;

/* ------------------------------------------------------------------ */
/* Helper puri (esportati per i test, mai rete/throw imprevisti).       */
/* ------------------------------------------------------------------ */

/** Split su `;` con state-machine sulle virgolette (mai split(";") naive). */
export function spezzaRiga(riga: string): string[] {
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

/** Normalizza etichetta lista: trim + maiuscole + spazi compattati. */
export function normalizzaLista(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}

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

export interface RigaItalia {
  circReg: string;
  pluri: string;
  uni: string;
  comune: string;
  elettori: number;
  votanti: number;
  bianche: number;
  lista: string;
  votiLista: number;
}

export interface RigaMerge {
  regione: string;
  collegio: string;
  comune: string;
  contrassegno: string;
  voti: number;
}

export function isHeaderItalia(campi: readonly string[]): boolean {
  return (
    campi.length === HEADER_ITALIA.length &&
    HEADER_ITALIA.every((atteso, i) => campi[i] === atteso)
  );
}

export function isHeaderMerge(campi: readonly string[]): boolean {
  return (
    campi.length === HEADER_MERGE.length &&
    HEADER_MERGE.every((atteso, i) => campi[i] === atteso)
  );
}

/**
 * Parser puro di una riga Italia (header escluso).
 * Ritorna null se la riga non e' target (data o tipo diversi: file
 * cumulativi); lancia su riga malformata. Non legge MAI le colonne
 * nominativo 14-18 (indici 13-17).
 */
export function parseRigaItalia(
  campi: readonly string[],
  tipoAtteso: "C" | "S",
  numeroRiga: number,
): RigaItalia | null {
  if (campi.length !== HEADER_ITALIA.length) {
    throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 19`);
  }
  const dataElezione = (campi[0] ?? "").trim();
  const tipo = (campi[1] ?? "").trim();
  if (!DATA_RE.test(dataElezione) || tipo !== tipoAtteso) return null;
  const circReg = (campi[2] ?? "").trim();
  const pluri = (campi[3] ?? "").trim();
  const uni = (campi[4] ?? "").trim();
  const comune = (campi[5] ?? "").trim();
  const elettori = interoNonNegativo(campi[6] ?? "");
  const votanti = interoNonNegativo(campi[8] ?? "");
  const bianche = interoNonNegativo(campi[10] ?? "");
  const votiLista = interoNonNegativo(campi[11] ?? "");
  const lista = normalizzaLista(campi[12] ?? "");
  if (elettori === null || votanti === null || bianche === null || votiLista === null) {
    throw new Error(`riga ${numeroRiga}: numerico non valido`);
  }
  if (!circReg || !pluri || !uni || !comune || !lista) {
    throw new Error(`riga ${numeroRiga}: campo testuale vuoto`);
  }
  return { circReg, pluri, uni, comune, elettori, votanti, bianche, lista, votiLista };
}

/**
 * Parser puro di una riga merge VdA/Trentino (formato candidati 12 col).
 * Ritorna null se non target; lancia se malformata. Non legge MAI le
 * colonne nominativo (indici 5-9).
 */
export function parseRigaMerge(
  campi: readonly string[],
  tipoAtteso: "C" | "S",
  numeroRiga: number,
): RigaMerge | null {
  if (campi.length !== HEADER_MERGE.length) {
    throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 12`);
  }
  const dataElezione = (campi[0] ?? "").trim();
  const tipo = (campi[1] ?? "").trim();
  if (!DATA_RE.test(dataElezione) || tipo !== tipoAtteso) return null;
  const regione = (campi[2] ?? "").trim();
  const collegio = (campi[3] ?? "").trim();
  const comune = (campi[4] ?? "").trim();
  const voti = interoNonNegativo(campi[10] ?? "");
  const contrassegno = normalizzaLista(campi[11] ?? "");
  if (voti === null) throw new Error(`riga ${numeroRiga}: TOTVOTI non valido`);
  if (!regione || !collegio || !comune || !contrassegno) {
    throw new Error(`riga ${numeroRiga}: campo testuale vuoto`);
  }
  return { regione, collegio, comune, contrassegno, voti };
}

/* ------------------------------------------------------------------ */
/* Rete e orchestrazione (pattern europee-2024).                        */
/* ------------------------------------------------------------------ */

function dormi(ms: number): Promise<void> {
  return new Promise((resolveAttesa) => setTimeout(resolveAttesa, ms));
}

function aiuto(): string {
  return [
    "Ingest reale elezioni politiche 2022 Camera+Senato (aggregati DAIT/Eligendo).",
    "",
    "Uso:",
    "  tsx scripts/ingest-reale-elezioni-politiche-2022.ts [--limite-righe N] [--help]",
    "",
    "Opzioni:",
    "  --limite-righe N   smoke test: legge solo le prime N righe dati per file,",
    "                     stampa le statistiche e NON scrive il file JSON.",
    "  --help             mostra questo aiuto.",
    "",
    `Sorgenti: 4 CSV DAIT (o copie in /tmp/elezioni se presenti).`,
    `Output: data/reali/elezioni-politiche-2022-camera.json + data/reali/elezioni-politiche-2022-senato.json (cap ${MAX_BYTE_OUT} byte ciascuno).`,
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

async function scaricaCsv(url: string, destinazione: string): Promise<string> {
  await dormi(PAUSA_RETE_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const risposta = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!risposta.ok || !risposta.body) {
      throw new Error(`download HTTP ${risposta.status} per ${url}`);
    }
    const dichiarato = Number.parseInt(risposta.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(dichiarato) && dichiarato > MAX_BYTE_DOWNLOAD) {
      throw new Error(`download dichiarato oltre il cap di ${MAX_BYTE_DOWNLOAD} byte`);
    }
    const finale = risposta.url.startsWith("http") ? risposta.url : url;
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

interface Porzione {
  e: number;
  v: number;
  b: number;
  pluri: string;
  circ: string;
}

interface StatoCamera {
  righeLette: number;
  righeAggregate: number;
  righeScartate: number;
  porzioni: Map<string, Porzione>;
  votiCU: Map<string, number>;
  liste: Map<string, number>;
  circE: Map<string, { e: number; v: number; b: number; liste: Map<string, number> }>;
  collU: Map<string, { e: number; v: number }>;
  e: number;
  v: number;
  b: number;
}

function nuovoStato(): StatoCamera {
  return {
    righeLette: 0,
    righeAggregate: 0,
    righeScartate: 0,
    porzioni: new Map(),
    votiCU: new Map(),
    liste: new Map(),
    circE: new Map(),
    collU: new Map(),
    e: 0,
    v: 0,
    b: 0,
  };
}

async function parseItalia(
  percorso: string,
  tipo: "C" | "S",
  stato: StatoCamera,
  limiteRighe: number | null,
): Promise<void> {
  // Il CSV DAIT e' Latin-1: decodifica latin1 (come europee-2024).
  const flusso = createReadStream(percorso, { encoding: "latin1" });
  const righe = createInterface({ input: flusso, crlfDelay: Infinity });
  let numeroRiga = 0;
  let headerVerificato = false;
  for await (const riga of righe) {
    if (riga.trim() === "") continue;
    numeroRiga += 1;
    const campi = spezzaRiga(riga);
    if (!headerVerificato) {
      if (!isHeaderItalia(campi)) {
        throw new Error(`header Italia inatteso (riga 1): ${campi.length} colonne`);
      }
      headerVerificato = true;
      continue;
    }
    if (limiteRighe !== null && stato.righeLette >= limiteRighe) break;
    if (campi.length !== HEADER_ITALIA.length) {
      throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 19`);
    }
    stato.righeLette += 1;
    const parsed = parseRigaItalia(campi, tipo, numeroRiga);
    if (!parsed) {
      stato.righeScartate += 1;
      continue;
    }
    stato.righeAggregate += 1;
    // e/v/b 1 sola volta per (comune, collegioU): le porzioni di comuni
    // divisi (es. ROMA in 7 collegi) hanno elettori distinti e si sommano.
    const chiaveCU = `${parsed.comune}||${parsed.uni}`;
    let porz = stato.porzioni.get(chiaveCU);
    if (!porz) {
      porz = {
        e: parsed.elettori,
        v: parsed.votanti,
        b: parsed.bianche,
        pluri: parsed.pluri,
        circ: parsed.circReg,
      };
      stato.porzioni.set(chiaveCU, porz);
      stato.e += parsed.elettori;
      stato.v += parsed.votanti;
      stato.b += parsed.bianche;
      let ce = stato.circE.get(parsed.circReg);
      if (!ce) {
        ce = { e: 0, v: 0, b: 0, liste: new Map() };
        stato.circE.set(parsed.circReg, ce);
      }
      ce.e += parsed.elettori;
      ce.v += parsed.votanti;
      ce.b += parsed.bianche;
      let cu = stato.collU.get(parsed.uni);
      if (!cu) {
        cu = { e: 0, v: 0 };
        stato.collU.set(parsed.uni, cu);
      }
      cu.e += parsed.elettori;
      cu.v += parsed.votanti;
    }
    // VOTILISTA 1 sola volta per (comune, collegioU, lista).
    const chiaveCUL = `${chiaveCU}||${parsed.lista}`;
    if (stato.votiCU.has(chiaveCUL)) {
      throw new Error(`riga ${numeroRiga}: duplicato (comune,collegio,lista) inatteso`);
    }
    stato.votiCU.set(chiaveCUL, parsed.votiLista);
    stato.liste.set(parsed.lista, (stato.liste.get(parsed.lista) ?? 0) + parsed.votiLista);
    const ce = stato.circE.get(parsed.circReg);
    if (!ce) throw new Error(`riga ${numeroRiga}: circoscrizione non registrata`);
    ce.liste.set(parsed.lista, (ce.liste.get(parsed.lista) ?? 0) + parsed.votiLista);
  }
  if (!headerVerificato) throw new Error("CSV vuoto o senza header");
}

async function parseMerge(
  percorso: string,
  tipo: "C" | "S",
  stato: StatoCamera,
  mergeRegioni: Map<string, { regione: string; collegio: string; comune: string }>,
  limiteRighe: number | null,
): Promise<void> {
  const flusso = createReadStream(percorso, { encoding: "latin1" });
  const righe = createInterface({ input: flusso, crlfDelay: Infinity });
  let numeroRiga = 0;
  let headerVerificato = false;
  let lette = 0;
  for await (const riga of righe) {
    if (riga.trim() === "") continue;
    numeroRiga += 1;
    const campi = spezzaRiga(riga);
    if (!headerVerificato) {
      if (!isHeaderMerge(campi)) {
        throw new Error(`header merge inatteso (riga 1): ${campi.length} colonne`);
      }
      headerVerificato = true;
      continue;
    }
    if (limiteRighe !== null && lette >= limiteRighe) break;
    if (campi.length !== HEADER_MERGE.length) {
      throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 12`);
    }
    lette += 1;
    stato.righeLette += 1;
    const parsed = parseRigaMerge(campi, tipo, numeroRiga);
    if (!parsed) {
      stato.righeScartate += 1;
      continue;
    }
    stato.righeAggregate += 1;
    // Voti lista = somma TOTVOTI per (comune, collegio, contrassegno)
    // (solo uninominali: nessun voto proporzionale separato).
    const chiave = `${parsed.comune}||${parsed.collegio}||${parsed.contrassegno}`;
    stato.votiCU.set(chiave, (stato.votiCU.get(chiave) ?? 0) + parsed.voti);
    stato.liste.set(
      parsed.contrassegno,
      (stato.liste.get(parsed.contrassegno) ?? 0) + parsed.voti,
    );
    const chiaveCirc = `EXTRA:${parsed.regione}`;
    let ce = stato.circE.get(chiaveCirc);
    if (!ce) {
      ce = { e: 0, v: 0, b: 0, liste: new Map() };
      stato.circE.set(chiaveCirc, ce);
    }
    ce.liste.set(
      parsed.contrassegno,
      (ce.liste.get(parsed.contrassegno) ?? 0) + parsed.voti,
    );
    const chiaveCom = `${parsed.comune}||${parsed.collegio}`;
    if (!mergeRegioni.has(chiaveCom)) {
      mergeRegioni.set(chiaveCom, { regione: parsed.regione, collegio: parsed.collegio, comune: parsed.comune });
    }
  }
  if (!headerVerificato) throw new Error("CSV merge vuoto o senza header");
}

interface Sorgente {
  nome: string;
  url: string;
  locale: string;
  tipo: "C" | "S";
  formato: "italia" | "merge";
}

const SORGENTI: Sorgente[] = [
  { nome: "camera-italia", url: URL_CAMERA_ITALIA, locale: CSV_CAMERA_ITALIA, tipo: "C", formato: "italia" },
  { nome: "camera-vda", url: URL_CAMERA_VDA, locale: CSV_CAMERA_VDA, tipo: "C", formato: "merge" },
  { nome: "senato-italia", url: URL_SENATO_ITALIA, locale: CSV_SENATO_ITALIA, tipo: "S", formato: "italia" },
  { nome: "senato-merge", url: URL_SENATO_MERGE, locale: CSV_SENATO_MERGE, tipo: "S", formato: "merge" },
];

async function risolviSorgente(s: Sorgente, scaricati: string[]): Promise<string> {
  if (existsSync(s.locale)) return s.locale;
  const destinazione = `${tmpdir()}/politiche-2022-${s.nome}-${Date.now()}.csv`;
  await scaricaCsv(s.url, destinazione);
  scaricati.push(destinazione);
  return destinazione;
}

interface ListaOut {
  n: string;
  v: number;
  p: number;
}

function listeOrdinate(mappa: Map<string, number>): { elenco: ListaOut[]; totale: number } {
  const totale = [...mappa.values()].reduce((s, x) => s + x, 0);
  const elenco = [...mappa.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([n, v]) => ({ n, v, p: totale > 0 ? unaDecimale((v / totale) * 100) : 0 }));
  return { elenco, totale };
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
        // file gia assente: niente da fare
      }
    }
  };

  const recuperatoIl = new Date().toISOString().slice(0, 10);
  const camera = nuovoStato();
  const senato = nuovoStato();
  const mergeRegioniCamera = new Map<string, { regione: string; collegio: string; comune: string }>();
  const mergeRegioniSenato = new Map<string, { regione: string; collegio: string; comune: string }>();
  // Regione per le circoscrizioni EXTRA (da file merge, colonna REGIONE).
  const extraRegioneCamera = new Map<string, string>();
  const extraRegioneSenato = new Map<string, string>();

  try {
    for (const s of SORGENTI) {
      const percorso = await risolviSorgente(s, scaricati);
      const stato = s.tipo === "C" ? camera : senato;
      if (s.formato === "italia") {
        await parseItalia(percorso, s.tipo, stato, opzioni.limiteRighe);
      } else {
        await parseMerge(
          percorso,
          s.tipo,
          stato,
          s.tipo === "C" ? mergeRegioniCamera : mergeRegioniSenato,
          opzioni.limiteRighe,
        );
      }
      // Memorizza REGIONE reale delle EXTRA leggendo le chiavi create.
      const mappaExtra = s.tipo === "C" ? extraRegioneCamera : extraRegioneSenato;
      for (const chiave of stato.circE.keys()) {
        if (chiave.startsWith("EXTRA:") && !mappaExtra.has(chiave)) {
          mappaExtra.set(chiave, chiave.slice("EXTRA:".length));
        }
      }
    }
  } finally {
    await rimuoviTmp();
  }

  const top = (m: Map<string, number>): string =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([n, v]) => `${n}=${v}`)
      .join(", ");
  console.log(
    `[ingest-politiche-2022] camera righe lette=${camera.righeLette} aggregate=${camera.righeAggregate} ` +
      `scartate=${camera.righeScartate} porzioni=${camera.porzioni.size} liste=${camera.liste.size} ` +
      `e=${camera.e} v=${camera.v} top3: ${top(camera.liste)}`,
  );
  console.log(
    `[ingest-politiche-2022] senato righe lette=${senato.righeLette} aggregate=${senato.righeAggregate} ` +
      `scartate=${senato.righeScartate} porzioni=${senato.porzioni.size} liste=${senato.liste.size} ` +
      `e=${senato.e} v=${senato.v} top3: ${top(senato.liste)}`,
  );

  if (opzioni.limiteRighe !== null) {
    console.log("[ingest-politiche-2022] smoke --limite-righe: file JSON non scritto.");
    return;
  }

  if (camera.righeAggregate === 0 || senato.righeAggregate === 0) {
    throw new Error("nessuna riga aggregata per una delle due schede");
  }

  const ramo = (
    stato: StatoCamera,
    id: string,
    mappaExtra: Map<string, string>,
  ): {
    elezione: Record<string, number | string>;
    liste: ListaOut[];
    circoscrizioni: Record<string, number | string | null | ListaOut[]>[];
    collegiU: Record<string, number | string>[];
  } => {
    const { elenco } = listeOrdinate(stato.liste);
    const circoscrizioni = [...stato.circE.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "it"))
      .map(([chiave, agg]) => {
        const isExtra = chiave.startsWith("EXTRA:");
        const r = isExtra ? (mappaExtra.get(chiave) ?? chiave) : chiave;
        const { elenco: listeCirc } = listeOrdinate(agg.liste);
        return {
          r,
          e: isExtra ? null : agg.e,
          v: isExtra ? null : agg.v,
          b: isExtra ? null : agg.b,
          a: isExtra || agg.e <= 0 ? null : affluenza(agg.v, agg.e),
          liste: listeCirc,
        };
      });
    const collegiU = [...stato.collU.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "it"))
      .map(([n, agg]) => ({ n, e: agg.e, v: agg.v, a: affluenza(agg.v, agg.e) }));
    return {
      elezione: {
        id,
        data: DATA_ISO,
        e: stato.e,
        v: stato.v,
        b: stato.b,
        a: affluenza(stato.v, stato.e),
      },
      liste: elenco,
      circoscrizioni,
      collegiU,
    };
  };

  const ramoCamera = ramo(camera, "politiche-2022-camera", extraRegioneCamera);
  const ramoSenato = ramo(senato, "politiche-2022-senato", extraRegioneSenato);

  // Comuni fusi: una riga per nome con affluenza Camera (ec/vc) e Senato
  // (es/vs); null dove il file DAIT non pubblica l'affluenza (VdA per la
  // Camera; VdA+TAA per il Senato). p = COLLPLURI Camera (nessuna
  // provincia nel tracciato 2022); per i 74 comuni solo-VdA, collegio e
  // regione dal file merge.
  const fusi = new Map<
    string,
    { c: string; p: string; r: string; ec: number | null; vc: number | null }
  >();
  for (const [chiave, porz] of camera.porzioni) {
    const nome = chiave.split("||")[0] ?? "";
    const esistente = fusi.get(nome);
    if (!esistente) {
      fusi.set(nome, { c: nome, p: porz.pluri, r: porz.circ, ec: porz.e, vc: porz.v });
    } else {
      esistente.ec = (esistente.ec ?? 0) + porz.e;
      esistente.vc = (esistente.vc ?? 0) + porz.v;
    }
  }
  const senatoPerComune = new Map<string, { e: number; v: number }>();
  for (const [chiave, porz] of senato.porzioni) {
    const nome = chiave.split("||")[0] ?? "";
    const esistente = senatoPerComune.get(nome);
    if (!esistente) {
      senatoPerComune.set(nome, { e: porz.e, v: porz.v });
    } else {
      esistente.e += porz.e;
      esistente.v += porz.v;
    }
  }
  // Comuni presenti solo nei merge (VdA): senza affluenza nota; regione e
  // collegio verbatim dal file merge.
  for (const { regione, collegio, comune } of mergeRegioniCamera.values()) {
    if (!fusi.has(comune)) {
      fusi.set(comune, { c: comune, p: collegio, r: regione, ec: null, vc: null });
    }
  }
  for (const { regione, collegio, comune } of mergeRegioniSenato.values()) {
    if (!fusi.has(comune)) {
      fusi.set(comune, { c: comune, p: collegio, r: regione, ec: null, vc: null });
    }
  }
  // Comuni per camera: {c,p,r,e,v,a} dai numeri Camera (ec/vc); i comuni
  // senza affluenza pubblicata (VdA, null) sono esclusi dal file servito
  // (la pagina li scarterebbe comunque: documentato in AVVERTENZE).
  const comuniCamera = [...fusi.values()]
    .sort(
      (a, b) =>
        a.r.localeCompare(b.r, "it") ||
        a.p.localeCompare(b.p, "it") ||
        a.c.localeCompare(b.c, "it"),
    )
    .flatMap((f) => {
      if (f.ec === null || f.vc === null) return [];
      return [{ c: f.c, p: f.p, r: f.r, e: f.ec, v: f.vc, a: affluenza(f.vc, f.ec) }];
    });
  // Comuni per senato: stessi nomi, numeri Senato (es/vs).
  const comuniSenato = [...fusi.values()]
    .sort(
      (a, b) =>
        a.r.localeCompare(b.r, "it") ||
        a.p.localeCompare(b.p, "it") ||
        a.c.localeCompare(b.c, "it"),
    )
    .flatMap((f) => {
      const s = senatoPerComune.get(f.c);
      if (!s) return [];
      return [{ c: f.c, p: f.p, r: f.r, e: s.e, v: s.v, a: affluenza(s.v, s.e) }];
    });

  const envelopeCamera = {
    provenance: {
      fonte: FONTE,
      url: URL_CAMERA_ITALIA,
      recuperatoIl,
      licenza: LICENZA,
    },
    metodologia: METODOLOGIA,
    avvertenze: AVVERTENZE,
    elezione: { ...(ramoCamera.elezione as Record<string, number | string>), tipo: "politiche" },
    liste: ramoCamera.liste,
    circoscrizioni: ramoCamera.circoscrizioni,
    collegiU: ramoCamera.collegiU,
    comuni: comuniCamera,
  };
  const envelopeSenato = {
    provenance: {
      fonte: FONTE,
      url: URL_SENATO_ITALIA,
      recuperatoIl,
      licenza: LICENZA,
    },
    metodologia: METODOLOGIA,
    avvertenze: AVVERTENZE,
    elezione: { ...(ramoSenato.elezione as Record<string, number | string>), tipo: "politiche" },
    liste: ramoSenato.liste,
    circoscrizioni: ramoSenato.circoscrizioni,
    collegiU: ramoSenato.collegiU,
    comuni: comuniSenato,
  };

  const scrivi = (percorso: string, envelope: unknown, etichetta: string): number => {
    const json = `${JSON.stringify(envelope)}\n`;
    const byte = Buffer.byteLength(json, "utf8");
    console.log(`[ingest-politiche-2022] output ${etichetta}: ${byte} byte (cap ${MAX_BYTE_OUT}).`);
    if (byte > MAX_BYTE_OUT) {
      throw new Error(`output ${etichetta} ${byte} byte oltre il cap di ${MAX_BYTE_OUT}: nessun file scritto`);
    }
    mkdirSync(DIR_REALI, { recursive: true });
    writeFileSync(percorso, json, "utf8");
    return byte;
  };
  const byteCamera = scrivi(FILE_OUT_CAMERA, envelopeCamera, "camera");
  const byteSenato = scrivi(FILE_OUT_SENATO, envelopeSenato, "senato");
  console.log(
    `[ingest-politiche-2022] scritti data/reali/elezioni-politiche-2022-camera.json (${byteCamera} byte) e data/reali/elezioni-politiche-2022-senato.json (${byteSenato} byte).`,
  );
}

// Esecuzione diretta via tsx; importabile dai test senza effetti (mai rete).
const eseguitoDiretto =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("ingest-reale-elezioni-politiche-2022.ts");
if (eseguitoDiretto) {
  main().catch((errore: unknown) => {
    const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
    console.error(`Ingest politiche-2022 fallito, nessun file scritto: ${messaggio}`);
    process.exit(1);
  });
}
