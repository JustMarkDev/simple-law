/**
 * Generatore di corpus massivo dimostrativo a partire dal seed espanso.
 *
 * Strategia di scaling (SENTENZA vincolante):
 * - default --totale 5000 (5 seed + 72 curati + 4923 varianti nel corpus unificato)
 * - cap memoria 20000: oltre solo streaming CLI via `lib/corpus.ts`
 *   (paginaShard/cercaInShard/contaShard) su `shard-*.jsonl.gz`.
 * - Output >1MB va in `/tmp` o `data/corpus/incoming/` (gitignored), MAI committato.
 *   Committabili solo: codice + 72 curati + `data/corpus/manifest.json` <100KB + README.
 *
 * Uso:
 *   npx tsx scripts/generate-corpus-massivo.ts --totale 5000 --kb-medio 4 --seed simple-law-v1 --output data/corpus/incoming/shard-demo.jsonl.gz
 *   npx tsx scripts/generate-corpus-massivo.ts --totale 500 --output /tmp/shard-demo.jsonl.gz
 *
 * - Mai Parquet/SQLite/S3/Bloom: solo JSONL (anche gzip) con Node integrato.
 * - Deterministico: mulberry32 + FNV-1a, seme `simple-law-corpus-v1:<tema>:<tipo>:<anno>:<indice>`.
 * - ELI/NIR sempre validi e unici; numeri riservati 8,36,124,133,139 mai usati.
 * - Testi in italiano, 300-800 parole per gli atti base; le varianti restano leggibili.
 * - `generaCorpus` / `generaVariante` sono riusabili senza CLI (import puro, mai side-effect
 *   all'import: la scrittura avviene solo nel blocco `eseguitoComeCli`).
 */

import { createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import {
  ATTI_ESPANSI,
  NUMERI_RISERVATI,
  contaParole,
  fnv1a,
  mulberry32,
  type AttoEspanso,
} from "../lib/seed-data-espansa";

interface Opzioni {
  totale: number;
  kbMedio: number;
  seed: string;
  output: string;
}

// Allineato a CORPUS_TOTALE (default 5000, clamp 77..20000) e CORPUS_KB_MEDIO (1..6, solo CLI).
// Il cap 20000 protegge la memoria (~25MB raw a 5000 atti): oltre usare lo streaming
// su shard via `scripts/corpus-100gb.ts` + `lib/corpus.ts`.
export const TOTALE_DEFAULT = 5000;
export const TOTALE_MASSIMO_MEMORIA = 20000;
export const KB_MEDIO_DEFAULT = 4;
export const KB_MEDIO_MINIMO = 1;
export const KB_MEDIO_MASSIMO = 6;

const NUMERI_VIETATI = new Set<number>([...NUMERI_RISERVATI]);

function leggiOpzioni(argv: string[]): Opzioni {
  const opzioni: Opzioni = {
    totale: TOTALE_DEFAULT,
    kbMedio: KB_MEDIO_DEFAULT,
    seed: "simple-law-v1",
    output: "data/corpus/incoming/shard-demo.jsonl.gz",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--totale" && argv[i + 1]) {
      const v = Number(argv[i + 1]);
      if (Number.isInteger(v) && v >= 1 && v <= TOTALE_MASSIMO_MEMORIA) opzioni.totale = v;
      i++;
    } else if (arg === "--kb-medio" && argv[i + 1]) {
      const v = Number(argv[i + 1]);
      if (Number.isFinite(v) && v >= KB_MEDIO_MINIMO && v <= KB_MEDIO_MASSIMO) opzioni.kbMedio = v;
      i++;
    } else if (arg === "--seed" && argv[i + 1]) {
      const s = String(argv[i + 1]).trim().slice(0, 80);
      if (s.length > 0) opzioni.seed = s;
      i++;
    } else if (arg === "--output" && argv[i + 1]) {
      const s = String(argv[i + 1]).trim().slice(0, 300);
      if (s.length > 0) opzioni.output = s;
      i++;
    }
  }
  return opzioni;
}

