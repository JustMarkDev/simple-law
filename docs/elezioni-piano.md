# Elezioni — piano fondato su sonde (2026-09-28, solo ricerca, zero scritture repo)

> Ogni URL sotto è stato aperto dal vivo in questo round; campioni in `/tmp/elezioni/`, non nel repo.

## 1. Eligendo / Archivio storico (Ministero Interno DAIT) — VERIFICATO

- Catalogo: `https://elezionistorico.interno.gov.it/eligendo/opendata.php` → 200, 62.562 B, HTML con `var aliasFile='/daithome/documenti/opendata'` + `var dataSet=[...]` (voci `[set, file, path]`, es. `catalogoagid/europee-2024-italia-livcomune.csv`).
- Download reale: `https://elezionistorico.interno.gov.it/daithome/documenti/opendata/catalogoagid/europee-2024-italia-livcomune.csv` → 301 AkamaiGHost a `https://dait.interno.gov.it/documenti/opendata/catalogoagid/europee-2024-italia-livcomune.csv` → 200, **13.284.241 B**.
- Formato europee: CSV `;`, campi quotati, header `"DATA_ELEZIONE";"DESCCIRCEUROPEA";"DESCREGIONE";"DESCPROVINCIA";"DESCCOMUNE";"ELETTORI";"ELETTORI_M";"ELETTORI_F";"VOTANTI";"VOTANTI_M";"VOTANTI_F";"NUMSCHEDEBIANCHE";"NUMSCHEDECONTESTAT";"DESCLISTA";"NUMVOTI"`, date `9/6/2024 00:00:00` (d/m/yyyy).
- Comunali: `https://dait.interno.gov.it/documenti/opendata/catalogoagid/comunali-20240609.csv` → 200, **36.252.829 B** misurati (HEAD+GET). Header diverso (livello candidati): `"DATAELEZIONE";"REGIONE";"CIRCOSCR";"PROVINCIA";"COMUNE";"COGNOME";"NOME";"DATANASCITA";"LUOGONASCITA";"SESSO";"PREFERENZE";"DESCRLISTA";"VOTILISTA"`. ATTENZIONE: prime righe `12/2/2023` → file cumulativo, non solo 09/06/2024.
- Info/licenza: `https://elezionistorico.interno.gov.it/eligendo/info_opendata.php` → 200, 17.714 B; testo: "dati ufficiali… proclamazioni… verbali dei seggi", contatto `elezioni.storico@interno.it`; nessuna stringa CC-BY nel body → riuso open-data ministeriale da confermare su catalogo AGID prima dell'ingest.
- Live: `https://elezionistorico.interno.gov.it/` → 200, 25.456 B, HTML statico + JS (no `app-root`/Angular rilevato) → consultazione via link esterno, niente scrape live.

## 2. ISTAT — VERIFICATO

- Comuni: `https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.csv` → 200, **1.126.843 B**, `Content-Type: application/octet-stream`; CSV `;`, header quotato (`Codice Regione;…;Denominazione…;Sigla automobilistica;Codice Catastale…;Codice NUTS1/2/3 2021 e 2024`); join ideale su catastale + denominazione+sigla.
- Demo: `https://demo.istat.it/` → 200, 33.204 B; "dati ufficiali… Anagrafe e Stato civile… Censimento"; download via `app/?i=<COD>&l=it` (pattern osservato: `D7B,PPC,PPR,CDQ,POS,STR,RCS`). Solo anagrafe/demografia, NON risultati elettorali → utile per denominatori (popolazione/elettori teorici), non per voti.
- DBnomics: `https://api.db.nomics.world/v22/datasets/ISTAT?limit=10` → 200, 3.622.772 B, JSON `datasets.docs[]` (es. `101_1015` agricoltura). Nessun dataset elettorale rilevato → fallback demografico/economico, non fonte voti.
- SDMX diretto: NESSUN endpoint SDMX elettorale verificato in questo round → RIMANDATO (precedenti 302/404/timeout confermati come pattern da non riprovare senza nuova sonda).

## 3. CISE / YouTrend — solo FONTI LINKATE (verificata reachability, mai scrape)

- `https://cise.luiss.it/` → 200, 196.516 B. `https://www.youtrend.it/` → 200, 264.385 B. Uso: link esterni di contesto/analisi; instabili per layout → vietato scraparli.

## 4. Schema proposto (round futuro, non implementato qui)

- `elezione{tipo:politiche/europee/regionali/comunali/referendum, data, turno, fonte_url}` → `consultazione{istat_comune(codice_catastale), elettori{M,F}, votanti{M,F}, bianche, contestate, affluenza}` → `voto_lista{descr_lista normalizzata, voti}` + `voto_candidato{cognome,nome,preferenze,voti_lista}` (solo file tipo comunali-candidati). Parser riusabile: `parseLivComune(";"+quotato, data d/m/yyyy)` + `parseCandidati(...)` separato; join ISTAT su catastale.
- Volumi attesi: europee-livcomune ~13 MB/file → ~150–300k righe; comunali-candidati ~36 MB → ingest SOLO per finestra/turno con cap ≤950 KB per `data/reali/elezioni-*.json` (aggregati comunali, mai righe candidato integrali).

## 5. UI/API future (stime, fuori round)

- `lib/elezioni.ts` (never-throw, tipi+parser, ~200 righe) → `scripts/ingest-reale-elezioni.ts` (bounded, 1 req/2s, exit 1 senza parziali) → `app/elezioni/page.tsx` + `app/elezioni/[tipo]/[data]/page.tsx` (tabelle affluenza+liste, italiano, badge "dati ufficiali DAIT"). Stima: 3–5 file, test Vitest su fixture `/tmp`.

## 6. Rischi e fallback

- File cumulativi/misnamed (comunali-20240609 contiene 2023) → filtrare sempre su `DATAELEZIONE`, mai sul nome file. Redirect `elezionistorico→dait.interno.gov.it` → seguire 301 e fissare provenance sull'URL finale. Range ignorato dal server (200 invece di 206) → niente resume, batch piccoli. Licenza DAIT non machine-readable → non pubblicare oltre aggregati finché non confermata. Live SPA/API non stabili → solo link esterno.
