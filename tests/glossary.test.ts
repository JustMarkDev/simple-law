import { describe, expect, it } from "vitest";
import { GLOSSARIO, espandiSigle, gloss, isGlossed } from "@/lib/glossary";

const SIGLE_RICHIESTE = [
  "DDL",
  "DL",
  "AIR",
  "VIR",
  "NUVIR",
  "GU",
  "CdM",
  "DPCM",
  "DPR",
  "ELI",
  "NIR",
  "SPARQL",
  "DAGL",
  "MEF",
  "ISTAT",
];

describe("GLOSSARIO", () => {
  it("contiene almeno 15 voci", () => {
    expect(Object.keys(GLOSSARIO).length).toBeGreaterThanOrEqual(15);
  });

  it("contiene tutte le sigle richieste", () => {
    for (const sigla of SIGLE_RICHIESTE) {
      expect(isGlossed(sigla), `manca ${sigla}`).toBe(true);
    }
  });
});

describe("gloss", () => {
  it("risolve una sigla ignorando le maiuscole", () => {
    expect(gloss("ddl")).toContain("Disegno di legge");
  });

  it("restituisce un fallback per termini sconosciuti", () => {
    expect(gloss("XYZ")).toContain("non disponibile");
    expect(gloss("")).toContain("Nessun termine");
  });
});

describe("espandiSigle", () => {
  it("espande le sigle note", () => {
    expect(espandiSigle("Il DDL e' pronto")).toContain("DDL (disegno di legge)");
    expect(espandiSigle("Pubblicata in GU oggi")).toContain("GU (Gazzetta Ufficiale)");
  });

  it("non espande le sigle gia' seguite da parentesi", () => {
    const testo = "L'AIR (analisi di impatto) e' pronta";
    expect(espandiSigle(testo)).toBe(testo);
  });

  it("non tocca un testo senza sigle", () => {
    expect(espandiSigle("Il gatto dorme sul divano")).toBe("Il gatto dorme sul divano");
  });
});
