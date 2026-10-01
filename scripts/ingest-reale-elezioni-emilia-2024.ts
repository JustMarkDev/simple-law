/**
 * Ingest reale elezioni regionali Emilia-Romagna 2024 (aggregati
 * DAIT/Eligendo, scrittore diretto, mai rete nei test).
 *
 * Sorgente (Ministero Interno DAIT — Eligendo Open Data, `;` quotato latin1):
 * ZIP `https://dait.interno.gov.it/documenti/opendata/regionali/regionali-20241117.zip`,
 * voce `Regionali_EmiliaRomagna_2024_Scrutini.csv` (20 colonne, righe a
 * livello candidato×sezione: NUM_CANDIDATO/COGNOME/NOME MAI letti).
 *
 * Aggregazione onesta: elettori/votanti/bianche/nulle/contestate sommati
 * UNA volta per sezione (dedup per comune+sezione); voti sommati per lista.
 * Solo aggregati, zero nominativi.
 *
 * Output: `data/reali/elezioni-regionali-2024-emilia-romagna.json`
 * (envelope + elezione + liste + regioni[1] + comuni, cap 950KB).
 * Exit 1 senza parziali se zero righe aggregate o file oltre il cap.
 *
 * Uso:
 *   tsx scripts/ingest-reale-elezioni-emilia-2024.ts [--limite-righe N] [--csv PATH] [--help]
 */

import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";

const DIR_REALI = resolve(dirname(new URL(import.meta.url).pathname), "..", "data", "reali");
const FILE_OUT = resolve(DIR_REALI, "elezioni-regionali-2024-emilia-romagna.json");
const URL_ZIP = "https://dait.interno.gov.it/documenti/opendata/regionali/regionali-20241117.zip";
const VOCE_ZIP = "Regionali_EmiliaRomagna_2024_Scrutini.csv";
const ZIP_LOCALE = "/tmp/elezioni/regional-probe/regionali-20241117.zip";
const DATA_ISO = "2024-11-17";
const TIPO = "regionali";
const REGIONE = "EMILIA-ROMAGNA";

const FONTE = "Ministero Interno DAIT — Eligendo Open Data";
const LICENZA = "open-data ministeriale da confermare, info_opendata senza stringa CC-BY";
const METODOLOGIA =
  "streaming ';' quotato latin1, e/v/bianche/nulle/contestate sommati 1x per sezione " +
  "(dedup comune+sezione), voti sommati per lista; affluenza a 1 decimale. " +
  "Colonne candidato (13-16) MAI lette: zero nominativi.";
const AVVERTENZE =
  "Solo aggregati: affluenza e voti per lista a livello regionale e affluenza " +
  "per comune. I seggi non sono presenti nel file ministeriale e non vengono mostrati.";

const MAX_BYTE_OUT = 950 * 1024;
const MAX_BYTE_DOWNLOAD_ZIP = 30 * 1024 * 1024;
const TIMEOUT_MS = 120_000;
const PAUSA_RETE_MS = 2000;

const HEADER = [
  "REGIONE",
  "CIRCOSCRIZIONE",
  "COMUNE",
  "SEZIONE",
  "ELETTORI_UOMINI",
  "ELETTORI_DONNE",
  "ELETTORI_TOTALI",
  "VOTANTI_UOMINI",
  "VOTANTI_DONNE",
  "VOTANTI_TOTALI",
  "SCHEDE_NULLE",
  "SCHEDE_BIANCHE",
  "SCHEDE_CONTESTATE",
  "NUM_CANDIDATO",
  "COGNOME_CANDIDATO",
  "NOME_CANDIDATO",
  "VOTI_CANDIDATO",
  "NUM_LISTA",
  "LISTA",
  "VOTI_LISTA",
] as const;

/* ------------------------------------------------------------------ */
/* Helper puri (mai rete).                                             */
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

export function isHeader(campi: readonly string[]): boolean {
  return campi.length === HEADER.length && HEADER.every((atteso, i) => campi[i] === atteso);
}

export interface RigaEmilia {
  circoscrizione: string;
  comune: string;
  sezione: string;
  elettori: number;
  votanti: number;
  bianche: number;
  nulle: number;
  contestate: number;
  lista: string;
  votiLista: number;
}

