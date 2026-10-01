import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { SEED_LAWS } from "@/lib/seed-data";
import { azzeraCacheReali, getCorpusInfo, getSeedLaws, unisciCorpus } from "@/lib/sources";
import { svuotaCacheCorpus } from "@/lib/corpus-unificato";

/**
 * Real-only di default: solo testi reali, niente schede di prova.
 * Senza `CORPUS_SINTETICO=1` il corpus e' seed curati + reali + 2 atti di
 * riferimento; il sintetico inventato ("Variante N", dimostrativi) e'
 * escluso. Con opt-in il legacy e' ripristinato.
 */

const ELI_DIMOSTRATIVI = SEED_LAWS.filter((l) => l.dimostrativo === true).map((l) => l.eli);
const ELI_CURATI = SEED_LAWS.filter((l) => l.dimostrativo !== true).map((l) => l.eli);

const STATI_ONESTI = ["in_vigore", "abrogato", "decaduto", "sconosciuto"];
const DOMINI_BASE_AMMESSI = [
  "normattiva.it",
  "gazzettaufficiale.it",
  "governo.it",
  "camera.it",
  "senato.it",
  "parlamento.it",
  "quirinale.it",
  "eur-lex.europa.eu",
  "cortecostituzionale.it",
];

function senzaSintetico(): void {
  vi.stubEnv("CORPUS_SINTETICO", "");
  azzeraCacheReali();
  svuotaCacheCorpus();
}

function conSintetico(): void {
  vi.stubEnv("CORPUS_SINTETICO", "1");
  azzeraCacheReali();
  svuotaCacheCorpus();
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("DATABASE_URL", "");
  azzeraCacheReali();
  svuotaCacheCorpus();
});

