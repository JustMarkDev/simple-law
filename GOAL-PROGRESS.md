# GOAL-PROGRESS

Obiettivo corrente: **dati reali, non mock** — open data ufficiali della
Repubblica italiana (leggi, parlamento, governo, tutto cio' che e' open source).
Obiettivo precedente (completato): UI/UX, feature, corpus 5005 voci.

## Reali-1 (2026-09-28, commit `5e0bb16`): primo batch ufficiale live
- Workflow: 1 chiamata `workflow` con 11 subagenti (3 verdetti read-only su
  endpoint + 1 giudice + 5 scrittori su file disgiunti + 2 revisori
  avversariali). I verdetti riusavano sonde /tmp precedenti: Normattiva
  bff-opendata OK (collections + aggiornati + dettaglio; avanzata 500 =
  scartata), Camera/Senato SPARQL OK (6288 atti leg19 Camera), Governo RSS OK
  (10 item). Il giudice ha fissato envelope `{provenance, ...}`, batch e
  policy dimostrativo=false solo con fonte.
- Ingerito (tutto verificato da me, rete live): `data/reali/` —
  **46 atti Normattiva** (23 DL, 16 Dlgs, 7 leggi, testi+sintesi+GU,
  343 KB), **414 deputati + 13 gruppi** Camera leg19 (CC BY-SA 4.0),
  **212 senatori + 14 denominazioni gruppi** Senato leg19 (CC BY 3.0 IT),
  **10 comunicati** governo. Scripts bounded (`--limite` max 200, file
  max 1 MB, exit 1 senza parziali).
- Fix P0 miei post-workflow (verificati): stato `abrogato` dedotto dal
  contenuto del testo (13/46 errati!) -> ora solo `articoloDataFineVigenza`
  fa fede + re-ingest (46/46 in_vigore); ELI seed DL139 errato
  (26G00161) -> codice GU reale **26G00162** + dataGU/numeroGU veri
  (DL133 26G00155 confermato esatto dai dati reali); `fontiReali`
  accettava qualunque https -> allowlist domini ufficiali; test fallback
  CdM aggiornato alla catena rete->reali->seed; id comunicati ripuliti
  (URL assoluti) + re-ingest governo; MANIFEST/README reali rigenerati
  con conteggi veri; badge "Dato ufficiale" sulle schede reali.
- Wiring: `getSeedLaws` = 5 seed + 46 reali + sintetico (dedup ELI, seed
  vincono i pareggi); `getSeedCdm` = reali primi. UI live: totale **5049**,
  atti reali con `dimostrativo: false`, dettaglio reale 200, CdM reali.
- Verifiche mie: `npm test` 321/321 OK, `typecheck` OK, `lint` OK, `build`
  OK (120 pagine), smoke live (5049 totale, ricerca reale, export 200).
- Next: pagina/route parlamentari (deputati/senatori/gruppi in UI con
  licenze), DDL Senato + atti Camera in `data/reali`, collegare ministri a
  schede parlamentari reali, allargare batch Normattiva (storico per anno),
  Corte Costituzionale / EUR-Lex / Quirinale / ISTAT (sonde + ingest),
  Elezioni/Eligendo, sostituzione progressiva del sintetico.

## Stato iniziale (2026-09-28, iterazione 0)
- Repo: `/Users/mark/Projects/simple-law`, branch `master` (appena `git init`, baseline committata `5391a84`).
- Stack: Next.js 15 App Router, TS strict, Tailwind, Prisma+Postgres con fallback seed, Vitest, Vercel Cron.
- Verifiche baseline: `npm test` 202/202 OK, `typecheck` OK, `build` OK.
- Corpus attuale: 5 leggi in `lib/seed-data.ts` (2 atti di riferimento + 3 dimostrativi) + `scripts/seed-espanso.ts` genera 240 demo in `data/seed-espanso.json` (non usato dalla UI di default).
- UI attuale: home feed civico + `/leggi` archivio 12/pagina + dettaglio `/leggi/[...eli]` + `/ministri` + `/statistiche` + `/semplifica` + `/salvati` (localStorage).
- Limiti noti: nessun full-text ranking, filtro persona solo client su estratto 2000, corpus dimostrativo, nessun supporto reale per 100 GB (solo piano in README).

## Iterazione 1 (2026-09-28, commit `cde8b63`)
- Workflow: 1 chiamata `workflow` con 24 subagenti (9 proposte + 1 giudice + 12 implementatori + 3 revisori avversariali).
- Proposte: corpus A (JSONL gzip + streaming + Postgres, vince) vs B (Parquet/SQLite/S3/Bloom, scartata: incompatibile Vercel, doppia logica) vs C (tassonomia realistica, integrata in A come generatore). UX: vince ibrido (quick-win + redesign editoriale sobrio). Feature top-8: ranking rilevanza, cursor pagination, export streaming, feed ETag, dashboard stats, timeline attuativi, confronto diff, ChecklistFare client.
- Implementato (file disgiunti, nessun conflitto):
  - `lib/corpus.ts` + `scripts/corpus-100gb.ts` (generate/verify/stats, shard `.jsonl.gz` 8k/shard, manifest, FTS streaming, never-throw) + `data/corpus/README.md`.
  - `lib/seed-data-espansa.ts` (72 atti curati 1948-2026, ELI/NIR validi) + `scripts/generate-corpus-massivo.ts` (varianti deterministiche fino a 200k, 82KB per 20 atti smoke OK).
  - `prisma/schema.prisma` (indici stato+data, gulpease, data+eli, testoHash/lunghezzaTesto, commento tsvector/GIN) + `lib/db.ts` (batch, cursor, BM25 rilevanza, cache stats, pure-JS hash per non rompere il bundle client).
  - `lib/search-rank.ts` (normalizeIT/stem/stopword/BM25-lite/highlight) + `app/api/leggi/route.ts` (sort `rilevanza` default con q).
  - UI: `app/page.tsx`+`LawCard`+`Header/Footer`, `app/leggi/page.tsx`+filtri/paginazione/search, dettaglio `[...eli]`+Quality/Traffic/Fonti+JSON-LD+prev/next, `statistiche`+GraficoBarre, `semplifica`+Comparsa+`TimelineAttuativi` nuovo, `salvati`+preferiti/persona, `export`+`feed` streaming, `globals/layout/tailwind/Contatore/ToggleTema`.
  - Test nuovi: `corpus-100gb` (11), `seed-espansa` (14), `search-rank` (20), `export-feed-100gb` (10). Totale 202->257.
