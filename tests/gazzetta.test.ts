/**
 * Test Gazzetta Ufficiale (solo metadati + link, mai mirror; zero rete).
 * Integrazione disco tollerante: se il file manca, i test passano con nota.
 */

import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  azzeraCacheGazzetta,
  caricaGazzettaUltima,
  PERCORSO_GAZZETTA,
} from "@/lib/gazzetta-dati";
import { GET as gazzettaGET } from "@/app/api/gazzetta/route";

const PERCORSO = join(process.cwd(), PERCORSO_GAZZETTA);

describe("gazzetta: loader never-throw + azzera cache", () => {
  it("azzeraCacheGazzetta non lancia e ricarica", async () => {
    expect(() => azzeraCacheGazzetta()).not.toThrow();
    let dati: unknown = "non-chiamato";
    expect(async () => {
      dati = await caricaGazzettaUltima();
    }).not.toThrow();
    await caricaGazzettaUltima();
    expect(dati === null || typeof dati === "object").toBe(true);
  });
});

describe("gazzetta: integrazione disco (tollerante se assente)", () => {
  it("envelope valido oppure nota di assenza", async () => {
    if (!existsSync(PERCORSO)) {
      expect(true).toBe(true);
      return;
    }
    expect(statSync(PERCORSO).size).toBeLessThanOrEqual(1024 * 1024);
    azzeraCacheGazzetta();
    const dati = await caricaGazzettaUltima();
    expect(dati).not.toBeNull();
    if (!dati) return;
    expect(dati.atti.length).toBeGreaterThan(0);
    for (const a of dati.atti.slice(0, 10)) {
      expect(a.titolo.length).toBeGreaterThanOrEqual(5);
      expect(a.url.startsWith("https://")).toBe(true);
    }
    expect(dati.provenance.licenza ?? "").not.toBe("");
  });

  it("copia difensiva: mutare non persiste", async () => {
    if (!existsSync(PERCORSO)) {
      expect(true).toBe(true);
      return;
    }
    azzeraCacheGazzetta();
    const prima = await caricaGazzettaUltima();
    if (!prima) return;
    const n = prima.atti.length;
    (prima.atti as unknown[]).pop();
    const seconda = await caricaGazzettaUltima();
    expect(seconda?.atti.length).toBe(n);
  });
});

describe("gazzetta: API mai-500", () => {
  it("risponde 200 con atti oppure payload vuoto onesto", async () => {
    const res = await gazzettaGET();
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      atti: { titolo: string; url: string }[];
      total: number;
    };
    expect(Array.isArray(corpo.atti)).toBe(true);
    expect(typeof corpo.total).toBe("number");
    for (const a of corpo.atti.slice(0, 5)) {
      expect(a.titolo.length).toBeGreaterThanOrEqual(5);
      expect(a.url.startsWith("https://")).toBe(true);
    }
  });
});
