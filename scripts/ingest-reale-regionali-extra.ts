/**
 * Ingest reale elezioni regionali Liguria 2024 + Calabria 2025 (SOLO aggregati).
 *
 * Sorgenti (Ministero Interno DAIT — Eligendo Open Data, `;` quotato):
 * - Liguria (ZIP `regionali-20241027.zip`, 200, 1.667.956B):
 *   voce `Regionali_Liguria_2024_Scrutini.csv` (20 colonne, livello sezione,
 *   stesso tracciato di Umbria 2024). Verificato via curl/unzip -l.
 * - Calabria (ZIP `regionali-20251005.zip`, 200, 1.686.154B):
 *   voce `20251005_REGIONALI_CALABRIA_SCRUTINI.csv` (16 colonne, livello
 *   comunale, stesso tracciato di Toscana 2025). Verificato via curl/unzip -l.
 * Se i CSV sono presenti in `/tmp/elezioni/extra/` vengono usati quelli
 * (offline deterministico); altrimenti estrazione dalla voce degli ZIP locali
 * o un solo download per ZIP mancante con cap byte, timeout, 1 retry e
 * disciplina 1 richiesta / 2s.
 *
 * Vietato per direttiva: tutti i `*Preferenze*.csv` (mai estratti, mai letti),
 * le voci `dato per sezione/*`, i file candidati Calabria
 * (`*_CANDIDATI_*.csv`), il `VOTANTI.csv`, ERO-2024, `regionali-20251123.zip`,
 * le colonne candidato (`NUM_CANDIDATO/NOME/COGNOME/...`, equivalenti
 * `*_CANDIDATO`) e `NUM_LISTA`. Il parser legge SOLO le colonne in whitelist
 * `REGIONE;CIRCOSCRIZIONE;COMUNE;ELETTORI;VOTANTI;BIANCHE;NULLE;CONTESTATE;`
 * `LISTA;VOTI_LISTA`; i voti del presidente (colonne candidato) sono scartati,
 * mai emessi. MAI nominativi in output. Caso Liguria: 821 righe con lista
 * vuota e 0 voti (solo-presidente, senza lista collegata) contribuiscono solo
 * all'affluenza di sezione, mai alle liste.
 *
 * Output: `data/reali/elezioni-regionali-2024-liguria.json` +
 * `data/reali/elezioni-regionali-2025-calabria.json` (SOLO aggregati:
 * regione con per-lista + comuni con sola affluenza, mai per-lista comunale,
 * mai righe candidato/nominativi). Ogni numero e' somma del parser, mai
 * calcolato a mano. Cap hard <=950KB per envelope: oltre, exit 1 senza
 * parziali (nessun file scritto).
 *
 * Uso: `tsx scripts/ingest-reale-regionali-extra.ts [--limite-righe N] [--csv-liguria PATH] [--csv-calabria PATH] [--help]`
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
const URL_ZIP_LIGURIA = `${BASE_OPENDATA}/regionali-20241027.zip`;
const URL_ZIP_CALABRIA = `${BASE_OPENDATA}/regionali-20251005.zip`;
const VOCE_ZIP_LIGURIA = "Regionali_Liguria_2024_Scrutini.csv";
const VOCE_ZIP_CALABRIA = "20251005_REGIONALI_CALABRIA_SCRUTINI.csv";

const CSV_LOCALE_LIGURIA = "/tmp/elezioni/extra/liguria-scrutini.csv";
const CSV_LOCALE_CALABRIA = "/tmp/elezioni/extra/calabria-scrutini.csv";
const ZIP_LOCALE_LIGURIA = "/tmp/elezioni/extra/regionali-20241027.zip";
const ZIP_LOCALE_CALABRIA = "/tmp/elezioni/extra/regionali-20251005.zip";

const FONTE = "Ministero Interno DAIT — Eligendo Open Data";
const LICENZA = "open-data ministeriale da confermare, info_opendata senza stringa CC-BY";
const METODOLOGIA_LIGURIA =
  "streaming ';' quotato latin1, filtro REGIONE=LIGURIA, e/v/bianche/nulle/contestate 1x/sezione e sommati " +
  "per comune, voti lista sommati per lista; voti candidato mai letti (scartati); righe solo-presidente " +
  "(lista vuota, 0 voti) solo per affluenza; b=bianche, k=nulle+contestaste; a/p a 1 decimale";
const METODOLOGIA_CALABRIA =
  "streaming ';' quotato latin1, filtro REGIONE=CALABRIA, e/v/bianche/nulle/contestate 1x/comune, " +
  "voti lista sommati per lista; voti candidato mai letti (scartati); " +
  "b=bianche, k=nulle+contestaste; a/p a 1 decimale";
const AVVERTENZE_LIGURIA =
  "Solo aggregati per lista, zero nominativi (colonne candidato mai lette). Voti del presidente non " +
  "pubblicati come aggregato nel tracciato e scartati; 821 righe solo-presidente senza lista contano " +
  "solo per l'affluenza. Livello sezione aggregato a comune. Solo Liguria 2024-10-27 (data dal nome " +
  "ZIP DAIT). Seggi assenti nel file.";
const AVVERTENZE_CALABRIA =
  "Solo aggregati per lista, zero nominativi (colonne candidato mai lette). Voti del presidente non " +
  "pubblicati come aggregato nel tracciato e scartati. Solo Calabria 2025-10-05 (data dal nome ZIP " +
  "DAIT). Seggi assenti nel file.";
const TIPO = "regionali";
/** Date convenzionali dal nome degli ZIP DAIT (come Toscana 20251012 / Umbria 20241117). */
const DATA_ISO_LIGURIA = "2024-10-27";
const DATA_ISO_CALABRIA = "2025-10-05";

