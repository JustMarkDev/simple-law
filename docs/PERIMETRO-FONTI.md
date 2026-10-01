# Perimetro fonti — stato definitivo (REALI-14, 2026-09-28)

> Tabella onesta fonte → stato. Stati ammessi: `live`, `wiring-pronto`,
> `link-only`, `rimandata`, `non-disponibile`. Mai numeri inventati:
> ogni riga `live` è verificata su disco in `data/reali/` il 2026-09-28;
> ogni riga non-live riporta il motivo dal verdetto REALI-14 o dalla
> sonda citata. Il file `docs/REALI-13-sonde-rimandate.md` non esiste
> (in `docs/` solo `bur-ricognizione.md`, `corpus-reale-roadmap.md`,
> `elezioni-piano.md`, `regionali-extra-ricognizione.md`): non è citato.

Corpus misurato il 2026-09-28: 6766 record (5 seed + 1763 reali
`dimostrativo=false` + ~4998 sintetici). I loader saltano i file assenti:
`wiring-pronto` non gonfia mai il corpus.

## Legenda

- `live` — file su disco, envelope valido, wiring registrato, visibile in UI/API.
- `wiring-pronto` — registry/loader/route registrate e tolleranti (file assente
  → voce omessa, mai throw); il file dati è atteso dagli scrittori assegnati.
- `link-only` — per natura non ingeribile (analisi/lavoro altrui): solo link esterno.
- `rimandata` — tecnicamente ingeribile ma rinviata con motivo e condizione di rientro.
- `non-disponibile` — ingestione esclusa: barriera tecnica o vincolo
  SOLO-aggregati/riuso che la rende incompatibile con gli script bounded.

## Live (verificate su disco il 2026-09-28)

| Fonte                                                                                       | File                                                                                                                                                                                                                                                      | Via                           |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Normattiva recenti                                                                          | `normattiva-recenti.json`                                                                                                                                                                                                                                 | `PERCORSI_ATTI_REALI`, corpus |
| Normattiva storici 1948–2020                                                                | `normattiva-storico-1948/1955/1960/1970/1975/1980/1985/1990/1992-1993/1995/2000/2005-2006/2010/2015/2020.json`                                                                                                                                            | `PERCORSI_ATTI_REALI`, corpus |
| Normattiva collezioni + bulk attuazione-UE + finestra 2005 + 2005-2006 + 2010 + 2015 + 2000 | `normattiva-storico-collezioni.json`, `normattiva-bulk-a-attuazione-ue.json`, `normattiva-bulk-b-finestra-2005.json`, `normattiva-storico-2005-2006.json`, `normattiva-storico-2010.json`, `normattiva-storico-2015.json`, `normattiva-storico-2000.json` | `PERCORSI_ATTI_REALI`, corpus |
| Normattiva finestre 2012 + 2018 (cap 80)                                                    | `normattiva-storico-2012.json` (72 atti), `normattiva-storico-2018.json` (74 atti) — verificati su disco il 2026-09-28                                                                                                                                    | `PERCORSI_ATTI_REALI`, corpus |
| Camera leg19 (deputati, gruppi, atti A/B/C)                                                 | `camera-deputati.json`, `camera-gruppi.json`, `camera-atti*.json`                                                                                                                                                                                         | anagrafiche + atti            |
| Senato (senatori, gruppi)                                                                   | `senato-senatori.json`, `senato-gruppi.json`                                                                                                                                                                                                              | anagrafiche                   |
| Parlamento DDL                                                                              | `parlamento-ddl.json`                                                                                                                                                                                                                                     | atti                          |
| Governo comunicati                                                                          | `governo-comunicati.json`                                                                                                                                                                                                                                 | comunicati                    |
| Quirinale atti + comunicati                                                                 | `quirinale-atti.json`, `quirinale-comunicati.json`                                                                                                                                                                                                        | atti/comunicati               |
| Consulta pronunce 2001                                                                      | `consulta-pronunce-2001.json`                                                                                                                                                                                                                             | atti                          |
| EUR-Lex 2026 + recepimenti (+atti)                                                          | `eurlex-2026.json`, `eurlex-recepimenti.json`, `eurlex-recepimenti-atti.json`                                                                                                                                                                             | atti                          |
| Oversight ANAC/CNEL/GA                                                                      | `oversight-anac-2025.json`, `oversight-cnel-2026.json`, `oversight-ga-2026.json`                                                                                                                                                                          | oversight                     |
| Gazzetta ultime (RSS diretto)                                                               | `gazzetta-ultime.json`                                                                                                                                                                                                                                    | GU                            |
| Europee 2024                                                                                | `elezioni-europee-2024.json`                                                                                                                                                                                                                              | UI/API elezioni               |
| Politiche 2022 Camera + Senato                                                              | `elezioni-politiche-2022-camera.json`, `elezioni-politiche-2022-senato.json`                                                                                                                                                                              | UI/API elezioni               |
| Referendum 2025 (5 quesiti)                                                                 | `referendum-2025.json`                                                                                                                                                                                                                                    | UI/API elezioni               |
| Regionali Toscana 2025 + Umbria 2024                                                        | `elezioni-regionali-2025-toscana.json`, `elezioni-regionali-2024-umbria.json`                                                                                                                                                                             | UI/API elezioni               |
| Regionali Liguria 2024 + Calabria 2025                                                      | `elezioni-regionali-2024-liguria.json`, `elezioni-regionali-2025-calabria.json`                                                                                                                                                                           | route regionali-extra         |
| Sondaggi nazionali (fonte secondaria)                                                       | `sondaggi-nazionali.json`                                                                                                                                                                                                                                 | hub elezioni                  |

