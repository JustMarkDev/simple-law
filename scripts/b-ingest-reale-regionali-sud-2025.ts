/**
 * Ingest reale elezioni regionali Sud 2025 — Campania/Puglia/Veneto (SOLO aggregati).
 *
 * Scrittore verticale-B (REALI-14, seconda fonte): file NUOVI con prefisso `b-`,
 * mai gli stessi nomi di A; nessuna edit a Header/sitemap/MANIFEST/README;
 * nessun altro file esistente toccato.
 *
 * Sorgente (Ministero Interno DAIT — Eligendo Open Data, `;` quotato latin1):
 * - ZIP `https://dait.interno.gov.it/documenti/opendata/regionali/regionali-20251123.zip`
 *   (verificato 2026-09-28: HTTP 200, 26.670.801 B), voce
 *   `20251123_REGIONALI_SCRUTINI.csv` (2.466.770 B, 23.062 righe incl. header,
 *   16 colonne tipo-Toscana, split per REGIONE: CAMPANIA 10.882 / VENETO 8.960 /
 *   PUGLIA 3.219 righe). Data elezione `2025-11-23` dal nome ZIP DAIT
 *   (convenzione Toscana 20251012 / Umbria 20241117).
 *
 * Riuso parser 100% (nessun nuovo parser): header verbatim + whitelist
 * `0,1,2,3,4,5,6,7,14,15` identici a Toscana 2025
 * (`REGIONE;CIRCOSCRIZIONE;COMUNE;ELETTORI;VOTANTI;BIANCHE;NULLE;CONTESTATE;`
 * `LISTA;VOTI_LISTA`); MAI letti gli indici candidato `8-12`
 * (`NUM_CANDIDATO/NOME/COGNOME/ALTRO_NOME/VOTI_CANDIDATO`) ne' `NUM_LISTA`
 * (13). 104 righe solo-presidente Campania (lista vuota + 0 voti) contano
 * solo per l'affluenza, mai per le liste (stessa regola di Liguria-extra).
 * Voci ZIP mai toccate: `*Preferenze*.csv`, `dato per sez/*`,
 * `*_CANDIDATI_*.csv`, `*_VOTANTI.csv`.
 *
 * Output (SOLO aggregati, zero nominativi): `data/reali/b-elezioni-regionali-2025-campania.json`
 * + `data/reali/b-elezioni-regionali-2025-puglia.json` +
 * `data/reali/b-elezioni-regionali-2025-veneto.json` (schema identico a
 * `elezioni-regionali-2025-toscana.json`: `provenance,elezione,liste,regioni,`
 * `comuni,metodologia,avvertenze`). Ogni numero e' somma del parser, mai
 * calcolato a mano. Cap hard <=950KB per envelope: oltre, exit 1 senza
 * parziali (nessun file scritto).
 *
 * Uso: `tsx scripts/b-ingest-reale-regionali-sud-2025.ts [--limite-righe N] [--csv PATH] [--help]`
 */

import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { spawnSync } from "node:child_process";
import { stat, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const URL_ZIP = "https://dait.interno.gov.it/documenti/opendata/regionali/regionali-20251123.zip";
const VOCE_ZIP = "20251123_REGIONALI_SCRUTINI.csv";
const ZIP_LOCALE = "/tmp/elezioni/b-sud/regionali-20251123.zip";

const FONTE = "Ministero Interno DAIT — Eligendo Open Data";
const LICENZA = "open-data ministeriale da confermare, info_opendata senza stringa CC-BY";
const TIPO = "regionali";
const DATA_ISO = "2025-11-23";
const REGIONI_ATTESE = ["CAMPANIA", "PUGLIA", "VENETO"] as const;
type RegioneAttesa = (typeof REGIONI_ATTESE)[number];

const METODOLOGIA =
  "streaming ';' quotato latin1, filtro REGIONE=CAMPANIA/PUGLIA/VENETO, e/v/bianche/nulle/contestate 1x/comune, " +
  "voti lista sommati per lista; voti candidato mai letti (scartati); " +
  "b=bianche, k=nulle+contestaste; a/p a 1 decimale";
const AVVERTENZE =
  "Solo aggregati per lista, zero nominativi (colonne candidato mai lette). Voti del presidente non " +
  "pubblicati come aggregato nel tracciato e scartati. Solo 2025-11-23 (data dal nome ZIP DAIT), " +
  "split per REGIONE dalla voce 20251123_REGIONALI_SCRUTINI.csv. Seggi assenti nel file.";

/** Header verbatim del tracciato (16 colonne, livello comunale, tipo-Toscana). */
const HEADER = [
  "REGIONE",
  "CIRCOSCRIZIONE",
  "COMUNE",
  "ELETTORI",
  "VOTANTI",
  "SCHEDE_BIANCHE",
  "SCHEDE_NULLE",
  "SCHEDE_CONTESTATE",
  "NUM_CANDIDATO",
  "NOME",
  "COGNOME",
  "ALTRO_NOME",
  "VOTI_CANDIDATO",
  "NUM_LISTA",
  "LISTA",
  "VOTI_LISTA",
] as const;

const MAX_BYTE_OUT = 950 * 1024;
const MAX_BYTE_DOWNLOAD_ZIP = 30 * 1024 * 1024;
const MAX_BYTE_CSV = 10 * 1024 * 1024;
const MAX_LISTE = 64;
const TIMEOUT_MS = 120_000;
const PAUSA_RETE_MS = 2000;
const TENTATIVI_DOWNLOAD = 2;

const DIR_REALI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "reali");
const FILE_OUT: Record<RegioneAttesa, string> = {
  CAMPANIA: resolve(DIR_REALI, "b-elezioni-regionali-2025-campania.json"),
  PUGLIA: resolve(DIR_REALI, "b-elezioni-regionali-2025-puglia.json"),
  VENETO: resolve(DIR_REALI, "b-elezioni-regionali-2025-veneto.json"),
};

