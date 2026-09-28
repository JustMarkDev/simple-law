/**
 * Ingest reale elezioni regionali Toscana 2025 + Umbria 2024 (SOLO aggregati).
 *
 * Sorgenti (Ministero Interno DAIT — Eligendo Open Data, ZIP con `;` quotato):
 * - Toscana 2025-10-12: `.../documenti/opendata/regionali/regionali-20251012.zip`,
 *   voce `20251012_REGIONALI_TOSCANA_SCRUTINI.csv` (16 colonne, livello comunale).
 * - Umbria 2024-11-17: `.../documenti/opendata/regionali/regionali-20241117.zip`,
 *   voce `Regionali_Umbria_ 2024_Scrutini.csv` (20 colonne, livello sezione,
 *   circoscrizione unica).
 * Se i CSV sono presenti in `/tmp/elezioni/` vengono usati quelli (offline
 * deterministico); altrimenti estrazione dalla voce degli ZIP locali o un solo
 * download per ZIP mancante con cap byte, timeout, 1 retry e disciplina
 * 1 richiesta / 2s.
 *
 * Vietato per direttiva: tutti i `*Preferenze*.csv`, ERO-2024,
 * `regionali-20251123.zip`, colonne `NUM_CANDIDATO/COGNOME/NOME/ALTRO_NOME`
 * (e gli equivalenti `*_CANDIDATO` umbri). Il parser legge SOLO le colonne in
 * whitelist `REGIONE;CIRCOSCRIZIONE;COMUNE;ELETTORI;VOTANTI;BIANCHE;NULLE;`
 * `CONTESTATE;LISTA;VOTI_LISTA`; i voti del presidente (colonne candidato)
 * sono scartati, mai emessi. MAI nominativi in output.
 *
 * Output: `data/reali/elezioni-regionali-2025-toscana.json` +
 * `data/reali/elezioni-regionali-2024-umbria.json` (SOLO aggregati:
 * regione con per-lista + comuni con sola affluenza, mai per-lista comunale,
 * mai righe candidato/nominativi). Ogni numero e' somma del parser, mai
 * calcolato a mano. Cap hard <=950KB per envelope: oltre, exit 1 senza
 * parziali (nessun file scritto).
 *
 * Uso: `tsx scripts/ingest-reale-elezioni-regionali.ts [--limite-righe N] [--csv-toscana PATH] [--csv-umbria PATH] [--help]`
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

const BASE_OPENDATA = "https://dait.interno.gov.it/documenti/opendata/regionali";
const URL_ZIP_TOSCANA = `${BASE_OPENDATA}/regionali-20251012.zip`;
const URL_ZIP_UMBRIA = `${BASE_OPENDATA}/regionali-20241117.zip`;
const VOCE_ZIP_TOSCANA = "20251012_REGIONALI_TOSCANA_SCRUTINI.csv";
const VOCE_ZIP_UMBRIA = "Regionali_Umbria_ 2024_Scrutini.csv";

const CSV_LOCALE_TOSCANA = "/tmp/elezioni/regionali-toscana-2025-scrutini.csv";
const CSV_LOCALE_UMBRIA = "/tmp/elezioni/regionali-umbria-2024-scrutini.csv";
const ZIP_LOCALE_TOSCANA = "/tmp/elezioni/regionali-20251012.zip";
const ZIP_LOCALE_UMBRIA = "/tmp/elezioni/regionali-20241117.zip";

const FONTE = "Ministero Interno DAIT — Eligendo Open Data";
const LICENZA = "open-data ministeriale da confermare, info_opendata senza stringa CC-BY";
const METODOLOGIA_TOSCANA =
  "streaming ';' quotato latin1, filtro REGIONE=TOSCANA, e/v/bianche/nulle/contestate 1x/comune, " +
  "voti lista sommati per lista; voti candidato mai letti (scartati); " +
  "b=bianche, k=nulle+contestaste; a/p a 1 decimale";
const METODOLOGIA_UMBRIA =
  "streaming ';' quotato latin1, filtro REGIONE=UMBRIA, e/v/bianche/nulle/contestate 1x/sezione e sommati " +
  "per comune, voti lista sommati per lista; voti candidato mai letti (scartati); circoscrizione unica; " +
  "b=bianche, k=nulle+contestaste; a/p a 1 decimale";
const AVVERTENZE_TOSCANA =
  "Solo aggregati per lista, zero nominativi (colonne candidato mai lette). Voti del presidente non " +
  "pubblicati come aggregato nel tracciato e scartati. Solo Toscana 2025-10-12. Seggi assenti nel file.";
const AVVERTENZE_UMBRIA =
  "Solo aggregati per lista, zero nominativi (colonne candidato mai lette). Voti del presidente non " +
  "pubblicati come aggregato nel tracciato e scartati. Livello sezione aggregato a comune. " +
  "Solo Umbria 2024-11-17, circoscrizione unica. Seggi assenti nel file.";
const TIPO = "regionali";
const DATA_ISO_TOSCANA = "2025-10-12";
const DATA_ISO_UMBRIA = "2024-11-17";

/** Header verbatim del tracciato Toscana 2025 (16 colonne, livello comunale). */
const HEADER_TOSCANA = [
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

/** Header verbatim del tracciato Umbria 2024 (20 colonne, livello sezione). */
const HEADER_UMBRIA = [
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

const MAX_BYTE_OUT = 950 * 1024;
const MAX_BYTE_DOWNLOAD_ZIP = 30 * 1024 * 1024;
const MAX_BYTE_CSV = 10 * 1024 * 1024;
const MAX_LISTE = 64;
const MAX_REGIONI = 10;
const TIMEOUT_MS = 120_000;
const PAUSA_RETE_MS = 2000;
const TENTATIVI_DOWNLOAD = 2;

const DIR_REALI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "reali");
const FILE_OUT_TOSCANA = resolve(DIR_REALI, "elezioni-regionali-2025-toscana.json");
const FILE_OUT_UMBRIA = resolve(DIR_REALI, "elezioni-regionali-2024-umbria.json");

/* ------------------------------------------------------------------ */
/* Helper puri (esportati per i test, mai rete).                        */
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

export function isHeaderToscana(campi: readonly string[]): boolean {
  return (
    campi.length === HEADER_TOSCANA.length &&
    HEADER_TOSCANA.every((atteso, i) => campi[i] === atteso)
  );
}

export function isHeaderUmbria(campi: readonly string[]): boolean {
  return (
    campi.length === HEADER_UMBRIA.length &&
    HEADER_UMBRIA.every((atteso, i) => campi[i] === atteso)
  );
}

export interface RigaRegionale {
  regione: string;
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
 * Parser puro di una riga Toscana (header escluso). Legge SOLO gli indici
 * whitelist 0,1,2,3,4,5,6,7,14,15; MAI gli indici candidato 8-12
 * (NUM_CANDIDATO/NOME/COGNOME/ALTRO_NOME/VOTI_CANDIDATO) ne' NUM_LISTA (13).
 * Ritorna null se la riga non e' target (REGIONE diversa); lancia se malformata.
 */
export function parseRigaToscana(campi: readonly string[], numeroRiga: number): RigaRegionale | null {
  if (campi.length !== HEADER_TOSCANA.length) {
    throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 16`);
  }
  const regione = (campi[0] ?? "").trim();
  if (regione !== "TOSCANA") return null;
  const circoscrizione = (campi[1] ?? "").trim();
  const comune = (campi[2] ?? "").trim();
  const elettori = interoNonNegativo(campi[3] ?? "");
  const votanti = interoNonNegativo(campi[4] ?? "");
  const bianche = interoNonNegativo(campi[5] ?? "");
  const nulle = interoNonNegativo(campi[6] ?? "");
  const contestate = interoNonNegativo(campi[7] ?? "");
  const lista = normalizzaLista(campi[14] ?? "");
  const votiLista = interoNonNegativo(campi[15] ?? "");
  if (elettori === null || votanti === null || bianche === null || nulle === null || contestate === null || votiLista === null) {
    throw new Error(`riga ${numeroRiga}: numerico non valido`);
  }
  if (!circoscrizione || !comune || !lista) {
    throw new Error(`riga ${numeroRiga}: campo testuale vuoto`);
  }
  return { regione, circoscrizione, comune, sezione: "", elettori, votanti, bianche, nulle, contestate, lista, votiLista };
}

/**
 * Parser puro di una riga Umbria (header escluso). Legge SOLO gli indici
 * whitelist 0,1,2,3,6,9,10,11,12,18,19 (totali, mai M/F); MAI gli indici
 * candidato 13-16 (NUM/COGNOME/NOME/VOTI_CANDIDATO) ne' NUM_LISTA (17).
 * Ritorna null se la riga non e' target (REGIONE diversa); lancia se malformata.
 */
export function parseRigaUmbria(campi: readonly string[], numeroRiga: number): RigaRegionale | null {
  if (campi.length !== HEADER_UMBRIA.length) {
    throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 20`);
  }
  const regione = (campi[0] ?? "").trim();
  if (regione !== "UMBRIA") return null;
  const circoscrizione = (campi[1] ?? "").trim();
  const comune = (campi[2] ?? "").trim();
  const sezione = (campi[3] ?? "").trim();
  const elettori = interoNonNegativo(campi[6] ?? "");
  const votanti = interoNonNegativo(campi[9] ?? "");
  const nulle = interoNonNegativo(campi[10] ?? "");
  const bianche = interoNonNegativo(campi[11] ?? "");
  const contestate = interoNonNegativo(campi[12] ?? "");
  const lista = normalizzaLista(campi[18] ?? "");
  const votiLista = interoNonNegativo(campi[19] ?? "");
  if (elettori === null || votanti === null || nulle === null || bianche === null || contestate === null || votiLista === null) {
    throw new Error(`riga ${numeroRiga}: numerico non valido`);
  }
  if (!circoscrizione || !comune || !sezione || !lista) {
    throw new Error(`riga ${numeroRiga}: campo testuale vuoto`);
  }
  return { regione, circoscrizione, comune, sezione, elettori, votanti, bianche, nulle, contestate, lista, votiLista };
}

/* ------------------------------------------------------------------ */
/* Rete e orchestrazione (scheletro europee-2024 / politiche-2022).      */
/* ------------------------------------------------------------------ */

function dormi(ms: number): Promise<void> {
  return new Promise((resolveAttesa) => setTimeout(resolveAttesa, ms));
}

function aiuto(): string {
  return [
    "Ingest reale elezioni regionali Toscana 2025 + Umbria 2024 (aggregati DAIT/Eligendo).",
    "",
    "Uso:",
    "  tsx scripts/ingest-reale-elezioni-regionali.ts [--limite-righe N] [--csv-toscana PATH] [--csv-umbria PATH] [--help]",
    "",
    "Opzioni:",
    "  --limite-righe N   smoke test: legge solo le prime N righe dati per file,",
    "                     stampa le statistiche e NON scrive i file JSON.",
    "  --csv-toscana PATH usa un CSV locale per la Toscana invece dei percorsi /tmp/elezioni.",
    "  --csv-umbria PATH  usa un CSV locale per l'Umbria invece dei percorsi /tmp/elezioni.",
    "  --help             mostra questo aiuto.",
    "",
    `Sorgenti: voci scrutini degli ZIP DAIT (o copie CSV in /tmp/elezioni se presenti).`,
    `Output: data/reali/elezioni-regionali-2025-toscana.json + data/reali/elezioni-regionali-2024-umbria.json (cap ${MAX_BYTE_OUT} byte ciascuno).`,
    "Solo aggregati per lista, zero nominativi: colonne candidato mai lette.",
  ].join("\n");
}

interface Opzioni {
  limiteRighe: number | null;
  csvToscana: string | null;
  csvUmbria: string | null;
}

/** Ritorna null se gli argomenti non sono validi (con messaggio su stderr). */
export function parseArgomenti(argv: string[]): Opzioni | "help" | null {
  let limiteRighe: number | null = null;
  let csvToscana: string | null = null;
  let csvUmbria: string | null = null;
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
    if (arg === "--csv-toscana") {
      const raw = argv[i + 1] ?? "";
      i += 1;
      if (!raw) {
        console.error("--csv-toscana richiede un percorso");
        return null;
      }
      csvToscana = raw;
      continue;
    }
    if (arg.startsWith("--csv-toscana=")) {
      csvToscana = arg.slice("--csv-toscana=".length);
      if (!csvToscana) {
        console.error("--csv-toscana richiede un percorso");
        return null;
      }
      continue;
    }
    if (arg === "--csv-umbria") {
      const raw = argv[i + 1] ?? "";
      i += 1;
      if (!raw) {
        console.error("--csv-umbria richiede un percorso");
        return null;
      }
      csvUmbria = raw;
      continue;
    }
    if (arg.startsWith("--csv-umbria=")) {
      csvUmbria = arg.slice("--csv-umbria=".length);
      if (!csvUmbria) {
        console.error("--csv-umbria richiede un percorso");
        return null;
      }
      continue;
    }
    console.error(`Argomento sconosciuto: ${arg}`);
    return null;
  }
  return { limiteRighe, csvToscana, csvUmbria };
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

/** Estrae UNA voce dallo ZIP su file (streaming via `unzip -p`, mai in memoria). */
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

export interface SorgenteRegionale {
  nome: string;
  urlZip: string;
  voceZip: string;
  csvLocale: string;
  zipLocale: string;
  csvOverride: string | null;
  regioneAttesa: string;
  dataIso: string;
  formato: "toscana" | "umbria";
}

/** Risolve il CSV da parsare: override > CSV locale > voce da ZIP locale > download ZIP. */
async function risolviCsv(s: SorgenteRegionale, scaricati: string[]): Promise<{ csv: string; urlProvenance: string }> {
  if (s.csvOverride && existsSync(s.csvOverride)) {
    return { csv: s.csvOverride, urlProvenance: s.urlZip };
  }
  if (existsSync(s.csvLocale)) return { csv: s.csvLocale, urlProvenance: s.urlZip };
  const estraiDaZip = (zip: string): string => {
    const destinazione = join(tmpdir(), `regionali-${s.nome}-${Date.now()}.csv`);
    estraiVoceZip(zip, s.voceZip, destinazione);
    scaricati.push(destinazione);
    return destinazione;
  };
  if (existsSync(s.zipLocale)) return { csv: estraiDaZip(s.zipLocale), urlProvenance: s.urlZip };
  const zipTmp = join(tmpdir(), `regionali-${s.nome}-${Date.now()}.zip`);
  const finale = await scaricaZip(s.urlZip, zipTmp);
  scaricati.push(zipTmp);
  return { csv: estraiDaZip(zipTmp), urlProvenance: finale };
}

export interface StatoRegione {
  righeLette: number;
  righeAggregate: number;
  righeScartate: number;
  /** Chiavi 1x per affluenza: Toscana (comune), Umbria (comune+sezione). */
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
  stato.votiListe += riga.votiLista;
  stato.liste.set(riga.lista, (stato.liste.get(riga.lista) ?? 0) + riga.votiLista);
  const kRiga = riga.nulle + riga.contestate;
  // e/v/b/k 1 sola volta per unita' (comune in Toscana, sezione in Umbria);
  // le righe si ripetono una per lista.
  const chiaveUnita = riga.sezione
    ? `${riga.regione}||${riga.circoscrizione}||${riga.comune}||${riga.sezione}`
    : `${riga.regione}||${riga.circoscrizione}||${riga.comune}`;
  if (!stato.unitaViste.has(chiaveUnita)) {
    stato.unitaViste.add(chiaveUnita);
    stato.e += riga.elettori;
    stato.v += riga.votanti;
    stato.b += riga.bianche;
    stato.k += kRiga;
  }
  const chiaveComune = `${riga.regione}||${riga.circoscrizione}||${riga.comune}`;
  let com = stato.comuni.get(chiaveComune);
  if (!com) {
    com = { c: riga.comune, p: riga.circoscrizione, r: riga.regione, e: 0, v: 0 };
    stato.comuni.set(chiaveComune, com);
  }
  if (!stato.unitaViste.has(`somma:${chiaveUnita}`)) {
    stato.unitaViste.add(`somma:${chiaveUnita}`);
    com.e += riga.elettori;
    com.v += riga.votanti;
  }
}

async function parseCsv(
  percorso: string,
  formato: "toscana" | "umbria",
  stato: StatoRegione,
  limiteRighe: number | null,
): Promise<void> {
  // I CSV DAIT sono Latin-1: decodifica latin1 (come europee-2024).
  const flusso = createReadStream(percorso, { encoding: "latin1" });
  const righe = createInterface({ input: flusso, crlfDelay: Infinity });
  let numeroRiga = 0;
  let headerVerificato = false;
  for await (const riga of righe) {
    if (riga.trim() === "") continue;
    numeroRiga += 1;
    const campi = spezzaRiga(riga);
    if (!headerVerificato) {
      const ok = formato === "toscana" ? isHeaderToscana(campi) : isHeaderUmbria(campi);
      if (!ok) {
        throw new Error(`header ${formato} inatteso (riga 1): ${campi.length} colonne`);
      }
      headerVerificato = true;
      continue;
    }
    if (limiteRighe !== null && stato.righeLette >= limiteRighe) break;
    if (formato === "toscana" && campi.length !== HEADER_TOSCANA.length) {
      throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 16`);
    }
    if (formato === "umbria" && campi.length !== HEADER_UMBRIA.length) {
      throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 20`);
    }
    stato.righeLette += 1;
    const parsed = formato === "toscana"
      ? parseRigaToscana(campi, numeroRiga)
      : parseRigaUmbria(campi, numeroRiga);
    if (!parsed) {
      stato.righeScartate += 1;
      continue;
    }
    applicaRiga(stato, parsed);
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
  s: SorgenteRegionale,
  metodologia: string,
  avvertenze: string,
  urlProvenance: string,
  recuperatoIl: string,
): Record<string, unknown> {
  if (stato.righeAggregate === 0) {
    throw new Error(`nessuna riga aggregata per ${s.nome}`);
  }
  if (stato.liste.size > MAX_LISTE) {
    throw new Error(`liste ${stato.liste.size} oltre il cap di ${MAX_LISTE} per ${s.nome}`);
  }
  const liste: ListaOut[] = [...stato.liste.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([n, v]) => ({ n, v, p: stato.votiListe > 0 ? unaDecimale((v / stato.votiListe) * 100) : 0 }));
  const regioni = [{
    r: s.regioneAttesa,
    e: stato.e,
    v: stato.v,
    b: stato.b,
    k: stato.k,
    a: affluenza(stato.v, stato.e),
    liste,
  }];
  if (regioni.length > MAX_REGIONI) {
    throw new Error(`regioni oltre il cap di ${MAX_REGIONI}`);
  }
  const comuni = [...stato.comuni.values()]
    .sort((a, b) =>
      a.r.localeCompare(b.r, "it") || a.p.localeCompare(b.p, "it") || a.c.localeCompare(b.c, "it"),
    )
    .map((c) => ({ c: c.c, p: c.p, r: c.r, e: c.e, v: c.v, a: affluenza(c.v, c.e) }));
  return {
    provenance: { fonte: FONTE, url: urlProvenance, recuperatoIl, licenza: LICENZA },
    elezione: {
      tipo: TIPO,
      data: s.dataIso,
      e: stato.e,
      v: stato.v,
      b: stato.b,
      k: stato.k,
      a: affluenza(stato.v, stato.e),
    },
    liste,
    regioni,
    comuni,
    metodologia,
    avvertenze,
  };
}

async function main(): Promise<void> {
  const opzioni = parseArgomenti(process.argv.slice(2));
  if (opzioni === "help") {
    console.log(aiuto());
    return;
  }
  if (opzioni === null) process.exit(2);

  const sorgenti: SorgenteRegionale[] = [
    {
      nome: "toscana-2025",
      urlZip: URL_ZIP_TOSCANA,
      voceZip: VOCE_ZIP_TOSCANA,
      csvLocale: CSV_LOCALE_TOSCANA,
      zipLocale: ZIP_LOCALE_TOSCANA,
      csvOverride: opzioni.csvToscana,
      regioneAttesa: "TOSCANA",
      dataIso: DATA_ISO_TOSCANA,
      formato: "toscana",
    },
    {
      nome: "umbria-2024",
      urlZip: URL_ZIP_UMBRIA,
      voceZip: VOCE_ZIP_UMBRIA,
      csvLocale: CSV_LOCALE_UMBRIA,
      zipLocale: ZIP_LOCALE_UMBRIA,
      csvOverride: opzioni.csvUmbria,
      regioneAttesa: "UMBRIA",
      dataIso: DATA_ISO_UMBRIA,
      formato: "umbria",
    },
  ];

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
  const stati = new Map<string, { stato: StatoRegione; urlProvenance: string }>();
  try {
    for (const s of sorgenti) {
      const { csv, urlProvenance } = await risolviCsv(s, scaricati);
      const stato = nuovoStato();
      await parseCsv(csv, s.formato, stato, opzioni.limiteRighe);
      stati.set(s.nome, { stato, urlProvenance });
      const top3 = [...stato.liste.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([n, voti]) => `${n}=${voti}`)
        .join(", ");
      console.log(
        `[ingest-regionali] ${s.nome} righe lette=${stato.righeLette} aggregate=${stato.righeAggregate} ` +
          `scartate=${stato.righeScartate} comuni=${stato.comuni.size} liste=${stato.liste.size} ` +
          `e=${stato.e} v=${stato.v} top3: ${top3}`,
      );
    }
  } finally {
    await rimuoviTmp();
  }

  if (opzioni.limiteRighe !== null) {
    console.log("[ingest-regionali] smoke --limite-righe: file JSON non scritti.");
    return;
  }

  const toscana = stati.get("toscana-2025");
  const umbria = stati.get("umbria-2024");
  if (!toscana || !umbria) throw new Error("stati regionali mancanti");

  // Serializza ENTRAMBI prima di scrivere: se uno supera il cap, nessun
  // file viene toccato (mai parziali su disco).
  const serializza = (envelope: unknown, etichetta: string): string => {
    const json = `${JSON.stringify(envelope)}\n`;
    const byte = Buffer.byteLength(json, "utf8");
    console.log(`[ingest-regionali] output ${etichetta}: ${byte} byte (cap ${MAX_BYTE_OUT}).`);
    if (byte > MAX_BYTE_OUT) {
      throw new Error(`output ${etichetta} ${byte} byte oltre il cap di ${MAX_BYTE_OUT}: nessun file scritto`);
    }
    return json;
  };
  const envelopeToscana = costruisciEnvelope(
    toscana.stato,
    sorgenti[0] as SorgenteRegionale,
    METODOLOGIA_TOSCANA,
    AVVERTENZE_TOSCANA,
    toscana.urlProvenance,
    recuperatoIl,
  );
  const envelopeUmbria = costruisciEnvelope(
    umbria.stato,
    sorgenti[1] as SorgenteRegionale,
    METODOLOGIA_UMBRIA,
    AVVERTENZE_UMBRIA,
    umbria.urlProvenance,
    recuperatoIl,
  );
  const jsonToscana = serializza(envelopeToscana, "toscana-2025");
  const jsonUmbria = serializza(envelopeUmbria, "umbria-2024");
  mkdirSync(DIR_REALI, { recursive: true });
  try {
    writeFileSync(FILE_OUT_TOSCANA, jsonToscana, "utf8");
    writeFileSync(FILE_OUT_UMBRIA, jsonUmbria, "utf8");
  } catch (errore) {
    // Mai parziali: se la seconda scrittura fallisce, rimuovi la prima.
    try {
      await unlink(FILE_OUT_TOSCANA);
    } catch {
      // best-effort
    }
    try {
      await unlink(FILE_OUT_UMBRIA);
    } catch {
      // best-effort
    }
    throw errore;
  }
  console.log(
    `[ingest-regionali] scritti data/reali/elezioni-regionali-2025-toscana.json (${Buffer.byteLength(jsonToscana, "utf8")} byte) ` +
      `e data/reali/elezioni-regionali-2024-umbria.json (${Buffer.byteLength(jsonUmbria, "utf8")} byte).`,
  );
}

// Esecuzione diretta via tsx; importabile dai test senza effetti (mai rete).
const eseguitoDiretto =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("ingest-reale-elezioni-regionali.ts");
if (eseguitoDiretto) {
  main().catch((errore: unknown) => {
    const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
    console.error(`Ingest regionali fallito, nessun file scritto: ${messaggio}`);
    process.exit(1);
  });
}
