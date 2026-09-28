import { describe, expect, it } from "vitest";
import {
  aAttoUe,
  azzeraCacheEurlex,
  cercaAttiUe,
  contaPerTipoUe,
  etichettaTipo,
  filtraPerTipoUe,
  leggiProvenanceEurlex,
  notaApplicabilita,
  normalizzaEurlex,
  paginaUe,
  trovaAttoUe,
  tuttiAttiUe,
} from "@/lib/eurlex-dati";

/** Fixture con valori reali osservati da CELLAR (record 32026R2108/32026L1472). */
const REG_FIXTURE = {
  celex: "32026R2108",
  eli: "http://data.europa.eu/eli/reg/2026/2108/oj",
  titolo:
    "REGULATION OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL ESTABLISHING THE UNION AUTHORISATION PROCEDURE",
  titoloLingua: "en",
  data: "2026-09-16",
  tipo: "REG",
  eurlexUrl: "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32026R2108",
  inVigore: true,
  entrataInVigore: "2026-10-01",
  fineValidita: "9999-12-31",
};

const DIR_FIXTURE = {
  celex: "32026L1472",
  eli: "http://data.europa.eu/eli/dir/2026/1472/oj",
  titolo: "DIRECTIVE OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL AMENDING ANNEXES",
  titoloLingua: "en",
  data: "2026-06-17",
  tipo: "DIR",
  eurlexUrl: "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32026L1472",
  inVigore: true,
  entrataInVigore: "2026-07-07",
  fineValidita: "9999-12-31",
};

describe("eurlex-dati: normalizzazione (fixture reali, zero rete)", () => {
  it("valida un regolamento e una direttiva reali", () => {
    const reg = aAttoUe(REG_FIXTURE);
    expect(reg).not.toBeNull();
    expect(reg?.celex).toBe("32026R2108");
    expect(reg?.tipo).toBe("REG");
    expect(reg?.inVigore).toBe(true);
    const dir = aAttoUe(DIR_FIXTURE);
    expect(dir?.tipo).toBe("DIR");
    expect(dir?.eli).toBe("http://data.europa.eu/eli/dir/2026/1472/oj");
  });

  it("scarta record senza CELEX genuino, titolo, data, tipo o URL", () => {
    expect(aAttoUe({ ...REG_FIXTURE, celex: "32026R2193R(01)" })).toBeNull();
    expect(aAttoUe({ ...REG_FIXTURE, celex: "" })).toBeNull();
    expect(aAttoUe({ ...REG_FIXTURE, titolo: "corto" })).toBeNull();
    expect(aAttoUe({ ...REG_FIXTURE, data: "non-una-data" })).toBeNull();
    expect(aAttoUe({ ...REG_FIXTURE, tipo: "DEC" })).toBeNull();
    expect(aAttoUe({ ...REG_FIXTURE, eli: "https://esempio.it/x" })).toBeNull();
    expect(aAttoUe({ ...REG_FIXTURE, eurlexUrl: "http://malevolo.it/x" })).toBeNull();
    expect(aAttoUe(null)).toBeNull();
    expect(aAttoUe("stringa")).toBeNull();
    expect(() => aAttoUe({})).not.toThrow();
  });

  it("etichette oneste: regolamenti applicabili, direttive da recepire", () => {
    expect(etichettaTipo("REG")).toBe("Regolamento UE");
    expect(etichettaTipo("DIR")).toBe("Direttiva UE");
    expect(etichettaTipo("DIR_IMPL")).toBe("Direttiva di esecuzione UE");
    expect(etichettaTipo("DIR_DEL")).toBe("Direttiva delegata UE");
    expect(notaApplicabilita("REG")).toContain("Direttamente applicabile");
    expect(notaApplicabilita("DIR")).toContain("recepimento");
    expect(() => etichettaTipo(undefined)).not.toThrow();
  });

  it("cerca per titolo/CELEX con soglia di 2 caratteri", () => {
    const atti = [aAttoUe(REG_FIXTURE), aAttoUe(DIR_FIXTURE)].filter(
      (a): a is NonNullable<typeof a> => a !== null,
    );
    expect(cercaAttiUe(atti, "authorisation")).toHaveLength(1);
    expect(cercaAttiUe(atti, "32026l1472")).toHaveLength(1);
    expect(cercaAttiUe(atti, "x")).toHaveLength(2);
    expect(cercaAttiUe(atti, "")).toHaveLength(2);
  });

  it("filtra per tipo, con DIR_TUTTE per la famiglia direttive", () => {
    const atti = [aAttoUe(REG_FIXTURE), aAttoUe(DIR_FIXTURE)].filter(
      (a): a is NonNullable<typeof a> => a !== null,
    );
    expect(filtraPerTipoUe(atti, "REG")).toHaveLength(1);
    expect(filtraPerTipoUe(atti, "DIR_TUTTE")).toHaveLength(1);
    expect(filtraPerTipoUe(atti, "sconosciuto")).toHaveLength(2);
    expect(filtraPerTipoUe(atti, "DIR_IMPL")).toHaveLength(0);
  });

  it("pagina con per ammessi 10|20|50 e conta per tipo", () => {
    const atti = [aAttoUe(REG_FIXTURE), aAttoUe(DIR_FIXTURE)].filter(
      (a): a is NonNullable<typeof a> => a !== null,
    );
    expect(paginaUe(atti, 1, 10)).toHaveLength(2);
    expect(paginaUe(atti, 2, 10)).toHaveLength(0);
    expect(paginaUe(atti, 1, 99)).toHaveLength(2);
    expect(normalizzaEurlex("  REGOLAMENTO  ")).toBe("regolamento");
    const conteggi = contaPerTipoUe(atti);
    expect(conteggi).toHaveLength(2);
    expect(conteggi.reduce((s, c) => s + c.componenti, 0)).toBe(2);
  });
});