- Fix P0 miei post-revisori: skip-link unico `#contenuto`; TabsPersona CSS rotte -> lista impilata accessibile; sezioni fonti/trasparenza con labelledby distinti; ID ELI slugificati; `toPrismaData` non persiste testo >8k in extra (solo hash/lunghezza colonne); regex ELI/NIR allargate per compat `/eli/it/` + date opzionali; `numeroSicuro` 4800->90000 + max 100k; `generaCorpus` cap 20k + `iterRecord` streaming; `rilevanza` pagina>1 con finestra globale; `sha256Hex` puro-JS (fix build `node:crypto`); `ChecklistFare` estratta in client component (fix prerender).
- Verifiche mie: `npm test` 257/257 OK, `typecheck` OK, `lint` OK, `build` OK, `start` smoke `/api/health` seed OK + `/api/leggi?per=2` OK, `generate-corpus-massivo --totale 20` 20 ELI unici OK.
- Next: collegare `seed-espansa`/corpus alla UI (oggi UI legge ancora 5 seed: `getSeedLaws` non include espansa/corpus), ingest reale Normattiva chunked con resume, FTS Postgres tsvector, export da cursore senza materializzare 5000, rate-limit IP reale + LRU, menu mobile dialog con focus-trap, test E2E a11y/perf con 5k atti.

## Iterazione 2 (2026-09-28, commit `65f5b51`)
- Workflow: 1 chiamata `workflow` con 16 subagenti (4 proposte + 1 giudice + 8 implementatori su file disgiunti + 3 revisori avversariali).
- Verdetto giudice: ibrido — mapping puro in `lib/corpus-unificato.ts`, `getSeedLaws` thin-wrapper con dedup (5 seed primi), default 5000 clamp 77..20000 via `CORPUS_TOTALE`/`CORPUS_SEED`, UI con slice/vetrina ed estratti bounded 5000, test migrati da `===5` a relativi.
- Implementato: `lib/corpus-unificato.ts` (NUOVO: 72 curati + varianti deterministiche fino al totale env, cache singleton, never-throw), `lib/sources.ts` (wiring + `getCorpusInfo`), `app/page.tsx` + `app/leggi/page.tsx` (slice home 12, estratti 5000), API/stats (X-Total-Count, cap), `components/CorpusBadge.tsx` (NUOVO), `lib/db.ts` (memo seed), `tests/corpus-unificato.test.ts` (NUOVO).
- Fix P0 miei post-workflow (i revisori avevano ragione su 4 punti, verificati da me):
  1. `sources.ts` importava `./corpus-unificato.server` inesistente (8 suite rosse) -> path corretto.
  2. `corpus-unificato.ts` definiva un `LawRecord` incompatibile (`fonti: string[]`, senza `stato`, `gulpease: null`) che corrompeva i record -> riscritto per emettere veri `LawRecord` di `lib/seed-data.ts` (Fonti via `buildFonti`, `stato: in_vigore`, Gulpease calcolato, NIR punteggiato, `dimostrativo` fedele con default true).
  3. Link home `/leggi?stato=verde|giallo|rosso` morti (pagina ignorava `stato`) -> filtro semaforo end-to-end su estratto bounded con paginazione in-memory + chip rimovibile + nota; API `stato` accetta ora anche i colori (prima solo match esatto `in_vigore`, `verde` dava totale 0).
  4. Test con riferimenti a moduli mai creati (`mappa-atti`, `corpus-unificato.server`, soft-skip che nascondevano il vuoto) -> riscritti contro il modulo reale; migrati `seed-fallback` (`toHaveLength(5)` -> sottoinsieme) e `api` (`anno=1999` -> `anno=1800` per il caso vuoto).
- Verifiche mie: `npm test` 283/283 OK, `typecheck` OK, `lint` OK, `build` OK (119 pagine statiche), smoke su server live: `/api/health` seed OK, `/api/leggi` totale 5005, statistiche 1948-2026, dettaglio variante 200, `/leggi?stato=verde` 200, API `stato=giallo` totale 240, home con 5005, export CSV 200.
- Next: unificare i 4 mirror `coloreSemaforo`/`personaRilevante` (home, archivio, API) in un'unica funzione esportata da `seed-fallback`; filtro persona server-side in `lib/db` (oggi filtra solo la pagina corrente); export streaming a pagine da 500 senza materializzare 5000; `generateStaticParams` oltre i 100; sitemap.xml; menu mobile con focus-trap; test perf con 20k atti.
