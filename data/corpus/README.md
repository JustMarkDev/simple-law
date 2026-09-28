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
# Genera 5000 atti di default (sicuro per il commit: solo manifest, mai shard >1MB)
npx tsx scripts/corpus-100gb.ts generate --totale=5000 --seed=simple-law-corpus-v1

# Shard più piccoli per prove locali
npx tsx scripts/corpus-100gb.ts generate --totale=500 --per-shard=500

# Verifica ELI/NIR unici, date, testi, checksum (esce con codice 1 se fallisce)
npx tsx scripts/corpus-100gb.ts verify --dir=data/corpus

# Verifica rapida su corpus enormi (prime 1000 righe per shard)
npx tsx scripts/corpus-100gb.ts verify --dir=data/corpus --max-righe=1000

# Statistiche da manifest + campione streaming (sicuro su 100GB)
npx tsx scripts/corpus-100gb.ts stats --dir=data/corpus

# Test
npx vitest run tests/corpus-100gb.test.ts
```

## Regole di commit

- Committare solo `README.md`, codice e `manifest.json` (<100KB).
- Non generare file enormi nel commit: generare al massimo 5000 atti in locale
  e non committare nessuno shard sopra 1MB.
- Stima 100GB: ~2000 shard da 50MB gzip, ~8mila atti l'uno, ~16 milioni di atti.

## API della libreria (`lib/corpus.ts`)

- `generaRecord(indice, seed)` e `generaCorpus(totale, seed)` — deterministici.
- `scriviShardJsonlGzip`, `contaShard`, `paginaShard` — streaming + paginazione.
- `cercaInShard` — FTS semplice con punteggio titolo > sintesi > testo e frase esatta `"…"`.
- `verificaShard`, `validaRecord`, `statisticheCorpus` — mai lanciano eccezioni.