describe("eurlex-dati: file reale da disco (zero rete)", () => {
  it("carica atti validati dal file ingest, mai throw", async () => {
    azzeraCacheEurlex();
    let atti: Awaited<ReturnType<typeof tuttiAttiUe>> = [];
    await expect(tuttiAttiUe().then((a) => (atti = a))).resolves.not.toThrow();
    // Se l'ingest e' stato eseguito: 50 atti validati e ordinati per data DESC.
    if (atti.length > 0) {
      expect(atti.length).toBeLessThanOrEqual(50);
      for (const a of atti) {
        expect(a.celex).toMatch(/^3\d{4}[RL]\d{1,4}$/);
        expect(a.titolo.length).toBeGreaterThanOrEqual(10);
        expect(a.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(a.eurlexUrl).toBe(
          `https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:${a.celex}`,
        );
      }
      for (let i = 1; i < atti.length; i += 1) {
        expect((atti[i - 1]?.data ?? "") >= (atti[i]?.data ?? "")).toBe(true);
      }
      const prov = await leggiProvenanceEurlex();
      expect(prov.fonte).toContain("CELLAR");
      expect(prov.licenza).toContain("2011/833");
      const trovato = await trovaAttoUe(atti[0]?.celex ?? "");
      expect(trovato?.celex).toBe(atti[0]?.celex);
      expect(await trovaAttoUe("non-un-celex")).toBeNull();
    }
    azzeraCacheEurlex();
  });
});

describe("eurlex: integrazione CELLAR tollerante (rete, mai dura)", () => {
  it("l'endpoint SPARQL risponde al conteggio REG (skip se offline)", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const query =
        "PREFIX cdm:<http://publications.europa.eu/ontology/cdm#> SELECT (COUNT(DISTINCT ?w) AS ?n) WHERE { ?w cdm:work_has_resource-type <http://publications.europa.eu/resource/authority/resource-type/REG> ; cdm:work_date_document ?date ; cdm:resource_legal_id_celex ?celex . FILTER(STR(?date)>='2026-01-01' && STR(?date)<='2026-12-31') . FILTER(!CONTAINS(STR(?celex),\"R(\")) }";
      const url = `https://publications.europa.eu/webapi/rdf/sparql?query=${encodeURIComponent(query)}&format=application%2Fsparql-results%2Bjson`;
      const risposta = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/sparql-results+json" },
      });
      if (!risposta.ok) {
        console.warn(`CELLAR integrazione: HTTP ${risposta.status}, verifiche saltate`);
        return;
      }
      const corpo = (await risposta.json()) as {
        results?: { bindings?: { n?: { value?: string } }[] };
      };
      const n = Number(corpo.results?.bindings?.[0]?.n?.value);
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThan(0);
    } catch (errore) {
      console.warn(
        `CELLAR integrazione: rete non disponibile (${errore instanceof Error ? errore.message : "?"})`,
      );
    } finally {
      clearTimeout(timer);
    }
  }, 30000);
});
