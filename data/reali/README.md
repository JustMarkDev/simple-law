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

Altre finestre storiche (`normattiva-storico-1990.json`: 71 atti,
`normattiva-storico-2000.json`: 61 atti, `normattiva-storico-1970.json`:
66 atti, `normattiva-storico-2010.json`: 66 atti,
`normattiva-storico-1960.json`: 60 atti, `normattiva-storico-2020.json`:
68 atti, `normattiva-storico-1992-1993.json`: 77 atti,
`normattiva-storico-2005-2006.json`: 49 atti) via
`scripts/ingest-reale-normattiva-finestre.ts` (stesse regole di onesta:
fine-vigenza + intestazione Art. 1, dedup contro tutti i file esistenti).

```bash
npx tsx scripts/ingest-reale-normattiva-finestre.ts
```

## Bulk Normattiva — `normattiva-bulk-a-attuazione-ue.json` (39) + `normattiva-bulk-b-finestra-2005.json` (638)

- Attuazione regolamenti UE da collezione bulk preconfezionata (metadati
  con flag `abrogato` esplicito dove presente; URL di download con token
  monouso, non stabile: fa fede l'API bff-opendata).
- Finestra aggiornati 2005, atti **lista-only** (`dettaglio: false`, senza
  testo): tipo/data/nir derivati dall'URN verificato, `stato:
  "sconosciuto"` (vigenza non verificabile, semaforo giallo in UI).
  Mai `in_vigore` inventato.

```bash
npx tsx scripts/ingest-reale-normattiva-bulk-a.ts
npx tsx scripts/ingest-reale-normattiva-bulk-b.ts
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

## Diritto UE — `eurlex-2026.json` (50 atti)

Fonte: **EUR-Lex CELLAR SPARQL**
(`https://publications.europa.eu/webapi/rdf/sparql`), riuso con
attribuzione Dec.2011/833/UE. Regolamenti e direttive 2026 con CELEX,
titolo (in inglese in questa prima fase), data, tipo e link eur-lex.
I regolamenti sono direttamente applicabili in Italia; le direttive
richiedono recepimento: la UI non afferma mai recepimenti specifici.
Sezione UI: `/eurlex` (route `/api/eurlex`).

```bash
npx tsx scripts/ingest-reale-eurlex.ts
```

## Quirinale — `quirinale-atti.json` (12) + `quirinale-comunicati.json` (12)

Fonte: **quirinale.it** (uso non commerciale con attribuzione; fa fede la
Gazzetta Ufficiale). Atti e comunicati della Presidenza con data, titolo,
sintesi e URL assoluti validati. Sezione UI: `/quirinale` (route
`/api/quirinale`).

```bash
npx tsx scripts/ingest-reale-quirinale.ts
```

## Elezioni — `docs/elezioni-piano.md` (piano, nessun dato ancora)

Ricerca verificata su Eligendo/Archivio Storico Elezioni/ISTAT con URL
provati, formati, volumi e licenze. L'ingest elettorale e' il prossimo passo.

## Controllo: appalti e giustizia amministrativa — `oversight-anac-2025.json` (60) + `oversight-ga-2026.json` (14)

- **ANAC/BDNCP via OCP Data Registry** (CC BY 4.0): 60 contratti 2025 con
  OCID, CIG, stazione appaltante, oggetto, data. Sezione UI: `/controllo`
  (route `/api/controllo`).
- **giustizia-amministrativa.it, Focus di Giurisprudenza** (solo metadati +
  link ufficiali): 14 provvedimenti 2026 di Consiglio di Stato (7), TAR (6)
  e CGA Sicilia (1). Giudice derivato dall'ente, sezione dopo la virgola;
  numero/anno solo se espliciti, mai inventati.
- Sono documenti di controllo, **mai leggi**: badge dedicato in UI e API.

```bash
npx tsx scripts/ingest-reale-oversight.ts
```

## Elezioni — `elezioni-*.json` + `referendum-2025.json`

Vedi `docs/elezioni-piano.md` per sonde e formati. Europee 2024, politiche
2022 (Camera+Senato), referendum 8-9 giugno 2025 (5 quesiti SI/NO con
affluenza nazionale, regionale e comunale). Solo aggregati, mai nominativi.

```bash
npx tsx scripts/ingest-reale-elezioni-europee-2024.ts
npx tsx scripts/ingest-reale-elezioni-politiche-2022.ts
npx tsx scripts/ingest-reale-referendum.ts
```

## Sondaggi nazionali — `sondaggi-nazionali.json` (30 rilevazioni)

Fonte secondaria: **Wikipedia, "Opinion polling for the next Italian
general election"** (CC BY-SA 4.0, con attribuzione e revisione pinnata
pageid+revid per verificabilita). Intenzioni di voto per partito con
istituto, fieldwork, campione e link alla fonte primaria. Mostrati in
`/elezioni` come rassegna, mai come dati ufficiali.