/**
 * Parser puro di una riga (header escluso). Legge SOLO gli indici whitelist
 * 0,1,2,3,4,5,6,7,8,9,10,11,12,18,19; MAI gli indici candidato 13-16 ne'
 * NUM_LISTA (17). Lancia se malformata, null se fuori REGIONE (mai qui).
 */
export function parseRiga(campi: readonly string[], numeroRiga: number): RigaEmilia | null {
  if (campi.length !== HEADER.length) {
    throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 20`);
  }
  const regione = (campi[0] ?? "").trim();
  if (regione !== REGIONE) return null;
  const circoscrizione = (campi[1] ?? "").trim();
  const comune = (campi[2] ?? "").trim();
  const sezione = (campi[3] ?? "").trim();
  const elettoriTot = interoNonNegativo(campi[6] ?? "");
  const votantiTot = interoNonNegativo(campi[9] ?? "");
  const nulle = interoNonNegativo(campi[10] ?? "");
  const bianche = interoNonNegativo(campi[11] ?? "");
  const contestate = interoNonNegativo(campi[12] ?? "");
  const lista = normalizzaLista(campi[18] ?? "");
  const votiLista = interoNonNegativo(campi[19] ?? "");
  if (
    elettoriTot === null ||
    votantiTot === null ||
    nulle === null ||
    bianche === null ||
    contestate === null ||
    votiLista === null
  ) {
    throw new Error(`riga ${numeroRiga}: numerico non valido`);
  }
  if (!circoscrizione || !comune || !sezione) {
    throw new Error(`riga ${numeroRiga}: campo testuale vuoto`);
  }
  if (!lista) {
    if (votiLista !== 0) {
      throw new Error(`riga ${numeroRiga}: lista vuota con voti non nulli`);
    }
    return {
      circoscrizione,
      comune,
      sezione,
      elettori: elettoriTot,
      votanti: votantiTot,
      bianche,
      nulle,
      contestate,
      lista: "",
      votiLista: 0,
    };
  }
  return {
    circoscrizione,
    comune,
    sezione,
    elettori: elettoriTot,
    votanti: votantiTot,
    bianche,
    nulle,
    contestate,
    lista,
    votiLista,
  };
}

/* ------------------------------------------------------------------ */
/* Rete e orchestrazione bounded.                                      */
/* ------------------------------------------------------------------ */

function dormi(ms: number): Promise<void> {
  return new Promise((resolveAttesa) => setTimeout(resolveAttesa, ms));
}

function aiuto(): string {
  return [
    "Ingest reale elezioni regionali Emilia-Romagna 2024 (aggregati DAIT/Eligendo).",
    "",
    "Uso:",
    "  tsx scripts/ingest-reale-elezioni-emilia-2024.ts [--limite-righe N] [--csv PATH] [--help]",
    "",
    "Opzioni:",
    "  --limite-righe N   smoke test: legge solo le prime N righe dati,",
    "                     stampa le statistiche e NON scrive il file JSON.",
    "  --csv PATH         usa un CSV locale invece dello ZIP (verifica header).",
    "  --help             mostra questo aiuto.",
    "",
    `Sorgente: voce ${VOCE_ZIP} dello ZIP DAIT (o copia in ${ZIP_LOCALE} se presente).`,
    `Output: data/reali/elezioni-regionali-2024-emilia-romagna.json (cap ${MAX_BYTE_OUT} byte).`,
    "Solo aggregati per lista, zero nominativi: colonne candidato mai lette.",
  ].join("\n");
}

function argomento(nome: string, argv: string[]): string | undefined {
  const prefisso = `--${nome}=`;
  const trovato = argv.find((arg) => arg.startsWith(prefisso));
  return trovato ? trovato.slice(prefisso.length).trim() || undefined : undefined;
}

async function scaricaZip(destinazione: string): Promise<void> {
  await dormi(PAUSA_RETE_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const risposta = await fetch(URL_ZIP, { signal: controller.signal, redirect: "follow" });
    if (!risposta.ok || !risposta.body) throw new Error(`download HTTP ${risposta.status}`);
    const dichiarato = Number.parseInt(risposta.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(dichiarato) && dichiarato > MAX_BYTE_DOWNLOAD_ZIP) {
      throw new Error(`download dichiarato oltre il cap di ${MAX_BYTE_DOWNLOAD_ZIP} byte`);
    }
    const { createWriteStream } = await import("node:fs");
    const { pipeline } = await import("node:stream/promises");
    const { Readable } = await import("node:stream");
    await pipeline(Readable.fromWeb(risposta.body as never), createWriteStream(destinazione));
    const { stat, unlink } = await import("node:fs/promises");
    const info = await stat(destinazione);
    if (info.size > MAX_BYTE_DOWNLOAD_ZIP) {
      await unlink(destinazione).catch(() => undefined);
      throw new Error(`download oltre il cap di ${MAX_BYTE_DOWNLOAD_ZIP} byte`);
    }
  } finally {
    clearTimeout(timer);
  }
}

interface StatoEmilia {
  e: number;
  v: number;
  b: number;
  k: number;
  votiListe: number;
  liste: Map<string, number>;
  comuni: Map<string, { c: string; p: string; r: string; e: number; v: number }>;
  sezioniViste: Set<string>;
  righeLette: number;
  righeAggregate: number;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    console.log(aiuto());
    return;
  }
  const limiteArg = argomento("limite-righe", argv);
  const limiteRighe = limiteArg ? Number.parseInt(limiteArg, 10) : null;
  if (limiteArg && (!Number.isFinite(limiteRighe!) || limiteRighe! <= 0)) {
    console.error("--limite-righe non valido");
    process.exit(2);
  }
  const csvOverride = argomento("csv", argv);

  let csvPercorso: string;
  const urlProvenance = URL_ZIP;
  const scaricati: string[] = [];
  try {
    if (csvOverride && existsSync(csvOverride)) {
      csvPercorso = csvOverride;
    } else if (existsSync(ZIP_LOCALE)) {
      const { tmpdir } = await import("node:os");
      const dest = join(tmpdir(), `emilia-2024-scrutini-${Date.now()}.csv`);
      const figlio = spawnSync("unzip", ["-p", ZIP_LOCALE, VOCE_ZIP], {
        maxBuffer: 128 * 1024 * 1024,
      });
      if (figlio.status !== 0) throw new Error("estrazione voce ZIP fallita");
      writeFileSync(dest, figlio.stdout);
      scaricati.push(dest);
      csvPercorso = dest;
    } else {
      const { tmpdir } = await import("node:os");
      const zipTmp = join(tmpdir(), `emilia-2024-${Date.now()}.zip`);
      await scaricaZip(zipTmp);
      scaricati.push(zipTmp);
      const dest = join(tmpdir(), `emilia-2024-scrutini-${Date.now()}.csv`);
      const figlio = spawnSync("unzip", ["-p", zipTmp, VOCE_ZIP], { maxBuffer: 128 * 1024 * 1024 });
      if (figlio.status !== 0) throw new Error("estrazione voce ZIP fallita");
      writeFileSync(dest, figlio.stdout);
      scaricati.push(dest);
      csvPercorso = dest;
    }

    const stato: StatoEmilia = {
      e: 0,
      v: 0,
      b: 0,
      k: 0,
      votiListe: 0,
      liste: new Map(),
      comuni: new Map(),
      sezioniViste: new Set(),
      righeLette: 0,
      righeAggregate: 0,
    };
    const flusso = createReadStream(csvPercorso, { encoding: "latin1" });
    const righe = createInterface({ input: flusso, crlfDelay: Infinity });
    let numeroRiga = 0;
    let headerVerificato = false;
    let lette = 0;
    for await (const riga of righe) {
      if (riga.trim() === "") continue;
      numeroRiga += 1;
      const campi = spezzaRiga(riga);
      if (!headerVerificato) {
        if (campi.length !== HEADER.length || !HEADER.every((h, i) => campi[i] === h)) {
          throw new Error(`header inatteso (riga 1): ${campi.length} colonne`);
        }
        headerVerificato = true;
        continue;
      }
      if (limiteRighe !== null && lette >= limiteRighe) break;
      if (campi.length !== HEADER.length) {
        throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 20`);
      }
      lette += 1;
      stato.righeLette += 1;
      const parsed = parseRiga(campi, numeroRiga);
      if (!parsed) continue;
      stato.righeAggregate += 1;
      // e/v/b/nulle/contestate UNA volta per sezione.
      const chiaveSezione = `${parsed.comune}||${parsed.sezione}`;
      if (!stato.sezioniViste.has(chiaveSezione)) {
        stato.sezioniViste.add(chiaveSezione);
        stato.e += parsed.elettori;
        stato.v += parsed.votanti;
        stato.b += parsed.bianche;
        stato.k += parsed.nulle + parsed.contestate;
      }
      if (parsed.lista) {
        stato.liste.set(parsed.lista, (stato.liste.get(parsed.lista) ?? 0) + parsed.votiLista);
        stato.votiListe += parsed.votiLista;
      }
      const chiaveComune = parsed.comune;
      let com = stato.comuni.get(chiaveComune);
      if (!com) {
        com = { c: parsed.comune, p: parsed.circoscrizione, r: REGIONE_NOME, e: 0, v: 0 };
        stato.comuni.set(chiaveComune, com);
      }
      if (!stato.sezioniViste.has(`somma:${chiaveSezione}`)) {
        stato.sezioniViste.add(`somma:${chiaveSezione}`);
        com.e += parsed.elettori;
        com.v += parsed.votanti;
      }
    }
    if (!headerVerificato) throw new Error("CSV vuoto o senza header");
    for (const tmp of scaricati) {
      try {
        const { unlink } = await import("node:fs/promises");
        await unlink(tmp);
      } catch {
        // best-effort
      }
    }

    console.log(
      `[ingest-emilia-2024] righe lette=${stato.righeLette} aggregate=${stato.righeAggregate} ` +
        `comuni=${stato.comuni.size} liste=${stato.liste.size} e=${stato.e} v=${stato.v}`,
    );
    if (limiteRighe !== null) {
      console.log("[ingest-emilia-2024] smoke --limite-righe: file JSON non scritto.");
      return;
    }
    if (stato.righeAggregate === 0) throw new Error("nessuna riga aggregata");

    const liste = [...stato.liste.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([n, v]) => ({
        n,
        v,
        p: stato.votiListe > 0 ? unaDecimale((v / stato.votiListe) * 100) : 0,
      }));
    const comuni = [...stato.comuni.values()]
      .sort((a, b) => a.c.localeCompare(b.c, "it"))
      .map((c) => ({ ...c, a: affluenza(c.v, c.e) }));
    const envelope = {
      provenance: {
        fonte: FONTE,
        url: urlProvenance,
        recuperatoIl: new Date().toISOString().slice(0, 10),
        licenza: LICENZA,
      },
      elezione: {
        tipo: TIPO,
        data: DATA_ISO,
        e: stato.e,
        v: stato.v,
        b: stato.b,
        k: stato.k,
        a: affluenza(stato.v, stato.e),
      },
      liste,
      regioni: [
        {
          r: REGIONE_NOME,
          e: stato.e,
          v: stato.v,
          b: stato.b,
          k: stato.k,
          a: affluenza(stato.v, stato.e),
          liste,
        },
      ],
      comuni,
      metodologia: METODOLOGIA,
      avvertenze: AVVERTENZE,
    };
    const json = `${JSON.stringify(envelope)}\n`;
    const byte = Buffer.byteLength(json, "utf8");
    console.log(`[ingest-emilia-2024] output ${byte} byte (cap ${MAX_BYTE_OUT} byte).`);
    if (byte > MAX_BYTE_OUT) {
      throw new Error(`output ${byte} byte oltre il cap di ${MAX_BYTE_OUT}: nessun file scritto`);
    }
    mkdirSync(DIR_REALI, { recursive: true });
    writeFileSync(FILE_OUT, json, "utf8");
    console.log(
      `[ingest-emilia-2024] scritto data/reali/elezioni-regionali-2024-emilia-romagna.json (${byte} byte).`,
    );
  } finally {
    for (const tmp of scaricati) {
      try {
        const { unlink } = await import("node:fs/promises");
        await unlink(tmp);
      } catch {
        // best-effort
      }
    }
  }
}

const REGIONE_NOME = "EMILIA-ROMAGNA";

const eseguitoDiretto =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("ingest-reale-elezioni-emilia-2024.ts");
if (eseguitoDiretto) {
  main().catch((errore: unknown) => {
    const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
    console.error(`Ingest Emilia-Romagna 2024 fallito, nessun file scritto: ${messaggio}`);
    process.exit(1);
  });
}
