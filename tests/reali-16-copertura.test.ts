/**
 * REALI-16 — copertura storica 1861-2026 (zero rete).
 * Ogni anno deve comparire in un file `normattiva-storico-*.json`
 * (singolo o range 1992-1993/2005-2006) cablato nel loader, con atti
 * veri e ELI unici. Mai inventare anni: il test fallisce se manca copertura.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getCorpusInfo, getSeedLaws } from "@/lib/sources";

const DIR_REALI = join(process.cwd(), "data", "reali");

function anniCoperti(nome: string): number[] {
  const m = /^normattiva-storico-(\d{4})(?:-(\d{4}))?\.json$/.exec(nome);
  if (!m) return [];
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  const out: number[] = [];
  for (let y = a; y <= b; y += 1) out.push(y);
  return out;
}

describe("reali-16: copertura storica completa 1861-2026", () => {
  it("ogni anno 1861-2025 ha una finestra storica dedicata (2026 via recenti+GU)", () => {
    const files = readdirSync(DIR_REALI).filter((f) => f.startsWith("normattiva-storico-"));
    const coperti = new Set<number>();
    for (const f of files) for (const y of anniCoperti(f)) coperti.add(y);
    const mancanti: number[] = [];
    for (let y = 1861; y <= 2025; y += 1) if (!coperti.has(y)) mancanti.push(y);
    expect(mancanti).toEqual([]);
    // Il 2026 corrente e' coperto come finestra modifiche + GU del giorno,
    // non come annata storica chiusa.
    expect(coperti.has(2026)).toBe(false);
    const recenti = JSON.parse(
      readFileSync(join(DIR_REALI, "normattiva-recenti.json"), "utf8"),
    ) as { atti?: unknown[] };
    expect(Array.isArray(recenti.atti) && recenti.atti.length).toBeGreaterThan(0);
  });

  it("corpus live interamente reale e sopra soglia", () => {
    const info = getCorpusInfo();
    expect(info.dimostrative).toBe(0);
    expect(info.reali).toBeGreaterThanOrEqual(4000);
    expect(info.totale).toBe(info.base + info.espansi);
    const leggi = getSeedLaws();
    expect(leggi.some((l) => (l.titolo ?? "").includes("Variante "))).toBe(false);
  });

  it("ogni finestra storica ha atti con ELI unici globali", () => {
    const files = readdirSync(DIR_REALI).filter((f) => f.startsWith("normattiva-storico-"));
    expect(files.length).toBeGreaterThanOrEqual(70);
    const visti = new Set<string>();
    let totale = 0;
    for (const f of files) {
      const d = JSON.parse(readFileSync(join(DIR_REALI, f), "utf8")) as {
        atti?: Array<{ eli?: string; titolo?: string }>;
      };
      const atti = Array.isArray(d.atti) ? d.atti : [];
      expect(atti.length).toBeGreaterThan(0);
      for (const a of atti) {
        const e = String(a.eli ?? "")
          .trim()
          .toLowerCase();
        expect(e.length).toBeGreaterThan(0);
        expect(visti.has(e)).toBe(false);
        visti.add(e);
        totale += 1;
      }
    }
    expect(totale).toBeGreaterThanOrEqual(3200);
  });
});
