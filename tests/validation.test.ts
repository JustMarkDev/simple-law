import { describe, expect, it } from "vite-plus/test";
import {
  clampPagina,
  clampPerPage,
  eliSicuro,
  escapeRegExp,
  parseAnno,
  parsePreferiti,
  parseQualita,
  parseQuery,
  splitEvidenzia,
} from "@/lib/validation";

describe("validation", () => {
  it("parseQualita clamp 0-100 e scarta non-finiti", () => {
    expect(parseQualita(77.6)).toBe(78);
    expect(parseQualita(-5)).toBe(0);
    expect(parseQualita(9999)).toBe(100);
    expect(parseQualita(Number.NaN)).toBeUndefined();
    expect(parseQualita("77")).toBeUndefined();
  });

  it("parseAnno accetta solo YYYY 1800-2100", () => {
    expect(parseAnno("2026")).toBe("2026");
    expect(parseAnno("26")).toBe("");
    expect(parseAnno("2026;DROP")).toBe("");
    expect(parseAnno(2026)).toBe("2026");
    expect(parseAnno("1700")).toBe("");
  });

  it("parseQuery tronca a 200", () => {
    expect(parseQuery("  ciao  ")).toBe("ciao");
    expect(parseQuery("a".repeat(500)).length).toBe(200);
  });

  it("clampPagina/per", () => {
    expect(clampPagina(-3)).toBe(1);
    expect(clampPagina(99999999)).toBe(10000);
    expect(clampPerPage(9999)).toBe(200);
    expect(clampPerPage(0)).toBe(20);
  });

  it("eliSicuro rifiuta control e oltre 500", () => {
    expect(eliSicuro("/eli/id/2026/07/27/26G00155/sg")).toContain("/eli/");
    expect(eliSicuro("a".repeat(600))).toBeNull();
    expect(eliSicuro("a\u0000b")).toBeNull();
  });

  it("escapeRegExp neutralizza", () => {
    expect(new RegExp(escapeRegExp("(((a+)+)+)+!")).test("(((a+)+)+)+!")).toBe(true);
  });

  it("splitEvidenzia trova token senza RegExp utente", () => {
    const parti = splitEvidenzia("Il decreto energia a Taranto", "energia taranto");
    expect(parti.some((p) => p.evidenzia)).toBe(true);
    expect(parti.map((p) => p.testo).join("")).toBe("Il decreto energia a Taranto");
    expect(splitEvidenzia("ciao", "(((a+)+)+)+!")).toEqual([{ testo: "ciao", evidenzia: false }]);
  });

  it("parsePreferiti valida solo ELI stringhe", () => {
    expect(parsePreferiti(["/eli/a", 1, "", "/eli/a"])).toEqual(["/eli/a"]);
    expect(parsePreferiti("no")).toEqual([]);
  });
});
