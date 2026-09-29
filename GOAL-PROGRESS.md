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
  schede parlamentari reali (fatto sotto), allargare batch Normattiva
  (storico per anno),
  Corte Costituzionale / EUR-Lex / Quirinale / ISTAT (sonde + ingest),
  Elezioni/Eligendo, sostituzione progressiva del sintetico.

## Reali-2 (2026-09-28, commit `432114f`): Parlamento in UI, 626 schede reali
- Workflow: 1 chiamata `workflow` con 10 subagenti (3 proposte IA concorrenti
  + 1 giudice + 4 scrittori disgiunti + 2 revisori). Il giudice ha scelto IA A
  (hub /parlamento + liste + dettaglio /parlamento/[camera]/[slug]).
- Implementato: `lib/parlamento-dati.ts` (server-only, cache, never-throw),
  5 pagine `app/parlamento/*` (hub leg19 con conteggi 414/212/13, liste 24/pag
  con q/gruppo/page, dettaglio con JSON-LD Person, licenze CC visibili),
  4 route `app/api/parlamento/*` (bounds, mai 500), box "Scheda parlamentare"
  in `ministri/[slug]` solo su match esatto (Meloni sì, Piantedosi no),
  voce Parlamento in nav.
- Fix P0 miei (i revisori avevano ragione): W1 non aveva consegnato
  (`parlamento-dati` + API assenti, build rotto) -> creati da me secondo il
  contratto congelato nei test; W3 non aveva consegnato (link ministri) ->
  implementato da me; 2 warning lint `<img>` -> disable mirati e motivati
  (foto ufficiali remote, niente ottimizzazione remota in build).
- Verifiche mie: `npm test` 353/353 OK, `typecheck` OK, `lint` OK, `build`
  OK (750 pagine statiche), smoke live (hub/API/ricerca/dettaglio 200,
  Meloni con link, Piantedosi senza).
- Next: DDL Senato + atti Camera in data/reali e in UI, Corte Costituzionale
  / EUR-Lex / Quirinale / ISTAT / Eligendo (sonde + ingest) — fatto sotto
  per DDL/atti/Consulta; restano EUR-Lex, Quirinale, ISTAT, Eligendo,
  batch storico Normattiva per anno, sostituzione progressiva del sintetico.

## Reali-3 (2026-09-28, commit `8aefb32`): storico, DDL/atti, Consulta
- Workflow: 1 chiamata `workflow` con 10 subagenti (4 sonde + 1 giudice + 3
  scrittori verticali + 2 revisori). Sonde: storico via aggiornati annuali +
  collezioni bulk; DDL Senato + 6288 atti Camera via SPARQL; Consulta/Quirinale;
  EUR-Lex CELLAR + ISTAT/Eligendo (giudice: Consulta subito, resto dopo).
- Ingerito: storico 1980 (66) + collezioni (112) Normattiva, 5 DDL + 197 atti
  Camera, 50 pronunce Consulta 2001. Totale reale: 500+ voci, corpus live 5227.
- Fix P0 miei (revisori + verifica mia): union multi-file (storico mai in UI
  per primo-file-vince); stati da intestazione Art. 1 formale + fine-vigenza
  preservata (21 decaduti, 12 abrogati) + re-ingest; seed DL139 allineato
  alla realta (abrogato L.166/2026, override aggiornati); DDL per whitelist;
  MANIFEST/README/nav/sitemap complete; badge Dato ufficiale.
- Scoperta chiave: DL 139 e 153/2026 davvero abrogati dalla L. 166/2026
  (header ufficiale Art. 1) — il sistema di vigenza funziona.
- Verifiche mie: `npm test` 396/396 OK, `typecheck`/`lint` OK, `build` OK
  (802 pagine), smoke live (5227 totale, decaduto trovabile, DDL/Consulta
  200, sitemap ok).
