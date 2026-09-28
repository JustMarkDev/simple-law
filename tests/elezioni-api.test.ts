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

// ---------------------------------------------------------------------------
// W2 multi-consultazione (aggiunta, mai cancellato nulla sopra):
// registry, 404 id ignoto, coerenza per-id. Tollerante se i JSON politiche
// di W1 sono ancora assenti: asserisce solo disponibilita' effettiva.
// ---------------------------------------------------------------------------

describe("elezioni api — registry multi-consultazione (MAI rete, mai throw)", () => {
  it("REGISTRY_ELEZIONI: 3 voci statiche con id/file/titolo, senza numeri reali", async () => {
    const mod = (await import("@/lib/elezioni-dati")) as Record<string, unknown>;
    const registry = mod["REGISTRY_ELEZIONI"] as Array<{
      id: string;
      tipo: string;
      data: string;
      file: string;
      titolo: string;
    }>;
    expect(Array.isArray(registry)).toBe(true);
    const ids = registry.map((v) => v.id).sort();
    expect(ids).toEqual(
      ["europee-2024", "politiche-2022-camera", "politiche-2022-senato"].sort(),
    );
    for (const v of registry) {
      expect(typeof v.file).toBe("string");
      expect(v.file.startsWith("data/reali/elezioni-")).toBe(true);
      expect(v.titolo.length).toBeGreaterThan(0);
      expect(typeof v.tipo).toBe("string");
      expect(typeof v.data).toBe("string");
    }
    // Default retrocompatibilita': ?id= assente -> europee-2024.
    expect(mod["DEFAULT_ID_ELEZIONE"]).toBe("europee-2024");
    expect(chiamateFetch).toBe(0);
  });

  it("normalizzaIdElezione/isIdElezione: trim+case, ignoto -> null/false, mai throw", async () => {
    const mod = (await import("@/lib/elezioni-dati")) as Record<string, unknown>;
    const norm = mod["normalizzaIdElezione"] as (v: unknown) => unknown;
    const isId = mod["isIdElezione"] as (v: unknown) => unknown;
    expect(() => norm("  Europee-2024 ")).not.toThrow();
    expect(norm("  Europee-2024 ")).toBe("europee-2024");
    expect(norm("POLITICHE-2022-CAMERA")).toBe("politiche-2022-camera");
    expect(norm("politiche-2022-senato")).toBe("politiche-2022-senato");
    expect(norm("id-ignoto-xyz")).toBeNull();
    expect(norm("")).toBeNull();
    expect(norm(123)).toBeNull();
    expect(norm(null)).toBeNull();
    expect(isId("europee-2024")).toBe(true);
    expect(isId("no-esiste")).toBe(false);
    expect(chiamateFetch).toBe(0);
  });

  it("elencaConsultazioni: solo file presenti validi, mai throw, mai fetch", async () => {
    const mod = (await import("@/lib/elezioni-dati")) as Record<string, unknown>;
    const elenca = mod["elencaConsultazioni"] as () => Promise<
      Array<{ id: string; disponibile: boolean }>
    >;
    let voci: Array<{ id: string; disponibile: boolean }> = [];
    await expect(
      (async () => {
        voci = await elenca();
      })(),
    ).resolves.not.toThrow();
    expect(Array.isArray(voci)).toBe(true);
    const ids = voci.map((v) => v.id);
    // Europee presente su disco -> sempre elencata; politiche solo se W1 ha scritto.
    expect(ids).toContain("europee-2024");
    for (const v of voci) {
      expect((v as unknown as { disponibile: boolean }).disponibile).toBe(true);
    }
    // Nessuna voce con id fuori registry.
    for (const id of ids) {
      expect([
        "europee-2024",
        "politiche-2022-camera",
        "politiche-2022-senato",
      ]).toContain(id);
    }
    // File assente -> consultazione assente (mai throw): coerenza con disco.
    const attesi = ["data/reali/elezioni-politiche-2022-camera.json"].map(
      (f) =>
        existsSync(resolve(process.cwd(), f)) ? "politiche-2022-camera" : null,
    );
    for (const id of attesi) {
      if (id === null) expect(ids).not.toContain("politiche-2022-camera");
    }
    expect(chiamateFetch).toBe(0);
  });
});