function numeroSicuro(base: number, indice: number): number {
  // Spazio ampio per 200k atti unici (fix P0 collisioni): base + stride primo,
  // senza modulo 4800. Range 1000..95000, salta i riservati.
  let candidato = base + indice * 137 + Math.floor(indice / 72) * 11 + 1000;
  candidato = 1000 + ((candidato - 1000) % 90000);
  let tentativi = 0;
  while (NUMERI_VIETATI.has(candidato) && tentativi < 50) {
    candidato = 1000 + ((candidato - 1000 + 1) % 90000);
    tentativi++;
  }
  return candidato;
}

const FRASI_RIEMPITIVE = [
  "La disposizione si applica nel rispetto del principio di proporzionalità e con oneri amministrativi contenuti per i destinatari.",
  "Il monitoraggio avviene con indicatori pubblici e aggiornati, pubblicati in formato aperto sul sito dell'amministrazione competente.",
  "Le regioni provvedono all'adeguamento dei propri ordinamenti entro centoventi giorni, sentita la Conferenza Stato-Regioni.",
  "Resta ferma la tutela giurisdizionale davanti al giudice competente, con rito abbreviato quando ricorrono ragioni di urgenza.",
  "La relazione tecnica quantifica gli oneri senza nuovi maggiori oneri a carico della finanza pubblica.",
] as const;

function adattaDimensioneTesto(testoBase: string, kbMedio: number, rnd: () => number): string {
  const obiettivoByte = Math.max(800, Math.min(60000, Math.round(kbMedio * 1024)));
  let testo = testoBase;
  let i = 0;
  while (Buffer.byteLength(testo, "utf8") < obiettivoByte && i < 40) {
    testo += ` ${FRASI_RIEMPITIVE[Math.floor(rnd() * FRASI_RIEMPITIVE.length) % FRASI_RIEMPITIVE.length]}`;
    i++;
  }
  return testo;
}

export function generaVariante(base: AttoEspanso, indice: number, seedRadice: string): AttoEspanso {
  const seme = fnv1a(`simple-law-corpus-v1:${base.tema}:${base.tipo}:${base.anno}:${seedRadice}:${indice}`);
  const rnd = mulberry32(seme);
  const numero = numeroSicuro(base.numero, indice);
  const slug = base.eli.split("/")[2] ?? "legge";
  const slugNir = slug.replace(/-/g, ".");
  const eli = `/eli/${slug}/${base.anno}/${numero}`;
  const [giorno, mese] = [base.dataEmanazione.slice(8, 10), base.dataEmanazione.slice(5, 7)];
  const nir = `urn:nir:stato:${slugNir}:${base.anno}-${mese}-${giorno};${numero}`;
  const variante = Math.floor(indice / Math.max(1, ATTI_ESPANSI.length)) + 1;
  const fraseAggiuntiva = scegliFrase(rnd);
  const testo = `${base.testo}\n\nNota di variante dimostrativa ${variante}. ${fraseAggiuntiva}`;
  return {
    ...base,
    eli,
    nir,
    numero,
    titolo: `${base.titolo} (variante dimostrativa ${variante})`,
    testo,
    dimostrativo: true,
    rinviiEli: [...base.rinviiEli],
  };
}

function scegliFrase(rnd: () => number): string {
  return FRASI_RIEMPITIVE[Math.floor(rnd() * FRASI_RIEMPITIVE.length) % FRASI_RIEMPITIVE.length] as string;
}

/**
 * Genera fino a `totale` atti in memoria (max 20000). Riusabile senza CLI:
 * non legge argv, non scrive file, non lancia verso l'esterno oltre il warn
 * di spazio esaurito. I numeri riservati [8,36,124,133,139] non compaiono mai
 * nelle varianti (solo negli atti base curati, se presenti). ELI sempre unici.
 */
