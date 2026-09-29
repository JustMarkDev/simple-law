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

## Coda recente — `normattiva-storico-2021/2023/2024/2025.json` (268 atti veri)

Chiude la coda 2020-2022-recenti: 2021 (71: 55 in vigore, 16 abrogati),
2023 (59: 53 in vigore, 6 abrogati), 2024 (70: 65 in vigore, 5 abrogati),
2025 (68: 66 in vigore, 2 abrogati). Stesse regole di onesta (fine-vigenza

- intestazione Art. 1, dedup contro tutti i file esistenti, entita HTML
  decodificate a load in `normalizzaAttoReale`).

```bash
npx tsx scripts/ingest-reale-finestra-2021-2025.ts --anni=2025,2024,2023,2021 --limite=80 --testo-max=2000
```

## Copertura totale 1948-2025 — ogni anno ha la sua finestra (1703 atti, batch 2026-09-29)

Backfill completo via `scripts/ingest-reale-finestra-anni-{A,B,C,D,E}.ts`
(stesso pattern onesto): 1949-1959 + 1961 (379), 1962-1974 (357),
1976-1989 (421), 1991-2004 (248), 2007-2019 (298). Il 2026 corrente resta
coperto da `normattiva-recenti.json` + GU del giorno. Gate:
`tests/reali-16-copertura.test.ts` (ogni anno cablato, ELI unici).

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

## Elezioni — `elezioni-*.json` + `referendum-2025.json` + `sondaggi-nazionali.json` (consuntivo)

Ingest elettorale eseguita: solo aggregati, mai nominativi. Vedi
`docs/elezioni-piano.md` per sonde e formati.

- Europee 2024 (`elezioni-europee-2024.json`, 15 liste, 20 regioni,
  7896 comuni); politiche 2022 (`elezioni-politiche-2022-camera.json`,
  27 liste; `elezioni-politiche-2022-senato.json`, 31 liste); referendum
  8-9 giugno 2025 (`referendum-2025.json`, 5 quesiti, 20 regioni,
  7896 comuni).
- Regionali: Umbria 2024 (23 liste, 92 comuni), Toscana 2025 (10 liste,
  273 comuni), Liguria 2024 (20 liste, 234 comuni), Calabria 2025
  (15 liste, 404 comuni), Emilia-Romagna 2024 (11 liste, 330 comuni;
  in MANIFEST il conteggio 330 = comuni, vedi nota convenzione).
  Split 2025-11-23 su disco con prefisso `b-`: Campania (20 liste,
  550 comuni), Puglia (13 liste, 257 comuni), Veneto (16 liste,
  560 comuni) — i test REALI-14 attendono i nomi canonici senza `b-`
  (assenti: SKIP con nota, mai fail).
- Sondaggi (`sondaggi-nazionali.json`, 30 rilevazioni): fonte
  secondaria Wikipedia con revisione pinnata, rassegna in `/elezioni`,
  mai dati ufficiali.

## Controllo: appalti e giustizia amministrativa — `oversight-anac-2025.json` (60) + `oversight-ga-2026.json` (14) + `oversight-cnel-2026.json` (50)

- **ANAC/BDNCP via OCP Data Registry** (CC BY 4.0): 60 contratti 2025 con
  OCID, CIG, stazione appaltante, oggetto, data. Sezione UI: `/controllo`
  (route `/api/controllo`).
- **giustizia-amministrativa.it, Focus di Giurisprudenza** (solo metadati +
  link ufficiali): 14 provvedimenti 2026 di Consiglio di Stato (7), TAR (6)
  e CGA Sicilia (1). Giudice derivato dall'ente, sezione dopo la virgola;
  numero/anno solo se espliciti, mai inventati.
- **CNEL** (solo metadati + link ufficiali, licenza aperta non dichiarata):
  50 osservazioni e proposte 2026 con titolo, data e scheda ufficiale.
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

## Finanziamenti ai partiti — `finanziamenti-erogazioni-2024-2026.json` (50 coppie)

Fonte: **Camera dei deputati — Erogazioni ai partiti politici iscritti nel
registro nazionale** (art. 5, comma 3, DL 149/2013), pagina indice
`https://parlamento18.camera.it/199` con i PDF annuali 2024 (`.../006/...`,
Last-Modified 13/05/2025, ~5,0 MB), 2025 (`.../007/...`, 11/06/2026,
~5,3 MB) e 2026 (`.../008/...`, 28/09/2026, ~4,2 MB). Hub di contesto
(solo fonte-link): `https://www.camera.it/leg19/1384`, relazioni
`https://www.camera.it/leg19/1234`. Licenza envelope:
`camera.it — solo riuso non commerciale con citazione fonte`.
Sezione UI: `/finanziamenti` (route `/api/finanziamenti`).