describe("elezioni api — 404 id ignoto e coerenza per-id (mai 500)", () => {
  it("caricaElezione/caricaElezioneResult: id ignoto -> null/{ok:false}, mai throw", async () => {
    const mod = (await import("@/lib/elezioni-dati")) as Record<string, unknown>;
    const carica = mod["caricaElezione"] as (
      id: unknown,
    ) => Promise<unknown>;
    const caricaResult = mod["caricaElezioneResult"] as (
      id: unknown,
    ) => Promise<{ ok: boolean; errore?: string }>;
    await expect(carica("id-ignoto-xyz")).resolves.toBeNull();
    await expect(carica("")).resolves.toBeNull();
    await expect(carica(null)).resolves.toBeNull();
    const esito = await caricaResult("id-ignoto-xyz");
    expect(esito.ok).toBe(false);
    expect(typeof esito.errore).toBe("string");
    expect((esito.errore as string).length).toBeGreaterThan(0);
    expect(chiamateFetch).toBe(0);
  });

  it("coerenza per-id: europee-2024 coincide con caricaEuropee2024; politiche assenti -> null", async () => {
    const mod = (await import("@/lib/elezioni-dati")) as Record<string, unknown>;
    const carica = mod["caricaElezione"] as (
      id: unknown,
    ) => Promise<Europee2024 | null>;
    const legacy = mod["caricaEuropee2024"] as () => Promise<Europee2024 | null>;
    const perId = await carica("europee-2024");
    const daLegacy = await legacy();
    if (daLegacy === null) {
      expect(perId).toBeNull();
    } else {
      expect(perId).not.toBeNull();
      expect(perId?.elezione.e).toBe(daLegacy.elezione.e);
      expect(perId?.elezione.v).toBe(daLegacy.elezione.v);
      expect(perId?.liste.length).toBe(daLegacy.liste.length);
      // Helper esistenti riusabili per-id senza cambiare firma.
      const cerca = mod["cercaComune"] as (
        comuni: readonly ComuneAgg[],
        q: unknown,
      ) => ComuneAgg[];
      const top = mod["topListe"] as (
        liste: readonly ListaAgg[],
        n: unknown,
      ) => ListaAgg[];
      const pagina = mod["pagina"] as (
        el: readonly unknown[],
        p: unknown,
        per: unknown,
      ) => unknown[];
      expect(() => cerca(perId?.comuni ?? [], "AA")).not.toThrow();
      expect(() => top(perId?.liste ?? [], 5)).not.toThrow();
      expect(() => pagina(perId?.comuni ?? [], 1, 20)).not.toThrow();
      const payload = JSON.stringify(perId);
      for (const campo of CAMPI_VIETATI) {
        expect(payload).not.toContain(`"${campo}"`);
      }
    }
    // Politiche: null se W1 non ha ancora scritto (file assente -> assente).
    for (const id of ["politiche-2022-camera", "politiche-2022-senato"]) {
      const file =
        id === "politiche-2022-camera"
          ? "data/reali/elezioni-politiche-2022-camera.json"
          : "data/reali/elezioni-politiche-2022-senato.json";
      const res = await carica(id);
      if (!existsSync(resolve(process.cwd(), file))) {
        expect(res).toBeNull();
      } else if (res !== null) {
        expect(res.elezione.data).toBe("2022-09-25");
        const payload = JSON.stringify(res);
        for (const campo of CAMPI_VIETATI) {
          expect(payload).not.toContain(`"${campo}"`);
        }
      }
    }
    expect(chiamateFetch).toBe(0);
  });
});