```bash
npx tsx scripts/fetch-sondaggi-wiki.mjs
```

## ISTAT — rimandato (decisione documentata)

Il CSV anagrafico ISTAT (`Elenco-comuni-italiani.csv`, latin-1, 1,1 MB) e'
un registro amministrativo, non demografia; i download demo.istat.it usano
pattern applicativi fragili e DBnomics non ha dataset elettorali. Niente
ingest finche' non esiste un dataset demografico stabile e licenziato:
vedi `docs/bur-ricognizione.md` per il metodo e `docs/elezioni-piano.md` §2.

## Cosa resta dimostrativo

Il corpus sintetico (`lib/seed-data.ts`, `lib/seed-data-espansa.ts`,
varianti generate, snapshot economico in `lib/stats.ts`) resta dimostrativo
ed e' etichettato in UI. Gli atti e comunicati di questa cartella sono gli
unici con `dimostrativo: false`.

## REALI-9 — finestre lista-only (pianificati, conteggi attesi non finali)

Stesso schema `§1` lista-only (`titoloAtto`, mai rubrica dettaglio;
`stato:"in_vigore"` + `limite:"stato non rilevabile da lista"`).
Conteggi sotto = attesi/misurati in sonda, MAI finali: fa fede il file scritto.

- `normattiva-finestra-2015.json` (~529 atti): `POST aggiornati` anno=2015,
  1 chiamata. `npx tsx scripts/ingest-reale-normattiva-f2015.ts`
- `normattiva-finestra-2005.json` (~672 atti): `POST aggiornati` anno=2005,
  1 chiamata. `npx tsx scripts/ingest-reale-normattiva-f2005.ts`
- `normattiva-finestra-1995.json` + `normattiva-finestra-2010.json`:
  stesso pattern, 1 POST/anno; conteggio letto da `numeroAttiTrovati` live.
  `npx tsx scripts/ingest-reale-normattiva-fextra.ts`
- `normattiva-testi-unici.json` (257 atti, ZIP `Testi Unici` 8,2 MB):
  `{titolo=titoloDoc, stato da metadati.abrogato}`.
  `npx tsx scripts/ingest-reale-normattiva-tu.ts`

## REALI-9 — Camera full leg19 (pianificati, 3144 DISTINCT, NO 6288)

`COUNT DISTINCT leg19=3144` (6288 = righe doppie URI×2). 3 shard lista+
dettaglio `?p ?o` batch 5 (record invariato, ~815 B/atto):

- `camera-atti-leg19-a.json` (numeri 1–1100, ~1050 atti)
- `camera-atti-leg19-b.json` (numeri 1101–2200, ~1050 atti)
- `camera-atti-leg19-c.json` (numeri 2201–3144, ~1044 atti)

Fonte: dati.camera.it SPARQL, licenza CC BY-SA 4.0.
`npx tsx scripts/ingest-reale-camera-full.ts`
Ultimo recupero / conteggio finale: scritti dallo script all'esecuzione.
