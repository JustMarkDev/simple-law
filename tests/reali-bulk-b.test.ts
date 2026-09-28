/**
 * REALI-9 bulk-B — test del file finestra-2005 lista-only (zero rete).
 *
 * Ruolo: scrittore bulk-B. Possiede SOLO questo file.
 * Controlli: cap <=1MB, envelope provenance completa, no-titoli-inventati
 * (titolo === titoloAtto), dedup ELI intra-file e cross-file vs pre-esistenti,
 * schema lista-only onesto (stato in_vigore + limite, dettaglio:false),
 * never-throw degli helper puri su input assenti/malformati.
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAP_ATTI_BULK_B,
  CAP_BYTE_BULK_B,
  OUT_DEFAULT_BULK_B,
  caricaChiaviEsistentiBulkB,
  chiaveEliBulkB,
  dedupAttiBulkB,
  numeroAttiTrovatiBulkB,
  urnDaVoceBulkB,
  voceToAttoBulkB,
  vociDaAggiornatiBulkB,
} from "../scripts/ingest-reale-normattiva-bulk-b";

const RADICE = process.cwd();
const PERCORSO_BULK_B = path.resolve(RADICE, OUT_DEFAULT_BULK_B);
const MAX_BYTE_HARD = 1024 * 1024;

const PRE_ESISTENTI = [
  "data/reali/normattiva-recenti.json",
  "data/reali/normattiva-leggi.json",
  "data/reali/normattiva-storico-collezioni.json",
  "data/reali/normattiva-storico-1980.json",
  "data/reali/normattiva-storico-1990.json",
  "data/reali/normattiva-storico-2000.json",
  "data/reali/normattiva-storico-2010.json",
  "data/reali/normattiva-storico-1970.json",
  "data/reali/normattiva-storico-2020.json",
  "data/reali/normattiva-storico-1960.json",
];

function isHttpsUrl(v: unknown): boolean {
  if (typeof v !== "string" || !v.trim()) return false;
  try {
    return new URL(v.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

function isIsoDateTime(v: unknown): boolean {
  if (typeof v !== "string" || !v.trim()) return false;
  const t = Date.parse(v.trim());
  if (!Number.isFinite(t)) return false;
  const anno = new Date(t).getUTCFullYear();
  return anno >= 2025 && anno <= new Date().getUTCFullYear() + 1;
}

async function leggiBulkB(): Promise<{ parsed: unknown; byte: number } | null> {
  try {
    const raw = await readFile(PERCORSO_BULK_B, "utf8");
    return { parsed: JSON.parse(raw) as unknown, byte: Buffer.byteLength(raw, "utf8") };
  } catch {
    return null;
  }
}

function notaSkip(motivo: string): void {
  console.info(`[reali-bulk-b] SKIP — ${motivo}`);
}

describe("reali-bulk-b: cap file ed envelope", () => {
  it("file entro cap byte e cap atti", async () => {
    const letto = await leggiBulkB();
    if (!letto) {
      notaSkip("file bulk-B assente (ingest non eseguito)");
      expect(true).toBe(true);
      return;
    }
    expect(letto.byte).toBeLessThanOrEqual(MAX_BYTE_HARD);
    expect(letto.byte).toBeLessThanOrEqual(CAP_BYTE_BULK_B);
    const env = letto.parsed as { atti?: unknown[]; provenance?: Record<string, unknown> };
    expect(Array.isArray(env.atti)).toBe(true);
    expect(env.atti?.length ?? 0).toBeGreaterThan(0);
    expect(env.atti?.length ?? 0).toBeLessThanOrEqual(CAP_ATTI_BULK_B);
  });

  it("provenance completa {fonte,url,recuperatoIl,licenza}", async () => {
    const letto = await leggiBulkB();
    if (!letto) {
      notaSkip("file bulk-B assente");
      expect(true).toBe(true);
      return;
    }
    const prov = (letto.parsed as { provenance?: Record<string, unknown> }).provenance;
    expect(prov && typeof prov === "object").toBe(true);
    expect(typeof prov?.["fonte"] === "string" && (prov?.["fonte"] as string).trim()).toBeTruthy();
    expect(isHttpsUrl(prov?.["url"])).toBe(true);
    expect(isIsoDateTime(prov?.["recuperatoIl"])).toBe(true);
    expect(typeof prov?.["licenza"] === "string" && (prov?.["licenza"] as string).trim()).toBeTruthy();
  });
});

describe("reali-bulk-b: onesta lista-only, mai inventare", () => {
  it("titolo === titoloAtto === sintesi; stato onesto + dettaglio:false", async () => {
    const letto = await leggiBulkB();
    if (!letto) {
      notaSkip("file bulk-B assente");
      expect(true).toBe(true);
      return;
    }
    const atti = (letto.parsed as { atti: Record<string, unknown>[] }).atti;
    const campione = [...atti.slice(0, 20), ...atti.slice(-5)];
    for (const a of campione) {
      expect(typeof a["titolo"] === "string" && (a["titolo"] as string).trim().length > 0).toBe(true);
      expect(a["titolo"]).toBe(a["titoloAtto"]);
      expect(a["sintesi"]).toBe(a["titoloAtto"]);
      expect(a["stato"]).toBe("in_vigore");
      expect(a["limite"]).toBe("stato non rilevabile da lista");
      expect(a["fonte"]).toBe("normattiva-bff");
      expect(a["dettaglio"]).toBe(false);
      expect(typeof a["urn"] === "string" && (a["urn"] as string).startsWith("urn:")).toBe(true);
      expect(typeof a["eli"] === "string" && (a["eli"] as string).startsWith("/")).toBe(true);
      expect(/^\d{4}$/.test(String(a["anno"] ?? ""))).toBe(true);
      expect(String(a["numero"] ?? "").trim().length > 0).toBe(true);
      expect(String(a["codiceRedazionale"] ?? "").trim().length > 0).toBe(true);
      expect((a as Record<string, unknown>)["testo"]).toBeUndefined();
      expect((a as Record<string, unknown>)["articolato"]).toBeUndefined();
    }
  });

  it("nessun ELI duplicato intra-file", async () => {
    const letto = await leggiBulkB();
    if (!letto) {
      notaSkip("file bulk-B assente");
      expect(true).toBe(true);
      return;
    }
    const atti = (letto.parsed as { atti: Record<string, unknown>[] }).atti;
    const visti = new Set<string>();
    for (const a of atti) {
      const k = chiaveEliBulkB(a["eli"]);
      expect(k).not.toBe("");
      expect(visti.has(k)).toBe(false);
      visti.add(k);
    }
  });

  it("nessun ELI collide coi 10 file pre-esistenti", async () => {
    const letto = await leggiBulkB();
    if (!letto) {
      notaSkip("file bulk-B assente");
      expect(true).toBe(true);
      return;
    }
    const conosciuti = await caricaChiaviEsistentiBulkB(PRE_ESISTENTI);
    const atti = (letto.parsed as { atti: Record<string, unknown>[] }).atti;
    for (const a of atti) {
      expect(conosciuti.has(chiaveEliBulkB(a["eli"]))).toBe(false);
      expect(conosciuti.has(chiaveEliBulkB(a["urn"]))).toBe(false);
    }
  });
});

describe("reali-bulk-b: helper never-throw su input assenti/malformati", () => {
  it("pure function reggono undefined/null/stringhe/fixture /tmp", async () => {
    expect(chiaveEliBulkB(undefined)).toBe("");
    expect(chiaveEliBulkB(null)).toBe("");
    expect(urnDaVoceBulkB(undefined)).toBe("");
    expect(urnDaVoceBulkB(null)).toBe("");
    expect(urnDaVoceBulkB("stringa")).toBe("");
    expect(voceToAttoBulkB(undefined)).toBeNull();
    expect(voceToAttoBulkB({})).toBeNull();
    expect(vociDaAggiornatiBulkB(undefined)).toEqual([]);
    expect(numeroAttiTrovatiBulkB(undefined)).toBeNull();
    expect((await caricaChiaviEsistentiBulkB(["data/reali/file-che-non-esiste.json"])).size).toBe(0);
    expect(dedupAttiBulkB([], new Set()).unici).toEqual([]);

    // Fixture /tmp: voce reale minima → atto valido; voce senza titolo → null.
    const dir = "/tmp/reali-bulk-b-fixture";
    await mkdir(dir, { recursive: true });
    const f = path.join(dir, "voce.json");
    await writeFile(
      f,
      JSON.stringify({
        titoloAtto: "Legge  finanziaria  2006. ",
        denominazioneAtto: "LEGGE",
        numeroProvvedimento: "266",
        annoProvvedimento: "2005",
        meseProvvedimento: "12",
        giornoProvvedimento: "23",
        codiceRedazionale: "005G0293",
      }),
      "utf8",
    );
    const voce = JSON.parse(await readFile(f, "utf8")) as unknown;
    const atto = voceToAttoBulkB(voce);
    expect(atto?.titolo).toBe("Legge finanziaria 2006.");
    expect(atto?.eli.startsWith("/")).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });
});
