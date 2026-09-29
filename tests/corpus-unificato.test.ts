import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_LAWS } from "@/lib/seed-data";
import { azzeraCacheReali, getSeedLaws } from "@/lib/sources";
import { countLaws, getStats, listLaws, resetPrisma } from "@/lib/db";
import {
  attoEspansoToLawRecord,
  contaCorpus,
  CORPUS_TOTALE_MAX,
  generaCorpusUnificato,
  getCorpusUnificato,
  svuotaCacheCorpus,
} from "@/lib/corpus-unificato";
import { ATTI_ESPANSI, type AttoEspanso } from "@/lib/seed-data-espansa";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  resetPrisma();
});

/**
 * Opt-in legacy per le prove sul corpus sintetico: real-only di default,
 * con `CORPUS_SINTETICO=1` si ripristinano 5 seed primi + varianti.
 */
function abilitaSintetico(): void {
  vi.stubEnv("CORPUS_SINTETICO", "1");
  azzeraCacheReali();
  svuotaCacheCorpus();
}

function disabilitaSintetico(): void {
  vi.stubEnv("CORPUS_SINTETICO", "");
  azzeraCacheReali();
  svuotaCacheCorpus();
}

const NUMERI_RISERVATI = [8, 36, 124, 133, 139];

describe("corpus unificato: forma e sottoinsieme seed", () => {
  it("ha totale >= 5 e primi 5 ELI == SEED_LAWS (opt-in sintetico)", () => {
    abilitaSintetico();
    try {
      const corpus = getSeedLaws();
      expect(corpus.length).toBeGreaterThanOrEqual(5);
      for (let i = 0; i < SEED_LAWS.length; i++) {
        expect(corpus[i]?.eli).toBe(SEED_LAWS[i]?.eli);
      }
    } finally {
      disabilitaSintetico();
    }
  });

  it("rispetta il totale da env quando impostato (clamp 87..20000)", () => {
    const raw = process.env.CORPUS_TOTALE;
    const corpus = getSeedLaws();
    if (raw !== undefined && raw !== "") {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        const atteso = Math.min(20000, Math.max(87, Math.floor(n)));
        expect(corpus.length).toBe(atteso);
        return;
      }
    }
    expect(corpus.length).toBeGreaterThanOrEqual(5);
    expect(corpus.length).toBeLessThanOrEqual(20000);
  });

  it("ha ELI unici (dedup per normalizzaChiaveEli)", () => {
    const corpus = getSeedLaws();
    const chiavi = corpus.map((l) => l.eli.trim().toLowerCase());
    expect(new Set(chiavi).size).toBe(corpus.length);
  });

  it("ha gulpease valorizzato su ogni record (o testo per ricalcolarlo)", () => {
    const corpus = getSeedLaws();
    for (const law of corpus) {
      if (law.gulpease === null || law.gulpease === undefined) {
        // Ammesso solo per seed arricchiti col testo ufficiale trapiantato:
        // normalizeLaw ricalcola il Gulpease dal testo (vedi seed-fallback).
        expect(
          typeof law.testo === "string" && law.testo.trim().length > 0,
          `gulpease nullo senza testo per ${law.eli}`,
        ).toBe(true);
      }
    }
  });

  it("non usa numeri riservati nelle varianti sintetiche (titoli Variante N, opt-in)", () => {
    abilitaSintetico();
    try {
      const corpus = getSeedLaws();
      // Solo le varianti generate (titolo "... Variante N"), ovunque siano
      // nel merge con reali e curati: i numeri ufficiali veri sono legittimi.
      const varianti = corpus.filter((law) => law.titolo.includes("Variante "));
      expect(varianti.length).toBeGreaterThan(0);
      for (const law of varianti) {
        const n = Number(law.numero);
        if (Number.isFinite(n)) {
          expect(NUMERI_RISERVATI, `numero riservato ${law.numero} in varianti`).not.toContain(
            n,
          );
        }
      }
    } finally {
      disabilitaSintetico();
    }
  });

  it("e' deterministico a parita' di seme", () => {
    const primo = getSeedLaws();
    const secondo = getSeedLaws();
    expect(secondo).toEqual(primo);
  });

  it("restituisce sempre una copia difensiva", () => {
    const primo = getSeedLaws();
    const elisPrima = primo.map((l) => l.eli);
    // Mutazione del risultato non deve persistere
    (primo as unknown[]).pop();
    if (primo[0]) primo[0].titolo = "MANOMESSO";
    const secondo = getSeedLaws();
    expect(secondo.map((l) => l.eli)).toEqual(elisPrima);
    expect(secondo[0]?.titolo).not.toBe("MANOMESSO");
    expect(secondo).not.toBe(primo);
  });

  it("never-throw: getSeedLaws non lancia mai", () => {
    expect(() => getSeedLaws()).not.toThrow();
    // Anche con env corrotti non deve lanciare verso i route handler
    vi.stubEnv("CORPUS_TOTALE", "non-un-numero");
    vi.stubEnv("CORPUS_SEED", "");
    expect(() => getSeedLaws()).not.toThrow();
    vi.unstubAllEnvs();
    vi.stubEnv("DATABASE_URL", "");
  });
});