/* ------------------------------------------------------------------ */
/* Helper puri (mai rete). Riuso 100% del parser Toscana/Calabria.      */
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

export interface RigaRegionale {
  regione: string;
  circoscrizione: string;
  comune: string;
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
 * 0,1,2,3,4,5,6,7,14,15; MAI gli indici candidato 8-12 ne' NUM_LISTA (13).
 * Riga solo-presidente (lista vuota + 0 voti, osservata 104x in Campania):
 * torna con lista "" per la sola affluenza (come Liguria-extra); lista vuota
 * con voti > 0 -> throw. Ritorna null se REGIONE fuori target; lancia se malformata.
 */
export function parseRiga(campi: readonly string[], numeroRiga: number): RigaRegionale | null {
  if (campi.length !== HEADER.length) {
    throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 16`);
  }
  const regione = (campi[0] ?? "").trim();
  if (regione !== "CAMPANIA" && regione !== "PUGLIA" && regione !== "VENETO") return null;
  const circoscrizione = (campi[1] ?? "").trim();
  const comune = (campi[2] ?? "").trim();
  const elettori = interoNonNegativo(campi[3] ?? "");
  const votanti = interoNonNegativo(campi[4] ?? "");
  const bianche = interoNonNegativo(campi[5] ?? "");
  const nulle = interoNonNegativo(campi[6] ?? "");
  const contestate = interoNonNegativo(campi[7] ?? "");
  const lista = normalizzaLista(campi[14] ?? "");
  const votiLista = interoNonNegativo(campi[15] ?? "");
  if (
    elettori === null ||
    votanti === null ||
    bianche === null ||
    nulle === null ||
    contestate === null ||
    votiLista === null
  ) {
    throw new Error(`riga ${numeroRiga}: numerico non valido`);
  }
  if (!circoscrizione || !comune) {
    throw new Error(`riga ${numeroRiga}: campo testuale vuoto`);
  }
  if (!lista) {
    if (votiLista !== 0) {
      throw new Error(`riga ${numeroRiga}: lista vuota con voti non nulli`);
    }
    return {
      regione,
      circoscrizione,
      comune,
      elettori,
      votanti,
      bianche,
      nulle,
      contestate,
      lista: "",
      votiLista: 0,
    };
  }
  return {
    regione,
    circoscrizione,
    comune,
    elettori,
    votanti,
    bianche,
    nulle,
    contestate,
    lista,
    votiLista,
  };
}

/* ------------------------------------------------------------------ */
/* Rete e orchestrazione bounded.                                       */
/* ------------------------------------------------------------------ */

function dormi(ms: number): Promise<void> {
  return new Promise((resolveAttesa) => setTimeout(resolveAttesa, ms));
}

function aiuto(): string {
  return [
    "Ingest reale elezioni regionali Sud 2025 Campania/Puglia/Veneto (aggregati DAIT/Eligendo, scrittore-B).",
    "",
    "Uso:",
    "  tsx scripts/b-ingest-reale-regionali-sud-2025.ts [--limite-righe N] [--csv PATH] [--help]",
    "",
    "Opzioni:",
    "  --limite-righe N   smoke test: legge solo le prime N righe dati,",
    "                     stampa le statistiche e NON scrive i file JSON.",
    "  --csv PATH         usa un CSV locale invece dello ZIP (verifica header).",
    "  --help             mostra questo aiuto.",
    "",
    `Sorgente: voce ${VOCE_ZIP} dello ZIP DAIT (o copia in ${ZIP_LOCALE} se presente).`,
    `Output: data/reali/b-elezioni-regionali-2025-{campania,puglia,veneto}.json (cap ${MAX_BYTE_OUT} byte ciascuno).`,
    "Solo aggregati per lista, zero nominativi: colonne candidato mai lette, Preferenze mai estratte.",
  ].join("\n");
}

interface Opzioni {
  limiteRighe: number | null;
  csvOverride: string | null;
}

/** Ritorna null se gli argomenti non sono validi (con messaggio su stderr). */
export function parseArgomenti(argv: string[]): Opzioni | "help" | null {
  let limiteRighe: number | null = null;
  let csvOverride: string | null = null;
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
    if (arg === "--csv") {
      const raw = argv[i + 1] ?? "";
      i += 1;
      if (!raw) {
        console.error("--csv richiede un percorso");
        return null;
      }
      csvOverride = raw;
      continue;
    }
    if (arg.startsWith("--csv=")) {
      csvOverride = arg.slice("--csv=".length);
      if (!csvOverride) {
        console.error("--csv richiede un percorso");
        return null;
      }
      continue;
    }
    console.error(`Argomento sconosciuto: ${arg}`);
    return null;
  }
  return { limiteRighe, csvOverride };
}

async function scaricaZip(url: string, destinazione: string): Promise<string> {
  let ultimoErrore: unknown = null;
  for (let tentativo = 1; tentativo <= TENTATIVI_DOWNLOAD; tentativo += 1) {
    await dormi(PAUSA_RETE_MS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const risposta = await fetch(url, { signal: controller.signal, redirect: "follow" });
      if (!risposta.ok || !risposta.body) {
        throw new Error(`download HTTP ${risposta.status} per ${url}`);
      }
      const dichiarato = Number.parseInt(risposta.headers.get("content-length") ?? "", 10);
      if (Number.isFinite(dichiarato) && dichiarato > MAX_BYTE_DOWNLOAD_ZIP) {
        throw new Error(`download dichiarato oltre il cap di ${MAX_BYTE_DOWNLOAD_ZIP} byte`);
      }
      const finale = risposta.url.startsWith("http") ? risposta.url : url;
      let scaricati = 0;
      const guardiano = new Transform({
        transform(pezzo: Buffer, _codifica, ok) {
          scaricati += pezzo.length;
          if (scaricati > MAX_BYTE_DOWNLOAD_ZIP) {
            ok(new Error(`download oltre il cap di ${MAX_BYTE_DOWNLOAD_ZIP} byte`));
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
      if (info.size > MAX_BYTE_DOWNLOAD_ZIP) {
        await unlink(destinazione);
        throw new Error(`download oltre il cap di ${MAX_BYTE_DOWNLOAD_ZIP} byte`);
      }
      return finale;
    } catch (errore) {
      ultimoErrore = errore;
    } finally {
      clearTimeout(timer);
    }
  }
  throw ultimoErrore instanceof Error ? ultimoErrore : new Error("download fallito");
}

/** Estrae UNA voce scrutini dallo ZIP su file (streaming via `unzip -p`, mai in memoria). */
function estraiVoceZip(zip: string, voce: string, destinazione: string): void {
  const figlio = spawnSync("unzip", ["-p", zip, voce], { maxBuffer: 64 * 1024 * 1024 });
  if (figlio.status !== 0) {
    throw new Error(`estrazione voce ${voce} dallo ZIP fallita`);
  }
  const contenuto = figlio.stdout as unknown as Buffer;
  if (!contenuto || contenuto.length === 0) {
    throw new Error(`voce ${voce} vuota o assente nello ZIP`);
  }
  if (contenuto.length > MAX_BYTE_CSV) {
    throw new Error(`voce ${voce} oltre il cap di ${MAX_BYTE_CSV} byte`);
  }
  writeFileSync(destinazione, contenuto);
}

export interface StatoRegione {
  righeLette: number;
  righeAggregate: number;
  righeScartate: number;
  righeSoloPresidente: number;
  unitaViste: Set<string>;
  comuni: Map<string, { c: string; p: string; r: string; e: number; v: number }>;
  liste: Map<string, number>;
  votiListe: number;
  e: number;
  v: number;
  b: number;
  k: number;
}

export function nuovoStato(): StatoRegione {
  return {
    righeLette: 0,
    righeAggregate: 0,
    righeScartate: 0,
    righeSoloPresidente: 0,
    unitaViste: new Set(),
    comuni: new Map(),
    liste: new Map(),
    votiListe: 0,
    e: 0,
    v: 0,
    b: 0,
    k: 0,
  };
}

export function applicaRiga(stato: StatoRegione, riga: RigaRegionale): void {
  stato.righeAggregate += 1;
  if (!riga.lista) {
    stato.righeSoloPresidente += 1;
  } else {
    stato.votiListe += riga.votiLista;
    stato.liste.set(riga.lista, (stato.liste.get(riga.lista) ?? 0) + riga.votiLista);
  }
  const kRiga = riga.nulle + riga.contestate;
  // e/v/b/k 1 sola volta per comune; le righe si ripetono una per lista.
  const chiaveUnita = `${riga.regione}||${riga.circoscrizione}||${riga.comune}`;
  if (!stato.unitaViste.has(chiaveUnita)) {
    stato.unitaViste.add(chiaveUnita);
    stato.e += riga.elettori;
    stato.v += riga.votanti;
    stato.b += riga.bianche;
    stato.k += kRiga;
  }
  let com = stato.comuni.get(chiaveUnita);
  if (!com) {
    com = { c: riga.comune, p: riga.circoscrizione, r: riga.regione, e: 0, v: 0 };
    stato.comuni.set(chiaveUnita, com);
  }
  if (!stato.unitaViste.has(`somma:${chiaveUnita}`)) {
    stato.unitaViste.add(`somma:${chiaveUnita}`);
    com.e += riga.elettori;
    com.v += riga.votanti;
  }
}

async function parseCsv(
  percorso: string,
  stati: Record<RegioneAttesa, StatoRegione>,
  limiteRighe: number | null,
): Promise<void> {
  // I CSV DAIT sono Latin-1: decodifica latin1 (come Toscana/Umbria/Liguria/Calabria).
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
      if (!isHeader(campi)) {
        throw new Error(`header inatteso (riga 1): ${campi.length} colonne`);
      }
      headerVerificato = true;
      continue;
    }
    if (limiteRighe !== null && lette >= limiteRighe) break;
    if (campi.length !== HEADER.length) {
      throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 16`);
    }
    lette += 1;
    for (const s of Object.values(stati)) s.righeLette += 1;
    const parsed = parseRiga(campi, numeroRiga);
    if (!parsed) {
      for (const s of Object.values(stati)) s.righeScartate += 1;
      continue;
    }
    applicaRiga(stati[parsed.regione as RegioneAttesa], parsed);
  }
  if (!headerVerificato) throw new Error("CSV vuoto o senza header");
}