export function generaCorpus(totale: number, seed: string, kbMedio: number): AttoEspanso[] {
  const risultato: AttoEspanso[] = [];
  const visti = new Set<string>();
  // Prima gli atti base curati, poi le varianti deterministiche.
  let indice = 0;
  while (risultato.length < totale) {
    const base = ATTI_ESPANSI[indice % ATTI_ESPANSI.length] as AttoEspanso;
    const ciclo = Math.floor(indice / ATTI_ESPANSI.length);
    let candidato: AttoEspanso;
    if (ciclo === 0) {
      candidato = indice < ATTI_ESPANSI.length ? base : generaVariante(base, indice, seed);
    } else {
      candidato = generaVariante(base, indice, seed);
    }
    if (!visti.has(candidato.eli)) {
      const rnd = mulberry32(fnv1a(`${seed}:${candidato.eli}`));
      const testoAdattato = ciclo === 0 ? candidato.testo : adattaDimensioneTesto(candidato.testo, kbMedio, rnd);
      visti.add(candidato.eli);
      risultato.push({ ...candidato, testo: testoAdattato });
    }
    indice++;
    if (indice > totale * 10 + 5000) break;
  }
  if (risultato.length < totale) {
    console.warn(`generate-corpus-massivo: richiesti ${totale}, generati ${risultato.length} (spazio ELI esaurito)`);
  }
  return risultato.slice(0, totale);
}

async function scriviJsonl(atti: AttoEspanso[], percorso: string): Promise<void> {
  const gzip = percorso.endsWith(".gz");
  const flusso = createWriteStream(percorso);
  const destinazione = gzip ? createGzip() : null;
  if (destinazione) destinazione.pipe(flusso);
  const scrittore = destinazione ?? flusso;
  for (const a of atti) {
    const riga = JSON.stringify({ ...a, dimostrativo: true });
    const ok = scrittore.write(`${riga}\n`);
    if (!ok) {
      await new Promise<void>((risolvi) => scrittore.once("drain", () => risolvi()));
    }
  }
  await new Promise<void>((risolvi, rifiuta) => {
    const chiudi = () => risolvi();
    scrittore.once("error", rifiuta);
    flusso.once("error", rifiuta);
    if (destinazione) {
      destinazione.end(() => chiudi());
    } else {
      scrittore.end(() => chiudi());
    }
  });
}

async function principale(): Promise<void> {
  const opzioni = leggiOpzioni(process.argv.slice(2));
  const atti = generaCorpus(opzioni.totale, opzioni.seed, opzioni.kbMedio);
  const eliUnici = new Set(atti.map((a) => a.eli)).size;
  const paroleTotali = atti.reduce((s, a) => s + contaParole(a.testo), 0);
  const paroleMedie = atti.length > 0 ? Math.round(paroleTotali / atti.length) : 0;
  try {
    await scriviJsonl(atti, opzioni.output);
  } catch {
    console.error(`Impossibile scrivere il file di output: ${opzioni.output}`);
    process.exit(1);
    return;
  }
  console.log(
    `Corpus generato: ${atti.length} atti (${eliUnici} ELI unici), ${paroleMedie} parole medie per testo, file ${opzioni.output}.`,
  );
  try {
    const { statSync } = await import("node:fs");
    const dimensione = statSync(opzioni.output).size;
    if (dimensione > 1024 * 1024) {
      console.log(
        `Promemoria: il file supera 1MB (${(dimensione / 1024 / 1024).toFixed(2)} MB). ` +
          `Tienilo in /tmp o data/corpus/incoming/ (gitignored) e non committarlo. ` +
          `Committabili solo codice + manifest.json <100KB + README.`,
      );
    }
  } catch {
    // Stat informativo: mai un lancio verso l'esterno.
  }
}

const eseguitoComeCli =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  (process.argv[1]?.endsWith("generate-corpus-massivo.ts") ||
    process.argv[1]?.endsWith("generate-corpus-massivo.js"));

if (eseguitoComeCli) {
  void principale();
}