Nota: gli storici 1975/1995 (REALI-13, nomi `normattiva-storico-*`) risultano
su disco il 2026-09-28; restano `wiring-pronto`/assenti solo gli alias
`normattiva-finestra-1975.json` e `normattiva-finestra-1995.json` (nomi
direttiva, coperti dal loader che salta gli assenti).

## Wiring-pronto REALI-14 (file attesi, loader tolleranti)

| Fonte                                                            | File atteso                                                                                                                                                                             | Via                                                                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Finanziamenti partiti 2024–2026 (solo beneficiario×anno, max 50) | `finanziamenti-erogazioni-2024-2026.json`                                                                                                                                               | nuovo (W1); licenza `camera.it — solo riuso non commerciale con citazione fonte` |
| Regionale Emilia-Romagna 2024-11-17                              | `elezioni-regionali-2024-emilia-romagna.json`                                                                                                                                           | registry elezioni + API regionali + hub (questo round)                           |
| Regionali Campania/Puglia/Veneto 2025-11-23                      | `elezioni-regionali-2025-campania.json`, `...-puglia.json`, `...-veneto.json` (bozze W3 verificate il 2026-09-28 con nomi `b-*`, stesso envelope: 20 liste, 550 comuni per la Campania) | registry elezioni + API regionali + hub (questo round)                           |
| Normattiva finestre 2012 + 2018 (cap 80)                         | `normattiva-storico-2012.json`, `normattiva-storico-2018.json` — entrambi live il 2026-09-28 (72/74 atti)                                                                               | `PERCORSI_ATTI_REALI` (questo round)                                             |

## Link-only per natura (mai scrape, solo link esterno)

| Fonte                                                                        | Motivo                                                                                                                |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| CISE (cise.luiss.it), YouTrend                                               | analisi di secondo livello, layout instabili — reachability verificata in `docs/elezioni-piano.md`, vietato scraparli |
| Radio Radicale, Openpolis, think-tank                                        | link-only per natura (verdetto REALI-14): archivi audio/aggregatori proprietari, incompatibili con ingest bounded     |
| Hub Camera (`camera.it/leg19/1384`) e relazioni CRP (`camera.it/leg19/1234`) | solo fonte-link per i finanziamenti (verdetto REALI-14)                                                               |

## Rimandata (non definitiva, con condizione di rientro)

| Fonte                                                                                              | Motivo e condizione                                                                |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| BDU Corte dei Conti — portale pubblico (il dominio `servizionline…` con login-check resta escluso) | non assegnata per vincolo max-2 verticali; rinviata a REALI-15 (verdetto REALI-14) |

## Non-disponibile (chiusura perimetro, dal verdetto REALI-14)

| Fonte                                                 | Motivo                                                                                                                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSM                                                   | WAF Radware (`Radware Block Page`, challenge browser, sitemap 404, URL `?t=<timestamp>` instabili) — incompatibile con script bounded; rientro solo con browser-rendering, fuori scope |
| Piemonte 2024 (`regionali-20240609.csv`)              | header candidati-level con DATANASCITA/LUOGONASCITA/SESSO + mancano NULLE/CONTESTATE — viola SOLO-aggregati + riuso 0%                                                                 |
| Abruzzo/Basilicata txt                                | candidati-level, esclusi                                                                                                                                                               |
| Sardegna/Marche                                       | 404, non pubblicate                                                                                                                                                                    |
| `dato per sez/*`                                      | 314 MB, fuori cap                                                                                                                                                                      |
| PDF integrali finanziamenti + relazioni CRP integrali | >4 MB, vietati (solo aggregati <50 KB)                                                                                                                                                 |
| Normattiva 2008                                       | errore code 1502 su >7000 atti, servirebbe split H1/H2 — scartato per costo                                                                                                            |
| Normattiva 2001                                       | dettaglio 25–71% volatile                                                                                                                                                              |
| Normattiva 1998/1988/1978/1965                        | battute da 2012/2018 per volume×resa                                                                                                                                                   |

## Correzioni note

- `data/reali/README.md:322-327`: eventuale correzione spetta agli scrittori
  assegnatari, non a questo round (wiring+test+perimetro).
