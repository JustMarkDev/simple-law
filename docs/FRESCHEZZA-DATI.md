# Freschezza dati reali (REALI-15, read-only)

Contratto di freschezza: quali file di `data/reali/` vanno aggiornati, ogni
quanto, con quale comando e a quale costo. Tutte le date sotto sono lette
davvero da `data/reali/MANIFEST.json` (mai inventate, mai stimate).

Riferimenti letti il 2026-09-28 (rilevati di nuovo dopo un aggiornamento
concorrente del MANIFEST):

- `MANIFEST.json` — `generatoIl`: `2026-09-28T23:15:12.499Z`, 57 voci,
  nessun duplicato, nessun orfano (W2 ha unito il duplicato
  Emilia-Romagna e assorbito i 5 orfani: verifica `orfani == []` in
  `tests/reali-15.test.ts`).

## File refreshabili (cadenze del giudice)

| fonte (file)                                                            | cadenza                                                     | comando                                                         | costo                                                                              | ultimo refresh (MANIFEST)          |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------- |
| Gazzetta Ufficiale RSS Serie Generale (`gazzetta-ultime.json`, 32 atti) | quotidiana feriale                                          | `bunx tsx scripts/ingest-reale-gu-diretta.ts`                   | 1 GET RSS Serie Generale (32 item osservati, timeout 15 s, max 84 item)            | `2026-09-28T23:13:18.479Z`         |
| Governo, comunicati (`governo-comunicati.json`, 10 comunicati)          | giornaliera (RSS volatile)                                  | `bunx tsx scripts/ingest-reale-governo.ts`                      | 1 GET feed RSS governo.it (max 30 item, timeout 12 s)                              | `2026-09-28T23:13:32.428Z`         |
| Normattiva recenti (`normattiva-recenti.json`, 46 atti)                 | settimanale (finestra mobile)                               | `bunx tsx scripts/ingest-reale-normattiva.ts --limite=50`       | 1 POST lista + ~46 dettagli a batch di 5 con pausa 400 ms, timeout 15 s (~1-3 min) | `2026-09-28T19:08:27.309Z`         |
| Sondaggi nazionali (`sondaggi-nazionali.json`, 30 rilevazioni)          | mensile (settimanale in campagna elettorale)                | `node scripts/fetch-sondaggi-wiki.mjs --dry-run` poi senza flag | MediaWiki API parse wikitext, cap 30 record, file <= 950 KB                        | `2026-09-28`                       |
| Camera, deputati (`camera-deputati.json`, 414)                          | mensile                                                     | `bunx tsx scripts/ingest-reale-camera.ts`                       | SPARQL dati.camera.it (lista + DESCRIBE per scheda)                                | `2026-09-28T18:26:21.186Z`         |
| Camera, gruppi (`camera-gruppi.json`, 13, derivato)                     | mensile (derivato dai deputati, senza nuove interrogazioni) | `bunx tsx scripts/ingest-reale-camera.ts`                       | derivato localmente da `camera-deputati.json`                                      | `2026-09-28T18:26:21.186Z`         |
| Camera, atti leg. 19 (`camera-atti.json`, 197, campione)                | mensile (campione leg. 19)                                  | `bunx tsx scripts/ingest-reale-camera.ts`                       | SPARQL dati.camera.it (campione)                                                   | `2026-09-28T19:00:23.484357+00:00` |
| Senato, senatori (`senato-senatori.json`, 212)                          | mensile                                                     | `bunx tsx scripts/ingest-reale-senato.ts`                       | SPARQL dati.senato.it (lista + dettagli gruppo/foto)                               | `2026-09-28T18:27:50.369Z`         |
| Senato, gruppi (`senato-gruppi.json`, 14 denominazioni)                 | mensile (denominazioni storiche leg. 19)                    | `bunx tsx scripts/ingest-reale-senato.ts`                       | stessa interrogazione dei senatori                                                 | `2026-09-28T18:27:50.369Z`         |
| Parlamento, DDL (`parlamento-ddl.json`, 5, campione)                    | mensile (campione leg. 19)                                  | `bunx tsx scripts/ingest-reale-ddl.ts`                          | SPARQL dati.senato.it (campione)                                                   | `2026-09-28T19:00:34.734348+00:00` |

