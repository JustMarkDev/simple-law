import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { SEED_CDM, SEED_LAWS, SEED_MINISTERS } from "@/lib/seed-data";
import { azzeraCacheReali, getSeedLaws } from "@/lib/sources";
import { svuotaCacheCorpus } from "@/lib/corpus-unificato";
import { isValidELI, parseNIR } from "@/lib/nir";
import { calcGulpease } from "@/lib/readability";

describe("integrita' del seed", () => {
  it("contiene 5 leggi", () => {
    expect(SEED_LAWS).toHaveLength(5);
  });

  it("ha ELI validi e NIR validi per ogni legge", () => {
    for (const law of SEED_LAWS) {
      expect(isValidELI(law.eli), `ELI non valido: ${law.eli}`).toBe(true);
      expect(parseNIR(law.nir), `NIR non valido: ${law.nir}`).not.toBeNull();
    }
  });

  it("allinea gulpease al testo", () => {
    for (const law of SEED_LAWS) {
      const testo = law.testo ?? law.sintesi;
      expect(law.gulpease).toBe(calcGulpease(testo).indice);
    }
  });

  it("include il DL 133/2026", () => {
    const legge = SEED_LAWS.find((l) => l.nir === "urn:nir:stato:decreto.legge:2026-07-27;133");
    expect(legge).toBeDefined();
    expect(legge?.eli).toBe("/eli/id/2026/07/27/26G00155/sg");
    expect(legge?.numero).toBe("133");
    expect(legge?.dataEmanazione).toBe("2026-07-27");
    expect(legge?.titolo.toLowerCase()).toContain("energia");
  });

  it("include il DL 139/2026", () => {
    const legge = SEED_LAWS.find((l) => l.numero === "139" && l.tipo === "decreto.legge");
    expect(legge).toBeDefined();
    expect(legge?.eli).toBe("/eli/id/2026/08/05/26G00162/sg");
  });

  it("include la legge 124/2025 sulla concorrenza", () => {
    const legge = SEED_LAWS.find((l) => l.numero === "124" && l.tipo === "legge");
    expect(legge).toBeDefined();
    expect(legge?.titolo.toLowerCase()).toContain("concorrenza");
  });

  it("ha 8 ministri con slug unici", () => {
    expect(SEED_MINISTERS).toHaveLength(8);
    const slug = new Set(SEED_MINISTERS.map((m) => m.slug));
    expect(slug.size).toBe(8);
    for (const ministro of SEED_MINISTERS) {
      expect(ministro.competenze.length).toBeGreaterThan(0);
      expect(ministro.dicastero.length).toBeGreaterThan(0);
    }
  });

  it("include i ministri richiesti", () => {
    const slug = SEED_MINISTERS.map((m) => m.slug);
    for (const atteso of [
      "meloni",
      "giorgetti",
      "piantedosi",
      "nordio",
      "urso",
      "calderone",
      "valditara",
      "schillaci",
    ]) {
      expect(slug).toContain(atteso);
    }
  });

  it("include il comunicato CdM 183", () => {
    expect(SEED_CDM.some((c) => c.numero === "183")).toBe(true);
  });
});

describe("corpus grande: i 5 seed come sottoinsieme", () => {
  // Queste prove verificano il merge legacy (5 seed primi + sintetico):
  // real-only di default, quindi opt-in CORPUS_SINTETICO=1.
  beforeEach(() => {
    vi.stubEnv("CORPUS_SINTETICO", "1");
    azzeraCacheReali();
    svuotaCacheCorpus();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    azzeraCacheReali();
    svuotaCacheCorpus();
  });

  it("il corpus contiene almeno i 5 seed puri", () => {
    const corpus = getSeedLaws();
    expect(corpus.length).toBeGreaterThanOrEqual(5);
    expect(corpus.length).toBeGreaterThanOrEqual(SEED_LAWS.length);
  });

  it("i primi 5 del corpus coincidono con SEED_LAWS (vincono sempre)", () => {
    const corpus = getSeedLaws();
    for (let i = 0; i < SEED_LAWS.length; i++) {
      expect(corpus[i]?.eli).toBe(SEED_LAWS[i]?.eli);
    }
  });

  it("ogni ELI dei 5 seed esiste nel corpus", () => {
    const eliCorpus = new Set(getSeedLaws().map((l) => l.eli));
    for (const seed of SEED_LAWS) {
      expect(eliCorpus.has(seed.eli)).toBe(true);
    }
  });

  it("il DL 133/2026 resta presente nel corpus grande", () => {
    const corpus = getSeedLaws();
    const legge = corpus.find((l) => l.nir === "urn:nir:stato:decreto.legge:2026-07-27;133");
    expect(legge).toBeDefined();
    expect(legge?.eli).toBe("/eli/id/2026/07/27/26G00155/sg");
    expect(legge?.numero).toBe("133");
  });

  it("il DL 139/2026 e la legge 124/2025 restano presenti", () => {
    const corpus = getSeedLaws();
    expect(corpus.some((l) => l.numero === "139" && l.tipo === "decreto.legge")).toBe(true);
    const l124 = corpus.find((l) => l.numero === "124" && l.tipo === "legge");
    expect(l124).toBeDefined();
    expect(l124?.titolo.toLowerCase()).toContain("concorrenza");
  });
});