- Next: EUR-Lex, Quirinale, ISTAT, Eligendo — fatto sotto per EUR-Lex e
  Quirinale (+ piano elezioni verificato); restano ingest elettorale,
  ISTAT, batch storico Normattiva per anno, sostituzione progressiva
  del sintetico.

## Reali-4 (2026-09-28, commit `5853988`): EUR-Lex, Quirinale, storico 1990/2000
- Workflow: 1 chiamata `workflow` con 10 subagenti (3 sonde + 1 giudice + 4
  scrittori + 2 revisori). Sonde: CELLAR SPARQL OK, Quirinale HTML stabile,
  finestre 1990/2000 percorribili, elezioni solo recon (doc verificato).
- Ingerito: 50 atti UE 2026 (CELEX, titoli EN fase-1 dichiarata, Dec.
  2011/833/UE), 12 atti + 12 comunicati Quirinale, storico 1990 (71: 40
  vigore, 28 decaduti, 3 abrogati) + 2000 (61: 46/8/7). Totale reale: 800+
  voci su 16 file; corpus live **5359** (esatto: 5+356 reali+4998 sintetiche).
- UI/API: `/eurlex` + `/quirinale` (nav, sitemap, licenze, mai-500),
  finestre in PERCORSI_ATTI_REALI. Nessun P0 bloccante dai revisori.
- Fix miei: nav/sitemap per le nuove sezioni, MANIFEST/README con conteggi
  veri, verifica volumi e stati via smoke.
- Verifiche mie: `npm test` 428/428 OK, `typecheck`/`lint` OK, `build` OK
  (855 pagine), smoke live (5359 totale, EUR-Lex/Quirinale 200, 1990 live).
- Next: ISTAT (de-scopato onestamente: anagrafiche latin-1 fragili, niente
  dataset demografico stabile — vedi README reali), altre finestre
  storiche — fatte 1970+2010; restano referendum — fatto sotto —,
  sostituzione progressiva del sintetico.

## Reali-7 (2026-09-28, commit `c77fcec`): referendum + storico 1970/2010 + BUR
- Workflow: 1 chiamata `workflow` con 11 subagenti (3 sonde + 1 giudice + 5
  scrittori + 2 revisori). Sonde: referendum DAIT (XLSX!), ISTAT fragile,
  BUR senza fonte unica (confermato con tabella per regione).
- Ingerito: referendum 8-9 giugno 2025 (5 quesiti SI/NO, 7896 comuni;
  controlli C1-C3 del revisore tornati), storico 1970 (28 vigore, 1
  decaduto, 37 abrogati) + 2010 (59/3/4). Corpus live **5491** esatto.
- UI/API: `/elezioni/referendum-2025` + API con barre SI/NO, hub card con
  "Quesiti: 5", sitemap. BUR solo documentato (`docs/bur-ricognizione.md`).
- Fix miei: politiche scrittura atomica 2 file, regex diacritici con escape
  \u0300-\u036f, sitemap dedup, ISTAT de-scope documentato.
- Verifiche mie: `npm test` 504/504 OK, `typecheck`/`lint` OK, `build` OK,
  smoke live (referendum/API/hub 200, Q1 SI 89,1%, totale 5491).
- Next: altre finestre storiche, recepimenti extra (atti Camera),
  sostituzione del sintetico, Corte dei Conti/ANAC se programmabili.

## Reali-5 (2026-09-28, commit `64e6ea5`): elezioni europee 2024 in UI
- Workflow: 1 chiamata `workflow` con 10 subagenti (3 proposte + 1 giudice +
  4 scrittori + 2 revisori). Giudice: ibrida (nazionale+regioni con liste,
  comuni solo affluenza; niente per-lista comunale, niente seggi).
- Ingerito: europee 2024 DAIT (93.984 righe -> 7.896 comuni + 20 regioni +
  15 liste, 616 KB); controlli numerici del revisore rifatti e tornati
  (affluenza 49,7 nazionale, 56,6 Piemonte).
- UI/API: `/elezioni` + `/elezioni/europee-2024` (+ ricerca comune) con
  licenza+disclaimer aggregati, nav, mai-500. Zero nominativi ovunque.
