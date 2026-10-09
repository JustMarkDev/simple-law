import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import sitemap from "@/app/sitemap";
import { getCorpusInfo, getSeedLaws } from "@/lib/sources";

const sorgenteSitemap = readFileSync(
  fileURLToPath(new URL("../app/sitemap.ts", import.meta.url)),
  "utf8",
);

function chiaveEliNormalizzata(eli: string): string {
  let v = eli;
  try {
    v = decodeURIComponent(v);
  } catch {
    // tieni originale
  }
  return v.toLowerCase().replace(/^\/+/, "").replace(/\/+$/, "");
}

describe("sitemap-copertura: intero corpus reale, ELI esistenti, mai 500", () => {
  it("non usa un cap hardcoded che tronca (niente LIMITE 5000 / totale scritto a mano)", () => {
    expect(sorgenteSitemap).toMatch(/getCorpusInfo|getSeedLaws/);
    expect(sorgenteSitemap).not.toMatch(/LIMITE_SITEMAP\s*=\s*5000/);
    expect(sorgenteSitemap).not.toContain("5941");
  });

  it("copre tutte le schede legge + le statiche, senza troncare", async () => {
    const { totale } = getCorpusInfo();
    expect(totale).toBe(getSeedLaws().length);
    expect(totale).toBeGreaterThan(5000);

    let urls: Awaited<ReturnType<typeof sitemap>> | null = null;
    let errore: unknown = null;
    try {
      urls = await sitemap();
    } catch (e) {
      errore = e;
    }
    expect(errore, "sitemap() ha lanciato (deve mai-500)").toBeNull();
    expect(Array.isArray(urls)).toBe(true);

    const voci = urls ?? [];
    const statiche = voci.filter((v) => !v.url.includes("/leggi/"));
    const dinamiche = voci.filter((v) => v.url.includes("/leggi/"));
    // 28 pagine istituzionali fisse
    expect(statiche.length).toBe(28);
    // copertura totale: una voce per ogni atto del corpus
    expect(dinamiche.length).toBe(totale);
    expect(voci.length).toBe(28 + totale);
  });

  it("ogni URL /leggi/ usa uno slug ELI esistente, unico e ben formato", async () => {
    const corpus = getSeedLaws();
    const eliNoti = new Set(corpus.map((l) => chiaveEliNormalizzata(l.eli)));
    const urls = await sitemap();
    const dinamiche = urls.filter((v) => v.url.includes("/leggi/"));

    const visti = new Set<string>();
    for (const voce of dinamiche) {
      const parsed = new URL(voce.url);
      expect(parsed.protocol).toBe("https:");
      const path = parsed.pathname;
      expect(path.startsWith("/leggi/")).toBe(true);
      expect(path).not.toContain("//");
      const slug = path.replace(/^\/leggi\//, "").replace(/\/+$/, "");
      expect(slug.length).toBeGreaterThan(0);
      // slug esistente nel corpus (confronto case-insensitive, decode)
      expect(eliNoti.has(chiaveEliNormalizzata(slug))).toBe(true);
      const chiave = slug.toLowerCase();
      expect(visti.has(chiave), `ELI duplicato in sitemap: ${slug}`).toBe(false);
      visti.add(chiave);
    }
    expect(visti.size).toBe(dinamiche.length);
  });
});
