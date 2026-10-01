/**
 * Test ingest referendum 2025 — SOLO fixture INLINE, MAI rete.
 *
 * Contesto: ZIP DAIT `referendum-20250608.zip` (20.677.784 B), file
 * `OPENDATA_LivComune.xlsx` (2.663.093 B, Foglio1, 39.481 righe, 13 colonne
 * con header DATAELEZIONE|NUMQUESITO|...|COMUNE, DATAELEZIONE=45816 unico
 * valore). Questa suite NON tocca /tmp né la rete: usa celle sintetiche
 * inline (comuni fittizi, MAI nominativi reali).
 */

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

let chiamateFetch = 0;
beforeEach(() => {
  chiamateFetch = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      chiamateFetch++;
      throw new Error("rete vietata in tests/referendum.test.ts");
    }),
  );
});

const HEADER_ATTESO = [
  "DATAELEZIONE",
  "NUMQUESITO",
  "QUESITOREFERENDUM",
  "ELETTORITOT",
  "ELETTORIM",
  "VOTANTITOT",
  "VOTANTIM",
  "SKBIANCHE",
  "VOTIVALIDI",
  "VOTIVALIDI_SI",
  "REGIONE",
  "PROVINCIA",
  "COMUNE",
] as const;

const TITOLO_Q1 = "CONTRATTO DI LAVORO A TUTELE CRESCENTI - SINTETICO";
const TITOLO_Q2 = "PICCOLE IMPRESE - SINTETICO";

function rigaCelle(over: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    DATAELEZIONE: "45816",
    NUMQUESITO: "1",
    QUESITOREFERENDUM: TITOLO_Q1,
    ELETTORITOT: "1000",
    ELETTORIM: "480",
    VOTANTITOT: "400",
    VOTANTIM: "190",
    SKBIANCHE: "10",
    VOTIVALIDI: "380",
    VOTIVALIDI_SI: "300",
    REGIONE: "REGIONE A",
    PROVINCIA: "PROV A",
    COMUNE: "COMUNE ALFA",
  };
  return HEADER_ATTESO.map((k) => over[k] ?? base[k] ?? "");
}

describe("referendum — header e filtro data (fixture inline)", () => {
  it("header atteso: 13 colonne nell'ordine reale DAIT", () => {
    expect(HEADER_ATTESO.length).toBe(13);
    expect(HEADER_ATTESO[0]).toBe("DATAELEZIONE");
    expect(HEADER_ATTESO[1]).toBe("NUMQUESITO");
    expect(HEADER_ATTESO[9]).toBe("VOTIVALIDI_SI");
    expect(HEADER_ATTESO[12]).toBe("COMUNE");
  });

  it("filtro DATAELEZIONE=45816: accetta target, scarta altri valori", async () => {
    const mod = (await import("@/scripts/ingest-reale-referendum")) as Record<string, unknown>;
    const isDataTarget = mod["isDataTarget"] as (s: string) => boolean;
    expect(isDataTarget("45816")).toBe(true);
    expect(isDataTarget("45815")).toBe(false);
    expect(isDataTarget("DATAELEZIONE")).toBe(false);
    const parse = mod["parseRigaReferendum"] as (celle: string[], n: number) => unknown;
    expect(parse(rigaCelle(), 2)).toMatchObject({ q: 1, si: 300, no: 80 });
    expect(parse(rigaCelle({ DATAELEZIONE: "45000" }), 2)).toBeNull();
    expect(chiamateFetch).toBe(0);
  });

  it("header diverso (12 o 14 colonne, ordine errato) -> isHeader false", async () => {
    const mod = (await import("@/scripts/ingest-reale-referendum")) as Record<string, unknown>;
    const isHeader = mod["isHeaderReferendum"] as (c: string[]) => boolean;
    expect(isHeader([...HEADER_ATTESO])).toBe(true);
    expect(isHeader([...HEADER_ATTESO].slice(0, 12))).toBe(false);
    expect(isHeader([...HEADER_ATTESO, "EXTRA"])).toBe(false);
    const scambiato = [...HEADER_ATTESO];
    const t = scambiato[9]!;
    scambiato[9] = scambiato[8]!;
    scambiato[8] = t;
    expect(isHeader(scambiato)).toBe(false);
  });
});

