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
decreti-legge, 16 decreti legislativi, 7 leggi; tutti in vigore al recupero.
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

## Cosa resta dimostrativo

Il corpus sintetico (`lib/seed-data.ts`, `lib/seed-data-espansa.ts`,
varianti generate, snapshot economico in `lib/stats.ts`) resta dimostrativo
ed e' etichettato in UI. Gli atti e comunicati di questa cartella sono gli
unici con `dimostrativo: false`.