- Fix miei: test conformita lib (forma Result vs dati), normalizza fragile
  + q senza cap in pagina [id], tmp CSV mai rimosso + cap download solo a
  fine scaricamento (ora in streaming con cleanup).
- Verifiche mie: `npm test` 446/446 OK, `typecheck`/`lint` OK, `build` OK
  (857 pagine), smoke live (hub/dettaglio/API 200, Roma trovata, totale
  5359 esatto).
- Next: ISTAT, referendum, altre finestre storiche — fatto sotto per le
  politiche 2022 e i recepimenti; restano ISTAT, referendum, altre
  finestre, sostituzione del sintetico (ancora ~5000 su 5491+).

## Reali-6 (2026-09-28, commit `eba9df2`): politiche 2022 + recepimenti UE
- Workflow: 1 chiamata `workflow` con 10 subagenti (3 sonde + 1 giudice + 4
  scrittori + 2 revisori). Sonde: DAIT politiche live, CELLAR transposition
  vs match testuale (scelto match esplicito anno+numero entro 60ch).
- Ingerito: politiche 2022 Camera+Senato (118k+120k righe -> 7824/7545
  comuni, 27/31 liste, golden C1-C3 tornati), mappa recepimenti (2 direttive
  UE, 0 atti trovati = onesto, mai fuzzy).
- Fix P0 miei (revisori): ingest scriveva 1 file unico vs 2 attesi (hub con
  link morti, [id] in empty-state) -> riscritto sui 2 file per-scheda +
  re-ingest; loader che invalidava tutto per VdA senza affluenza -> skip
  tollerante + regression test; DDL per whitelist.
- Verifiche mie: `npm test` 483/483 OK, `typecheck`/`lint` OK, `build` OK
  (859 pagine), smoke live (hub senza 'Dati in preparazione', Milano
  trovata, box recepimenti onesto).
- Next: ISTAT (de-scopato, vedi sopra), Corte dei Conti/ANAC/Cassazione —
  fatti sotto ANAC + giustizia amministrativa (CdS/TAR/CGA); restano Corte
  dei Conti e Cassazione/Italgiure (chiuse: login/captcha), altre finestre,
  sostituzione del sintetico.

## Reali-8 (2026-09-28, commit `c7f433f`): oversight ANAC + giustizia amm.va
- Workflow: 1 chiamata `workflow` con 10 subagenti (3 sonde + 1 giudice + 4
  scrittori + 2 revisori). Sonde: ANAC/BDNCP via OCP (VIA LIBERA), CdS/TAR
  via Focus giurisprudenza (VIA LIBERA), Corte dei Conti e Italgiure
  (RIMANDATE: niente machine-readable stabile).
- Ingerito: 60 contratti ANAC 2025 + 14 provvedimenti (7 CdS, 6 TAR, 1 CGA
  Sicilia) con soli metadati + link ufficiali, badge "non è una legge".
- Fix P0 miei (revisori): lib leggeva nomi file/chiavi mai scritti
  (controllo sempre vuoto) -> allineato ai file reali; record con ente
  punteggiato scartati (7/14 persi!) -> normalizer tollerante + CGA come
  terzo giudice onesto; numero/anno/CIG opzionali mai inventati.
- Verifiche mie: `npm test` 554/554 OK, `typecheck`/`lint` OK, `build` OK
  (862 pagine), smoke live (hub/lista 200, filtri cds/tar/cga esatti).
- Next: recepimenti extra, Corte dei Conti se si apre un canale,
  sostituzione del sintetico — fatti sotto bulk/atti/finestre; restano
  Corte dei Conti/Italgiure (chiuse), altre finestre, riduzione sintetico
  (ora ~5000/6296).

## Reali-9 (2026-09-28, commit `fd13037`): scala reale, 6296 voci live
- Workflow: 1 chiamata `workflow` con 10 subagenti (2 sonde + 1 giudice + 5
  scrittori + 2 revisori). Sonde: bulk con/senza titolo, atti Camera 3144
  DISTINCT (6288 righe doppie).
