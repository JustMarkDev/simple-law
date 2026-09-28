# SimpleLaw Italia

Dati politici italiani + semplificatore di leggi con AI. Interfaccia e contenuti in **italiano**.

Stack: **Next.js 15 (App Router)**, **TypeScript strict**, **Tailwind CSS**, **Prisma + PostgreSQL**
(Neon / Vercel Postgres) con **fallback ai dati seed**, **Vitest**, **Vercel Cron** per l'ingest.

## Avvio rapido

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # test unitari e smoke test delle API
npm run typecheck  # tsconfig strict, nessun errore
npm run lint       # ESLint, zero warning
```

Il database **non e' obbligatorio**: senza `DATABASE_URL` l'app usa i dati inclusi nel bundle
(`lib/seed-data.ts`) e tutte le API continuano a funzionare.

## Variabili d'ambiente

Copia `.env.example` in `.env.local`. Tutte le variabili sono opzionali in sviluppo.

| Variabile              | Descrizione                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`         | Postgres (Neon / Vercel Postgres). Assente -> fallback seed.       |
| `LLM_API_KEY`          | Chiave di un provider compatibile OpenAI. Assente -> euristica.    |
| `LLM_BASE_URL`         | Base URL del provider (default `https://api.openai.com/v1`).       |
| `LLM_MODEL`            | Modello usato (default `gpt-4o-mini`).                             |
| `NEXT_PUBLIC_SITE_URL` | Base per link assoluti e feed RSS.                                 |
| `CRON_SECRET`          | Se impostato richiede `Bearer` su cron/sync. Se assente: aperto in dev/test, `401` in `production` (fail-closed). |

Nessun segreto va committato: `.env*` e' in `.gitignore`.

## Database e fallback

`lib/db.ts` espone un singleton Prisma che vale `null` quando `DATABASE_URL` manca.

- `getLawsFromDBorSeed()`, `getLawByEli()`, `listMinisters()` provano prima il DB e, in caso di
  errore o risultato vuoto, restituiscono i dati seed. **Non lanciano mai eccezioni.**
- `persistLaws()` e `recordIngestRun()` restituiscono `0` / `false` senza DB.
- `GET /api/health` riporta `db: "connected" | "seed"`.

Bootstrap schema e dati:

```bash
npm run prisma:generate   # genera il client (eseguito anche in postinstall)
npm run prisma:push       # crea le tabelle (richiede DATABASE_URL)
npm run db:seed           # carica leggi e ministri
npm run db:seed:espanso            # genera data/seed-espanso.json (default 240 atti offline, dimostrativo:true; usa --totale=1500 per test di scala)
npm run db:seed:espanso -- --apply # + upsert in DB (richiede DATABASE_URL)
```

Piano 100 GB: il corpus reale arriva via `sync:storico` a chunk (`limit`/`pageSize`/`maxPages`),
`persistLaws` deduplica per ELI e scrive in sequenza, la lista usa filtri/skip/take lato DB
(`listLaws` via `wherePrisma`/`orderByPrisma`) e `queryLaws` usa `where`+`take` server-side per export/persona
(evita full-scan), la UI pagina a 12 per pagina. `data/seed-espanso.json` serve per test di scala senza rete.

Modelli Prisma: `Law` (chiave `eli`), `Minister` (chiave `slug`), `IngestRun`.

## API

Tutte le route rispondono JSON e non restituiscono 500 se il DB manca.

