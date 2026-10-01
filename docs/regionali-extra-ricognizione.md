# Regionali-extra — ricognizione sonde Liguria 2024 + Calabria 2025 (2026-09-28)

> Ogni URL sotto è stato verificato dal vivo il 2026-09-28 (HEAD 200 + `unzip -l`).
> Solo aggregati per lista + affluenza comunale. Zero nominativi. File `*Preferenze*.csv` mai aperti.

## Esito generale

- Ingerite 2 consultazioni DAIT–Eligendo via `scripts/ingest-reale-regionali-extra.ts`.
- Liguria 2024: ZIP `regionali-20241027.zip` (200, 1.667.956B), voce
  `Regionali_Liguria_2024_Scrutini.csv` (4.549.040B, 20 colonne tipo-Umbria,
  livello sezione, 35.700 righe, tutte `REGIONE=LIGURIA`). 234 comuni, 20 liste,
  e=1.341.693, v=616.748.
- Calabria 2025: ZIP `regionali-20251005.zip` (200, 1.686.154B), voce
  `20251005_REGIONALI_CALABRIA_SCRUTINI.csv` (606.489B, 16 colonne tipo-Toscana,
  livello comunale, 6.060 righe, tutte `REGIONE=CALABRIA`). 404 comuni, 15 liste,
  e=1.888.368, v=814.857.
- Output ≤950KB: Liguria 20.888 byte, Calabria 31.928 byte.

## Header verbatim (sonda 3)

- Liguria (20): `REGIONE;CIRCOSCRIZIONE;COMUNE;SEZIONE;ELETTORI_UOMINI;ELETTORI_DONNE;`
  `ELETTORI_TOTALI;VOTANTI_UOMINI;VOTANTI_DONNE;VOTANTI_TOTALI;SCHEDE_NULLE;SCHEDE_BIANCHE;`
  `SCHEDE_CONTESTATE;NUM_CANDIDATO;COGNOME_CANDIDATO;NOME_CANDIDATO;VOTI_CANDIDATO;`
  `NUM_LISTA;LISTA;VOTI_LISTA` — identico a Umbria 2024.
- Calabria (16): `REGIONE;CIRCOSCRIZIONE;COMUNE;ELETTORI;VOTANTI;SCHEDE_BIANCHE;SCHEDE_NULLE;`
  `SCHEDE_CONTESTATE;NUM_CANDIDATO;NOME;COGNOME;ALTRO_NOME;VOTI_CANDIDATO;NUM_LISTA;`
  `LISTA;VOTI_LISTA` — identico a Toscana 2025.

## Limiti noti (non difetti: scelte documentate)

1. Voti del presidente scartati: il tracciato pubblica voti candidato per riga ma nessun
   aggregato per presidente; come per Toscana/Umbria, le colonne candidato non sono mai
   lette. In Liguria 821 righe «solo-presidente» (lista vuota, 0 voti lista) contano solo
   per l'affluenza di sezione.
2. Date dal nome ZIP DAIT (`2024-10-27`, `2025-10-05`), stessa convenzione di
   Toscana (`20251012`) e Umbria (`20241117`).
3. Calabria: la colonna `CIRCOSCRIZIONE` del tracciato contiene l'area elettorale
   (`NORD`/`CENTRO`/`SUD`), non la provincia. Il valore è riportato verbatim nella
   chiave `p` dei comuni (come in ingest). Liguria: province reali
   (`GENOVA`/`SAVONA`/`LA SPEZIA`/`IMPERIA`).
4. Voci ZIP mai toccate: `*Preferenze*.csv`, `dato per sezione/*`,
   `*_CANDIDATI_*.csv`, `*_VOTANTI.csv` (formato diverso, fuori scope).
5. Licenza: riuso open-data ministeriale da confermare (pagina `info_opendata` senza
   stringa CC-BY), come per le altre regionali. Seggi assenti nei file.
6. Esclusi per direttiva: Emilia-Romagna in `20241117`, `regionali-20251123.zip`,
   Marche (404), txt `20240310`/`20240421` (altro parser).

## File e rotte (scrittore W1, REALI-13)

- `scripts/ingest-reale-regionali-extra.ts` + `data/reali/elezioni-regionali-2024-liguria.json`
  - `data/reali/elezioni-regionali-2025-calabria.json` + `lib/regionali-extra-dati.ts`
  - `app/api/regionali-extra/route.ts` + `app/api/regionali-extra/[id]/route.ts`
  - `app/regionali-extra/page.tsx` + `app/regionali-extra/[id]/page.tsx`
  - `tests/regionali-extra.test.ts`.
- Nessun altro file esistente toccato, salvo voce `Header.tsx` e voci `sitemap.ts`.
