# GOAL-PROGRESS

Obiettivo: UI/UX migliore, feature attuali migliorate + nuove feature, database reale di leggi italiane da ~5 a scala 100 GB.

## Stato iniziale (2026-09-28, iterazione 0)
- Repo: `/Users/mark/Projects/simple-law`, branch `master` (appena `git init`, baseline committata `5391a84`).
- Stack: Next.js 15 App Router, TS strict, Tailwind, Prisma+Postgres con fallback seed, Vitest, Vercel Cron.
- Verifiche baseline: `npm test` 202/202 OK, `typecheck` OK, `build` OK.
- Corpus attuale: 5 leggi in `lib/seed-data.ts` (2 atti di riferimento + 3 dimostrativi) + `scripts/seed-espanso.ts` genera 240 demo in `data/seed-espanso.json` (non usato dalla UI di default).
- UI attuale: home feed civico + `/leggi` archivio 12/pagina + dettaglio `/leggi/[...eli]` + `/ministri` + `/statistiche` + `/semplifica` + `/salvati` (localStorage).
- Limiti noti: nessun full-text ranking, filtro persona solo client su estratto 2000, corpus dimostrativo, nessun supporto reale per 100 GB (solo piano in README).

## Strategia 100 GB
- 100 GB non committabili: serve architettura chunked/streaming + generatore deterministico offline + ingest Normattiva a chunk + indici DB + paginazione server-side + export streaming.
- Stima: ~200k atti Normattiva × ~100-500 KB (testo+metadati+indici) ≈ 20-100 GB. Shard JSONL in `data/corpus/` + SQLite/Postgres + FTS.
- Iterazione 1: fondazioni (corpus massivo realistico offline 5000 atti + loader streaming + search ranking + UI lista/dettaglio + nuove feature + test).