Le cadenze sopra sono le stringhe esatte usate da
`scripts/verifica-freschezza.ts` (il test trasversale ne verifica la
citazione parola per parola: niente sinonimi inventati).

Allineamento verificato il 2026-09-28: per `gazzetta-ultime.json` e
`governo-comunicati.json` il `recuperatoIl` del MANIFEST coincide con la
provenance del file (refresh W4 gia' assorbiti da W2 nel MANIFEST).

## Verifica automatica (mai rete)

```bash
bunx tsx scripts/verifica-freschezza.ts            # soglie standard (sondaggi mensili)
bunx tsx scripts/verifica-freschezza.ts --campagna # sondaggi settimanali in campagna
bunx tsx scripts/verifica-freschezza.ts --json     # esito in JSON
```

Soglie oneste (tolleranza inclusa): quotidiana feriale 4 giorni (copre il
fine settimana), giornaliera 3 giorni, settimanale 9 giorni, mensile
35 giorni. Lo script esce con codice 1 se un file refreshabile supera la
soglia, se la sua voce manca nel MANIFEST o se `recuperatoIl` non e'
interpretabile. Non fa rete e non scrive file.

## Non refreshabili ora (snapshot/archivio)

Nessun refresh, nessun fix su transienti (regola ferrea: mai cancellare un
record per un link morto transiente, solo fix permanenti verificati con
200 vista):

- `ingest-reale-camera.ts` / `ingest-reale-senato.ts`: mensili; il 403 del
  Senato osservato oggi e' transiente (WAF) → solo retry, mai cancellare.
- Quirinale (403×9), EUR-Lex (202×9), `api.normattiva` (405/409):
  transienti o non-rotte, nessun fix.
- Storici Normattiva, elezioni/referendum passati, consulta, oversight,
  finanziamenti, recepimenti: snapshot o archivi, si aggiornano solo su
  direttiva esplicita del giudice (finestre 1965/2022 in carico a W4
  fresh+finestre, non a questo documento).
- `oversight-cnel-2026.json`: 9/9 link con pattern permanente verso `/404`
  in carico a W1 link; qui non si tocca.

## Regole ferree (promemoria)

Mai inventare numeri, URL o date (solo file e risposte viste); mai scrivere
fuori dai file assegnati; rete rispettosa (HEAD no-follow prima del GET,
batch ≤ 5, pausa 150-400 ms, timeout 8-15 s, retry solo 429/5xx); ingest
bounded con exit 1 senza parziali; librerie never-throw; interfaccia in
italiano.

## Refresh R1 2026-09-29 (conteggi veri, da provenance dei file)

- `gazzetta-ultime.json`: 32 -> 32 atti, `recuperatoIl` `2026-09-29T01:12:57.822Z`
  (`bunx tsx scripts/ingest-reale-gu-diretta.ts`, SG n.225 del 2026-09-28).
- `governo-comunicati.json`: 10 -> 10 comunicati, `recuperatoIl`
  `2026-09-29T01:13:00.139Z` (`bunx tsx scripts/ingest-reale-governo.ts`).
- `normattiva-recenti.json`: 46 -> 46 atti, `recuperatoIl`
  `2026-09-29T01:13:16.675Z` (`bunx tsx scripts/ingest-reale-normattiva.ts
--limite=50`; lista 330 URN, dettagli OK 46, 4 scarti senza titolo/chiave).
- `bunx tsx scripts/verifica-freschezza.ts`: exit 0, tutti i refreshabili OK.
- Nota onesta: gli script non aggiornano `MANIFEST.json` (voci ancora al
  2026-09-28, fuori scope R1: MANIFEST in carico a W2) → 2 test di coerenza
  in `tests/refresh-reali.test.ts` falliscono finche' W2 non ri-sincronizza
  il MANIFEST; `tsc --noEmit` pulito.
