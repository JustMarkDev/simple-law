# Dati reali (open data ufficiali)

Tutti i file in questa cartella contengono dati scaricati dalle fonti
ufficiali con gli script `scripts/ingest-reale-*.ts`. Ogni file ha un
envelope `{provenance, ...}` con fonte, URL, data di recupero e licenza.
Record con `dimostrativo: false` nell'app = da questi file. Mai codici,
numeri, URL o date inventati: i campi assenti restano assenti.

I file oltre 1 MB non si committano: rigenerare con gli script.

## Normattiva — `normattiva-recenti.json` (46 atti)

Fonte: **Normattiva — API Open Data (bff-opendata v1)**,
Istituto Poligrafico e Zecca dello Stato.
Base: `https://api.normattiva.it/t/normattiva.api/bff-opendata/v1`.

- Endpoint lista: `POST /api/v1/ricerca/aggiornati`
  `{dataInizioAggiornamento, dataFineAggiornamento}` (finestra modifiche
  `2026-07-01`..`2026-09-28`; la data di emanazione dei singoli atti puo'
  essere antecedente).
- Endpoint dettaglio: `POST /api/v1/atto/dettaglio-atto-urn` `{urn}` con URN
  NIR costruito solo da campi reali della lista
  (`denominazioneAtto` + `giorno/mese/annoProvvedimento` +
  `numeroProvvedimento`) e validato con `parseNIR`.
- Endpoint tentati e falliti il 2026-09-28: `POST /ricerca/listaAtti`
  (404, ripiegato su `aggiornati`), `POST /ricerca/avanzata` (500).
- Stato degli atti: solo `articoloDataFineVigenza` del dettaglio fa fede
  (`99999999` = in vigore); mai dedotto dal testo.
- Licenza/termini: riproduzione consentita con menzione di fonte, carattere
  non autentico e gratuito. Solo il testo sulla Gazzetta Ufficiale a stampa
  e' autentico.

Ultima esecuzione reale: 2026-09-28 — **46 atti** (richiesti 50; 4 dettagli
senza titolo/chiave scartati, mai inventati). Composizione: 23
decreti-legge, 16 decreti legislativi, 7 leggi; 44 in vigore, 2 abrogati
(DL 139/2026 e DL 153/2026, abrogati dalla legge 166/2026: intestazione
formale Art. 1 di Normattiva). Stato mai dedotto dal corpo del testo.
File: 343,7 KB. Testi troncati a 8000 caratteri dove oltre (`testoTroncato:
true`); sintesi entro 600 caratteri. URN in lista: 330.

```bash
npx tsx scripts/ingest-reale-normattiva.ts --limite=50
npx tsx scripts/ingest-reale-normattiva.ts --help   # tutte le opzioni
```

Batch dettagli da 5 con pausa 400 ms, timeout 15000 ms, retry solo su
429/5xx, stop su 403/409/ERR_409. Se tutti gli endpoint falliscono o il JSON
supera 1 MB, esce con codice 1 senza scrivere file parziali.

## Camera dei deputati — `camera-deputati.json` (414) + `camera-gruppi.json` (13)

Fonte: **dati.camera.it (SPARQL)**, legislatura 19. Licenza: **CC BY-SA 4.0**.

- Lista deputati + `DESCRIBE` per scheda (gruppo corrente, collegio, URL
  scheda); solo campi presenti in risposta, mai inventati.
- `camera-gruppi.json` e' derivato localmente dai deputati (conteggio
  componenti per gruppo, senza nuove interrogazioni).
- Ultimo recupero: 2026-09-28.

```bash
npx tsx scripts/ingest-reale-camera.ts
```

## Senato — `senato-senatori.json` (212) + `senato-gruppi.json` (14 denominazioni)

Fonte: **dati.senato.it (SPARQL)**, legislatura 19. Licenza: **CC BY 3.0 IT**.

- Lista senatori + dettagli (adesioni ai gruppi, foto); gruppi come
  denominazioni storiche della legislatura (stessa forza, nomi diversi nel
  tempo: es. varianti "Civici d'Italia" e "Italia Viva").
- Dettagli singoli falliti non abortiscono l'ingest (senatore senza
  gruppo/foto, mai senza nome). Ultimo recupero: 2026-09-28.

```bash
npx tsx scripts/ingest-reale-senato.ts
```

## Governo — `governo-comunicati.json` (10 comunicati)

Fonte: **governo.it feed RSS** (`https://www.governo.it/it/feed/rss`, RSS 2.0).
Solo URL assoluti navigabili; numero del comunicato solo se nel titolo.
Riuso di titolo/link/descrizione. Ultimo recupero: 2026-09-28.

```bash
npx tsx scripts/ingest-reale-governo.ts
```

## Storico Normattiva — `normattiva-storico-1980.json` (66) + `normattiva-storico-collezioni.json` (112)

Stessa fonte e licenza del batch recente. Due sorgenti bounded:

- finestra `1980-01-01`..`1980-12-31` via `aggiornati` (max 80 atti);
- 3 collezioni chiuse via download (`Codici`, `Leggi costituzionali`,
  `Leggi di delegazione europea`; max 122 atti).

Dedup per ELI/URN contro `normattiva-recenti.json` (mai due record per lo
stesso atto). Stati onesti: 36+109 in vigore, 21 decaduti (DL non
convertiti, intestazione Art. 1), 9+3 abrogati; `articoloDataFineVigenza`
conservata in ogni record per audit.

```bash
npx tsx scripts/ingest-reale-normattiva-storico.ts [--limite-1980=80] [--testo-max=2000]
```

## DDL e atti parlamentari — `parlamento-ddl.json` (5) + `camera-atti.json` (197)

Fonti: dati.senato.it / dati.camera.it (SPARQL, leg. 19), licenze CC BY 3.0
IT / CC BY-SA 4.0. Disegni di legge con fase/iter e atti della Camera con
tipo e link ufficiali. **Non sono leggi in vigore**: in UI portano sempre il
badge "Disegno di legge — non in vigore".

```bash
npx tsx scripts/ingest-reale-ddl.ts
```

## Corte Costituzionale — `consulta-pronunce-2001.json` (50 pronunce)

Fonte: cortecostituzionale.it (CC BY-SA 3.0). Campione di 50 pronunce del
2001 con numero, data, oggetto e link ufficiale. Sezione UI: `/consulta`
(route `/api/consulta`).

```bash
npx tsx scripts/ingest-reale-consulta.ts
```

## Cosa resta dimostrativo

Il corpus sintetico (`lib/seed-data.ts`, `lib/seed-data-espansa.ts`,
varianti generate, snapshot economico in `lib/stats.ts`) resta dimostrativo
ed e' etichettato in UI. Gli atti e comunicati di questa cartella sono gli
unici con `dimostrativo: false`.
