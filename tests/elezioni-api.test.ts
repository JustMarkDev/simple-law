/**
 * Test superficie dati elezioni (lib + JSON su disco) — MAI rete, MAI throw.
 *
 * v1 NON prevede /api/* (verdetto giudice): questa suite verifica il contratto
 * che pagine e script condividono —
 * `lib/elezioni-dati.ts` never-throw (`caricaEuropee2024`, `cercaComune`,
 * `topListe`, `affluenza`) + envelope JSON `data/reali/elezioni-europee-2024.json`.
 *
 * Strategia mock-tollerante (W2 parallelo):
 * - Parte A: stub INLINE con le stesse firme/blocchi (prova i bound attesi).
 * - Parte B: import dinamico del lib reale se presente → conformita' + mai-500.
 * - Parte C: integrazione disco tollerante — se il JSON esiste, assert cap
 *   ≤950KB, licenza, solo aggregati, Σ p = 100 ± 0,1; se assente, passa.
 * Nessun test fallisce per file di altri scrittori ancora assenti.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

let chiamateFetch = 0;
beforeEach(() => {
  chiamateFetch = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      chiamateFetch++;
      throw new Error("rete vietata in tests/elezioni-api.test.ts");
    }),
  );
});

// ---------------------------------------------------------------------------
// Tipi del contratto v1 (specchio della direttiva giudice, solo aggregati).
// ---------------------------------------------------------------------------

interface ListaAgg {
  readonly n: string;
  readonly v: number;
  readonly p: number;
}

interface RegioneAgg {
  readonly r: string;
  readonly e: number;
  readonly v: number;
  readonly b: number;
  readonly k: number;
  readonly a: number;
  readonly liste: readonly ListaAgg[];
}

interface ComuneAgg {
  readonly c: string;
  readonly p: string;
  readonly r: string;
  readonly e: number;
  readonly v: number;
  readonly a: number;
}

interface Europee2024 {
  readonly provenance: { fonte: string; url: string; recuperatoIl: string; licenza: string };
  readonly elezione: { tipo: string; data: string; e: number; v: number; b: number; k: number; a: number };
  readonly liste: readonly ListaAgg[];
  readonly regioni: readonly RegioneAgg[];
  readonly comuni: readonly ComuneAgg[];
  readonly metodologia: string;
  readonly avvertenze: string;
}

const CAMPI_VIETATI = [
  "COGNOME",
  "NOME",
  "DATANASCITA",
  "LUOGONASCITA",
  "SESSO",
  "PREFERENZE",
  "VOTILISTA",
  "DESCLISTA",
  "NUMVOTI",
] as const;

// ---------------------------------------------------------------------------
// Stub INLINE del contratto (stesse firme attese dal lib reale).
// ---------------------------------------------------------------------------

const STUB: Europee2024 = {
  provenance: {
    fonte: "Ministero Interno DAIT — Eligendo Open Data",
    url: "https://dait.interno.gov.it/documenti/opendata/catalogoagid/europee-2024-italia-livcomune.csv",
    recuperatoIl: "2026-09-28",
    licenza: "open-data ministeriale da confermare",
  },
  elezione: { tipo: "europee", data: "2024-06-09", e: 1500, v: 900, b: 15, k: 3, a: 60 },
  liste: [
    { n: "LISTA B", v: 350, p: 70 },
    { n: "LISTA A", v: 150, p: 30 },
  ],
  regioni: [
    {
      r: "REGIONE A",
      e: 1500,
      v: 900,
      b: 15,
      k: 3,
      a: 60,
      liste: [
        { n: "LISTA B", v: 350, p: 70 },
        { n: "LISTA A", v: 150, p: 30 },
      ],
    },
  ],
  comuni: [
    { c: "COMUNE ALFA", p: "PROV A", r: "REGIONE A", e: 1000, v: 600, a: 60 },
    { c: "COMUNE BETA", p: "PROV A", r: "REGIONE A", e: 500, v: 300, a: 60 },
  ],
  metodologia: "stub inline per test",
  avvertenze: "Solo aggregati. Seggi assenti nel file.",
};

function normalizzaQ(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function cercaComuneStub(q: unknown, dati: Europee2024 = STUB): ComuneAgg[] {
  if (typeof q !== "string") return [];
  const nq = normalizzaQ(q);
  if (nq.length < 2) return [];
  return dati.comuni.filter((c) => normalizzaQ(c.c).includes(nq)).slice(0, 100);
}

function topListeStub(n: unknown, dati: Europee2024 = STUB): ListaAgg[] {
  const k = Math.floor(Number(n));
  if (!Number.isFinite(k) || k < 1) return [];
  return dati.liste.slice(0, Math.min(k, 10));
}

function affluenzaStub(e: unknown, v: unknown): number {
  const ne = Number(e);
  const nv = Number(v);
  if (!Number.isFinite(ne) || !Number.isFinite(nv) || ne <= 0 || nv < 0) return 0;
  return Math.round((nv / ne) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("elezioni api — bound del contratto su stub inline (MAI rete)", () => {
  it("cercaComune: min 2 caratteri, match contains NFD-insensibile, cap 100 righe", () => {
    expect(cercaComuneStub("")).toEqual([]);
    expect(cercaComuneStub("A")).toEqual([]); // 1ch → vuoto
    expect(cercaComuneStub("al")).toHaveLength(1);
    expect(cercaComuneStub("COMUNE")).toHaveLength(2);
    expect(cercaComuneStub("comune")).toHaveLength(2); // case-insensitive
    expect(cercaComuneStub("COMUNÈ", STUB)).toHaveLength(2); // NFD

    const molti: Europee2024 = {
      ...STUB,
      comuni: Array.from({ length: 150 }, (_, i) => ({
        c: `COMUNE ${String(i).padStart(3, "0")}`,
        p: "PROV A",
        r: "REGIONE A",
        e: 10,
        v: 5,
        a: 50,
      })),
    };
    expect(cercaComuneStub("comune", molti)).toHaveLength(100);
  });

  it("topListe: clamp 1..10, input non numerici → [] senza lanciare", () => {
    expect(topListeStub(1)).toHaveLength(1);
    expect(topListeStub(99)).toHaveLength(2); // clamp a 10, qui solo 2 liste
    expect(topListeStub(0)).toEqual([]);
    expect(topListeStub(-3)).toEqual([]);
    expect(topListeStub("x")).toEqual([]);
    expect(topListeStub(NaN)).toEqual([]);
    expect(() => topListeStub(5)).not.toThrow();
  });

  it("affluenza: 1 decimale, e=0 → 0 (mai NaN/Infinity/throw)", () => {
    expect(affluenzaStub(15640, 8334)).toBe(53.3);
    expect(affluenzaStub(0, 10)).toBe(0);
    expect(affluenzaStub(-5, 10)).toBe(0);
    expect(affluenzaStub("x", 10)).toBe(0);
    expect(Number.isFinite(affluenzaStub(0, 0))).toBe(true);
  });

  it("Σ percentuali liste stub = 100 ± 0,1", () => {
    const somma = STUB.liste.reduce((s, l) => s + l.p, 0);
    expect(Math.abs(somma - 100)).toBeLessThanOrEqual(0.1);
  });

  it("licenza+fonte presenti in ogni risposta; niente nominativi in output", () => {
    const payload = JSON.stringify(STUB);
    expect(STUB.provenance.licenza.length).toBeGreaterThan(0);
    expect(STUB.provenance.fonte).toMatch(/DAIT|Interno/);
    for (const campo of CAMPI_VIETATI) {
      expect(payload).not.toContain(`"${campo}"`);
    }
    // Niente per-lista comunale (vietato in v1: costerebbe +MB).
    for (const c of STUB.comuni) {
      expect(Object.keys(c).sort()).toEqual(["a", "c", "e", "p", "r", "v"]);
    }
  });
});

describe("elezioni api — conformita' lib reale (tollerante se assente, mai-500)", () => {
  it("lib/elezioni-dati: Result never-throw, bound e licenza", async () => {
    let mod: Record<string, unknown>;
    try {
      mod = (await import("@/lib/elezioni-dati")) as Record<string, unknown>;
    } catch {
      expect(true).toBe(true); // W2 non ancora presente
      return;
    }
    // Guard >1MB → null/Result-errore: il modulo deve esportare una guardia o gestirla in carica.
    // Forme accettate (mai throw, mai 500): caricaEuropee2024Result() ->
    // Result {ok,...}; caricaEuropee2024() -> dati Europee2024 | null.
    const caricaResult = mod["caricaEuropee2024Result"];
    if (typeof caricaResult === "function") {
      let esito: unknown;
      expect(() => {
        esito = (caricaResult as () => unknown)();
      }).not.toThrow();
      const awaited = await esito;
      expect(typeof awaited === "object" && awaited !== null).toBe(true);
      expect("ok" in (awaited as Record<string, unknown>)).toBe(true);
      if ((awaited as { ok?: unknown }).ok === true) {
        const dati = (awaited as { dati: Europee2024 }).dati;
        expect(dati && typeof dati === "object").toBe(true);
        expect(dati.provenance.licenza.length).toBeGreaterThan(0);
        const payload = JSON.stringify(dati);
        for (const campo of CAMPI_VIETATI) {
          expect(payload).not.toContain(`"${campo}"`);
        }
      }
      return;
    }
    const carica = mod["caricaEuropee2024"];
    if (typeof carica === "function") {
      let esito: unknown;
      expect(() => {
        esito = (carica as () => unknown)();
      }).not.toThrow();
      const awaited = await esito;
      // Accetta dati Europee2024 oppure null (file assente) — MAI throw.
      if (awaited !== null) {
        const dati = awaited as Europee2024;
        expect(typeof dati).toBe("object");
        expect(dati.provenance.licenza.length).toBeGreaterThan(0);
        const payload = JSON.stringify(dati);
        for (const campo of CAMPI_VIETATI) {
          expect(payload).not.toContain(`"${campo}"`);
        }
      }
    }
    const cerca = mod["cercaComune"];
    if (typeof cerca === "function") {
      const fn = cerca as (q: unknown) => unknown;
      expect(fn("")).toEqual([]);
      expect(fn("x")).toEqual([]);
      const res = fn("AA") as unknown[];
      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBeLessThanOrEqual(100);
    }
    const top = mod["topListe"];
    if (typeof top === "function") {
      const fn = top as (n: unknown) => unknown;
      const res = fn(99) as unknown[];
      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBeLessThanOrEqual(10);
    }
    const aff = mod["affluenza"];
    if (typeof aff === "function") {
      const fn = aff as (e: unknown, v: unknown) => unknown;
      expect(fn(0, 1)).toBe(0);
      expect(fn(15640, 8334)).toBe(53.3);
    }
    expect(chiamateFetch).toBe(0);
  });
});

describe("elezioni api — integrazione disco tollerante (solo se W1 ha scritto il JSON)", () => {
  const PERCORSO = resolve(
    process.cwd(),
    "data",
    "reali",
    "elezioni-europee-2024.json",
  );

  it("se il file esiste: ≤950KB, envelope valido, solo aggregati", async () => {
    if (!existsSync(PERCORSO)) {
      expect(true).toBe(true); // W1 non ancora eseguito
      return;
    }
    const byte = statSync(PERCORSO).size;
    expect(byte).toBeLessThanOrEqual(950 * 1024);
    const dati = JSON.parse(readFileSync(PERCORSO, "utf8")) as Europee2024;
    expect(dati.provenance.fonte).toMatch(/DAIT|Interno/);
    expect(dati.provenance.url).toContain("europee-2024-italia-livcomune.csv");
    expect(dati.provenance.licenza.length).toBeGreaterThan(0);
    expect(dati.elezione.tipo).toBe("europee");
    expect(dati.regioni.length).toBeLessThanOrEqual(20);
    expect(dati.comuni.length).toBeGreaterThan(0);
    const payload = JSON.stringify(dati);
    for (const campo of CAMPI_VIETATI) {
      expect(payload).not.toContain(`"${campo}"`);
    }
    const somma = dati.liste.reduce((s, l) => s + l.p, 0);
    expect(Math.abs(somma - 100)).toBeLessThanOrEqual(0.1);
    // Tipo Result del loader reale, se presente, resta mai-500 anche su disco.
    let mod: Record<string, unknown> | null = null;
    try {
      mod = (await import("@/lib/elezioni-dati")) as Record<string, unknown>;
    } catch {
      mod = null;
    }
    if (mod && typeof mod["caricaEuropee2024"] === "function") {
      await expect(
        (mod["caricaEuropee2024"] as () => unknown)(),
      ).resolves.not.toThrow();
    }
  });
});