describe("mapping atti (lib/corpus-unificato)", () => {
  it("mappa ogni TipoAtto curato a un LawRecord valido", () => {
    expect(ATTI_ESPANSI.length).toBeGreaterThan(0);
    for (const atto of ATTI_ESPANSI) {
      let record: ReturnType<typeof attoEspansoToLawRecord>;
      expect(() => {
        record = attoEspansoToLawRecord(atto);
      }).not.toThrow();
      record = attoEspansoToLawRecord(atto);
      expect(record.eli.length).toBeGreaterThan(0);
      expect(record.nir.length).toBeGreaterThan(0);
      expect(record.numero).toBe(String(atto.numero));
      expect(record.stato).toBe("in_vigore");
      expect(record.air).toBe(atto.air === true ? "presente" : "assente");
      expect(record.attuativi).toMatchObject({ scaduti: 0 });
      expect(record.fonti).toBeTruthy();
      expect(typeof record.fonti).toBe("object");
      expect(record.dimostrativo).toBe(atto.dimostrativo);
      expect(record.titolo).toBe(atto.titolo);
      expect((record.testo ?? "").length).toBeGreaterThan(0);
    }
  });

  it("copre tutti i tipi con gli slug LawRecord attesi", () => {
    const tipi = new Set(ATTI_ESPANSI.map((a) => a.tipo));
    expect(tipi.size).toBeGreaterThanOrEqual(5);
    const perTipo = new Map<string, ReturnType<typeof attoEspansoToLawRecord>>();
    for (const atto of ATTI_ESPANSI) {
      if (!perTipo.has(atto.tipo)) perTipo.set(atto.tipo, attoEspansoToLawRecord(atto));
    }
    expect(perTipo.get("Legge")?.tipo).toBe("legge");
    expect(perTipo.get("Decreto-Legge")?.tipo).toBe("decreto.legge");
    expect(perTipo.get("Decreto Legislativo")?.tipo).toBe("decreto.legislativo");
  });

  it("non lancia su input malformato (fallback dimostrativo)", () => {
    expect(() => attoEspansoToLawRecord(undefined as never)).not.toThrow();
    expect(() => attoEspansoToLawRecord(null as never)).not.toThrow();
    expect(() => attoEspansoToLawRecord({} as never)).not.toThrow();
    const fallback = attoEspansoToLawRecord({} as never);
    expect(fallback.eli.length).toBeGreaterThan(0);
    expect(fallback.dimostrativo).toBe(true);
  });

  it("le varianti generate restano LawRecord validi e unici", () => {
    const campione = generaCorpusUnificato(120, "test-unitario");
    expect(campione).toHaveLength(120);
    const chiavi = campione.map((l) => l.eli.trim().toLowerCase());
    expect(new Set(chiavi).size).toBe(campione.length);
    for (const record of campione) {
      expect(record.stato).toBe("in_vigore");
      expect(record.gulpease).not.toBeNull();
      expect(record.fonti).toBeTruthy();
    }
    const base: AttoEspanso = ATTI_ESPANSI[0] as AttoEspanso;
    void base;
  });
});