| Metodo | Route                        | Descrizione                                             |
| ------ | ---------------------------- | ------------------------------------------------------- |
| GET    | `/api/health`                | `{ok, db, time}`                                        |
| GET    | `/api/leggi?q=&tipo=&anno=&sort=&page=&per=` | elenco norme: `q` max 200, `tipo` max 80, `anno` YYYY 1800-2100 (altrimenti ignorato), `sort` data_desc\|data_asc\|titolo_asc\|gulpease_desc\|qualita_desc, `page` 1..10000, `per` alias `limit` 1..200. Risponde `{items,total,page,per}` + `count=total` |
| GET    | `/api/leggi/[...eli]`        | dettaglio `{law,ui,simplified,quality,fonti,memorizzata}` (`ui` = forma UI con semaforo/riquadri; `?eli=` max 500; 404 se ignota) |
| GET    | `/api/ministri`              | elenco ministri                                         |
| GET    | `/api/ministri/[slug]`       | dettaglio ministro                                      |
| GET    | `/api/cdm`                   | comunicati del Governo (live con fallback seed)         |
| GET    | `/api/export`                | export del corpus: `?formato=csv\|json&q=&tipo=&anno=` (max 5000 righe; CSV 12 colonne con BOM, anti-injection `'=+-@\|%;"` dopo spazi/controlli inclusi BOM/unicode/bidi, `attachment` + `no-store`; 400 se formato non valido) |
| GET    | `/api/statistiche`           | aggregati del corpus + snapshot economico               |
| GET    | `/api/feed`                  | feed RSS delle ultime norme                             |
| GET    | `/api/cron/ingest`           | ingest da Vercel Cron (sempre 200)                      |
| GET    | `/api/sync/storico`          | bulk storico Normattiva (`limit`, `maxPages` <= 10, `denominazioni`, `collezioni`) |
| GET    | `/api/sync/recente`          | atti aggiornati (`dal`, `al`, `limit`)                  |
| GET    | `/api/parlamento...`         | deputati, senatori, gruppi, DDL leg19 (`q`, `gruppo`, `page`, `per`<=100; mai 500) |
| GET    | `/api/elezioni...`           | consultazioni, dettaglio, comuni (`q`, `page`, `per`<=100; mai 500) |
| GET    | `/api/eurlex...`             | atti UE CELLAR con recepimenti (`q`, `tipo`, `page`, `per`; mai 500) |
| GET    | `/api/quirinale`             | atti e comunicati del Quirinale (mai 500)               |
| GET    | `/api/consulta...`           | pronunce Corte Costituzionale (mai 500)                 |
| GET    | `/api/controllo...`          | contratti ANAC, provvedimenti GA, documenti CNEL (`tipo`, `q`; mai 500) |
| GET    | `/api/gazzetta`              | ultima GU: solo metadati + link ufficiali (mai 500)     |

Le route `/api/sync/storico` e `/api/sync/recente`, come `/api/cron/ingest`, richiedono
`Authorization: Bearer <CRON_SECRET>` **se** `CRON_SECRET` e' impostato; senza la
variabile restano aperte solo fuori produzione (`NODE_ENV!=production`), in `production`
rispondono `401` fail-closed. La pagina `/semplifica` e' uno strumento offline (nessuna scrittura):
form GET `?titolo=` (max 500) + `?testo=` (20-20000) con anteprima a 5 caselle via `simplifyLaw`,
`?eli=` per singola scheda, `?confronta=eliA,eliB` per confronto di 2 atti. La pagina `/salvati` mostra i preferiti locali
(`localStorage["simple-law:preferiti:v1"]`, max 200 ELI, stella ☆/★ sulle card).

Esempio:

```bash
curl "http://localhost:3000/api/leggi?q=carburanti"
curl "http://localhost:3000/api/leggi/eli/id/2026/07/27/26G00155/sg"
curl "http://localhost:3000/api/export?formato=csv&anno=2026"
curl "http://localhost:3000/api/statistiche"
```

## Semplificazione (offline + LLM opzionale)

- `lib/simplify.ts` - euristica offline deterministica: 5 caselle (`in10Secondi`, `perTe`,
  `cosaFare`, `statoLavora`, `proContro`) + indice Gulpease.
- `lib/ai-provider.ts` - `simplifyWithProvider()` usa un provider compatibile OpenAI se
  `LLM_API_KEY` e' presente; in ogni altro caso ricade sull'euristica. **Non lancia mai** e
  ritenta senza `response_format` se il provider non lo supporta.

## Metriche

- `lib/readability.ts` - Gulpease, Flesch-Vacca, rinvii, bis/ter.
- `lib/quality.ts` - punteggio euristico su processo, tecnica e attuazione.
- `lib/glossary.ts` - glossario istituzionale ed espansione delle sigle.