- I PDF NON vengono mai ingeriti integralmente (>4MB vietati): lo script
  ne estrae via content-stream solo data/anno/importo di riga e
  intestazione beneficiario (regola last-wins per coordinata, verificata
  via render); il nominativo del soggetto erogante e' scartato dal parser,
  mai emesso. Zero nominativi in output.
- Una riga pubblicata = una comunicazione (`n_erogazioni` = righe;
  `totale_euro` = somma algebrica, incluse righe a zero e rettifiche
  negative, senza giudizi). Merge (beneficiario, anno) tra file;
  `fonte_pdf` = PDF con piu' righe per la coppia (parita' -> piu'
  recente); `lastModified` ISO dallo header HTTP reale.
- Scope anni 2024-2026: le righe con anno fuori intervallo (trasmissioni
  tardive di anni precedenti) sono scartate e conteggiate, mai aggregate.
- Misurato il 2026-09-28: 61.663 righe pubblicate totali, 56.843 in anni
  2024-2026 (€95.099.531,98) aggregate in 985 coppie, 4.820 fuori-anni
  scartate; pubblicate le top-50 per totale (30.042 comunicazioni,
  €61.793.787,98: 52,9% delle righe e 65,0% degli importi in-scope).
  File: ~20 KB. Validazione incrociata: somme al centesimo identiche tra
  parser content-stream e pdftotext su tutti e 3 i PDF.

```bash
npx tsx scripts/ingest-reale-finanziamenti.ts [--max=50]
```

Bound: timeout 15s indice / 30s PDF, retry solo su 429/5xx x3 con
backoff, cap 8MB per PDF, file <=1MB, exit 1 senza scrivere alcun file
in caso di fallimento (mai parziali).

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

## REALI-9 — Camera full leg19 (consuntivo: 1048×3=3144 DISTINCT, NO 6288)

`COUNT DISTINCT leg19=3144` (6288 = righe doppie URI×2). 3 shard lista+
dettaglio `?p ?o` batch 5 (record invariato, ~815 B/atto), scritti il
2026-09-28 e cablati in MANIFEST:

- `camera-atti-leg19-a.json` (1048 atti)
- `camera-atti-leg19-b.json` (1048 atti)
- `camera-atti-leg19-c.json` (1048 atti)

Fonte: dati.camera.it SPARQL, licenza CC BY-SA 4.0.
`npx tsx scripts/ingest-reale-camera-full.ts`
Ultimo recupero / conteggio finale: scritti dallo script all'esecuzione.

## REALI-13 — finestre Normattiva 1975/1995 (consuntivo)

Stessa fonte e licenza dei batch recenti (`POST /api/v1/ricerca/aggiornati`
anno intero, cap 80 dettagli come da script esistente; URN solo se
denominazione+anno+numero non vuoti).

- `normattiva-finestra-1975.json`: finestra `1975-01-01`..`1975-12-31`
  (sonda: 371 atti in lista; esempi di sonda LEGGE184/DPR85; conteggio
  finale = file scritto, max 80).
- `normattiva-finestra-1995.json`: finestra `1995-01-01`..`1995-12-31`
  (sonda: 871 atti in lista; esempi di sonda DL444/LEGGE198; conteggio
  finale = file scritto, max 80).