interface ListaOut {
  n: string;
  v: number;
  p: number;
}

export function costruisciEnvelope(
  stato: StatoRegione,
  regione: RegioneAttesa,
  urlProvenance: string,
  recuperatoIl: string,
): Record<string, unknown> {
  if (stato.righeAggregate === 0) {
    throw new Error(`nessuna riga aggregata per ${regione}`);
  }
  if (stato.liste.size > MAX_LISTE) {
    throw new Error(`liste ${stato.liste.size} oltre il cap di ${MAX_LISTE} per ${regione}`);
  }
  const liste: ListaOut[] = [...stato.liste.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([n, v]) => ({
      n,
      v,
      p: stato.votiListe > 0 ? unaDecimale((v / stato.votiListe) * 100) : 0,
    }));
  const regioni = [
    {
      r: regione,
      e: stato.e,
      v: stato.v,
      b: stato.b,
      k: stato.k,
      a: affluenza(stato.v, stato.e),
      liste,
    },
  ];
  const comuni = [...stato.comuni.values()]
    .sort(
      (a, b) =>
        a.r.localeCompare(b.r, "it") ||
        a.p.localeCompare(b.p, "it") ||
        a.c.localeCompare(b.c, "it"),
    )
    .map((c) => ({ c: c.c, p: c.p, r: c.r, e: c.e, v: c.v, a: affluenza(c.v, c.e) }));
  return {
    provenance: { fonte: FONTE, url: urlProvenance, recuperatoIl, licenza: LICENZA },
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
    regioni,
    comuni,
    metodologia: METODOLOGIA,
    avvertenze: AVVERTENZE,
  };
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
  const stati: Record<RegioneAttesa, StatoRegione> = {
    CAMPANIA: nuovoStato(),
    PUGLIA: nuovoStato(),
    VENETO: nuovoStato(),
  };
  let urlProvenance = URL_ZIP;
  try {
    let csv = opzioni.csvOverride;
    if (!csv || !existsSync(csv)) {
      if (opzioni.csvOverride) {
        throw new Error(`CSV override assente: ${opzioni.csvOverride}`);
      }
      const estraiDaZip = (zip: string): string => {
        const destinazione = join(tmpdir(), `b-regionali-sud-${Date.now()}.csv`);
        estraiVoceZip(zip, VOCE_ZIP, destinazione);
        scaricati.push(destinazione);
        return destinazione;
      };
      if (existsSync(ZIP_LOCALE)) {
        csv = estraiDaZip(ZIP_LOCALE);
      } else {
        const zipTmp = join(tmpdir(), `b-regionali-sud-${Date.now()}.zip`);
        const finale = await scaricaZip(URL_ZIP, zipTmp);
        urlProvenance = finale;
        scaricati.push(zipTmp);
        csv = estraiDaZip(zipTmp);
      }
    }
    await parseCsv(csv, stati, opzioni.limiteRighe);
    for (const r of REGIONI_ATTESE) {
      const s = stati[r];
      const top3 = [...s.liste.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([n, voti]) => `${n}=${voti}`)
        .join(", ");
      console.log(
        `[b-ingest-regionali-sud] ${r} righeAggregate=${s.righeAggregate} ` +
          `soloPresidente=${s.righeSoloPresidente} comuni=${s.comuni.size} liste=${s.liste.size} e=${s.e} v=${s.v} top3: ${top3}`,
      );
    }
  } finally {
    await rimuoviTmp();
  }

  if (opzioni.limiteRighe !== null) {
    console.log("[b-ingest-regionali-sud] smoke --limite-righe: file JSON non scritti.");
    return;
  }

  // Serializza TUTTI prima di scrivere: se uno supera il cap, nessun
  // file viene toccato (mai parziali su disco).
  const serializza = (envelope: unknown, etichetta: string): string => {
    const json = `${JSON.stringify(envelope)}\n`;
    const byte = Buffer.byteLength(json, "utf8");
    console.log(
      `[b-ingest-regionali-sud] output ${etichetta}: ${byte} byte (cap ${MAX_BYTE_OUT}).`,
    );
    if (byte > MAX_BYTE_OUT) {
      throw new Error(
        `output ${etichetta} ${byte} byte oltre il cap di ${MAX_BYTE_OUT}: nessun file scritto`,
      );
    }
    return json;
  };
  const jsons: Record<RegioneAttesa, string> = {
    CAMPANIA: serializza(
      costruisciEnvelope(stati.CAMPANIA, "CAMPANIA", urlProvenance, recuperatoIl),
      "campania-2025",
    ),
    PUGLIA: serializza(
      costruisciEnvelope(stati.PUGLIA, "PUGLIA", urlProvenance, recuperatoIl),
      "puglia-2025",
    ),
    VENETO: serializza(
      costruisciEnvelope(stati.VENETO, "VENETO", urlProvenance, recuperatoIl),
      "veneto-2025",
    ),
  };
  mkdirSync(DIR_REALI, { recursive: true });
  const scritti: string[] = [];
  try {
    for (const r of REGIONI_ATTESE) {
      writeFileSync(FILE_OUT[r], jsons[r], "utf8");
      scritti.push(FILE_OUT[r]);
    }
  } catch (errore) {
    // Mai parziali: se una scrittura fallisce, rimuovi le b- già scritte.
    for (const f of scritti) {
      try {
        await unlink(f);
      } catch {
        // best-effort
      }
    }
    throw errore;
  }
  console.log(
    `[b-ingest-regionali-sud] scritti data/reali/b-elezioni-regionali-2025-campania.json ` +
      `(${Buffer.byteLength(jsons.CAMPANIA, "utf8")} byte), ` +
      `b-elezioni-regionali-2025-puglia.json (${Buffer.byteLength(jsons.PUGLIA, "utf8")} byte), ` +
      `b-elezioni-regionali-2025-veneto.json (${Buffer.byteLength(jsons.VENETO, "utf8")} byte).`,
  );
}

// Esecuzione diretta via tsx; importabile dai test senza effetti (mai rete).
const eseguitoDiretto =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("b-ingest-reale-regionali-sud-2025.ts");
if (eseguitoDiretto) {
  main().catch((errore: unknown) => {
    const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
    console.error(`Ingest b-regionali-sud fallito, nessun file scritto: ${messaggio}`);
    process.exit(1);
  });
}
