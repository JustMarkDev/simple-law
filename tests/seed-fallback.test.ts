import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  attuativiRiepilogo,
  findLawByEli,
  formatDate,
  formatTipo,
  normalizeLaw,
} from "@/components/seed-fallback";
import { loadLawByEli, loadLaws } from "@/lib/load-laws";
import { SEED_LAWS } from "@/lib/seed-data";
import type { LawRecord } from "@/lib/seed-data";
import { azzeraCacheReali } from "@/lib/sources";
import { svuotaCacheCorpus } from "@/lib/corpus-unificato";
import { svuotaCacheDb } from "@/lib/db";

const ELI_133 = "/eli/id/2026/07/27/26G00155/sg";

describe("seed-fallback (cio' che vede la UI)", () => {
  // Queste prove verificano cio' che vede la UI col corpus legacy completo
  // (5 seed primi + espansi): real-only di default, quindi opt-in.
  beforeEach(() => {
    vi.stubEnv("CORPUS_SINTETICO", "1");
    azzeraCacheReali();
    svuotaCacheCorpus();
    svuotaCacheDb();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    azzeraCacheReali();
    svuotaCacheCorpus();
    svuotaCacheDb();
  });

  it("carica il corpus (5 seed + espansi) e trova la DL 133/2026", async () => {
    const leggi = await loadLaws();
    expect(leggi.length).toBeGreaterThanOrEqual(5);
    // I 5 seed restano i primi e vincono la dedup per ELI.
    for (let i = 0; i < SEED_LAWS.length; i++) {
      expect(leggi[i]?.eli).toBe(SEED_LAWS[i]?.eli);
    }
    const dl133 = await loadLawByEli(ELI_133);
    expect(dl133?.numero).toBe("133");
  });

  it("la scheda 133 riporta diesel e ILVA con semaforo giallo", async () => {
    const dl133 = await loadLawByEli(ELI_133);
    expect(dl133?.semplificata.in10Secondi).toMatch(/diesel/i);
    expect(dl133?.semplificata.in10Secondi).toMatch(/ILVA/);
    expect(dl133?.stato).toBe("giallo");
    expect(dl133?.dimostrativo).toBe(false);
  });

  it("le chiavi perTe sono guida/lavoro/impresa/studio", async () => {
    const dl133 = await loadLawByEli(ELI_133);
    expect(Object.keys(dl133?.semplificata.perTe ?? {}).sort()).toEqual([
      "guida",
      "impresa",
      "lavoro",
      "studio",
    ]);
  });

  it("gli atti oltre i due di riferimento sono dimostrativi", async () => {
    const leggi = await loadLaws();
    // Lookup per ELI (unico): i numeri si ripetono tra atti reali e seed.
    const perEli = new Map(leggi.map((law) => [law.eli, law]));
    expect(perEli.get("/eli/id/2026/07/27/26G00155/sg")?.dimostrativo).toBe(false);
    expect(perEli.get("/eli/id/2026/08/05/26G00162/sg")?.dimostrativo).toBe(false);
    expect(perEli.get("/eli/id/2025/12/19/25G00134/sg")?.dimostrativo).toBe(true);
    expect(perEli.get("/eli/id/2026/03/12/26G00091/sg")?.dimostrativo).toBe(true);
    expect(perEli.get("/eli/id/2026/02/10/26G00044/sg")?.dimostrativo).toBe(true);
  });

  it("findLawByEli ignora maiuscole/minuscole e slash", async () => {
    const leggi = await loadLaws();
    expect(findLawByEli(leggi, "/ELI/ID/2026/07/27/26G00155/SG")?.numero).toBe("133");
    expect(findLawByEli(leggi, `${ELI_133}/`)?.numero).toBe("133");
  });

  it("formatDate usa il fuso UTC (niente slittamenti di giorno)", () => {
    expect(formatDate("2026-07-27")).toMatch(/luglio.*2026|2026.*luglio/i);
  });

  it("attuativiRiepilogo descrive i decreti mancanti", () => {
    expect(attuativiRiepilogo({ daAdottare: 2, adottati: 0, scaduti: 0 })).toMatch(/2 da adottare/);
  });

  it("formatTipo produce etichette leggibili", () => {
    expect(formatTipo("decreto.legge")).toBe("Decreto-legge");
    expect(formatTipo("legge")).toBe("Legge");
  });
});

function recordSenzaOverride(): LawRecord {
  const record = SEED_LAWS.find((law) => law.numero === "124");
  if (!record) throw new Error("seed 124 assente");
  return record;
}

describe("parita' stored-vs-derived", () => {
  it("preferisce la qualita' memorizzata, altrimenti ricalcola", () => {
    const base = recordSenzaOverride();
    expect(normalizeLaw({ ...base, qualita: 77 } as LawRecord).qualita).toBe(77);

    const ricalcolata = normalizeLaw(base).qualita;
    expect(normalizeLaw({ ...base, qualita: Number.NaN } as LawRecord).qualita).toBe(ricalcolata);
  });

  it("completa le chiavi perTe mancanti dalla versione derivata", () => {
    const base = recordSenzaOverride();
    const parziale = {
      ...base,
      semplificata: {
        in10Secondi: "Parziale",
        perTe: { guida: "solo guida" },
        cosaFare: ["x"],
        statoLavora: { colore: "verde", motivo: "ok" },
        proContro: { pro: ["p"], contro: ["c"] },
        gulpease: 50,
      },
    } as unknown as LawRecord;

    const normalizzata = normalizeLaw(parziale);
    expect(Object.keys(normalizzata.semplificata.perTe).sort()).toEqual([
      "guida",
      "impresa",
      "lavoro",
      "studio",
    ]);
    expect(normalizzata.semplificata.perTe.guida).toBe("solo guida");
  });
});