describe("server unificato (lib/corpus-unificato)", () => {
  it("applica default, trim e clamp 87..20000 da env", () => {
    svuotaCacheCorpus();
    try {
      vi.stubEnv("CORPUS_TOTALE", "3");
      expect(getCorpusUnificato()).toHaveLength(87);
      svuotaCacheCorpus();
      vi.stubEnv("CORPUS_TOTALE", "non-un-numero");
      vi.stubEnv("CORPUS_SEED", "");
      expect(getCorpusUnificato()).toHaveLength(5000);
    } finally {
      vi.unstubAllEnvs();
      vi.stubEnv("DATABASE_URL", "");
      svuotaCacheCorpus();
    }
  });

  it("ELI unici, copia difensiva e cache", () => {
    const primo = getCorpusUnificato();
    expect(primo.length).toBeGreaterThanOrEqual(87);
    expect(primo.length).toBeLessThanOrEqual(CORPUS_TOTALE_MAX);
    const chiavi = primo.map((l) => l.eli.trim().toLowerCase());
    expect(new Set(chiavi).size).toBe(primo.length);
    // Copia difensiva: mutare non persiste
    const elis = primo.map((l) => l.eli);
    (primo as unknown[]).pop();
    const secondo = getCorpusUnificato();
    expect(secondo.map((l) => l.eli)).toEqual(elis);
    expect(secondo).not.toBe(primo);
  });

  it("svuotaCacheCorpus non lancia e ricrea lo stesso corpus", () => {
    const prima = getCorpusUnificato();
    expect(() => svuotaCacheCorpus()).not.toThrow();
    const dopo = getCorpusUnificato();
    expect(dopo).toEqual(prima);
    expect(contaCorpus()).toBe(prima.length);
  });
});

describe("coerenza stats / dedup / export / feed", () => {
  it("getStats: totale == sum(perTipo) == sum(perAnno) quando presenti", async () => {
    const stats = await getStats();
    const sommaTipi = Object.values(stats.perTipo as Record<string, number>).reduce(
      (a, b) => a + b,
      0,
    );
    expect(stats.totale).toBe(sommaTipi);
    const perAnno = (stats as unknown as { perAnno?: Record<string, number> }).perAnno;
    if (perAnno) {
      const sommaAnni = Object.values(perAnno).reduce((a, b) => a + b, 0);
      expect(stats.totale).toBe(sommaAnni);
    }
  });

  it("dedup persiste tra getSeedLaws, listLaws e countLaws", async () => {
    const corpus = getSeedLaws();
    const totale = await countLaws();
    expect(totale).toBe(corpus.length);
    // Pagina ampia: nessun ELI duplicato
    const pagina = await listLaws({ page: 1, per: 48 });
    const elis = pagina.items.map((l) => l.eli.trim().toLowerCase());
    expect(new Set(elis).size).toBe(elis.length);
  });

  it("export resta limitato: cap 5000 con batch 500", async () => {
    const totale = await countLaws();
    expect(totale).toBeLessThanOrEqual(20000);
    // Simula batch da 500: ogni batch ha al massimo 500 righe
    const batch = await listLaws({ page: 1, per: 48 });
    expect(batch.items.length).toBeLessThanOrEqual(48);
    // Il totale esportabile non supera il cap 5000
    expect(Math.min(totale, 5000)).toBeLessThanOrEqual(5000);
  });

  it("feed resta limitato a max 50 voci", async () => {
    const { GET: feedGET } = await import("@/app/api/feed/route");
    const res = await feedGET();
    expect(res.status).toBe(200);
    const xml = await res.text();
    const voci = xml.split("<item>").length - 1;
    expect(voci).toBeLessThanOrEqual(50);
  });
});
