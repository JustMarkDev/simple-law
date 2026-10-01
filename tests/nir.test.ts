import { describe, expect, it } from "vite-plus/test";
import {
  eliToNir,
  formatNIR,
  isValidELI,
  nirToEli,
  normalizeEli,
  parseELI,
  parseNIR,
} from "@/lib/nir";

const NIR = "urn:nir:stato:decreto.legge:2026-07-27;133";
const ELI = "/eli/id/2026/07/27/26G00155/sg";

describe("parseNIR", () => {
  it("analizza un NIR di decreto-legge", () => {
    expect(parseNIR(NIR)).toEqual({
      autorita: "stato",
      tipo: "decreto.legge",
      data: "2026-07-27",
      numero: "133",
      raw: NIR,
    });
  });

  it("rifiuta input malformati", () => {
    expect(parseNIR("")).toBeNull();
    expect(parseNIR("urn:nir:stato:legge:2026-13-40;1")).toBeNull();
    expect(parseNIR("non-un-urn")).toBeNull();
  });
});

describe("formatNIR", () => {
  it("ricompone l'URN", () => {
    expect(formatNIR({ tipo: "decreto.legge", data: "2026-07-27", numero: 133 })).toBe(NIR);
  });

  it("supporta l'autorita' esplicita", () => {
    expect(
      formatNIR({ autorita: "regione.lombardia", tipo: "legge", data: "2025-01-02", numero: "4" }),
    ).toBe("urn:nir:regione.lombardia:legge:2025-01-02;4");
  });

  it("restituisce stringa vuota se mancano dati", () => {
    expect(formatNIR({ tipo: "legge", data: "", numero: "1" })).toBe("");
  });
});

describe("parseELI / isValidELI", () => {
  it("analizza un ELI", () => {
    expect(parseELI(ELI)).toEqual({
      id: "id",
      anno: "2026",
      mese: "07",
      giorno: "27",
      codice: "26G00155",
      versione: "sg",
      raw: ELI,
    });
  });

  it("accetta un URL assoluto e ignora query/hash", () => {
    const url = "https://www.normattiva.it/eli/id/2026/07/27/26G00155/sg?x=1#y";
    expect(parseELI(url)?.codice).toBe("26G00155");
    expect(isValidELI(url)).toBe(true);
  });

  it("rifiuta stringhe non-ELI", () => {
    expect(isValidELI("urn:nir:stato:legge:2026-01-01;1")).toBe(false);
    expect(parseELI("")).toBeNull();
  });

  it("rifiuta ELI con segmenti in eccesso o testo attorno", () => {
    expect(parseELI(`${ELI}/extra`)).toBeNull();
    expect(isValidELI(`vedi ${ELI} qui`)).toBe(false);
    expect(isValidELI(`${ELI}?x=1#y`)).toBe(true);
  });
});

describe("normalizeEli", () => {
  it("riduce un URL al solo path", () => {
    expect(normalizeEli("https://www.normattiva.it/eli/id/2026/07/27/26G00155/sg")).toBe(ELI);
  });

  it("rimuove lo slash finale", () => {
    expect(normalizeEli(ELI + "/")).toBe(ELI);
  });
});

describe("conversioni ELI <-> NIR", () => {
  it("converte ELI in NIR con i metadati", () => {
    expect(eliToNir(ELI, { tipo: "decreto.legge", numero: "133" })).toBe(NIR);
  });

  it("restituisce null senza metadati", () => {
    expect(eliToNir(ELI)).toBeNull();
  });

  it("converte NIR in ELI con il codice redazionale", () => {
    expect(nirToEli(NIR, { codice: "26G00155", versione: "sg" })).toBe(ELI);
  });

  it("restituisce null senza codice", () => {
    expect(nirToEli(NIR)).toBeNull();
  });
});
