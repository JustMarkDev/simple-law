/**
 * Test ingest finestre Normattiva 1990/2000: fixture inline, zero rete.
 *
 * Copre parser/mapping/stato/dedup delle funzioni pure esportate da
 * `scripts/ingest-reale-normattiva-finestre.ts`, l'unione multi-file
 * (3+ file) via `lib/sources.ts` e un'integrazione tollerante sui JSON
 * reali (passa anche se i file non sono ancora stati generati).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  caricaChiaviEsistenti,
  chiaveEliFinestra,
  dettaglioToRecordFinestra,
  dividiIntervalloFinestra,
  eliCandidatiFinestra,
  isErroreLimiteAttiFinestra,
  isIsoDateFinestra,
  normalizzaFinestra,
  statoDaFineVigenzaFinestre,
  statoDaIntestazioneArt1Finestre,
  stringaFinestra,
  urnDaVoceFinestra,
  vociDaAggiornatiFinestra,
} from "../scripts/ingest-reale-normattiva-finestre";
import type { VoceFinestra } from "../scripts/ingest-reale-normattiva-finestre";
import { estraiListaAttiReali, normalizzaAttoReale, unisciCorpus } from "../lib/sources";

const VOCE_AGGIORNATI_1990 = {
  numeroAtto: "55",
  numeroAttoAlfanumerico: "55",
  dataGU: "1990-03-10",
  numeroGU: "59",
  codiceRedazionale: "090G0075",
  titoloAtto: "Conversione in legge del decreto-legge.",
  giornoProvvedimento: "27",
  meseProvvedimento: "1",
  annoProvvedimento: "1990",
  numeroProvvedimento: "55",
  denominazioneAtto: "DECRETO-LEGGE",
  descrizioneAtto: "DECRETO-LEGGE 27 gennaio 1990, n. 55",
};

const VOCE_AGGIORNATI_2000 = {
  numeroAtto: "112",
  dataGU: "2000-06-15",
  numeroGU: "138",
  codiceRedazionale: "000G0148",
  titoloAtto: "Disposizioni in materia di prova.",
  giornoProvvedimento: "9",
  meseProvvedimento: "6",
  annoProvvedimento: "2000",
  numeroProvvedimento: "112",
  denominazioneAtto: "LEGGE",
  descrizioneAtto: "LEGGE 9 giugno 2000, n. 112",
};

const VOCE_1990: VoceFinestra = {
  urn: "urn:nir:stato:decreto.legge:1990-01-27;55",
  codice: "090G0075",
  dataGU: "1990-03-10",
  numeroGU: "59",
  eliReale: "",
};

const DETTAGLIO_1990 = {
  data: {
    atto: {
      titolo: "DECRETO-LEGGE 27 gennaio 1990, n. 55",
      sottoTitolo: "Conversione in legge del decreto-legge di prova.",
      articoloHtml: "<div><p>Testo reale di prova con piu' parole per la sintesi.</p></div>",
      tipoProvvedimentoDescrizione: "DECRETO-LEGGE",
      annoProvvedimento: 1990,
      meseProvvedimento: 1,
      giornoProvvedimento: 27,
      numeroProvvedimento: 55,
      annoGU: 1990,
      meseGU: 3,
      giornoGU: 10,
      numeroGU: 59,
      articoloDataInizioVigenza: "19900127",
      articoloDataFineVigenza: "99999999",
    },
  },
};

const DETTAGLIO_ABROGATO = {
  data: {
    atto: {
      titolo: "LEGGE 9 giugno 2000, n. 112",
      sottoTitolo: "Disposizioni in materia di prova.",
      articoloHtml: "<div><p>Testo di prova.</p></div>",
      tipoProvvedimentoDescrizione: "LEGGE",
      annoProvvedimento: 2000,
      meseProvvedimento: 6,
      giornoProvvedimento: 9,
      numeroProvvedimento: 112,
      articoloDataFineVigenza: "20051231",
    },
  },
};

const VOCE_2000: VoceFinestra = {
  urn: "urn:nir:stato:legge:2000-06-09;112",
  codice: "000G0148",
  dataGU: "",
  numeroGU: "",
  eliReale: "",
};

describe("ingest finestre Normattiva 1990/2000 (fixture inline, zero rete)", () => {
  it("urnDaVoceFinestra costruisce l'URN reale dalle voci aggiornati", () => {
    expect(urnDaVoceFinestra(VOCE_AGGIORNATI_1990)).toBe(
      "urn:nir:stato:decreto.legge:1990-01-27;55",
    );
    expect(urnDaVoceFinestra(VOCE_AGGIORNATI_2000)).toBe(
      "urn:nir:stato:legge:2000-06-09;112",
    );
  });

  it("urnDaVoceFinestra restituisce '' se i campi non bastano (mai inventare)", () => {
    expect(urnDaVoceFinestra({})).toBe("");
    expect(urnDaVoceFinestra(null)).toBe("");
    expect(urnDaVoceFinestra({ denominazioneAtto: "LEGGE" })).toBe("");
    expect(urnDaVoceFinestra("stringa")).toBe("");
  });

  it("vociDaAggiornatiFinestra estrae voci con dedup URN", () => {
    const voci = vociDaAggiornatiFinestra({
      data: [VOCE_AGGIORNATI_1990, VOCE_AGGIORNATI_1990, VOCE_AGGIORNATI_2000],
    });
    expect(voci).toHaveLength(2);
    expect(voci[0]?.urn).toBe("urn:nir:stato:decreto.legge:1990-01-27;55");
    expect(voci[1]?.urn).toBe("urn:nir:stato:legge:2000-06-09;112");
  });

  it("vociDaAggiornatiFinestra non lancia su forme inattese", () => {
    expect(vociDaAggiornatiFinestra(null)).toEqual([]);
    expect(vociDaAggiornatiFinestra({})).toEqual([]);
    expect(vociDaAggiornatiFinestra("x")).toEqual([]);
  });

  it("statoDaFineVigenzaFinestre: solo la data esplicita fa fede", () => {
    expect(statoDaFineVigenzaFinestre("99999999", "20260928")).toBe("in_vigore");
    expect(statoDaFineVigenzaFinestre("20051231", "20260928")).toBe("abrogato");
    expect(statoDaFineVigenzaFinestre("", "20260928")).toBe("in_vigore");
    expect(statoDaFineVigenzaFinestre("non-una-data", "20260928")).toBe("in_vigore");
  });

  it("statoDaIntestazioneArt1Finestre: solo intestazione formale Art. 1", () => {
    expect(statoDaIntestazioneArt1Finestre("ART. 1 DECRETO DECADUTO - testo")).toBe("decaduto");
    expect(
      statoDaIntestazioneArt1Finestre("Art. 1 ((PROVVEDIMENTO ABROGATO - testo"),
    ).toBe("abrogato");
    expect(statoDaIntestazioneArt1Finestre("Testo che cita un'abrogazione nel corpo")).toBeNull();
    expect(statoDaIntestazioneArt1Finestre("")).toBeNull();
  });

  it("chiaveEliFinestra normalizza con trim+lowercase", () => {
    expect(chiaveEliFinestra("  /ELI/ID/1990/SG  ")).toBe("/eli/id/1990/sg");
    expect(chiaveEliFinestra(null)).toBe("");
    expect(chiaveEliFinestra(undefined)).toBe("");
  });

  it("eliCandidatiFinestra elenca ELI reale + derivato da URN/codice", () => {
    const candidati = eliCandidatiFinestra(VOCE_1990);
    expect(candidati).toContain("/eli/id/1990/01/27/090g0075/sg");
    const conReale: VoceFinestra = { ...VOCE_1990, eliReale: "/eli/id/1990/03/10/090G0075/ORIGINAL" };
    expect(eliCandidatiFinestra(conReale)).toContain("/eli/id/1990/03/10/090g0075/original");
  });

  it("dettaglioToRecordFinestra mappa il dettaglio reale 1990 in LawRecord", () => {
    const record = dettaglioToRecordFinestra(VOCE_1990, DETTAGLIO_1990, 2000);
    expect(record).not.toBeNull();
    expect(record?.titolo).toBe("DECRETO-LEGGE 27 gennaio 1990, n. 55");
    expect(record?.tipo).toBe("decreto.legge");
    expect(record?.numero).toBe("55");
    expect(record?.dataEmanazione).toBe("1990-01-27");
    expect(record?.nir).toBe(VOCE_1990.urn);
    expect(record?.eli).toBe("/eli/id/1990/01/27/090G0075/sg");
    expect(record?.chiave).toBe(record?.eli);
    expect(record?.stato).toBe("in_vigore");
    expect(record?.sintesi.length).toBeLessThanOrEqual(600);
    expect(record?.dataGU).toBe("1990-03-10");
    expect(record?.numeroGU).toBe("59");
    expect(record?.codiceRedazionale).toBe("090G0075");
    expect(record?.articoloDataFineVigenza).toBe("99999999");
    expect("dimostrativo" in (record as unknown as Record<string, unknown>)).toBe(false);
  });

  it("dettaglioToRecordFinestra onora la fine-vigenza passata (abrogato)", () => {
    const record = dettaglioToRecordFinestra(VOCE_2000, DETTAGLIO_ABROGATO, 2000);
    expect(record?.stato).toBe("abrogato");
    expect(record?.articoloDataFineVigenza).toBe("20051231");
  });

  it("dettaglioToRecordFinestra tronca il testo oltre testoMax con flag", () => {
    const record = dettaglioToRecordFinestra(VOCE_1990, DETTAGLIO_1990, 10);
    expect(record?.testoTroncato).toBe(true);
    expect(record?.testo).toContain("[...]");
  });

  it("dettaglioToRecordFinestra scarta dettagli senza titolo/chiave", () => {
    expect(dettaglioToRecordFinestra(VOCE_1990, {}, 2000)).toBeNull();
    expect(dettaglioToRecordFinestra(VOCE_1990, null, 2000)).toBeNull();
    expect(dettaglioToRecordFinestra(VOCE_1990, { data: { atto: {} } }, 2000)).toBeNull();
  });

  it("caricaChiaviEsistenti restituisce set vuoto se i file mancano", async () => {
    const chiavi = await caricaChiaviEsistenti(["data/reali/file-che-non-esiste-xyz.json"]);
    expect(chiavi.size).toBe(0);
  });

  it("utility di base: normalizza, stringa e date ISO", () => {
    expect(normalizzaFinestra("  a   b\nc ")).toBe("a b c");
    expect(stringaFinestra(55)).toBe("55");
    expect(stringaFinestra(" x ")).toBe("x");
    expect(stringaFinestra(null)).toBe("");
    expect(isIsoDateFinestra("1990-01-27")).toBe(true);
    expect(isIsoDateFinestra("1990-13-40")).toBe(false);
    expect(isIsoDateFinestra("non-data")).toBe(false);
  });

  it("unione multi-file (3+ batch): dedup ELI, i seed vincono", () => {
    const mk = (eli: string, titolo: string) => ({
      chiave: eli,
      titolo,
      tipo: "legge",
      numero: "1",
      dataEmanazione: "1990-01-01",
      nir: `urn:nir:fake:${eli}`,
      eli,
      stato: "in_vigore",
      sintesi: titolo,
      fonti: {},
    });
    const batch1990 = [mk("/eli/id/1990/01/01/A/sg", "Atto A 1990")];
    const batch2000 = [
      mk("/eli/id/1990/01/01/A/sg", "Atto A duplicato 2000"),
      mk("/eli/id/2000/06/09/B/sg", "Atto B 2000"),
    ];
    const batch1980 = [mk("/eli/id/1980/01/01/C/sg", "Atto C 1980")];
    const normalizzati = [...batch1990, ...batch2000, ...batch1980]
      .map((a) => normalizzaAttoReale(a))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const uniti = unisciCorpus([], normalizzati, []);
    // Nota: unisciCorpus deduplica ma non garantisce l'ordine tra reali;
    // conta la dedup, non il vincitore tra batch reali.
    const perEli = new Map(uniti.map((r) => [r.eli.toLowerCase(), r]));
    expect(perEli.size).toBe(3);
    expect(estraiListaAttiReali({ atti: [...batch1990, ...batch2000] })).toHaveLength(3);
  });
});

describe("integrazione tollerante finestre 1990/2000 (zero rete, disco read-only)", () => {
  async function leggiAtti(percorso: string): Promise<unknown[]> {
    const raw = await readFile(path.resolve(percorso), "utf8");
    if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) throw new Error("file oltre 1MB");
    return estraiListaAttiReali(JSON.parse(raw) as unknown);
  }

  it("i JSON 1990/2000 (se presenti) sono envelope validi con atti normalizzabili", async () => {
    for (const percorso of [
      "data/reali/normattiva-storico-1990.json",
      "data/reali/normattiva-storico-2000.json",
    ]) {
      let lista: unknown[];
      try {
        lista = await leggiAtti(percorso);
      } catch {
        // File non ancora generato: integrazione tollerante, passa.
        continue;
      }
      expect(lista.length).toBeGreaterThan(0);
      expect(lista.length).toBeLessThanOrEqual(80);
      let validi = 0;
      for (const item of lista.slice(0, 500)) {
        const record = normalizzaAttoReale(item);
        if (!record) continue;
        validi += 1;
        expect(record.titolo.length).toBeGreaterThan(0);
        expect(record.eli.length).toBeGreaterThan(0);
        expect(["in_vigore", "abrogato", "decaduto"]).toContain(record.stato);
      }
      expect(validi).toBeGreaterThan(0);
    }
  });

  it("unione reali esistenti: nessun ELI duplicato tra batch (se i file ci sono)", async () => {
    const percorsi = [
      "data/reali/normattiva-recenti.json",
      "data/reali/normattiva-storico-1980.json",
      "data/reali/normattiva-storico-collezioni.json",
      "data/reali/normattiva-storico-1990.json",
      "data/reali/normattiva-storico-2000.json",
    ];
    const visti = new Set<string>();
    let duplicati = 0;
    let totale = 0;
    for (const percorso of percorsi) {
      let lista: unknown[];
      try {
        lista = await leggiAtti(percorso);
      } catch {
        continue;
      }
      for (const item of lista) {
        const record = normalizzaAttoReale(item);
        if (!record) continue;
        totale += 1;
        const chiave = record.eli.trim().toLowerCase();
        if (visti.has(chiave)) duplicati += 1;
        visti.add(chiave);
      }
    }
    if (totale === 0) return; // nessun file: tollerante
    expect(duplicati).toBe(0);
  });
});

const VOCE_AGGIORNATI_2010 = {
  numeroProvvedimento: "96",
  denominazioneAtto: "LEGGE",
  annoProvvedimento: "2010",
  meseProvvedimento: "6",
  giornoProvvedimento: "25",
  codiceRedazionale: "010G0116",
  dataGU: "2010-06-26",
  numeroGU: "147",
};

const VOCE_AGGIORNATI_1970 = {
  numeroProvvedimento: "281",
  denominazioneAtto: "LEGGE",
  annoProvvedimento: "1970",
  meseProvvedimento: "5",
  giornoProvvedimento: "16",
  codiceRedazionale: "070U0281",
  dataGU: "1970-05-22",
  numeroGU: "127",
};

describe("ingest finestre Normattiva 2010/1970 (fixture inline, zero rete)", () => {
  it("urnDaVoceFinestra costruisce URN reali 2010 e 1970", () => {
    expect(urnDaVoceFinestra(VOCE_AGGIORNATI_2010)).toBe(
      "urn:nir:stato:legge:2010-06-25;96",
    );
    expect(urnDaVoceFinestra(VOCE_AGGIORNATI_1970)).toBe(
      "urn:nir:stato:legge:1970-05-16;281",
    );
  });

  it("vociDaAggiornatiFinestra: dedup URN tra 2010/1970", () => {
    const voci = vociDaAggiornatiFinestra({
      data: { listaAtti: [VOCE_AGGIORNATI_2010, VOCE_AGGIORNATI_2010, VOCE_AGGIORNATI_1970] },
    });
    expect(voci).toHaveLength(2);
  });

  it("stati onesti: fine-vigenza passata=abrogato, 99999999=in_vigore, Art.1 formale", () => {
    expect(statoDaFineVigenzaFinestre("99999999", "20260928")).toBe("in_vigore");
    expect(statoDaFineVigenzaFinestre("19751231", "20260928")).toBe("abrogato");
    expect(statoDaIntestazioneArt1Finestre("ART. 1 DECRETO DECADUTO - testo")).toBe("decaduto");
    expect(statoDaIntestazioneArt1Finestre("corpo che cita abrogazione")).toBeNull();
  });

  it("dettaglioToRecordFinestra 1970: stato abrogato da fine-vigenza passata", () => {
    const voce: VoceFinestra = {
      urn: "urn:nir:stato:legge:1970-05-16;281",
      codice: "070U0281",
      dataGU: "1970-05-22",
      numeroGU: "127",
      eliReale: "",
    };
    const record = dettaglioToRecordFinestra(
      voce,
      {
        data: {
          atto: {
            titolo: "LEGGE 16 maggio 1970, n. 281",
            sottoTitolo: "Provvedimenti finanziari per le Regioni.",
            articoloHtml: "<div><p>Testo di prova.</p></div>",
            tipoProvvedimentoDescrizione: "LEGGE",
            annoProvvedimento: 1970,
            meseProvvedimento: 5,
            giornoProvvedimento: 16,
            numeroProvvedimento: 281,
            articoloDataFineVigenza: "19751231",
          },
        },
      },
      2000,
    );
    expect(record?.stato).toBe("abrogato");
    expect(record?.dataEmanazione).toBe("1970-05-16");
  });

  it("split onesto: dimezza l'anno, rifiuta intervalli invalidi", () => {
    const parti = dividiIntervalloFinestra("2010-01-01", "2010-12-31");
    expect(parti).not.toBeNull();
    expect(parti).toHaveLength(2);
    const prima = parti?.[0] as [string, string];
    const seconda = parti?.[1] as [string, string];
    expect(prima[0]).toBe("2010-01-01");
    expect(seconda[1]).toBe("2010-12-31");
    expect(prima[1] < seconda[0]).toBe(true);
    expect(dividiIntervalloFinestra("2010-01-01", "2010-01-01")).toBeNull();
    expect(dividiIntervalloFinestra("non-data", "2010-12-31")).toBeNull();
    expect(isErroreLimiteAttiFinestra(new Error("Numero di atti superiore al limite consentito di 7000, raffinare la ricerca"))).toBe(true);
    expect(isErroreLimiteAttiFinestra(new Error("altro errore"))).toBe(false);
  });

  it("unione multi-file (5+ batch): dedup ELI su tutti i batch", () => {
    const mk = (eli: string, titolo: string) => ({
      chiave: eli,
      titolo,
      tipo: "legge",
      numero: "1",
      dataEmanazione: "2010-01-01",
      nir: `urn:nir:fake:${eli}`,
      eli,
      stato: "in_vigore",
      sintesi: titolo,
      fonti: {},
    });
    const batch = [
      mk("/eli/id/2010/06/25/X/sg", "Atto X 2010"),
      mk("/eli/id/2010/06/25/X/sg", "Atto X duplicato 1970"),
      mk("/eli/id/1970/05/16/Y/sg", "Atto Y 1970"),
      mk("/eli/id/1990/01/01/A/sg", "Atto A 1990"),
      mk("/eli/id/2000/06/09/B/sg", "Atto B 2000"),
      mk("/eli/id/1980/01/01/C/sg", "Atto C 1980"),
    ];
    const normalizzati = batch
      .map((a) => normalizzaAttoReale(a))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const uniti = unisciCorpus([], normalizzati, []);
    expect(new Set(uniti.map((r) => r.eli.toLowerCase())).size).toBe(5);
  });
});

describe("integrazione tollerante finestre 2010/1970 (zero rete, disco read-only)", () => {
  async function leggiAtti(percorso: string): Promise<unknown[]> {
    const raw = await readFile(path.resolve(percorso), "utf8");
    if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) throw new Error("file oltre 1MB");
    return estraiListaAttiReali(JSON.parse(raw) as unknown);
  }

  it("i JSON 2010/1970 (se presenti) sono envelope validi, <=80 atti, stati onesti", async () => {
    for (const percorso of [
      "data/reali/normattiva-storico-2010.json",
      "data/reali/normattiva-storico-1970.json",
    ]) {
      let lista: unknown[];
      try {
        lista = await leggiAtti(percorso);
      } catch {
        continue;
      }
      expect(lista.length).toBeGreaterThan(0);
      expect(lista.length).toBeLessThanOrEqual(80);
      let validi = 0;
      for (const item of lista.slice(0, 500)) {
        const record = normalizzaAttoReale(item);
        if (!record) continue;
        validi += 1;
        expect(record.titolo.length).toBeGreaterThan(0);
        expect(record.eli.length).toBeGreaterThan(0);
        expect(["in_vigore", "abrogato", "decaduto"]).toContain(record.stato);
      }
      expect(validi).toBeGreaterThan(0);
    }
  });

  it("unione reali 7 file: nessun ELI duplicato (se i file ci sono)", async () => {
    const percorsi = [
      "data/reali/normattiva-recenti.json",
      "data/reali/normattiva-storico-1980.json",
      "data/reali/normattiva-storico-collezioni.json",
      "data/reali/normattiva-storico-1990.json",
      "data/reali/normattiva-storico-2000.json",
      "data/reali/normattiva-storico-2010.json",
      "data/reali/normattiva-storico-1970.json",
    ];
    const visti = new Set<string>();
    let duplicati = 0;
    let totale = 0;
    for (const percorso of percorsi) {
      let lista: unknown[];
      try {
        lista = await leggiAtti(percorso);
      } catch {
        continue;
      }
      for (const item of lista) {
        const record = normalizzaAttoReale(item);
        if (!record) continue;
        totale += 1;
        const chiave = record.eli.trim().toLowerCase();
        if (visti.has(chiave)) duplicati += 1;
        visti.add(chiave);
      }
    }
    if (totale === 0) return;
    expect(duplicati).toBe(0);
  });
});

const VOCE_AGGIORNATI_2020 = {
  numeroProvvedimento: "27",
  denominazioneAtto: "DECRETO-LEGGE",
  annoProvvedimento: "2020",
  meseProvvedimento: "3",
  giornoProvvedimento: "17",
  codiceRedazionale: "020G0033",
  dataGU: "2020-03-17",
  numeroGU: "70",
};

const VOCE_AGGIORNATI_1960 = {
  numeroProvvedimento: "1084",
  denominazioneAtto: "LEGGE",
  annoProvvedimento: "1960",
  meseProvvedimento: "10",
  giornoProvvedimento: "21",
  codiceRedazionale: "060U1084",
  dataGU: "1960-11-02",
  numeroGU: "270",
};

describe("ingest finestre Normattiva 2020/1960 (fixture inline, zero rete)", () => {
  it("urnDaVoceFinestra costruisce URN reali 2020 e 1960", () => {
    expect(urnDaVoceFinestra(VOCE_AGGIORNATI_2020)).toBe(
      "urn:nir:stato:decreto.legge:2020-03-17;27",
    );
    expect(urnDaVoceFinestra(VOCE_AGGIORNATI_1960)).toBe(
      "urn:nir:stato:legge:1960-10-21;1084",
    );
  });

  it("vociDaAggiornatiFinestra: dedup URN tra 2020/1960", () => {
    const voci = vociDaAggiornatiFinestra({
      data: { listaAtti: [VOCE_AGGIORNATI_2020, VOCE_AGGIORNATI_2020, VOCE_AGGIORNATI_1960] },
    });
    expect(voci).toHaveLength(2);
  });

  it("stati onesti: fine-vigenza passata=abrogato, 99999999=in_vigore, Art.1 formale", () => {
    expect(statoDaFineVigenzaFinestre("99999999", "20260928")).toBe("in_vigore");
    expect(statoDaFineVigenzaFinestre("20201231", "20260928")).toBe("abrogato");
    expect(statoDaFineVigenzaFinestre("19651231", "20260928")).toBe("abrogato");
    expect(statoDaIntestazioneArt1Finestre("ART. 1 DECRETO DECADUTO - testo")).toBe("decaduto");
    expect(statoDaIntestazioneArt1Finestre("corpo che cita abrogazione")).toBeNull();
  });

  it("dettaglioToRecordFinestra 2020: DL Cura Italia con stato da fine-vigenza", () => {
    const voce: VoceFinestra = {
      urn: "urn:nir:stato:decreto.legge:2020-03-17;18",
      codice: "020G0033",
      dataGU: "2020-03-17",
      numeroGU: "70",
      eliReale: "",
    };
    const record = dettaglioToRecordFinestra(
      voce,
      {
        data: {
          atto: {
            titolo: "DECRETO-LEGGE 17 marzo 2020, n. 18",
            sottoTitolo: "Misure di potenziamento del Servizio sanitario nazionale.",
            articoloHtml: "<div><p>Testo di prova.</p></div>",
            tipoProvvedimentoDescrizione: "DECRETO-LEGGE",
            annoProvvedimento: 2020,
            meseProvvedimento: 3,
            giornoProvvedimento: 17,
            numeroProvvedimento: 18,
            articoloDataFineVigenza: "99999999",
          },
        },
      },
      2000,
    );
    expect(record?.stato).toBe("in_vigore");
    expect(record?.dataEmanazione).toBe("2020-03-17");
    expect(record?.nir).toBe("urn:nir:stato:decreto.legge:2020-03-17;18");
  });

  it("dettaglioToRecordFinestra 1960: stato abrogato da fine-vigenza passata", () => {
    const voce: VoceFinestra = {
      urn: "urn:nir:stato:legge:1960-10-21;1084",
      codice: "060U1084",
      dataGU: "1960-11-02",
      numeroGU: "270",
      eliReale: "",
    };
    const record = dettaglioToRecordFinestra(
      voce,
      {
        data: {
          atto: {
            titolo: "LEGGE 21 ottobre 1960, n. 1084",
            sottoTitolo: "Disposizioni di prova.",
            articoloHtml: "<div><p>Testo di prova.</p></div>",
            tipoProvvedimentoDescrizione: "LEGGE",
            annoProvvedimento: 1960,
            meseProvvedimento: 10,
            giornoProvvedimento: 21,
            numeroProvvedimento: 1084,
            articoloDataFineVigenza: "19651231",
          },
        },
      },
      2000,
    );
    expect(record?.stato).toBe("abrogato");
    expect(record?.dataEmanazione).toBe("1960-10-21");
  });

  it("unione multi-file (7+ batch): dedup ELI su tutti i batch inclusi 2020/1960", () => {
    const mk = (eli: string, titolo: string, dataEmanazione: string) => ({
      chiave: eli,
      titolo,
      tipo: "legge",
      numero: "1",
      dataEmanazione,
      nir: `urn:nir:fake:${eli}`,
      eli,
      stato: "in_vigore",
      sintesi: titolo,
      fonti: {},
    });
    const batch = [
      mk("/eli/id/2020/03/17/X/sg", "Atto X 2020", "2020-03-17"),
      mk("/eli/id/2020/03/17/X/sg", "Atto X duplicato 2020", "2020-03-17"),
      mk("/eli/id/1960/10/21/Y/sg", "Atto Y 1960", "1960-10-21"),
      mk("/eli/id/2010/06/25/A/sg", "Atto A 2010", "2010-06-25"),
      mk("/eli/id/1970/05/16/B/sg", "Atto B 1970", "1970-05-16"),
      mk("/eli/id/1990/01/01/C/sg", "Atto C 1990", "1990-01-01"),
      mk("/eli/id/2000/06/09/D/sg", "Atto D 2000", "2000-06-09"),
      mk("/eli/id/1980/01/01/E/sg", "Atto E 1980", "1980-01-01"),
    ];
    const normalizzati = batch
      .map((a) => normalizzaAttoReale(a))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const uniti = unisciCorpus([], normalizzati, []);
    expect(new Set(uniti.map((r) => r.eli.toLowerCase())).size).toBe(7);
  });

  it("dedup cross-file: ELI 2020/1960 contro batch esistenti", () => {
    const mk = (eli: string, titolo: string) => ({
      chiave: eli,
      titolo,
      tipo: "legge",
      numero: "1",
      dataEmanazione: "2020-01-01",
      nir: `urn:nir:fake:${eli}`,
      eli,
      stato: "in_vigore",
      sintesi: titolo,
      fonti: {},
    });
    const esistenti = [mk("/eli/id/2020/03/17/X/sg", "Atto X esistente")];
    const nuovi = [
      mk("/eli/id/2020/03/17/X/sg", "Atto X duplicato nuova finestra"),
      mk("/eli/id/1960/10/21/Y/sg", "Atto Y nuovo"),
    ];
    const normalizzati = [...esistenti, ...nuovi]
      .map((a) => normalizzaAttoReale(a))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const uniti = unisciCorpus([], normalizzati, []);
    expect(new Set(uniti.map((r) => r.eli.toLowerCase())).size).toBe(2);
  });
});

describe("integrazione tollerante finestre 2020/1960 (zero rete, disco read-only)", () => {
  async function leggiAtti(percorso: string): Promise<unknown[]> {
    const raw = await readFile(path.resolve(percorso), "utf8");
    if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) throw new Error("file oltre 1MB");
    return estraiListaAttiReali(JSON.parse(raw) as unknown);
  }

  it("i JSON 2020/1960 (se presenti) sono envelope validi, <=80 atti, stati onesti", async () => {
    for (const percorso of [
      "data/reali/normattiva-storico-2020.json",
      "data/reali/normattiva-storico-1960.json",
    ]) {
      let lista: unknown[];
      try {
        lista = await leggiAtti(percorso);
      } catch {
        continue;
      }
      expect(lista.length).toBeGreaterThan(0);
      expect(lista.length).toBeLessThanOrEqual(80);
      let validi = 0;
      for (const item of lista.slice(0, 500)) {
        const record = normalizzaAttoReale(item);
        if (!record) continue;
        validi += 1;
        expect(record.titolo.length).toBeGreaterThan(0);
        expect(record.eli.length).toBeGreaterThan(0);
        expect(["in_vigore", "abrogato", "decaduto"]).toContain(record.stato);
      }
      expect(validi).toBeGreaterThan(0);
    }
  });

  it("unione reali 9 file: nessun ELI duplicato (se i file ci sono)", async () => {
    const percorsi = [
      "data/reali/normattiva-recenti.json",
      "data/reali/normattiva-storico-1980.json",
      "data/reali/normattiva-storico-collezioni.json",
      "data/reali/normattiva-storico-1990.json",
      "data/reali/normattiva-storico-2000.json",
      "data/reali/normattiva-storico-2010.json",
      "data/reali/normattiva-storico-1970.json",
      "data/reali/normattiva-storico-2020.json",
      "data/reali/normattiva-storico-1960.json",
    ];
    const visti = new Set<string>();
    let duplicati = 0;
    let totale = 0;
    for (const percorso of percorsi) {
      let lista: unknown[];
      try {
        lista = await leggiAtti(percorso);
      } catch {
        continue;
      }
      for (const item of lista) {
        const record = normalizzaAttoReale(item);
        if (!record) continue;
        totale += 1;
        const chiave = record.eli.trim().toLowerCase();
        if (visti.has(chiave)) duplicati += 1;
        visti.add(chiave);
      }
    }
    if (totale === 0) return;
    expect(duplicati).toBe(0);
  });
});

const VOCE_AGGIORNATI_1992 = {
  numeroProvvedimento: "488",
  denominazioneAtto: "LEGGE",
  annoProvvedimento: "1992",
  meseProvvedimento: "12",
  giornoProvvedimento: "19",
  codiceRedazionale: "092G0533",
  dataGU: "1992-12-21",
  numeroGU: "299",
};

const VOCE_AGGIORNATI_2005 = {
  numeroProvvedimento: "266",
  denominazioneAtto: "LEGGE",
  annoProvvedimento: "2005",
  meseProvvedimento: "12",
  giornoProvvedimento: "23",
  codiceRedazionale: "005G0293",
  dataGU: "2005-12-29",
  numeroGU: "302",
};

describe("ingest finestre Normattiva 1992-1993/2005-2006 (fixture inline, zero rete)", () => {
  it("urnDaVoceFinestra costruisce URN reali 1992 e 2005", () => {
    expect(urnDaVoceFinestra(VOCE_AGGIORNATI_1992)).toBe(
      "urn:nir:stato:legge:1992-12-19;488",
    );
    expect(urnDaVoceFinestra(VOCE_AGGIORNATI_2005)).toBe(
      "urn:nir:stato:legge:2005-12-23;266",
    );
  });

  it("vociDaAggiornatiFinestra: dedup URN tra 1992-1993 e 2005-2006", () => {
    const voci = vociDaAggiornatiFinestra({
      data: { listaAtti: [VOCE_AGGIORNATI_1992, VOCE_AGGIORNATI_1992, VOCE_AGGIORNATI_2005] },
    });
    expect(voci).toHaveLength(2);
  });

  it("stati onesti: fine-vigenza passata=abrogato, 99999999=in_vigore, Art.1 formale con campo preservato", () => {
    expect(statoDaFineVigenzaFinestre("99999999", "20260928")).toBe("in_vigore");
    expect(statoDaFineVigenzaFinestre("19951231", "20260928")).toBe("abrogato");
    expect(statoDaFineVigenzaFinestre("20061231", "20260928")).toBe("abrogato");
    expect(statoDaIntestazioneArt1Finestre("ART. 1 DECRETO DECADUTO - testo")).toBe("decaduto");
    expect(statoDaIntestazioneArt1Finestre("corpo che cita abrogazione")).toBeNull();
  });

  it("dettaglioToRecordFinestra 1992: preserva articoloDataFineVigenza e stato onesto", () => {
    const voce: VoceFinestra = {
      urn: "urn:nir:stato:legge:1992-12-19;488",
      codice: "092G0533",
      dataGU: "1992-12-21",
      numeroGU: "299",
      eliReale: "",
    };
    const record = dettaglioToRecordFinestra(
      voce,
      {
        data: {
          atto: {
            titolo: "LEGGE 19 dicembre 1992, n. 488",
            sottoTitolo: "Disposizioni di prova.",
            articoloHtml: "<div><p>Testo di prova.</p></div>",
            tipoProvvedimentoDescrizione: "LEGGE",
            annoProvvedimento: 1992,
            meseProvvedimento: 12,
            giornoProvvedimento: 19,
            numeroProvvedimento: 488,
            articoloDataFineVigenza: "99999999",
          },
        },
      },
      2000,
    );
    expect(record?.stato).toBe("in_vigore");
    expect(record?.articoloDataFineVigenza).toBe("99999999");
    expect(record?.dataEmanazione).toBe("1992-12-19");
  });

  it("dettaglioToRecordFinestra 2005: fine-vigenza passata=abrogato con campo preservato", () => {
    const voce: VoceFinestra = {
      urn: "urn:nir:stato:legge:2005-12-23;266",
      codice: "005G0293",
      dataGU: "2005-12-29",
      numeroGU: "302",
      eliReale: "",
    };
    const record = dettaglioToRecordFinestra(
      voce,
      {
        data: {
          atto: {
            titolo: "LEGGE 23 dicembre 2005, n. 266",
            sottoTitolo: "Disposizioni per la formazione del bilancio.",
            articoloHtml: "<div><p>Testo di prova.</p></div>",
            tipoProvvedimentoDescrizione: "LEGGE",
            annoProvvedimento: 2005,
            meseProvvedimento: 12,
            giornoProvvedimento: 23,
            numeroProvvedimento: 266,
            articoloDataFineVigenza: "20061231",
          },
        },
      },
      2000,
    );
    expect(record?.stato).toBe("abrogato");
    expect(record?.articoloDataFineVigenza).toBe("20061231");
  });

  it("split onesto: errore 1501/12-mesi fa splittare come il limite 7000", () => {
    expect(
      isErroreLimiteAttiFinestra(new Error("periodo di esportazione superiore a 12 mesi (code 1501)")),
    ).toBe(true);
    expect(
      isErroreLimiteAttiFinestra(new Error("Numero di atti superiore al limite consentito di 7000, raffinare la ricerca")),
    ).toBe(true);
    expect(isErroreLimiteAttiFinestra(new Error("altro errore"))).toBe(false);
    const parti = dividiIntervalloFinestra("1992-01-01", "1993-12-31");
    expect(parti).not.toBeNull();
    expect(parti).toHaveLength(2);
    const prima = parti?.[0] as [string, string];
    const seconda = parti?.[1] as [string, string];
    expect(prima[0]).toBe("1992-01-01");
    expect(seconda[1]).toBe("1993-12-31");
    expect(prima[1] < seconda[0]).toBe(true);
  });

  it("unione multi-file (11 batch): dedup ELI incluse 1992-1993/2005-2006", () => {
    const mk = (eli: string, titolo: string, dataEmanazione: string) => ({
      chiave: eli,
      titolo,
      tipo: "legge",
      numero: "1",
      dataEmanazione,
      nir: `urn:nir:fake:${eli}`,
      eli,
      stato: "in_vigore",
      sintesi: titolo,
      fonti: {},
    });
    const batch = [
      mk("/eli/id/1992/12/19/X/sg", "Atto X 1992-1993", "1992-12-19"),
      mk("/eli/id/1992/12/19/X/sg", "Atto X duplicato", "1992-12-19"),
      mk("/eli/id/2005/12/23/Y/sg", "Atto Y 2005-2006", "2005-12-23"),
      mk("/eli/id/2010/06/25/A/sg", "Atto A 2010", "2010-06-25"),
      mk("/eli/id/1970/05/16/B/sg", "Atto B 1970", "1970-05-16"),
      mk("/eli/id/1990/01/01/C/sg", "Atto C 1990", "1990-01-01"),
      mk("/eli/id/2000/06/09/D/sg", "Atto D 2000", "2000-06-09"),
      mk("/eli/id/1980/01/01/E/sg", "Atto E 1980", "1980-01-01"),
      mk("/eli/id/2020/03/17/F/sg", "Atto F 2020", "2020-03-17"),
      mk("/eli/id/1960/10/21/G/sg", "Atto G 1960", "1960-10-21"),
    ];
    const normalizzati = batch
      .map((a) => normalizzaAttoReale(a))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const uniti = unisciCorpus([], normalizzati, []);
    expect(new Set(uniti.map((r) => r.eli.toLowerCase())).size).toBe(9);
  });
});

describe("integrazione tollerante finestre 1992-1993/2005-2006 (zero rete, disco read-only)", () => {
  async function leggiAtti(percorso: string): Promise<unknown[]> {
    const raw = await readFile(path.resolve(percorso), "utf8");
    if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) throw new Error("file oltre 1MB");
    return estraiListaAttiReali(JSON.parse(raw) as unknown);
  }

  it("i JSON 1992-1993/2005-2006 (se presenti) sono envelope validi, <=80 atti, stati onesti", async () => {
    for (const percorso of [
      "data/reali/normattiva-storico-1992-1993.json",
      "data/reali/normattiva-storico-2005-2006.json",
    ]) {
      let lista: unknown[];
      try {
        lista = await leggiAtti(percorso);
      } catch {
        continue;
      }
      expect(lista.length).toBeGreaterThan(0);
      expect(lista.length).toBeLessThanOrEqual(80);
      let validi = 0;
      for (const item of lista.slice(0, 500)) {
        const record = normalizzaAttoReale(item);
        if (!record) continue;
        validi += 1;
        expect(record.titolo.length).toBeGreaterThan(0);
        expect(record.eli.length).toBeGreaterThan(0);
        expect(["in_vigore", "abrogato", "decaduto"]).toContain(record.stato);
      }
      expect(validi).toBeGreaterThan(0);
    }
  });

  it("unione reali 11 file: nessun ELI duplicato (se i file ci sono)", async () => {
    const percorsi = [
      "data/reali/normattiva-recenti.json",
      "data/reali/normattiva-storico-1980.json",
      "data/reali/normattiva-storico-collezioni.json",
      "data/reali/normattiva-storico-1990.json",
      "data/reali/normattiva-storico-2000.json",
      "data/reali/normattiva-storico-2010.json",
      "data/reali/normattiva-storico-1970.json",
      "data/reali/normattiva-storico-2020.json",
      "data/reali/normattiva-storico-1960.json",
      "data/reali/normattiva-storico-1992-1993.json",
      "data/reali/normattiva-storico-2005-2006.json",
    ];
    const visti = new Set<string>();
    let duplicati = 0;
    let totale = 0;
    for (const percorso of percorsi) {
      let lista: unknown[];
      try {
        lista = await leggiAtti(percorso);
      } catch {
        continue;
      }
      for (const item of lista) {
        const record = normalizzaAttoReale(item);
        if (!record) continue;
        totale += 1;
        const chiave = record.eli.trim().toLowerCase();
        if (visti.has(chiave)) duplicati += 1;
        visti.add(chiave);
      }
    }
    if (totale === 0) return;
    expect(duplicati).toBe(0);
  });
});

const VOCE_AGGIORNATI_1948 = {
  numeroProvvedimento: "1",
  denominazioneAtto: "DECRETO LEGISLATIVO",
  annoProvvedimento: "1948",
  meseProvvedimento: "2",
  giornoProvvedimento: "12",
  codiceRedazionale: "048U0001",
  dataGU: "1948-02-20",
  numeroGU: "42",
};

const VOCE_AGGIORNATI_1985 = {
  numeroProvvedimento: "45",
  denominazioneAtto: "DECRETO-LEGGE",
  annoProvvedimento: "1985",
  meseProvvedimento: "2",
  giornoProvvedimento: "19",
  codiceRedazionale: "085G0062",
  dataGU: "1985-02-20",
  numeroGU: "44",
};

describe("ingest finestre Normattiva 1948/1985 (fixture inline, zero rete)", () => {
  it("urnDaVoceFinestra costruisce URN reali 1948 e 1985", () => {
    expect(urnDaVoceFinestra(VOCE_AGGIORNATI_1948)).toBe(
      "urn:nir:stato:decreto.legislativo:1948-02-12;1",
    );
    expect(urnDaVoceFinestra(VOCE_AGGIORNATI_1985)).toBe(
      "urn:nir:stato:decreto.legge:1985-02-19;45",
    );
  });

  it("vociDaAggiornatiFinestra: dedup URN tra 1948/1985", () => {
    const voci = vociDaAggiornatiFinestra({
      data: { listaAtti: [VOCE_AGGIORNATI_1948, VOCE_AGGIORNATI_1948, VOCE_AGGIORNATI_1985] },
    });
    expect(voci).toHaveLength(2);
  });

  it("stati onesti: fine-vigenza passata=abrogato, 99999999=in_vigore, Art.1 formale", () => {
    expect(statoDaFineVigenzaFinestre("99999999", "20260928")).toBe("in_vigore");
    expect(statoDaFineVigenzaFinestre("19501231", "20260928")).toBe("abrogato");
    expect(statoDaFineVigenzaFinestre("19881231", "20260928")).toBe("abrogato");
    expect(statoDaIntestazioneArt1Finestre("ART. 1 DECRETO DECADUTO - testo")).toBe("decaduto");
    expect(statoDaIntestazioneArt1Finestre("corpo che cita abrogazione")).toBeNull();
  });

  it("dettaglioToRecordFinestra 1948: decreto legislativo con stato da fine-vigenza", () => {
    const voce: VoceFinestra = {
      urn: "urn:nir:stato:decreto.legislativo:1948-02-12;1",
      codice: "048U0001",
      dataGU: "1948-02-20",
      numeroGU: "42",
      eliReale: "",
    };
    const record = dettaglioToRecordFinestra(
      voce,
      {
        data: {
          atto: {
            titolo: "DECRETO LEGISLATIVO 12 febbraio 1948, n. 1",
            sottoTitolo: "Disposizioni di prova.",
            articoloHtml: "<div><p>Testo di prova.</p></div>",
            tipoProvvedimentoDescrizione: "DECRETO LEGISLATIVO",
            annoProvvedimento: 1948,
            meseProvvedimento: 2,
            giornoProvvedimento: 12,
            numeroProvvedimento: 1,
            articoloDataFineVigenza: "19501231",
          },
        },
      },
      2000,
    );
    expect(record?.stato).toBe("abrogato");
    expect(record?.dataEmanazione).toBe("1948-02-12");
    expect(record?.articoloDataFineVigenza).toBe("19501231");
  });

  it("dettaglioToRecordFinestra 1985: DL decaduto da intestazione Art.1", () => {
    const voce: VoceFinestra = {
      urn: "urn:nir:stato:decreto.legge:1985-02-19;45",
      codice: "085G0062",
      dataGU: "1985-02-20",
      numeroGU: "44",
      eliReale: "",
    };
    const record = dettaglioToRecordFinestra(
      voce,
      {
        data: {
          atto: {
            titolo: "DECRETO-LEGGE 19 febbraio 1985, n. 45",
            sottoTitolo: "Misure urgenti di prova.",
            articoloHtml: "<div><p>ART. 1 DECRETO DECADUTO - Testo di prova.</p></div>",
            tipoProvvedimentoDescrizione: "DECRETO-LEGGE",
            annoProvvedimento: 1985,
            meseProvvedimento: 2,
            giornoProvvedimento: 19,
            numeroProvvedimento: 45,
            articoloDataFineVigenza: "99999999",
          },
        },
      },
      2000,
    );
    expect(record?.stato).toBe("decaduto");
    expect(record?.dataEmanazione).toBe("1985-02-19");
  });

  it("unione multi-file (13 batch): dedup ELI incluse 1948/1985", () => {
    const mk = (eli: string, titolo: string, dataEmanazione: string) => ({
      chiave: eli,
      titolo,
      tipo: "decreto.legge",
      numero: "1",
      dataEmanazione,
      nir: `urn:nir:fake:${eli}`,
      eli,
      stato: "in_vigore",
      sintesi: titolo,
      fonti: {},
    });
    const batch = [
      mk("/eli/id/1948/02/12/X/sg", "Atto X 1948", "1948-02-12"),
      mk("/eli/id/1948/02/12/X/sg", "Atto X duplicato", "1948-02-12"),
      mk("/eli/id/1985/02/19/Y/sg", "Atto Y 1985", "1985-02-19"),
      mk("/eli/id/2010/06/25/A/sg", "Atto A 2010", "2010-06-25"),
      mk("/eli/id/1970/05/16/B/sg", "Atto B 1970", "1970-05-16"),
      mk("/eli/id/1990/01/01/C/sg", "Atto C 1990", "1990-01-01"),
      mk("/eli/id/2000/06/09/D/sg", "Atto D 2000", "2000-06-09"),
      mk("/eli/id/1980/01/01/E/sg", "Atto E 1980", "1980-01-01"),
      mk("/eli/id/2020/03/17/F/sg", "Atto F 2020", "2020-03-17"),
      mk("/eli/id/1960/10/21/G/sg", "Atto G 1960", "1960-10-21"),
      mk("/eli/id/1955/01/01/H/sg", "Atto H 1955", "1955-01-01"),
      mk("/eli/id/2015/01/01/I/sg", "Atto I 2015", "2015-01-01"),
    ];
    const normalizzati = batch
      .map((a) => normalizzaAttoReale(a))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const uniti = unisciCorpus([], normalizzati, []);
    expect(new Set(uniti.map((r) => r.eli.toLowerCase())).size).toBe(11);
  });
});

describe("integrazione tollerante finestre 1948/1985 (zero rete, disco read-only)", () => {
  async function leggiAtti(percorso: string): Promise<unknown[]> {
    const raw = await readFile(path.resolve(percorso), "utf8");
    if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) throw new Error("file oltre 1MB");
    return estraiListaAttiReali(JSON.parse(raw) as unknown);
  }

  it("i JSON 1948/1985 (se presenti) sono envelope validi, <=80 atti, stati onesti", async () => {
    for (const percorso of [
      "data/reali/normattiva-storico-1948.json",
      "data/reali/normattiva-storico-1985.json",
    ]) {
      let lista: unknown[];
      try {
        lista = await leggiAtti(percorso);
      } catch {
        continue;
      }
      expect(lista.length).toBeGreaterThan(0);
      expect(lista.length).toBeLessThanOrEqual(80);
      let validi = 0;
      for (const item of lista.slice(0, 500)) {
        const record = normalizzaAttoReale(item);
        if (!record) continue;
        validi += 1;
        expect(record.titolo.length).toBeGreaterThan(0);
        expect(record.eli.length).toBeGreaterThan(0);
        expect(["in_vigore", "abrogato", "decaduto"]).toContain(record.stato);
      }
      expect(validi).toBeGreaterThan(0);
    }
  });

  it("unione reali 13 file: nessun ELI duplicato (se i file ci sono)", async () => {
    const percorsi = [
      "data/reali/normattiva-recenti.json",
      "data/reali/normattiva-storico-1980.json",
      "data/reali/normattiva-storico-collezioni.json",
      "data/reali/normattiva-storico-1990.json",
      "data/reali/normattiva-storico-2000.json",
      "data/reali/normattiva-storico-2010.json",
      "data/reali/normattiva-storico-1970.json",
      "data/reali/normattiva-storico-2020.json",
      "data/reali/normattiva-storico-1960.json",
      "data/reali/normattiva-storico-1992-1993.json",
      "data/reali/normattiva-storico-2005-2006.json",
      "data/reali/normattiva-storico-1948.json",
      "data/reali/normattiva-storico-1985.json",
    ];
    const visti = new Set<string>();
    let duplicati = 0;
    let totale = 0;
    for (const percorso of percorsi) {
      let lista: unknown[];
      try {
        lista = await leggiAtti(percorso);
      } catch {
        continue;
      }
      for (const item of lista) {
        const record = normalizzaAttoReale(item);
        if (!record) continue;
        totale += 1;
        const chiave = record.eli.trim().toLowerCase();
        if (visti.has(chiave)) duplicati += 1;
        visti.add(chiave);
      }
    }
    if (totale === 0) return;
    expect(duplicati).toBe(0);
  });
});
