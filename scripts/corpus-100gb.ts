#!/usr/bin/env tsx
/**
 * scripts/corpus-100gb.ts — CLI 100GB-ready: generate / verify / stats.
 * Resta il percorso per shard grandi (streaming, oltre il cap memoria di 20000):
 * generate scrive shard-*.jsonl.gz in streaming senza tenerli in memoria.
 * Uso:
 *   npx tsx scripts/corpus-100gb.ts generate --totale=5000 --seed=simple-law-corpus-v1 --dir=data/corpus/incoming --per-shard=8000
 *   npx tsx scripts/corpus-100gb.ts verify --dir=data/corpus/incoming --max-errori=20
 *   npx tsx scripts/corpus-100gb.ts stats --dir=data/corpus/incoming
 * Testi e messaggi sempre in italiano.
 *
 * Nota vincolante: gli shard grandi NON si committano mai (limite 1MB per file
 * committato). Generare sempre in `data/corpus/incoming/` o `/tmp/...` (gitignored);
 * committare solo codice + `manifest.json` <100KB + README. Per il runtime web
 * (default CORPUS_TOTALE=5000) usare `scripts/generate-corpus-massivo.ts`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  VERSIONE_CORPUS,
  DIR_CORPUS_DEFAULT,
  RIGHE_PER_SHARD_DEFAULT,
  costruisciManifest,
  generaRecord,
  leggiManifest,
  salvaManifest,
  calcolaSha256File,
  verificaShard,
  statisticheCorpus,
  type InfoShard,
} from '../lib/corpus';

function prendiOpzione(args: string[], nome: string, fallback = ''): string {
  const prefisso = `--${nome}=`;
  for (const a of args) {
    if (a.startsWith(prefisso)) return a.slice(prefisso.length);
  }
  const indice = args.indexOf(`--${nome}`);
  if (indice >= 0 && indice + 1 < args.length && !args[indice + 1].startsWith('--')) {
    return args[indice + 1];
  }
  return fallback;
}

function prendiIntero(args: string[], nome: string, fallback: number): number {
  const grezzo = prendiOpzione(args, nome, '');
  if (!grezzo) return fallback;
  const valore = Number.parseInt(grezzo, 10);
  return Number.isFinite(valore) ? valore : fallback;
}

function nomeShard(indice: number): string {
  return `shard-${String(indice).padStart(5, '0')}.jsonl.gz`;
}

function* generatoreRecord(totale: number, seed: string): Generator<string> {
  for (let i = 0; i < totale; i++) {
    yield JSON.stringify(generaRecord(i, seed)) + '\n';
  }
}

async function comandoGenerate(args: string[]): Promise<number> {
  const totale = prendiIntero(args, 'totale', 5000);
  const perShard = prendiIntero(args, 'shard', prendiIntero(args, 'per-shard', RIGHE_PER_SHARD_DEFAULT));
  const seed = prendiOpzione(args, 'seed', VERSIONE_CORPUS);
  const dir = prendiOpzione(args, 'dir', DIR_CORPUS_DEFAULT);

  if (!Number.isInteger(totale) || totale < 1 || totale > 200000) {
    console.error('Errore: --totale deve essere un intero tra 1 e 200000.');
    return 1;
  }
  if (!Number.isInteger(perShard) || perShard < 100 || perShard > 20000) {
    console.error('Errore: --per-shard deve essere un intero tra 100 e 20000.');
    return 1;
  }
  if (!seed || seed.length > 200) {
    console.error('Errore: --seed da 1 a 200 caratteri.');
    return 1;
  }

  await fs.promises.mkdir(dir, { recursive: true });
  const numeroShard = Math.ceil(totale / perShard);
  console.log(`Generazione di ${totale} atti dimostrativi in ${numeroShard} shard (seed: ${seed})…`);

  const { createGzip } = await import('node:zlib');
  const infoShard: InfoShard[] = [];
  for (let s = 0; s < numeroShard; s++) {
    const inizio = s * perShard;
    const fine = Math.min(totale, inizio + perShard);
    const nome = nomeShard(s);
    const percorso = path.join(dir, nome);
    const gzip = createGzip();
    const uscita = fs.createWriteStream(percorso);
    const completato = new Promise<void>((risolvi, rifiuta) => {
      uscita.on('finish', () => risolvi());
      uscita.on('error', (e) => rifiuta(e));
      gzip.on('error', (e) => rifiuta(e));
    });
    gzip.pipe(uscita);
    for (let i = inizio; i < fine; i++) {
      const riga = JSON.stringify(generaRecord(i, seed)) + '\n';
      if (!gzip.write(riga)) {
        await new Promise<void>((risolvi) => gzip.once('drain', () => risolvi()));
      }
      if ((i - inizio + 1) % 2000 === 0) {
        console.log(`  ${nome}: ${i - inizio + 1}/${fine - inizio} atti…`);
      }
    }
    gzip.end();
    await completato;
    const stat = await fs.promises.stat(percorso);
    const esitoHash = await calcolaSha256File(percorso);
    if (!esitoHash.ok) {
      console.error(`Errore: ${esitoHash.errore}`);
      return 1;
    }
    infoShard.push({ file: nome, count: fine - inizio, bytes: stat.size, checksumSha256: esitoHash.valore });
    console.log(`  ${nome}: ${fine - inizio} atti, ${(stat.size / 1024).toFixed(1)} KB, sha256 ${esitoHash.valore.slice(0, 12)}…`);
  }

  // Usa il generatore anche in forma iterable per evitare codice morto e riuso futuro.
  void generatoreRecord;

  const manifest = costruisciManifest(infoShard, seed);
  const esitoSalvataggio = await salvaManifest(path.join(dir, 'manifest.json'), manifest);
  if (!esitoSalvataggio.ok) {
    console.error(`Errore: ${esitoSalvataggio.errore}`);
    return 1;
  }
  console.log(`Completato: ${totale} atti, ${infoShard.length} shard. Manifest aggiornato in ${path.join(dir, 'manifest.json')}.`);
  console.log('Promemoria: non committare shard sopra 1MB (vedi data/corpus/README.md). Genera in data/corpus/incoming/ o /tmp.');
  return 0;
}

async function comandoVerify(args: string[]): Promise<number> {
  const dir = prendiOpzione(args, 'dir', DIR_CORPUS_DEFAULT);
  const maxErrori = prendiIntero(args, 'max-errori', 20);
  const maxRighe = prendiIntero(args, 'max-righe', 0);
  const esitoManifest = await leggiManifest(path.join(dir, 'manifest.json'));
  if (!esitoManifest.ok) {
    console.error(`Verifica fallita: ${esitoManifest.errore}`);
    return 1;
  }
  const manifest = esitoManifest.valore;
  console.log(`Verifica di ${manifest.totaleAtti} atti in ${manifest.shard.length} shard…`);
  const eliVisti = new Set<string>();
  const nirVisti = new Set<string>();
  let totaleRighe = 0;
  const erroriGlobali: string[] = [];

  for (const info of manifest.shard) {
    const percorso = path.join(dir, info.file);
    let presente = false;
    try {
      const stat = await fs.promises.stat(percorso);
      presente = stat.isFile();
      if (stat.size !== info.bytes) {
        erroriGlobali.push(`${info.file}: dimensione ${stat.size} diversa da manifest ${info.bytes}.`);
      }
    } catch {
      erroriGlobali.push(`${info.file}: file mancante.`);
    }
    if (!presente) continue;
    const esitoHash = await calcolaSha256File(percorso);
    if (!esitoHash.ok) {
      erroriGlobali.push(`${info.file}: ${esitoHash.errore}`);
      continue;
    }
    if (esitoHash.valore !== info.checksumSha256) {
      erroriGlobali.push(`${info.file}: checksum ${esitoHash.valore} diverso da manifest ${info.checksumSha256}.`);
    }
    const esito = await verificaShard(percorso, { maxErrori, maxRighe, eliVisti, nirVisti });
    if (!esito.ok) {
      erroriGlobali.push(`${info.file}: ${esito.errore}`);
    } else {
      totaleRighe += esito.valore.totaleRighe;
      for (const e of esito.valore.errori) erroriGlobali.push(`${info.file}: ${e}`);
      if (esito.valore.totaleRighe !== info.count && maxRighe === 0) {
        erroriGlobali.push(`${info.file}: righe ${esito.valore.totaleRighe} diverse da manifest ${info.count}.`);
      }
    }
    if (erroriGlobali.length >= maxErrori) break;
  }

  if (erroriGlobali.length > 0) {
    console.error(`Verifica fallita: ${erroriGlobali.length} problemi (mostrati i primi ${Math.min(erroriGlobali.length, maxErrori)}).`);
    for (const e of erroriGlobali.slice(0, maxErrori)) console.error(`  - ${e}`);
    return 1;
  }
  console.log(`Verifica riuscita: ${totaleRighe} righe, ELI unici ${eliVisti.size}, NIR unici ${nirVisti.size}.`);
  return 0;
}

async function comandoStats(args: string[]): Promise<number> {
  const dir = prendiOpzione(args, 'dir', DIR_CORPUS_DEFAULT);
  const esito = await statisticheCorpus(dir, 500);
  if (!esito.ok) {
    console.error(`Statistiche non disponibili: ${esito.errore}`);
    return 1;
  }
  const s = esito.valore;
  console.log(`Corpus: ${s.totaleAtti} atti in ${s.numeroShard} shard, ${(s.byteTotali / 1024 / 1024).toFixed(2)} MB totali.`);
  console.log(`Media per atto: ${s.byteMediPerAtto} byte (compresso). Righe campionate: ${s.righeCampionate}.`);
  console.log('Per tipo (campione):');
  for (const [tipo, n] of Object.entries(s.perTipo).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${tipo}: ${n}`);
  }
  return 0;
}

async function main(): Promise<number> {
  const [, , comando, ...args] = process.argv;
  if (comando === 'generate') return comandoGenerate(args);
  if (comando === 'verify') return comandoVerify(args);
  if (comando === 'stats') return comandoStats(args);
  console.log('Uso: corpus-100gb.ts <generate|verify|stats> [--totale=5000] [--per-shard=8000] [--seed=...] [--dir=data/corpus/incoming]');
  console.log('Esempio: npx tsx scripts/corpus-100gb.ts generate --totale=5000 --dir=data/corpus/incoming');
  console.log('Nota: gli shard grandi non si committano mai; usare data/corpus/incoming/ o /tmp.');
  return comando === undefined ? 0 : 1;
}

const invocatoDiretto = process.argv[1]?.endsWith('corpus-100gb.ts') ?? false;
if (invocatoDiretto) {
  main().then(
    (codice) => {
      process.exitCode = codice;
    },
    (errore) => {
      console.error(`Errore imprevisto: ${(errore as Error).message}`);
      process.exitCode = 1;
    },
  );
}
