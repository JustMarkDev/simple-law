import { describe, expect, it } from "vitest";
import {
  estraiFrasi,
  highlightMatches,
  normalizeIT,
  rankAndFilter,
  scoreBM25Lite,
  stemIT,
  tokenizzaIT,
  type ElementoRankabile,
} from "@/lib/search-rank";

const ATTI: ElementoRankabile[] = [
  {
    titolo: "Misure urgenti per i carburanti e il sostegno alle famiglie",
    sintesi: "Interventi economici generali per il potere di acquisto",
    numero: "133",
    tipo: "decreto.legge",
  },
  {
    titolo: "Disposizioni generali in materia di bilancio dello Stato",
    sintesi: "Riforma dei carburanti agricoli e accise sul gasolio",
    numero: "45",
    tipo: "legge",
  },
  {
    titolo: "Norme per la tutela della laguna di Venezia",
    sintesi: "Salvaguardia ambientale e paesaggistica",
    numero: "78",
    tipo: "legge",
  },
];

describe("normalizeIT", () => {
  it("minuscole + accenti + spazi", () => {
    expect(normalizeIT("  Città   ENERGIA ")).toBe("citta energia");
  });

  it("non lancia con input imprevisti", () => {
    expect(normalizeIT(null)).toBe("");
    expect(normalizeIT(undefined)).toBe("");
    expect(normalizeIT(123 as unknown as string)).toBe("123");
  });
});

describe("tokenizzaIT e stemIT", () => {
  it("rimuove le stopword italiane", () => {
    const token = tokenizzaIT("il decreto per la tutela di Venezia");
    expect(token).not.toContain("il");
    expect(token).not.toContain("per");
    expect(token).not.toContain("la");
    expect(token).toContain("venezia");
  });

  it("stemming leggero raggruppa i plurali", () => {
    expect(stemIT("carburanti")).toBe(stemIT("carburante"));
  });

  it("non lancia con input imprevisti", () => {
    expect(tokenizzaIT(null)).toEqual([]);
    expect(stemIT(undefined)).toBe("");
  });
});

describe("estraiFrasi", () => {
  it("estrae le frasi tra virgolette", () => {
    expect(estraiFrasi('"carburanti agricoli" energia')).toEqual(["carburanti agricoli"]);
  });

  it("non lancia con input imprevisti", () => {
    expect(estraiFrasi(null)).toEqual([]);
  });
});

describe("scoreBM25Lite", () => {
  it("il titolo pesa piu' della sintesi", () => {
    const punteggioTitolo = scoreBM25Lite(ATTI[0], ["carburant"]);
    const punteggioSintesi = scoreBM25Lite(ATTI[1], ["carburant"]);
    expect(punteggioTitolo).toBeGreaterThan(punteggioSintesi);
  });

  it("la frase esatta nel titolo da' un bonus", () => {
    const conFrase = scoreBM25Lite(ATTI[0], ["carburant"], { frasi: ["misure urgenti"] });
    const senzaFrase = scoreBM25Lite(ATTI[0], ["carburant"], { frasi: [] });
    expect(conFrase).toBeGreaterThan(senzaFrase);
  });

  it("zero senza match e mai throw", () => {
    expect(scoreBM25Lite(ATTI[2], ["carburant"])).toBe(0);
    expect(scoreBM25Lite(null as unknown as ElementoRankabile, ["a"])).toBe(0);
    expect(scoreBM25Lite(ATTI[0], [])).toBe(0);
  });
});

describe("rankAndFilter", () => {
  it("il titolo batte la sintesi a parita' di termine", () => {
    const ordinati = rankAndFilter(ATTI, "carburanti");
    expect(ordinati.length).toBe(2);
    expect(ordinati[0].titolo).toContain("carburanti");
  });

  it("accenti: 'citta' trova 'città'", () => {
    const atti = [
      { titolo: "Piano per le città metropolitane", sintesi: "", numero: "1", tipo: "legge" },
      { titolo: "Norme sui bilanci", sintesi: "", numero: "2", tipo: "legge" },
    ];
    const ordinati = rankAndFilter(atti, "citta");
    expect(ordinati.length).toBe(1);
    expect(ordinati[0].titolo).toContain("città");
  });

  it("query vuota o <2 caratteri: lista invariata", () => {
    expect(rankAndFilter(ATTI, "")).toEqual(ATTI);
    expect(rankAndFilter(ATTI, "x")).toEqual(ATTI);
    expect(rankAndFilter(ATTI, "   ")).toEqual(ATTI);
  });

  it("nessun match: lista vuota", () => {
    expect(rankAndFilter(ATTI, "zzzqqq")).toEqual([]);
  });

  it("non muta l'array originale", () => {
    const copia = [...ATTI];
    rankAndFilter(ATTI, "carburanti");
    expect(ATTI).toEqual(copia);
  });

  it("never-throw con input malformati", () => {
    expect(rankAndFilter(null as unknown as ElementoRankabile[], "energia")).toEqual([]);
    expect(rankAndFilter(ATTI, null)).toEqual(ATTI);
    expect(rankAndFilter([null as unknown as ElementoRankabile], "energia")).toEqual([]);
  });
});

describe("highlightMatches", () => {
  it("evidenzia preservando gli accenti", () => {
    const html = highlightMatches("Piano per le città metropolitane", "citta");
    expect(html).toContain("<mark>città</mark>");
  });

  it("fa escape dell'HTML", () => {
    const html = highlightMatches("<script>alert(1)</script> energia", "energia");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<mark>energia</mark>");
  });

  it("query vuota: testo escapato senza mark", () => {
    expect(highlightMatches("Energia", "")).toBe("Energia");
    expect(highlightMatches("<b>", "x")).toBe("&lt;b&gt;");
  });

  it("never-throw", () => {
    expect(highlightMatches(null, null)).toBe("");
    expect(typeof highlightMatches(undefined, "energia")).toBe("string");
  });
});