describe("real-only: default senza sintetico", () => {
  it("nessun titolo inventato Variante in getSeedLaws senza env", () => {
    senzaSintetico();
    const leggi = getSeedLaws();
    expect(leggi.length).toBeGreaterThan(0);
    for (const law of leggi) {
      expect(law.titolo.includes("Variante "), `titolo sintetico: ${law.eli}`).toBe(false);
    }
  });

  it("nessun record dimostrativo nel default (solo testi reali)", () => {
    senzaSintetico();
    const leggi = getSeedLaws();
    for (const law of leggi) {
      expect(law.dimostrativo, `dimostrativo in default: ${law.eli}`).not.toBe(true);
    }
  });

  it("i 3 seed dimostrativi inventati sono esclusi di default", () => {
    senzaSintetico();
    expect(ELI_DIMOSTRATIVI).toHaveLength(3);
    const elis = new Set(getSeedLaws().map((l) => l.eli));
    for (const eli of ELI_DIMOSTRATIVI) {
      expect(elis.has(eli), `seed dimostrativo presente in default: ${eli}`).toBe(false);
    }
  });

  it("restano DL 133/2026 e DL 139/2026 curati, primi nel corpus", () => {
    senzaSintetico();
    expect(ELI_CURATI).toHaveLength(2);
    const leggi = getSeedLaws();
    expect(leggi[0]?.eli).toBe(ELI_CURATI[0]);
    expect(leggi[1]?.eli).toBe(ELI_CURATI[1]);
    const elis = new Set(leggi.map((l) => l.eli));
    for (const eli of ELI_CURATI) {
      expect(elis.has(eli)).toBe(true);
    }
  });

  it("stati onesti in tutto il default (mai 500, mai inventati)", () => {
    senzaSintetico();
    for (const law of getSeedLaws()) {
      expect(STATI_ONESTI, `stato non onesto ${law.eli}: ${law.stato}`).toContain(law.stato);
    }
  });

  it("fonti solo da domini allowlist https (mai 500)", () => {
    senzaSintetico();
    for (const law of getSeedLaws()) {
      const fonti = law.fonti as Record<string, unknown> | null;
      if (!fonti || typeof fonti !== "object") continue;
      for (const valore of Object.values(fonti)) {
        if (typeof valore !== "string" || !valore) continue;
        let url: URL;
        try {
          url = new URL(valore);
        } catch {
          expect(`URL non valido in ${law.eli}: ${valore}`).toBe("");
          continue;
        }
        expect(url.protocol, `fonte non https in ${law.eli}`).toBe("https:");
        const host = url.hostname.toLowerCase();
        const ammesso = DOMINI_BASE_AMMESSI.some(
          (base) => host === base || host.endsWith(`.${base}`),
        );
        expect(ammesso, `dominio non allowlist in ${law.eli}: ${valore}`).toBe(true);
      }
    }
  });

  it("zero em-dash/en-dash e max 1 middle-dot per riga nei testi visibili", () => {
    senzaSintetico();
    for (const law of getSeedLaws()) {
      for (const campo of [law.titolo, law.sintesi]) {
        if (typeof campo !== "string") continue;
        expect(campo.includes("—"), `em-dash in ${law.eli}`).toBe(false);
        expect(campo.includes("–"), `en-dash in ${law.eli}`).toBe(false);
        for (const riga of campo.split("\n")) {
          const punti = (riga.match(/·/g) ?? []).length;
          expect(punti, `troppi middle-dot in ${law.eli}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("real-only: opt-in CORPUS_SINTETICO=1 ripristina il legacy", () => {
  it("opt-in ripristina varianti e 5 seed primi", () => {
    senzaSintetico();
    const prima = getSeedLaws();
    conSintetico();
    const dopo = getSeedLaws();
    const varianti = dopo.filter((l) => l.titolo.includes("Variante "));
    expect(varianti.length).toBeGreaterThan(0);
    expect(dopo.length).toBeGreaterThan(prima.length);
    for (let i = 0; i < SEED_LAWS.length; i++) {
      expect(dopo[i]?.eli).toBe(SEED_LAWS[i]?.eli);
    }
  });

  it("valori non-1 restano real-only (0, no, vuoto)", () => {
    for (const valore of ["0", "no", ""]) {
      vi.stubEnv("CORPUS_SINTETICO", valore);
      azzeraCacheReali();
      svuotaCacheCorpus();
      const varianti = getSeedLaws().filter((l) => l.titolo.includes("Variante "));
      expect(varianti, `sintetico attivo con CORPUS_SINTETICO=${valore}`).toHaveLength(0);
    }
  });
});

describe("real-only: getCorpusInfo invarianti + never-throw", () => {
  it("base + espansi == totale, 0 <= reali <= totale, senza sintetico", () => {
    senzaSintetico();
    const info = getCorpusInfo();
    expect(info.base).toBeGreaterThan(0);
    expect(info.totale).toBeGreaterThanOrEqual(info.base);
    expect(info.espansi).toBe(info.totale - info.base);
    expect(info.base + info.espansi).toBe(info.totale);
    expect(info.reali).toBeGreaterThanOrEqual(0);
    expect(info.reali).toBeLessThanOrEqual(info.totale);
    const atteso = getSeedLaws().filter((l) => l.dimostrativo === false).length;
    expect(info.reali).toBe(atteso);
  });

  it("invarianti anche con opt-in sintetico", () => {
    conSintetico();
    const info = getCorpusInfo();
    expect(info.base + info.espansi).toBe(info.totale);
    expect(info.reali).toBeLessThanOrEqual(info.totale);
  });

  it("conteggi reali mai abbassati (soglia 1763)", () => {
    senzaSintetico();
    expect(getCorpusInfo().reali).toBeGreaterThanOrEqual(1763);
  });

  it("never-throw: getSeedLaws, getCorpusInfo, unisciCorpus", () => {
    senzaSintetico();
    expect(() => getSeedLaws()).not.toThrow();
    expect(() => getCorpusInfo()).not.toThrow();
    expect(() => unisciCorpus(null as never, undefined as never, {} as never)).not.toThrow();
    expect(unisciCorpus(null as never, undefined as never, {} as never)).toEqual([]);
    vi.stubEnv("CORPUS_SINTETICO", "valore-strano");
    vi.stubEnv("CORPUS_TOTALE", "non-un-numero");
    expect(() => getSeedLaws()).not.toThrow();
    expect(() => getCorpusInfo()).not.toThrow();
  });
});
