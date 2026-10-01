/**
 * Refresh reali (W4): freschezza dei file tempo-sensibili, zero rete.
 *
 * File refreshabili: governo-comunicati.json (giornaliera), gazzetta-ultime.json
 * (quotidiana feriale), sondaggi-nazionali.json (settimanale/mensile).
 * Ogni controllo e' offline: solo lettura disco + MANIFEST, mai fetch.
 * UI e messaggi in italiano.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Guardia anti-rete: qualsiasi fetch fallisce subito il test.
// Orologio congelato al 2026-09-29: le soglie di freschezza (7/31 giorni)
// restano deterministiche per sempre, senza dipendere dalla data reale.
// ---------------------------------------------------------------------------
let chiamateFetch = 0;
beforeEach(() => {
  chiamateFetch = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      chiamateFetch += 1;
      throw new Error("rete vietata in tests/refresh-reali.test.ts");
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const RADICE = process.cwd();
const PERCORSO_MANIFEST = join(RADICE, "data", "reali", "MANIFEST.json");

interface VoceManifest {
  readonly file: string;
  readonly conteggio: number;
  readonly recuperatoIl: string;
}

function giorniDa(dataIso: string, ora: number): number | null {
  try {
    const t = String(dataIso ?? "").trim();
    if (!t) return null;
    // Accetta sia ISO completo sia data sola YYYY-MM-DD.
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T00:00:00Z` : t;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return null;
    return (ora - ms) / 86_400_000;
  } catch {
    return null;
  }
}

function leggiJson(percorso: string): Record<string, unknown> | null {
  try {
    if (!existsSync(percorso)) return null;
    const raw = readFileSync(percorso, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function vociManifest(): VoceManifest[] {
  try {
    const parsed = leggiJson(PERCORSO_MANIFEST) as { fonti?: unknown } | null;
    const fonti = (parsed?.fonti ?? []) as unknown;
    if (!Array.isArray(fonti)) return [];
    const voci: VoceManifest[] = [];
    for (const v of fonti) {
      try {
        if (!v || typeof v !== "object" || Array.isArray(v)) continue;
        const r = v as Record<string, unknown>;
        if (typeof r["file"] !== "string") continue;
        voci.push({
          file: r["file"] as string,
          conteggio: typeof r["conteggio"] === "number" ? (r["conteggio"] as number) : -1,
          recuperatoIl: typeof r["recuperatoIl"] === "string" ? (r["recuperatoIl"] as string) : "",
        });
      } catch {
        // Voce malformata: ignorata, mai lanciare.
      }
    }
    return voci;
  } catch {
    return [];
  }
}

function provenanceDi(envelope: Record<string, unknown> | null): Record<string, unknown> {
  try {
    const p = envelope?.["provenance"];
    if (!p || typeof p !== "object" || Array.isArray(p)) return {};
    return p as Record<string, unknown>;
  } catch {
    return {};
  }
}

describe("refresh reali: freschezza file tempo-sensibili (zero rete)", () => {
  it("governo-comunicati.json aggiornato entro 7 giorni e coerente con MANIFEST", () => {
    const percorso = join(RADICE, "data", "reali", "governo-comunicati.json");
    expect(existsSync(percorso)).toBe(true);
    expect(statSync(percorso).size).toBeLessThanOrEqual(1024 * 1024);
    const envelope = leggiJson(percorso);
    expect(envelope).not.toBeNull();
    const comunicati = envelope?.["comunicati"];
    expect(Array.isArray(comunicati)).toBe(true);
    const n = (comunicati as unknown[]).length;
    expect(n).toBeGreaterThan(0);
    const prov = provenanceDi(envelope);
    expect(prov["url"]).toBe("https://www.governo.it/it/feed/rss");
    expect(String(prov["licenza"] ?? "")).not.toBe("");
    const eta = giorniDa(String(prov["recuperatoIl"] ?? ""), Date.now());
    expect(eta).not.toBeNull();
    expect(eta as number).toBeLessThanOrEqual(7);
    const voce = vociManifest().find((v) => v.file === "governo-comunicati.json");
    expect(voce).toBeDefined();
    expect(voce?.conteggio).toBe(n);
    expect(voce?.recuperatoIl).toBe(String(prov["recuperatoIl"] ?? ""));
    expect(chiamateFetch).toBe(0);
  });

  it("gazzetta-ultime.json aggiornata entro 7 giorni e coerente con MANIFEST", () => {
    const percorso = join(RADICE, "data", "reali", "gazzetta-ultime.json");
    expect(existsSync(percorso)).toBe(true);
    expect(statSync(percorso).size).toBeLessThanOrEqual(1024 * 1024);
    const envelope = leggiJson(percorso);
    expect(envelope).not.toBeNull();
    const atti = envelope?.["atti"];
    expect(Array.isArray(atti)).toBe(true);
    const n = (atti as unknown[]).length;
    expect(n).toBeGreaterThan(0);
    const prov = provenanceDi(envelope);
    expect(prov["url"]).toBe("https://www.gazzettaufficiale.it/rss/SG");
    expect(String(prov["licenza"] ?? "")).not.toBe("");
    const eta = giorniDa(String(prov["recuperatoIl"] ?? ""), Date.now());
    expect(eta).not.toBeNull();
    expect(eta as number).toBeLessThanOrEqual(7);
    const voce = vociManifest().find((v) => v.file === "gazzetta-ultime.json");
    expect(voce).toBeDefined();
    expect(voce?.conteggio).toBe(n);
    expect(voce?.recuperatoIl).toBe(String(prov["recuperatoIl"] ?? ""));
    expect(chiamateFetch).toBe(0);
  });

  it("sondaggi-nazionali.json aggiornato entro 31 giorni e coerente con MANIFEST", () => {
    const percorso = join(RADICE, "data", "reali", "sondaggi-nazionali.json");
    expect(existsSync(percorso)).toBe(true);
    expect(statSync(percorso).size).toBeLessThanOrEqual(950 * 1024);
    const envelope = leggiJson(percorso);
    expect(envelope).not.toBeNull();
    const sondaggi = envelope?.["sondaggi"];
    expect(Array.isArray(sondaggi)).toBe(true);
    const n = (sondaggi as unknown[]).length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(60);
    const prov = provenanceDi(envelope);
    expect(prov["pageid"]).toBe(71355617);
    expect(prov["licenza"]).toBe("CC BY-SA 4.0");
    // Data di riferimento: estratto_il, poi revisione_timestamp.
    const riferimento = String(
      prov["estratto_il"] ?? prov["revisione_timestamp"] ?? prov["recuperatoIl"] ?? "",
    );
    const eta = giorniDa(riferimento, Date.now());
    expect(eta).not.toBeNull();
    expect(eta as number).toBeLessThanOrEqual(31);
    const voce = vociManifest().find((v) => v.file === "sondaggi-nazionali.json");
    expect(voce).toBeDefined();
    expect(voce?.conteggio).toBe(n);
    expect(chiamateFetch).toBe(0);
  });

  it("helper mai-lancio su input malformati", () => {
    expect(() => giorniDa(null as never, Date.now())).not.toThrow();
    expect(() => leggiJson("/percorso/inesistente.json")).not.toThrow();
    expect(() => vociManifest()).not.toThrow();
    expect(() => provenanceDi(null)).not.toThrow();
    expect(giorniDa("", Date.now())).toBeNull();
    expect(giorniDa("non-una-data", Date.now())).toBeNull();
    expect(provenanceDi(null)).toEqual({});
    expect(chiamateFetch).toBe(0);
  });
});