describe("referendum — quote SI/NO e affluenza (fixture inline)", () => {
  it("quota SI: no=validi-si, p_si a 1 decimale, si>validi -> null", async () => {
    const mod = (await import("@/scripts/ingest-reale-referendum")) as Record<string, unknown>;
    const quotaSi = mod["quotaSi"] as (
      si: string,
      validi: string,
    ) => { si: number; no: number; validi: number; p_si: number } | null;
    expect(quotaSi("300", "380")).toMatchObject({ si: 300, no: 80 });
    expect(quotaSi("300", "380")?.p_si).toBe(Math.round((300 / 380) * 100 * 10) / 10);
    expect(quotaSi("0", "0")).toMatchObject({ no: 0, p_si: 0 });
    expect(quotaSi("381", "380")).toBeNull();
    expect(quotaSi("-1", "380")).toBeNull();
  });

  it("parse riga: quesito normalizzato {id,titolo}, mai nominativi", async () => {
    const mod = (await import("@/scripts/ingest-reale-referendum")) as Record<string, unknown>;
    const parse = mod["parseRigaReferendum"] as (
      celle: string[],
      n: number,
    ) => Record<string, unknown>;
    const r = parse(rigaCelle({ NUMQUESITO: "2", QUESITOREFERENDUM: TITOLO_Q2 }), 3);
    expect(r).toMatchObject({ q: 2, titolo: TITOLO_Q2, si: 300, no: 80 });
    const serializzato = JSON.stringify(r);
    for (const campo of ["COGNOME", "NOME", "PREFERENZE", "DATANASCITA"]) {
      expect(serializzato).not.toContain(campo);
    }
    expect(() => parse(rigaCelle({ NUMQUESITO: "6" }), 3)).toThrow();
    expect(() => parse(rigaCelle({ VOTIVALIDI_SI: "999" }), 3)).toThrow();
  });

  it("affluenza v/e a 1 decimale, e<=0 -> 0", async () => {
    const mod = (await import("@/scripts/ingest-reale-referendum")) as Record<string, unknown>;
    const affluenza = mod["affluenza"] as (v: number, e: number) => number;
    expect(affluenza(400, 1000)).toBe(40);
    expect(affluenza(1, 3)).toBe(33.3);
    expect(affluenza(10, 0)).toBe(0);
  });
});

describe("referendum — integrazione disco tollerante (MAI fallire se assente)", () => {
  it("se data/reali/referendum-2025.json esiste: envelope + cap 950KB", () => {
    const percorso = resolve(process.cwd(), "data/reali/referendum-2025.json");
    if (!existsSync(percorso)) {
      expect(true).toBe(true);
      return;
    }
    const byte = statSync(percorso).size;
    expect(byte).toBeLessThanOrEqual(950 * 1024);
    const grezzo = JSON.parse(readFileSync(percorso, "utf8")) as Record<string, unknown>;
    const elezione = grezzo["elezione"] as Record<string, unknown>;
    expect(elezione["tipo"]).toBe("referendum");
    expect(elezione["data"]).toBe("2025-06-08");
    const quesiti = grezzo["quesiti"] as unknown[];
    expect(Array.isArray(quesiti)).toBe(true);
    expect(quesiti.length).toBeLessThanOrEqual(5);
    const comuni = grezzo["comuni"] as unknown[];
    expect(Array.isArray(comuni)).toBe(true);
    const serializzato = JSON.stringify(grezzo);
    expect(serializzato).not.toContain("COGNOME");
    expect(chiamateFetch).toBe(0);
  });
});
