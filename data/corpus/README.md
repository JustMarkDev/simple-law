# Corpus dimostrativo 100GB-ready

> Tutti i testi in questa cartella sono **dimostrativi e sintetici** (PRNG deterministico).
> Non sono testi ufficiali: per gli atti reali usare Normattiva e la Gazzetta Ufficiale.

## Obiettivo

Architettura corpose che scala da 5 atti a 100GB **senza cambiare codice**:

- shard JSONL gzip da ~50MB (`shard-00000.jsonl.gz`, ~7-10mila atti)
- un atto per riga: `RecordCorpus` + `testo` + `dimostrativo: true`
- `manifest.json` committabile (<100KB): versione, totale, shard con count/byte/checksum
- loader in streaming (`readline` + `zlib`), mai `readFile` intero sullo shard
- generatore deterministico `mulberry32` + `FNV-1a`, seed `simple-law-corpus-v1:<tema>:<tipo>:<anno>:<numero>`
- funzioni di accesso dati never-throw (`Esito<T>` = `{ ok: true, valore } | { ok: false, errore }`)

## Stratificazione: cosa è committato e cosa è servito

| Livello | Dove vive | Dimensione | Committato? | Servito a runtime? |
|---|---|---|---|---|
| 5 leggi seed (`SEED_LAWS`) | codice (`lib/seed-*.ts`) | pochi KB | sì | sì, sempre primi |
| 72 atti curati (`ATTI_ESPANSI`) | codice (bundle) | ~250KB di testi | sì | sì, via `convertiAttoEspanso` |
| 5000 runtime (default) | memoria (generati da `generaCorpus`) | ~25MB raw (~18MB con testo 3,5KB) | no (solo `manifest.json` <100KB) | sì, `CORPUS_TOTALE=5000` |
| Totale servito di default | `getCorpusUnificato()` | 5 + 82 + 4913 varianti = 5000 | solo codice + manifest | sì |
| Shard dimostrativi grandi | `data/corpus/incoming/` o `/tmp/` | oltre 1MB | MAI | no (solo CLI/streaming) |

> In breve: 82 curati nel bundle + 5000 runtime di default = ~5087 atti curati/generati
> di riferimento; il corpus unificato servito resta a 5000 record (`slice(0, totale)`)
> con dedup per ELI. `data/seed-espanso.json` è solo un artefatto di build, mai letto a request.

## Variabili d'ambiente (runtime web)

| Variabile | Default | Intervallo | Note |
|---|---|---|---|
| `CORPUS_TOTALE` | `5000` | clamp `77..20000` | totale servito da `getCorpusUnificato()` |
| `CORPUS_SEED` | `simple-law-v1` | trim, max 80 caratteri | chiave cache `totale:seed` |
| `CORPUS_KB_MEDIO` | `4` | `1..6`, solo CLI | dimensione testi varianti |
| `CORPUS_MAX_MS` | `250` | timeout in ms | oltre il timeout, fallback ai 87 (5 seed + 82 curati) |
| `DATABASE_URL` | (assente) | — | se presente vince sul corpus generato |

Cap memoria 20000: 5000 atti × ~5KB ≈ 25MB raw, gestibile in serverless solo con
singleton + paginazione; 95k atti ≈ 475MB (OOM). Oltre i 20000 solo streaming su shard.

## Layout

```text
data/corpus/
  README.md            # questo file (committato)
  manifest.json        # committato se <100KB
  shard-00000.jsonl.gz # NON committare sopra 1MB
  shard-00001.jsonl.gz
  incoming/            # area di lavoro, ignorata da git
```

`.gitignore` consigliato (a cura del proprietario del file, non toccato qui):

```text
data/corpus/*.gz
data/corpus/*.jsonl
data/corpus/incoming/
!data/corpus/README.md
!data/corpus/manifest.json
```

## Formati

ELI canonico: `/eli/it/<tipo>/<anno>/<numero>` (es. `/eli/it/legge/2024/12`).
NIR canonico: `urn:nir:stato:<tipo>:<anno>;<numero>` (es. `urn:nir:stato:legge:2024;12`).
ELI e NIR sono unici per costruzione: `(tipo, anno, numero)` deriva dall'indice globale.

