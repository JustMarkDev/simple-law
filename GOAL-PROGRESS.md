# GOAL-PROGRESS

Obiettivo: UI/UX migliore, feature attuali migliorate + nuove feature, database reale di leggi italiane da ~5 a scala 100 GB.

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