- Ingerito: 39 atti attuazione UE + 638 atti 2005 lista-only + 3144 atti
  Camera in 3 shard + finestre 1960/2020. Corpus live **6296** (1970 reali).
- Fix P0 miei (revisori): 677 atti spacciati in_vigore senza dettaglio ->
  stato "sconosciuto" (giallo); 7/14 GA persi -> CGA terzo giudice +
  normalizer tollerante; file mai caricati (nomi) -> PERCORSI esatti;
  slice 500/file troncava 138 atti 1907-1931 -> cap 5000 + regression test;
  entita HTML nei titoli decode a load.
- Verifiche mie: `npm test` 599/599 OK, `typecheck`/`lint` OK, `build` OK
  (862 pagine), smoke live (6296 totale, 675 sconosciuti filtrabili,
  dettaglio 1910, DDL 3149, controllo 14).
- Next: altre finestre (anni '50/'40, 2015) — fatte 1992/1993 e 2005/2006
  sotto; restano recepimenti extra, Corte dei Conti se si apre, riduzione
  del sintetico (ora ~5000/6422, 22% reale mostrato in UI).

## Reali-10 (2026-09-28, commit `9a7e00e`): composizione, finestre, sondaggi
- Workflow: 1 chiamata `workflow` con 10 subagenti (2 sonde + 1 giudice + 4
  scrittori + 2 revisori). Sonde: vigilanza residua + sondaggi Wikipedia
  (CC BY-SA, MediaWiki API stabile).
- Ingerito: finestre 1992-1993 (77) + 2005-2006 (49), 30 sondaggi nazionali
  con pageid+revid pinnati. Corpus live **6422** (reali 1419, 22% mostrato).
- UI: "X atti ufficiali su Y (22% reale)" in home e archivio; rassegna
  sondaggi in hub elezioni con attribuzione.
- Fix P0 miei (revisori): PERCORSI coi nomi reali (126 atti esclusi!),
  cache TTL reali (267ms -> memo), regression test no-troncamento.
- Verifiche mie: `npm test` 639/639 OK, `typecheck`/`lint` OK, `build` OK,
  smoke live (6422 esatto, sondaggi visibili, percentuali tornate).
- Next: recepimenti extra (atti Camera) — fatto sotto (mappa con 0 match
  onesti + box in UI che legge entrambe le mappe); restano altre finestre,
  Corte dei Conti se si apre, riduzione del sintetico.

## Reali-11 (2026-09-28, commit `78e7ac6`): finestre 1955/2015, atti collegati
- Workflow: 1 chiamata `workflow` con 10 subagenti (3 proposte + 1 giudice +
  4 scrittori + 2 revisori). Decisione documentata: default sintetico
  INVARIATO (il ranking BM25 surfacia gia i reali; tagliare sarebbe
  cosmetico) — si cresce solo con dati veri.
- Ingerito: finestre 1955 (35) + 2015 (74, 7 decaduti). Mappa atti collegati
  UE (0 match: direttive 2026 troppo recenti, onesto).
- UI: box recepimenti legge entrambe le mappe (NIM + atti Camera/Normattiva).
- Fix miei (revisori): conti 82 curati (non 72) in codice/README/test/MIN
  87; type mismatch mappe recepimenti.
- Verifiche mie: `npm test` 645/645 OK, `typecheck`/`lint` OK, `build` OK,
  smoke live (dettaglio direttiva onesto; doppio rendering escluso: HTML +
  flight payload).
- Next: altre finestre, Corte dei Conti se si apre, riduzione del sintetico
  via crescita reale (mai tagli cosmetici).

## Reali-12 (2026-09-28, commit `4158767`): regionali, finestre 1948/1985, CNEL
- Workflow: 1 chiamata `workflow` con 10 subagenti (3 sonde + 1 giudice + 4
  scrittori + 2 revisori). Sonde: regionali DAIT, finanziamenti/CNEL/CSM,
  finestre dense.
