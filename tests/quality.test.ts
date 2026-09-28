import { describe, expect, it } from "vitest";
import { scoreQuality } from "@/lib/quality";

describe("scoreQuality", () => {
  it("premia una norma ben costruita e attuata", () => {
    const result = scoreQuality({
      testo: "Breve testo.",
      attuativi: { daAdottare: 0, adottati: 3, scaduti: 0 },
      air: "presente",
      fiducia: false,
      omnibus: false,
    });
    expect(result.processo).toBe(90);
    expect(result.attuazione).toBe(100);
    expect(result.totale).toBe(92);
    expect(result.giudizio).toBe("ottimo");
  });

  it("penalizza fiducia, omnibus e assenza di AIR", () => {
    const result = scoreQuality({
      testo: "Breve testo.",
      attuativi: { daAdottare: 0, adottati: 0, scaduti: 0 },
      air: "assente",
      fiducia: true,
      omnibus: true,
    });
    expect(result.processo).toBe(5);
  });

  it("azzera l'attuazione con soli decreti scaduti", () => {
    const result = scoreQuality({
      testo: "Breve testo.",
      attuativi: { daAdottare: 0, adottati: 0, scaduti: 4 },
      air: "esente",
      fiducia: false,
      omnibus: false,
    });
    expect(result.attuazione).toBe(0);
  });

  it("mantiene tutti i punteggi tra 0 e 100", () => {
    const result = scoreQuality({
      testo: "Molti rinvii: art. 1, art. 2, legge n. 3, decreto legislativo n. 4, comma 5-bis, comma 6-ter.",
      attuativi: { daAdottare: 5, adottati: 1, scaduti: 3 },
      air: "assente",
      fiducia: true,
      omnibus: true,
    });
    for (const valore of [result.processo, result.tecnica, result.attuazione, result.totale]) {
      expect(valore).toBeGreaterThanOrEqual(0);
      expect(valore).toBeLessThanOrEqual(100);
    }
    expect(typeof result.giudizio).toBe("string");
  });
});