/** Header verbatim del tracciato Liguria 2024 (20 colonne, livello sezione, tipo-Umbria). */
const HEADER_LIGURIA = [
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

/** Header verbatim del tracciato Calabria 2025 (16 colonne, livello comunale, tipo-Toscana). */
const HEADER_CALABRIA = [
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
const MAX_REGIONI = 10;
const TIMEOUT_MS = 120_000;
const PAUSA_RETE_MS = 2000;
const TENTATIVI_DOWNLOAD = 2;

const DIR_REALI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "reali");
const FILE_OUT_LIGURIA = resolve(DIR_REALI, "elezioni-regionali-2024-liguria.json");
const FILE_OUT_CALABRIA = resolve(DIR_REALI, "elezioni-regionali-2025-calabria.json");

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

export function isHeaderLiguria(campi: readonly string[]): boolean {
  return (
    campi.length === HEADER_LIGURIA.length &&
    HEADER_LIGURIA.every((atteso, i) => campi[i] === atteso)
  );
}

export function isHeaderCalabria(campi: readonly string[]): boolean {
  return (
    campi.length === HEADER_CALABRIA.length &&
    HEADER_CALABRIA.every((atteso, i) => campi[i] === atteso)
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
  /** Lista normalizzata; "" = riga solo-presidente (solo affluenza, mai liste). */
  lista: string;
  votiLista: number;
}

/**
 * Parser puro di una riga Liguria (header escluso). Legge SOLO gli indici
 * whitelist 0,1,2,3,6,9,10,11,12,18,19 (totali, mai M/F); MAI gli indici
 * candidato 13-16 (NUM/COGNOME/NOME/VOTI_CANDIDATO) ne' NUM_LISTA (17).
 * Riga solo-presidente (lista vuota + 0 voti): torna con lista "" per la sola
 * affluenza; lista vuota con voti > 0 -> throw. Ritorna null se REGIONE diversa;
 * lancia se malformata.
 */
export function parseRigaLiguria(
  campi: readonly string[],
  numeroRiga: number,
): RigaRegionale | null {
  if (campi.length !== HEADER_LIGURIA.length) {
    throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 20`);
  }
  const regione = (campi[0] ?? "").trim();
  if (regione !== "LIGURIA") return null;
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
  if (
    elettori === null ||
    votanti === null ||
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
      regione,
      circoscrizione,
      comune,
      sezione,
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
    sezione,
    elettori,
    votanti,
    bianche,
    nulle,
    contestate,
    lista,
    votiLista,
  };
}

/**
 * Parser puro di una riga Calabria (header escluso). Legge SOLO gli indici
 * whitelist 0,1,2,3,4,5,6,7,14,15; MAI gli indici candidato 8-12
 * (NUM_CANDIDATO/NOME/COGNOME/ALTRO_NOME/VOTI_CANDIDATO) ne' NUM_LISTA (13).
 * Ritorna null se la riga non e' target (REGIONE diversa); lancia se malformata.
 */
export function parseRigaCalabria(
  campi: readonly string[],
  numeroRiga: number,
): RigaRegionale | null {
  if (campi.length !== HEADER_CALABRIA.length) {
    throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 16`);
  }
  const regione = (campi[0] ?? "").trim();
  if (regione !== "CALABRIA") return null;
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
  if (!circoscrizione || !comune || !lista) {
    throw new Error(`riga ${numeroRiga}: campo testuale vuoto`);
  }
  return {
    regione,
    circoscrizione,
    comune,
    sezione: "",
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
/* Rete e orchestrazione (scheletro ingest-reale-elezioni-regionali).    */
/* ------------------------------------------------------------------ */

function dormi(ms: number): Promise<void> {
  return new Promise((resolveAttesa) => setTimeout(resolveAttesa, ms));
}

function aiuto(): string {
  return [
    "Ingest reale elezioni regionali Liguria 2024 + Calabria 2025 (aggregati DAIT/Eligendo).",
    "",
    "Uso:",
    "  tsx scripts/ingest-reale-regionali-extra.ts [--limite-righe N] [--csv-liguria PATH] [--csv-calabria PATH] [--help]",
    "",
    "Opzioni:",
    "  --limite-righe N   smoke test: legge solo le prime N righe dati per file,",
    "                     stampa le statistiche e NON scrive i file JSON.",
    "  --csv-liguria PATH usa un CSV locale per la Liguria invece dei percorsi /tmp/elezioni/extra.",
    "  --csv-calabria PATH usa un CSV locale per la Calabria invece dei percorsi /tmp/elezioni/extra.",
    "  --help             mostra questo aiuto.",
    "",
    `Sorgenti: voci scrutini degli ZIP DAIT (o copie CSV in /tmp/elezioni/extra se presenti).`,
    `Output: data/reali/elezioni-regionali-2024-liguria.json + data/reali/elezioni-regionali-2025-calabria.json (cap ${MAX_BYTE_OUT} byte ciascuno).`,
    "Solo aggregati per lista, zero nominativi: colonne candidato mai lette, Preferenze mai estratte.",
  ].join("\n");
}

interface Opzioni {
  limiteRighe: number | null;
  csvLiguria: string | null;
  csvCalabria: string | null;
}

/** Ritorna null se gli argomenti non sono validi (con messaggio su stderr). */
export function parseArgomenti(argv: string[]): Opzioni | "help" | null {
  let limiteRighe: number | null = null;
  let csvLiguria: string | null = null;
  let csvCalabria: string | null = null;
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
    if (arg === "--csv-liguria") {
      const raw = argv[i + 1] ?? "";
      i += 1;
      if (!raw) {
        console.error("--csv-liguria richiede un percorso");
        return null;
      }
      csvLiguria = raw;
      continue;
    }
    if (arg.startsWith("--csv-liguria=")) {
      csvLiguria = arg.slice("--csv-liguria=".length);
      if (!csvLiguria) {
        console.error("--csv-liguria richiede un percorso");
        return null;
      }
      continue;
    }
    if (arg === "--csv-calabria") {
      const raw = argv[i + 1] ?? "";
      i += 1;
      if (!raw) {
        console.error("--csv-calabria richiede un percorso");
        return null;
      }
      csvCalabria = raw;
      continue;
    }
    if (arg.startsWith("--csv-calabria=")) {
      csvCalabria = arg.slice("--csv-calabria=".length);
      if (!csvCalabria) {
        console.error("--csv-calabria richiede un percorso");
        return null;
      }
      continue;
    }
    console.error(`Argomento sconosciuto: ${arg}`);
    return null;
  }
  return { limiteRighe, csvLiguria, csvCalabria };
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

export interface SorgenteRegionale {
  nome: string;
  urlZip: string;
  voceZip: string;
  csvLocale: string;
  zipLocale: string;
  csvOverride: string | null;
  regioneAttesa: string;
  dataIso: string;
  formato: "liguria" | "calabria";
}

/** Risolve il CSV da parsare: override > CSV locale > voce da ZIP locale > download ZIP. */
async function risolviCsv(
  s: SorgenteRegionale,
  scaricati: string[],
): Promise<{ csv: string; urlProvenance: string }> {
  if (s.csvOverride && existsSync(s.csvOverride)) {
    return { csv: s.csvOverride, urlProvenance: s.urlZip };
  }
  if (existsSync(s.csvLocale)) return { csv: s.csvLocale, urlProvenance: s.urlZip };
  const estraiDaZip = (zip: string): string => {
    const destinazione = join(tmpdir(), `regionali-extra-${s.nome}-${Date.now()}.csv`);
    estraiVoceZip(zip, s.voceZip, destinazione);
    scaricati.push(destinazione);
    return destinazione;
  };
  if (existsSync(s.zipLocale)) return { csv: estraiDaZip(s.zipLocale), urlProvenance: s.urlZip };
  const zipTmp = join(tmpdir(), `regionali-extra-${s.nome}-${Date.now()}.zip`);
  const finale = await scaricaZip(s.urlZip, zipTmp);
  scaricati.push(zipTmp);
  return { csv: estraiDaZip(zipTmp), urlProvenance: finale };
}

export interface StatoRegione {
  righeLette: number;
  righeAggregate: number;
  righeScartate: number;
  righeSoloPresidente: number;
  /** Chiavi 1x per affluenza: Liguria (comune+sezione), Calabria (comune). */
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
  // e/v/b/k 1 sola volta per unita' (comune in Calabria, sezione in Liguria);
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
  formato: "liguria" | "calabria",
  stato: StatoRegione,
  limiteRighe: number | null,
): Promise<void> {
  // I CSV DAIT sono Latin-1: decodifica latin1 (come regionali Toscana/Umbria).
  const flusso = createReadStream(percorso, { encoding: "latin1" });
  const righe = createInterface({ input: flusso, crlfDelay: Infinity });
  let numeroRiga = 0;
  let headerVerificato = false;
  for await (const riga of righe) {
    if (riga.trim() === "") continue;
    numeroRiga += 1;
    const campi = spezzaRiga(riga);
    if (!headerVerificato) {
      const ok = formato === "liguria" ? isHeaderLiguria(campi) : isHeaderCalabria(campi);
      if (!ok) {
        throw new Error(`header ${formato} inatteso (riga 1): ${campi.length} colonne`);
      }
      headerVerificato = true;
      continue;
    }
    if (limiteRighe !== null && stato.righeLette >= limiteRighe) break;
    if (formato === "liguria" && campi.length !== HEADER_LIGURIA.length) {
      throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 20`);
    }
    if (formato === "calabria" && campi.length !== HEADER_CALABRIA.length) {
      throw new Error(`riga ${numeroRiga}: ${campi.length} colonne invece di 16`);
    }
    stato.righeLette += 1;
    const parsed =
      formato === "liguria"
        ? parseRigaLiguria(campi, numeroRiga)
        : parseRigaCalabria(campi, numeroRiga);
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
    .map(([n, v]) => ({
      n,
      v,
      p: stato.votiListe > 0 ? unaDecimale((v / stato.votiListe) * 100) : 0,
    }));
  const regioni = [
    {
      r: s.regioneAttesa,
      e: stato.e,
      v: stato.v,
      b: stato.b,
      k: stato.k,
      a: affluenza(stato.v, stato.e),
      liste,
    },
  ];
  if (regioni.length > MAX_REGIONI) {
    throw new Error(`regioni oltre il cap di ${MAX_REGIONI}`);
  }
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
      nome: "liguria-2024",
      urlZip: URL_ZIP_LIGURIA,
      voceZip: VOCE_ZIP_LIGURIA,
      csvLocale: CSV_LOCALE_LIGURIA,
      zipLocale: ZIP_LOCALE_LIGURIA,
      csvOverride: opzioni.csvLiguria,
      regioneAttesa: "LIGURIA",
      dataIso: DATA_ISO_LIGURIA,
      formato: "liguria",
    },
    {
      nome: "calabria-2025",
      urlZip: URL_ZIP_CALABRIA,
      voceZip: VOCE_ZIP_CALABRIA,
      csvLocale: CSV_LOCALE_CALABRIA,
      zipLocale: ZIP_LOCALE_CALABRIA,
      csvOverride: opzioni.csvCalabria,
      regioneAttesa: "CALABRIA",
      dataIso: DATA_ISO_CALABRIA,
      formato: "calabria",
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
        `[ingest-regionali-extra] ${s.nome} righe lette=${stato.righeLette} aggregate=${stato.righeAggregate} ` +
          `scartate=${stato.righeScartate} soloPresidente=${stato.righeSoloPresidente} comuni=${stato.comuni.size} liste=${stato.liste.size} ` +
          `e=${stato.e} v=${stato.v} top3: ${top3}`,
      );
    }
  } finally {
    await rimuoviTmp();
  }

  if (opzioni.limiteRighe !== null) {
    console.log("[ingest-regionali-extra] smoke --limite-righe: file JSON non scritti.");
    return;
  }

  const liguria = stati.get("liguria-2024");
  const calabria = stati.get("calabria-2025");
  if (!liguria || !calabria) throw new Error("stati regionali mancanti");

  // Serializza ENTRAMBI prima di scrivere: se uno supera il cap, nessun
  // file viene toccato (mai parziali su disco).
  const serializza = (envelope: unknown, etichetta: string): string => {
    const json = `${JSON.stringify(envelope)}\n`;
    const byte = Buffer.byteLength(json, "utf8");
    console.log(
      `[ingest-regionali-extra] output ${etichetta}: ${byte} byte (cap ${MAX_BYTE_OUT}).`,
    );
    if (byte > MAX_BYTE_OUT) {
      throw new Error(
        `output ${etichetta} ${byte} byte oltre il cap di ${MAX_BYTE_OUT}: nessun file scritto`,
      );
    }
    return json;
  };
  const envelopeLiguria = costruisciEnvelope(
    liguria.stato,
    sorgenti[0] as SorgenteRegionale,
    METODOLOGIA_LIGURIA,
    AVVERTENZE_LIGURIA,
    liguria.urlProvenance,
    recuperatoIl,
  );
  const envelopeCalabria = costruisciEnvelope(
    calabria.stato,
    sorgenti[1] as SorgenteRegionale,
    METODOLOGIA_CALABRIA,
    AVVERTENZE_CALABRIA,
    calabria.urlProvenance,
    recuperatoIl,
  );
  const jsonLiguria = serializza(envelopeLiguria, "liguria-2024");
  const jsonCalabria = serializza(envelopeCalabria, "calabria-2025");
  mkdirSync(DIR_REALI, { recursive: true });
  try {
    writeFileSync(FILE_OUT_LIGURIA, jsonLiguria, "utf8");
    writeFileSync(FILE_OUT_CALABRIA, jsonCalabria, "utf8");
  } catch (errore) {
    // Mai parziali: se la seconda scrittura fallisce, rimuovi la prima.
    try {
      await unlink(FILE_OUT_LIGURIA);
    } catch {
      // best-effort
    }
    try {
      await unlink(FILE_OUT_CALABRIA);
    } catch {
      // best-effort
    }
    throw errore;
  }
  console.log(
    `[ingest-regionali-extra] scritti data/reali/elezioni-regionali-2024-liguria.json (${Buffer.byteLength(jsonLiguria, "utf8")} byte) ` +
      `e data/reali/elezioni-regionali-2025-calabria.json (${Buffer.byteLength(jsonCalabria, "utf8")} byte).`,
  );
}

// Esecuzione diretta via tsx; importabile dai test senza effetti (mai rete).
const eseguitoDiretto =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("ingest-reale-regionali-extra.ts");
if (eseguitoDiretto) {
  main().catch((errore: unknown) => {
    const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
    console.error(`Ingest regionali-extra fallito, nessun file scritto: ${messaggio}`);
    process.exit(1);
  });
}