- Ingerito: regionali Toscana 2025 + Umbria 2024 (liste+affluenza verificate
  C1-C3), finestre 1948 (28: 15 vigore/13 abrogati) + 1985 (74: 47/8/19),
  50 documenti CNEL (solo metadati + link).
- UI/API: hub 6 consultazioni senza link morti, dettaglio comune per
  regionali/referendum, sezione CNEL (?tipo=cnel) con badge non-legge.
- Fix miei: europee main-guard anti side-effect, slice 500/file che
  troncava 138 atti 1907-1931 (ora cap 5000 + regression test), regex
  diacritici con escape, MANIFEST/README completi.
- Verifiche mie: `npm test` 693/693 OK, `typecheck`/`lint` OK, `build` OK
  (864 pagine), smoke live (hub/lista/API CNEL, filtri cds/tar/cga).
- Next: altre finestre/regioni (fatte sotto: Liguria, Calabria, 1975,
  1995, GU diretta), Corte dei Conti se si apre, riduzione del sintetico.

## Reali-13 (2026-09-28, commit `c073b8b`): regionali, finestre, GU diretta
- Workflow: 1 chiamata `workflow` con 11 subagenti (4 sonde + 1 giudice + 4
  scrittori + 2 revisori). Sonde: regionali DAIT, finanziamenti/CSM,
  GU RSS, finestre dense.
- Ingerito: regionali Liguria 2024 + Calabria 2025, finestre 1975 + 1995,
  GU n.225 del giorno stesso (32 atti, DL 167/2026). Corpus live **6766**.
- UI/API: hub elezioni esteso, sezione `/gazzetta` (metadati + link),
  MANIFEST 48 voci zero orfani/fantasmi, README API completo.
- Fix miei: MANIFEST url obbligatorio, sezione GU assente (solo dati).
- Verifiche mie: `npm test` 743/743 OK, `typecheck`/`lint` OK, `build` OK,
  smoke live (regionali/GU/API 200).
- Next: altre regioni/finestre (fatte sotto: Emilia-Romagna, Sud,
  2012/2018), Corte dei Conti se si apre, finanziamenti (fatti sotto),
  riduzione del sintetico via crescita reale.

## Reali-14 (2026-09-29, commit `b260bce`): Emilia-R., Sud, finestre, finanze
- Workflow: 1 chiamata `workflow` con 11 subagenti (4 sonde + 1 giudice + 4
  scrittori + 2 revisori). Sonde: finanziamenti/CSM/regioni/finestre.
- Ingerito: regionali Emilia-Romagna 2024 (330 comuni, 11 liste),
  Campania/Puglia/Veneto 2025, finestre 2012 + 2018, finanziamenti partiti
  (erogazioni 2024-2026 con PDF ufficiali). Corpus live **6766+**.
- UI/API: hub regionali esteso, sezione `/finanziamenti` (verificata live:
  Lega 2067 erogazioni €4,6M), MANIFEST 51 voci.
- Fix miei: script Emilia dedicato (tracciato candidato×sezione),
  main-guard, regex diacritici, wiring hub/dettaglio/API.
- Verifiche mie: `npm test` 804/804 OK, `typecheck`/`lint` OK, `build` OK
  (874 pagine), smoke live (hub/dettaglio/API/ricerca 200).
- Next: altre regioni/finestre (fatte sotto: 1965, 2022), Corte dei
  Conti/CSM se si aprono, riduzione del sintetico via crescita reale.

## Reali-15 (2026-09-28, commit `dbb9296`): freschezza, finestre 1965/2022
- Workflow: 1 chiamata `workflow` con 10 subagenti (3 audit + 1 giudice + 4
  scrittori + 2 revisori). Audit: link-rot, coerenza MANIFEST/disco/UI,
  freschezza e performance.