## Identificatori

- `lib/nir.ts` - parsing e composizione di NIR (`urn:nir:...`) ed ELI (`/eli/id/...`).
  NIR ed ELI non sono convertibili in modo univoco: `eliToNir` / `nirToEli` richiedono i
  metadati mancanti (tipo/numero oppure codice redazionale) e restituiscono `null` altrimenti.

## Deploy su Vercel

1. Importa il repository e collega un database Postgres (opzionale).
2. Imposta le variabili d'ambiente (opzionali).
3. `vercel.json` registra il cron `0 6 * * *` su `/api/cron/ingest`.

## Test

`npm test` esegue i test Vitest su metriche, identificatori, glossario, semplificatore, provider
AI, sorgenti (con fetch simulato), layer DB (senza database reale) e smoke test di tutte le route.

## Limiti noti (v1)

- I dati oltre ai primi due atti richiesti sono **esempi dimostrativi**, non dati ufficiali
  (contrassegnati in UI con "Scheda dimostrativa").
- `/api/cron/ingest` ritorna 200 salvo 401 se non autorizzato; se imposti `CRON_SECRET`, richiede
  `Authorization: Bearer <CRON_SECRET>` (401 altrimenti); senza `CRON_SECRET` in `production`
  risponde comunque 401. La stessa protezione vale
  per `/api/sync/storico` e `/api/sync/recente`.
- Gli archivi bulk di Normattiva sono accettati fino a **250 MB**: oltre il limite il
  download viene interrotto (errore non ritentabile) e il limite e' annotato nel report.

## Dati reali (open data ufficiali)

I file in `data/reali/` sostituiscono progressivamente il corpus dimostrativo con dati
ufficiali verificati. Ogni file ha envelope `provenance` (fonte, url, recuperatoIl ISO-8601,
licenza): senza `provenance` completa il file resta dimostrativo.

| fonte | endpoint | file | licenza | rigenerazione |
| ----- | -------- | ---- | ------- | ------------- |
| normattiva.it | `POST /api/v1/ricerca/listaAtti` + `POST /api/v1/atto/dettaglio-atto-urn` (fallback `GET /collections/collection-predefinite`) | `data/reali/normattiva-leggi.json` | attribuzione + link Normattiva/GU per atto (no mirror bulk) | `scripts/ingest-reale-*.ts` |
| dati.camera.it | `GET https://dati.camera.it/sparql` | `data/reali/camera-deputati.json` | CC BY-SA 4.0 | `scripts/ingest-reale-*.ts` |
| dati.senato.it (senatori) | `GET https://dati.senato.it/sparql` | `data/reali/senato-senatori.json` | CC BY 3.0 IT | `scripts/ingest-reale-*.ts` |
| dati.senato.it (DDL) | `GET https://dati.senato.it/sparql` | `data/reali/senato-ddl.json` | CC BY 3.0 IT | `scripts/ingest-reale-*.ts` |
| governo.it/it/feed/rss | `GET https://www.governo.it/it/feed/rss` | `data/reali/governo-cdm.json` | riuso titolo/link/descrizione | `scripts/ingest-reale-*.ts` |
| dati.camera.it + dati.senato.it (gruppi) | `GET https://dati.camera.it/sparql`, `GET https://dati.senato.it/sparql` | `data/reali/gruppi-parlamentari.json` | CC BY-SA 4.0, CC BY 3.0 IT | `scripts/ingest-reale-*.ts` |

Stato e manifest: `data/reali/MANIFEST.json` riporta per ogni file conteggio e `recuperatoIl`
(`null` = in attesa del primo ingest, nessun numero inventato). I file oltre 1 MB non si
committano: rigenerarli via `scripts/ingest-reale-*.ts`.

Resta dimostrativo: il corpus sintetico da circa 5000 atti e' in via di sostituzione dai file
in `data/reali/`; finche' il manifest indica `in attesa primo ingest`, l'app usa il fallback seed.
