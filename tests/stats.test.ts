import { describe, expect, it } from "vitest";
import {
  ECONOMIA_SNAPSHOT,
  airDistribuzione,
  attuativiTotali,
  buildStats,
  contaPerAnno,
  contaPerTipo,
  gulpeaseMedio,
  qualitaDi,
  qualitaMedia,
} from "@/lib/stats";
import type { StatLaw } from "@/lib/stats";

const LEGGI: StatLaw[] = [
  {
    tipo: "decreto.legge",
    dataEmanazione: "2026-07-27",
    titolo: "DL energia",
    sintesi: "Misure per l'energia.",
    gulpease: 50,
    air: "semplificata",
    attuativi: { daAdottare: 2, adottati: 0, scaduti: 0 },
    qualita: 62,
  },
  {
    tipo: "legge",
    dataEmanazione: "2026-02-10",
    titolo: "Legge sicurezza",
    sintesi: "Misure per la sicurezza informatica.",
    gulpease: 40,
    air: "assente",
    attuativi: { daAdottare: 1, adottati: 1, scaduti: 0 },
  },
  {
    tipo: "decreto.legge",
    dataEmanazione: "2025-12-19",
    titolo: "Legge concorrenza",
    sintesi: "Misure per la concorrenza.",
    gulpease: null,
    air: undefined,
    attuativi: { daAdottare: 0, adottati: 0, scaduti: 1 },
  },
];

describe("aggregati di corpus", () => {
  it("conta per anno e per tipo", () => {
    expect(contaPerAnno(LEGGI)).toEqual({ "2025": 1, "2026": 2 });
    expect(contaPerTipo(LEGGI)).toEqual({ "decreto.legge": 2, legge: 1 });
  });

  it("calcola la media Gulpease ignorando i null", () => {
    expect(gulpeaseMedio(LEGGI)).toBe(45);
    expect(gulpeaseMedio([])).toBeNull();
  });

  it("somma i decreti attuativi", () => {
    expect(attuativiTotali(LEGGI)).toEqual({
      daAdottare: 3,
      adottati: 1,
      scaduti: 1,
      totale: 5,
    });
  });

  it("distribuisce l'AIR includendo nonNoto", () => {
    const distribuzione = airDistribuzione(LEGGI);
    expect(distribuzione.semplificata).toBe(1);
    expect(distribuzione.assente).toBe(1);
    expect(distribuzione.nonNoto).toBe(1);
    expect(distribuzione.presente).toBe(0);
  });

  it("usa la qualita memorizzata o la ricalcola", () => {
    expect(qualitaDi(LEGGI[0])).toBe(62);
    const ricalcolata = qualitaDi(LEGGI[1]);
    expect(ricalcolata).not.toBeNull();
    expect(qualitaMedia(LEGGI)).not.toBeNull();
  });

  it("compone l'aggregato completo", () => {
    const stats = buildStats(LEGGI);
    expect(stats.totale).toBe(3);
    expect(stats.perAnno["2026"]).toBe(2);
    expect(stats.perTipo["decreto.legge"]).toBe(2);
    expect(stats.gulpeaseMedio).toBe(45);
    expect(stats.attuativiTotali.totale).toBe(5);
    expect(stats.qualitaMedia).not.toBeNull();
  });
});

describe("snapshot economico", () => {
  it("ogni indicatore dichiara fonte e periodo", () => {
    expect(ECONOMIA_SNAPSHOT.length).toBeGreaterThan(0);
    for (const indicatore of ECONOMIA_SNAPSHOT) {
      expect(indicatore.fonte.length).toBeGreaterThan(0);
      expect(indicatore.periodo.length).toBeGreaterThan(0);
      expect(typeof indicatore.valore).toBe("number");
    }
  });
});