- Refresh: governo-comunicati, GU, sondaggi ri-ingeriti (conteggi stabili,
  nessun record inventato/cancellato); finestre 1965 + 2022; MANIFEST 57
  voci zero orfani/fantasmi; docs/FRESCHEZZA-DATI.md + verifica-freschezza.
- Fix miei: refresh test con orologio congelato (falliva tra giorni),
  verificaFreschezza NaN-throw, sleep inutile, eslint-disable orfani.
- Verifiche mie: `npm test` 845/845 OK, `typecheck`/`lint` OK, `build` OK
  (874 pagine), smoke live (7049 totale, 2046 reali 29%, export 200).
- Next: altre finestre/regioni, Corte dei Conti/CSM se si aprono, crescita
  reale continua.

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

## Cozy-1 (2026-09-29, commit real-only+cozy): solo leggi vere, footer dusk, cozy ovunque
- Direzione utente (override skill): minimale, accogliente, font cozy
  (Nunito), angoli arrotondati mai pill, liquid-glass approssimato onesto,
  motion.dev, Hugeicons gratis, base Next.js fullstack + toolchain
  (prettier/format, eslint, vitest su vite), parole semplici per tutti.
- Design Read: compagna civica accogliente per italiani non tecnici,
  minimalismo caldo, Tailwind + Nunito + motion/react + Hugeicons.
  Dials VARIANCE 5 / MOTION 5 / DENSITY 3.
- Workflow: proposte Ax3 (design audit) + BxC parallele + giudice, poi
  scrittori W1-W3 (sobrio, committato a10f367), C1-C5 cozy paralleli,
  W4 real-only + W5 backfill + F1 footer paralleli, 2 revisori avversariali.
- REAL-ONLY (richiesta esplicita utente, niente schede di prova):
  `getSeedLaws()` default = 2 seed curati + reali + 2 riferimenti;
  sintetico solo con CORPUS_SINTETICO=1. Live: 2316 atti veri, 0
  "Variante", 0 dimostrativi. Disclaimer riscritto senza "di prova".
- Backfill: 2021 (71) + 2023 (59) + 2024 (70) + 2025 (68) = 268 atti
  veri via bff-opendata; MANIFEST 61 voci; PERCORSI cablati da me
  (W5 non poteva per scope); entita HTML decodificate a load da me
  (P1 revisore A); README coda recente aggiunto da me.
- Footer editoriale stile "offline" richiesto: wordmark + tagline +
  3 colonne, blocco blu notte dusk in puro CSS (niente picsum remoto
  dopo P1/P0 revisori: tracking, AA, lock tinta; resta l'unico color
  block documentato), rounded-t-2xl, contrasto AA su fondo solido.
- Skill-compliance mia: 265 em/en-dash in testi (codice+dati envelope,
  mai testi ufficiali), 1 intento CTA ("Vedi tutte le norme"),
  max 1 middle-dot/riga (helper fraseRisultati/fraseEstratto),
  PulsantePreferito/ListaSalvati senza glifi stella, InfoCorpus +
  dimostrative reali (P2 revisore A).
- Verifiche mie: tsc OK, eslint OK, 858/858 test OK, build OK
  (874 pagine), smoke live (/, /leggi, /api/leggi 200, DL 153/2026 vero).
- Noto e rimandato: eyebrow multipli in controllo/statistiche/semplifica
  (P1 rev B fuori perimetro), puntini singoli e step "1 -" in semplifica
  (conformi ma da rivedere), nessuna foto reale hero (niente image-gen
  in ambiente: slot aperti picsum o scatti istituzionali), coda storica
  1949-54/56-59/1961-64/1966-69/1971-74/1976-79/1981-84/1986-89/1991/1994/
  1996-99/2001-04/2007-09/2011/2013-14/2016-17/2019 ancora scoperta.
- Next: finestre storiche mancanti, audit foto/eyebrow residui, E2E a11y.