- Nomi direttiva `normattiva-finestra-*` sono alias: l'esecuzione W3 del
  2026-09-28 ha scritto i nomi default dello script,
  `normattiva-storico-1975.json` (**63 atti**: 39 in vigore, 24 abrogati) +
  `normattiva-storico-1995.json` (**70 atti**: 56 decaduti, 13 in vigore,
  1 abrogato; gli anni '90 sono pieni di DL non convertiti), entrambi
  cablati in `PERCORSI_ATTI_REALI` accanto ai nomi `normattiva-finestra-*`
  (loader salta gli assenti).
- Cablate in `PERCORSI_ATTI_REALI` (`lib/sources.ts`); il loader salta i
  file assenti, quindi il corpus resta invariato finche' W3 non li genera.
- Riserva 1965 (337 in sonda) NON ingerita in REALI-13.

```bash
npx tsx scripts/ingest-reale-normattiva-finestre.ts --anni=1975,1995
```

## REALI-13 — regionali-extra Liguria24/Calabria25 (consuntivo, solo aggregati)

Fonte: Ministero Interno DAIT — Eligendo Open Data (ZIP scrutini;
zero nominativi, colonne candidato mai lette; solo aggregati per-lista +
affluenza comunale; cap ≤950KB/file).

- `elezioni-regionali-2024-liguria.json` (**20 liste**, 234 comuni) da
  `https://dait.interno.gov.it/documenti/opendata/regionali/regionali-20241027.zip`
  (filtro `REGIONE=LIGURIA`).
- `elezioni-regionali-2025-calabria.json` (**15 liste**, 404 comuni) da
  `https://dait.interno.gov.it/documenti/opendata/regionali/regionali-20251005.zip`
  (filtro `REGIONE=CALABRIA`).
- `elezioni-regionali-2024-emilia-romagna.json` (**11 liste**, 330 comuni) da
  `https://dait.interno.gov.it/documenti/opendata/regionali/regionali-20241117.zip`
  (tracciato candidato×sezione 20 colonne: e/v sommati 1x per sezione,
  voti per lista; colonne candidato mai lette).
- Fuori scope: `regionali-20251123.zip`,
  Marche 404, txt 20240310/20240421 (altro parser).

## REALI-13 — GU diretta Ultime (consuntivo, solo RSS ultimo numero)

Fonte: **gazzettaufficiale.it RSS** (solo ultimo numero/serie: title+link
ELI https+pubDate; nessun archivio, nessun mirror atti).

- `gazzetta-ultime.json` (**32 atti**) da `https://www.gazzettaufficiale.it/rss/SG`
  (sonda: Serie Generale n.225 del 28-09-2026, 32 item) + serie S1/S2/S3/S4/S5/P2
  solo se entro cap (≤1 numero/serie, ≤84 item/serie; file ≤1MB).
- Normalizzare http→https; ELI noto
  `https://www.gazzettaufficiale.it/eli/id/2026/08/26/26G00173/sg`.

## REALI-13 — sonde rimandate (solo docs)

Dettaglio in `docs/REALI-13-sonde-rimandate.md` (unico file docs di
REALI-13): finanziamenti (via libera condizionata futura, solo aggregati),
Radio Radicale link-only, Openpolis link-only, CSM rimandata, regionali
esclusi.

## REALI-15 — nomi canonici vs alias (i test restano SKIP, mai fail)

I loader su disco saltano i file assenti; i test sotto passano con nota
(`console.info` + `expect(true)`) quando il nome atteso non esiste.
Nessun rename su disco in REALI-15: fa fede il file esistente.

- Regionali 2025-11-23: i test REALI-14 attendono i canonici
  `elezioni-regionali-2025-campania/puglia/veneto.json`; su disco gli
  alias `b-elezioni-regionali-2025-campania/puglia/veneto.json`
  (split per REGIONE dallo ZIP `regionali-20251123.zip`; conteggi
  MANIFEST = liste: 20/13/16). SKIP con nota, mai fail.
- Finestre 1975/1995: i test REALI-13 attendono gli alias
  `normattiva-finestra-1975/1995.json`; canonici su disco
  `normattiva-storico-1975.json` (63 atti) e
  `normattiva-storico-1995.json` (70 atti), cablati in
  `PERCORSI_ATTI_REALI` accanto ai nomi `finestra-*`. SKIP con nota.
- Oversight: i test REALI-8/`oversight-api` attendono gli alias
  `anac-contratti-2025.json` / `ga-provvedimenti-2026.json`; canonici
  su disco `oversight-anac-2025.json` (60 voci) e
  `oversight-ga-2026.json` (14 voci). I test REALI-10 attendono gli
  alias `cnel-pareri.json` / `commissione-partiti-gu.json`; canonici
  `oversight-cnel-2026.json` (50 documenti) e
  `finanziamenti-erogazioni-2024-2026.json` (50 erogazioni).
  SKIP con nota, mai fail su transiente.

## REALI-15 — audit link (sessione 2026-09-29, solo curl visti)

- CNEL (`oversight-cnel-2026.json`): verificati 5/5 slug via HEAD
  no-follow → `302` a `/404?initialRequestUrl=...`; 1 GET con follow →
  `200` template `Errore Pagina 404`; host `/` e `/documenti` → `200`.
  L'API `POST /api/cnel/content/getItems` (1 sola chiamata, pageSize 5,
  categoria osservazioni) restituisce ancora gli stessi slug relativi:
  nessuna alternativa con `200` vista. Nessun fix applicato (una
  riscrittura sarebbe cieca e inventata); nessun record cancellato.
- Altri host (senato/quirinale/eur-lex/api.normattiva): transienti
  segnalati dalle direttive (WAF/rate-limit), nessun fix applicato in
  questa sessione, mai cancellare record per link morti transienti.
