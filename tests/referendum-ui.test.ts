/**
 * Test referendum 2025 in UI/API (fixture reale su disco, tollerante se
 * assente; zero rete). Copre le decisioni prese in REALI-7: coercizione
 * numeri-stringa DAIT, mai-500 dell'API, coerenza SI/NO.
 */

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  azzeraCacheReferendum,
  caricaReferendum2025,
  caricaReferendum2025Result,
  cercaComuneReferendum,
  PERCORSO_REFERENDUM_2025,
} from "@/lib/elezioni-dati";
import { GET as referendumGET } from "@/app/api/elezioni/referendum-2025/route";

const PERCORSO = join(process.cwd(), PERCORSO_REFERENDUM_2025);

function discoPresente(): boolean {
  try {
    return existsSync(PERCORSO);
  } catch {
    return false;
  }
}

describe("referendum 2025 — loader (tollerante se assente)", () => {
  it("never-throw e azzera-cache", async () => {
    expect(() => azzeraCacheReferendum()).not.toThrow();
    let dati: unknown = "non-chiamato";
    expect(async () => {
      dati = await caricaReferendum2025();
    }).not.toThrow();
    await caricaReferendum2025();
    expect(dati === null || typeof dati === "object").toBe(true);
  });

  it("se il file esiste: 5 quesiti numerici coerenti, 20 regioni, 7896 comuni", async () => {
    if (!discoPresente()) {
      expect(true).toBe(true);
      return;
    }
    azzeraCacheReferendum();
    const dati = await caricaReferendum2025();
    expect(dati).not.toBeNull();
    if (!dati) return;
    expect(dati.quesiti).toHaveLength(5);
    for (const q of dati.quesiti) {
      expect(typeof q.si).toBe("number");
      expect(typeof q.no).toBe("number");
      expect(q.si).toBeGreaterThan(0);
      expect(q.no).toBeGreaterThan(0);
      // p_si coerente con si/validi a 1 decimale.
      const atteso = q.validi > 0 ? Math.round((q.si / q.validi) * 100 * 10) / 10 : 0;
      expect(Math.abs(q.p_si - atteso)).toBeLessThanOrEqual(0.1);
    }
    expect(dati.regioni).toHaveLength(20);
    expect(dati.comuni).toHaveLength(7896);
    for (const c of dati.comuni.slice(0, 100)) {
      expect(Number.isFinite(c.e) && Number.isFinite(c.v) && Number.isFinite(c.a)).toBe(true);
    }
    expect(dati.provenance.licenza ?? "").not.toBe("");
  });

  it("cercaComuneReferendum bound e min-2 (mai throw)", () => {
    expect(cercaComuneReferendum(null as never, "roma")).toEqual([]);
    expect(cercaComuneReferendum([], "roma")).toEqual([]);
    expect(cercaComuneReferendum([], "x")).toEqual([]);
  });

  it("Result con motivo in italiano quando assente", async () => {
    const esito = await caricaReferendum2025Result();
    expect(typeof esito.ok).toBe("boolean");
    if (!esito.ok) expect(esito.errore.length).toBeGreaterThan(0);
  });
});

describe("referendum 2025 — API mai-500", () => {
  it("risponde 200 con quesiti oppure 404 onesto senza dati", async () => {
    const res = await referendumGET(
      new Request("http://localhost/api/elezioni/referendum-2025?q=roma&per=5"),
    );
    expect([200, 404].includes(res.status)).toBe(true);
    const corpo = (await res.json()) as {
      quesiti?: unknown[];
      comuni?: { items: unknown[]; total: number };
      licenza?: string;
    };
    expect(typeof corpo.licenza).toBe("string");
    if (res.status === 200) {
      expect(Array.isArray(corpo.quesiti)).toBe(true);
      expect(corpo.quesiti!.length).toBe(5);
      expect(corpo.comuni!.total).toBeGreaterThan(0);
      expect(corpo.comuni!.items.length).toBeLessThanOrEqual(5);
    }
  });

  it("q sotto 2 caratteri non filtra (mai 500)", async () => {
    const res = await referendumGET(new Request("http://localhost/api/elezioni/referendum-2025?q=x"));
    expect([200, 404].includes(res.status)).toBe(true);
  });
});