## Storico-totale (2026-09-29): copertura 1948-2025 completa, 4019 atti veri
- Workflow: 1 chiamata `workflow` con 5 ingestor paralleli (A-E, anni
  disgiunti, niente tocchi a lib/MANIFEST/test). Rete OK per tutti.
- Ingerito: 53 nuovi file annuali, 1703 atti veri (379+357+421+248+298),
  stati solo fine-vigenza/Art.1, zero dash, ELI unici globali (3294/3294).
  Scarti solo onesti (fetch failed / atto non trovato, mai inventati).
- Wiring mio: PERCORSI +53, MANIFEST 61->114 voci (conteggi veri dal
  provenance), README sezione copertura, gate
  `tests/reali-16-copertura.test.ts` (falliva onestamente su 2026:
  dichiarato coperto da recenti+GU, non da annata chiusa).
- Verifiche mie: tsc OK, eslint OK, 861/861 test OK, build OK
  (874 pagine), smoke live (200, ricerca "lavoro" trova RD 387/1922 vero).
- Next: finestre dense per gli anni magri (<30 atti: 1966-74, 1996-2001),
  eyebrow multipli residui (controllo/statistiche/semplifica), foto reali,
  E2E a11y, freschezza 2026 continua.

## Dense (2026-09-29): secondo passaggio, 5941 atti veri
- Workflow: 1 chiamata `workflow` con 4 densificatori paralleli (anni
  disgiunti, append con dedup, bound +120/file e 950KB).
- Resa: +1904 lordi (+328/+637/+507/+432), netti +1922 con storicototale
  (4019 -> 5941; 5939 reali, 0 dimostrativi). Anni magri risolti
  (1974: 17->135, 1988: 34->154, 1991: 26->123, 2011: 27->121).
- Race parallela: i team si sono pestati i piedi (stessi atti aggiornati
  trasversali); audit globale mio: 2 ELI duplicati residui, risolti
  tenendo la finestra piu vicina all'emanazione; ora 0 duplicati su
  tutto data/reali. MANIFEST 114 voci con 32 conteggi aggiornati veri.
- Verifiche mie: tsc OK, eslint OK, 861/861 test OK, build OK
  (874 pagine), smoke live (200 anche con filtro giallo).
- Next: eyebrow multipli residui, foto reali, E2E a11y, freschezza 2026.

## Slop-zero (2026-09-29): 3-card uguali ed eyebrow multipli rimossi
- Workflow: 1 chiamata `workflow` con 3 writer (home steps, controllo,
  statistiche+semplifica, file disgiunti).
- U1: "Come funziona" da 3 card uguali (banned) a righe numerate
  asimmetriche in un contenitore; h3 non piu uppercase.
- U2: controllo 1 eyebrow per ramo, badge "non e legge" semplici, CTA
  accento 48px, zero dot, empty dedicato con icona.
- U3: titoli normali ovunque, step "1. ..." col punto, confronto a 4
  righe dati, nota conteggi con virgola. Resta 1 hero-eyebrow per render
  (branch vuoti/rami alternativi: mai 2 visibili insieme).
- Verifiche mie: tsc OK, eslint OK, 861/861 test OK, build OK
  (874 pagine), smoke live su 4 route.
- Next: foto reali, E2E a11y, freschezza 2026 continua.

## Freschezza+gate (2026-09-29): refresh 2026 e slop-gate
- Workflow: 1 chiamata `workflow` con 2 agenti (refresh + gate).
- R1: GU/gov/recenti ri-ingeriti (32/10/46 invariati, solo freschezza);
  MANIFEST ri-sincronizzato da me (R1 non poteva toccarlo per scope).
- R2: `tests/slop-gate.test.ts` (7 test: dash, dot, pill, href orfani,
  h1+title, alt) con whitelist motivate; 12 righe a 2 dot segnalate
  come casi veri non bloccanti (eurlex/consulta/parlamento).
- Verifiche mie: tsc OK, 868/868 test OK, build OK, smoke live.
- Next: foto reali, E2E con server, densita anni magri residui.
