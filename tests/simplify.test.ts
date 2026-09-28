import { describe, expect, it } from "vitest";
import { buildLLMPrompt, simplifyLaw } from "@/lib/simplify";

const INPUT = {
  titolo: "Disposizioni urgenti in materia di carburanti",
  testo:
    "Il decreto interviene sulle accise. Le disposizioni si applicano dal giorno successivo. Le amministrazioni adottano i decreti attuativi entro sessanta giorni.",
  air: "esente" as const,
  attuativi: { daAdottare: 1, adottati: 0, scaduti: 0 },
};

describe("simplifyLaw", () => {
  it("produce tutte le caselle previste", () => {
    const risultato = simplifyLaw(INPUT);
    expect(typeof risultato.in10Secondi).toBe("string");
    expect(risultato.in10Secondi.length).toBeGreaterThan(0);
    expect(risultato.perTe.guida).toBeTruthy();
    expect(Array.isArray(risultato.cosaFare)).toBe(true);
    expect(risultato.cosaFare.length).toBeGreaterThanOrEqual(3);
    expect(["verde", "giallo", "rosso"]).toContain(risultato.statoLavora.colore);
    expect(risultato.statoLavora.motivo.length).toBeGreaterThan(0);
    expect(Array.isArray(risultato.proContro.pro)).toBe(true);
    expect(Array.isArray(risultato.proContro.contro)).toBe(true);
    expect(typeof risultato.gulpease).toBe("number");
  });

  it("segnala giallo quando ci sono decreti attuativi da adottare", () => {
    expect(simplifyLaw(INPUT).statoLavora.colore).toBe("giallo");
  });

  it("segnala rosso quando ci sono decreti attuativi scaduti", () => {
    const risultato = simplifyLaw({
      ...INPUT,
      attuativi: { daAdottare: 0, adottati: 0, scaduti: 2 },
    });
    expect(risultato.statoLavora.colore).toBe("rosso");
  });

  it("e' deterministico", () => {
    expect(simplifyLaw(INPUT)).toEqual(simplifyLaw(INPUT));
  });

  it("usa un solo schema perTe con le chiavi persona della UI", () => {
    const risultato = simplifyLaw({ titolo: "Norma di prova", testo: "Testo della norma." });
    expect(Object.keys(risultato.perTe).sort()).toEqual([
      "guida",
      "impresa",
      "lavoro",
      "studio",
    ]);
    for (const chiave of Object.keys(risultato.perTe)) {
      expect(risultato.perTe[chiave]).toBeTruthy();
    }
  });
});

describe("buildLLMPrompt", () => {
  it("chiede JSON e include il testo", () => {
    const prompt = buildLLMPrompt("Testo della norma.");
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("Testo della norma.");
    expect(prompt).toContain("in10Secondi");
  });

  it("chiede lo schema perTe della UI", () => {
    const prompt = buildLLMPrompt("Testo della norma.");
    expect(prompt).toContain('"perTe"');
    expect(prompt).toContain('"guida"');
    expect(prompt).toContain('"lavoro"');
    expect(prompt).toContain('"impresa"');
    expect(prompt).toContain('"studio"');
    expect(prompt).not.toContain("cittadini");
  });
});
