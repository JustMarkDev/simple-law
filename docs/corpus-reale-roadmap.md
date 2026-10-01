# Roadmap corpus reale-vs-sintetico (REALI-9)

Numeri verificati via script il 2026-09-28 (mai stimati a mano).

## OGGI: reale vs sintetico

| Corpus                       | Record   | Nota                                                                                |
| ---------------------------- | -------- | ----------------------------------------------------------------------------------- |
| Atti/documenti reali         | 1018     | 616 Normattiva + 52 UE + 202 parlamento + 24 Quirinale + 50 Consulta + 74 oversight |
| Anagrafiche/comunicati reali | 663      | 414 deputati + 212 senatori + 27 gruppi + 10 governo                                |
| Aggregati elettorali         | 78       | liste/quesiti, non atti                                                             |
| **Totale reale**             | **1759** | `data/reali/*.json`                                                                 |
| Sintetico default            | 5000     | `CORPUS_TOTALE_DEFAULT` (`lib/corpus-unificato.ts:27`)                              |
| Rapporto reale/sintetico     | ~35%     | 1759 / 5000                                                                         |

Dopo REALI-9 (attesi, non finali): +~1450 lista-only +257 TU +3144 Camera
= ~6600 reali → rapporto ribaltato (~132% del default sintetico).

## Leve per ribaltare il rapporto

1. **Collezioni bulk**: 1 download ZIP = centinaia di atti (TU: 257 atti,
   ~260 KB JSON; collezioni note: 124043 abrogati, 91346 regi decreti,
   47761 DPR, 7441 DL+conversioni, 2923 Dlgs, 2335 ratifiche, 1093 UE).
2. **Finestre annuali lista-only**: 1 POST `aggiornati`/anno, zero dettagli
   (~500–700 atti/finestra, <600 KB); split per mese se oltre cap.
3. **Postgres per testi integrali**: file JSON oltre 1 MB non si committano;
   testi integrali/articolati vanno nel DB, nel repo solo metadati ≤1 MB.

## Cosa NON committare mai (e perche')

- File `data/reali/*.json` > 1 MB (cap hard, exit 1): il repo resta
  clonabile; rigenerare con gli script.
- File parziali dopo errore/cap: mai dati tronchi spacciati per completi.
- `GOAL-PROGRESS.md`, `.git/`, `node_modules/`, `.next/`: stato/toolchain,
  non dati.

## Prossimi 3 passi concreti

1. Eseguire W1–W4 REALI-9 (script bounded, verifica cap 972800 B pre-scrittura).
2. Registrare i nuovi percorsi in `PERCORSI_ATTI_REALI` (`lib/sources.ts`) e
   gli shard in `lib/ddl-dati.ts`; conteggi finali in README.
3. Valutare Postgres per testi integrali + finestre 1995/2010
   già coperte da `ingest-reale-normattiva-fextra.ts`.
