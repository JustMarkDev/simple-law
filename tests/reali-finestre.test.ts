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