Date: anni realistici 1948-2026 in generazione; la verifica accetta 1861-2026
(per compatibilità con lo storico Normattiva).
Testi: 1,5-6KB con articoli numerati e rinvii incrociati fittizi.

Esempio di `manifest.json`:

```json
{
  "versione": "simple-law-corpus-v1",
  "totaleAtti": 5000,
  "generatoIl": "2026-01-01T00:00:00.000Z",
  "seed": "simple-law-corpus-v1",
  "shard": [
    { "file": "shard-00000.jsonl.gz", "count": 5000, "bytes": 1234567, "checksumSha256": "…" }
  ],
  "checksumSha256": "…"
}
```

## Comandi

```bash
# Generatore runtime (default 5000, cap 20000, output in incoming/ mai committato)
bunx tsx scripts/generate-corpus-massivo.ts --totale 5000 --kb-medio 4 --seed simple-law-v1 --output data/corpus/incoming/shard-demo.jsonl.gz

# Prova locale piccola
bunx tsx scripts/generate-corpus-massivo.ts --totale 500 --output /tmp/shard-demo.jsonl.gz

# Shard grandi in streaming (oltre i 20000, fino a 200k/100GB): sempre in incoming/ o /tmp/
bunx tsx scripts/corpus-100gb.ts generate --totale=5000 --seed=simple-law-corpus-v1 --dir=data/corpus/incoming

# Verifica ELI/NIR unici, date, testi, checksum (esce con codice 1 se fallisce)
bunx tsx scripts/corpus-100gb.ts verify --dir=data/corpus/incoming

# Verifica rapida su corpus enormi (prime 1000 righe per shard)
bunx tsx scripts/corpus-100gb.ts verify --dir=data/corpus/incoming --max-righe=1000

# Statistiche da manifest + campione streaming (sicuro su 100GB)
bunx tsx scripts/corpus-100gb.ts stats --dir=data/corpus/incoming

# Test
npx vitest run tests/corpus-100gb.test.ts
```

## Regole di commit

- Committare solo `README.md`, codice e `manifest.json` (<100KB). Mai JSON/shard >1MB.
- Non generare file enormi nel commit: l'output dei generatori va in `/tmp/` o in
  `data/corpus/incoming/` (gitignored), mai in `data/corpus/` radice né in `data/*.json`.
- Default runtime 5000 atti (5 seed + 82 curati + 4913 varianti); bundle committato = 82 curati.
- `NUMERI_RISERVATI [8,36,124,133,139]` mai nelle varianti generate.
- Stima 100GB: ~2000 shard da 50MB gzip, ~8mila atti l'uno, ~16 milioni di atti.

## Come scalare a 200k / 100GB

1. **Fino a 20000 (memoria):** alza `CORPUS_TOTALE` (clamp `77..20000`).
   `getCorpusUnificato()` genera le varianti via `generaCorpus(totale, seed, 4)`
   con ELI unici e numeri riservati esclusi.
2. **Oltre 20000 (shard):** genera shard streaming con
   `scripts/corpus-100gb.ts generate --totale=200000 --dir=/tmp/corpus --per-shard=8000`,
   poi leggi con `lib/corpus.ts` (`paginaShard` / `cercaInShard` / `contaShard`)
   senza mai caricare tutto in memoria.
3. **Produzione (Postgres):** imposta `DATABASE_URL`; il DB vince sul corpus generato
   e l'archivio pagina con `listLaws({page, per})` (default 12, max 48), dettaglio con
   `generateStaticParams` su 200-500 recenti + ISR, sitemap con `listLawsCursor` a chunk.
4. **Budget:** p95 <300ms warm, <800ms cold; oltre il timeout `CORPUS_MAX_MS=250`
   scatta il fallback ai 87 (5 seed + 82 curati).

## API della libreria (`lib/corpus.ts`)

- `generaRecord(indice, seed)` e `generaCorpus(totale, seed)` — deterministici.
- `scriviShardJsonlGzip`, `contaShard`, `paginaShard` — streaming + paginazione.
- `cercaInShard` — FTS semplice con punteggio titolo > sintesi > testo e frase esatta `"…"`.
- `verificaShard`, `validaRecord`, `statisticheCorpus` — mai lanciano eccezioni.
