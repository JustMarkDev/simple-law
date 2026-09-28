# BUR regionali — ricognizione sonde (2026-09-28, sola documentazione)

> Ogni URL sotto è stato aperto dal vivo il 2026-09-28. Nessun ingest testi: solo link esterni verificati. Mai scraping senza base giuridica.

## Esito generale
- Nessuna fonte nazionale unica dei BUR. Zero ELI regionale rilevato nelle 5 sonde. Zero API/RSS BUR documentate sui testi integrali. Zero licenze aperte sui testi (solo consultazione gratuita).
- Unica open-data attinente: metadati leggi Lombardia su Socrata (non testi BUR).

## Tabella 5 regioni (URL provati)
| Regione | Portale BUR (aperto, esito) | Open data / API / RSS / ELI | Formato | Licenza |
|---|---|---|---|---|
| Sardegna | `https://buras.regione.sardegna.it/` → 200, elenco bollettini+inserzioni, link `/bollettino/*`, `/inserzione/*`, `/api/assets/*` | API documentata: no. RSS: no. ELI: no. Pattern `/api/assets/*` è download PDF, non API metadati | HTML + PDF | `https://www.regione.sardegna.it/note-legali` → copyright default, CC BY-NC-SA 2.5 IT solo dove marcato; valore legale solo BURAS. Niente riuso aperto |
| Campania | `http://burc.regione.campania.it/eBurcWeb/publicContent/home/index.iface` → 200, ultimi BURC + PDF `BurcPdfOutput/*.pdf` + versione navigabile | API: no. RSS: no. ELI: no. Ricerca HTML `/search/search.iface` + archivio dal 02/03/2009, niente endpoint machine-readable | HTML + PDF | Pagine `info.iface`: consultazione libera e gratuita, inserzioni gratuite via PEC. Nessun testo CC-BY rilevato |
| Lombardia | Hub `https://www.regione.lombardia.it/burl-bollettino-ufficiale-regione-lombardia` → 200. Piattaforma `https://www.consultazioniburl.servizirl.it/` linkata dall'hub, fetch diretto 2026-09-28 vuoto → da riverificare | API BUR testi: no. RSS: no. ELI: no. Solo metadati leggi: `https://www.dati.lombardia.it/government/CRL-Leggi-Regionali-della-Lombardia/abjw-hhay` → 200 (Socrata, ~2.675 righe, estremi+data/numero BURL) | Hub HTML + PDF su piattaforma dedicata | Portale: tutti i diritti riservati. Dataset CRL: Public Domain Dedication 1.0, ma copre metadati leggi, non testi BUR |
| Lazio | `https://sicer.regione.lazio.it/PublicBur/burlazio/FrontEnd/UltimiEdiz` → 200, tabella n./data/edizione con `BUR-2026-*.pdf` + `.fd.pdf` firmato. Guida `https://www.regione.lazio.it/bur/guida-al-servizio` → 200 | API: no. RSS: no (solo RSS news di portale). ELI: no. Ricerca per edizione/atto puntuale solo HTML dal 01/07/2012 (L.R. 12/2011) | HTML + PDF | Guida: consultazione gratuita, pubblicazione bisettimanale telematica. Nessun testo CC-BY rilevato |
| Sicilia (GURS) | `http://www.gurs.regione.sicilia.it/` → 200, avviso migrazione: dal 01/01/2026 (L.R. 26/06/2025 n. 28) solo `https://www.gursonline.regione.sicilia.it` → 200 (Home, Consultazione, Archivio Storico, PagoPA, istruzioni inserzioni PDF) | API: no. RSS: no. ELI: no | HTML + PDF | Note legali standard, nessun CC-BY sui fascicoli rilevato. Tariffe/abbonamenti aggiornati 01/01/2026 |

## Verdetto: ingeribile-ora vs link-futuri
- Ingeribile-ora come testi integrali: NESSUNA delle 5 (licenze chiuse + nessuna API/RSS/ELI).
- Linkabili oggi come link esterni verificati: tutte e 5 (URL sopra).
- Candidata pilota metadati-only: solo Sardegna (URL `/inserzione/*`, `/bollettino/*`, `/api/assets/*` stabili e aperti oggi).

## Proposta concreta prossimo passo
1. Sezione `app` "Bollettini regionali": 5 link esterni verificati (tabella sopra), badge "consultazione gratuita, testi © Regione", nessun mirror PDF.
2. Script pilota W-pilota-BURAS (se approvato): solo metadati Sardegna (numero bollettino, data, titolo inserzione, URL canonico), 1 req/2s, cap 950 KB, exit 1 senza parziali, mai testo integrale senza parere su note legali. Altre 4 regioni: solo link, niente script.
