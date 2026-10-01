import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  getLawByEli,
  getLawsFromDBorSeed,
  getMinisterBySlug,
  getPrisma,
  listMinisters,
  persistLaws,
  recordIngestRun,
  resetPrisma,
} from "@/lib/db";
import { getSeedLaws } from "@/lib/sources";

const ELI = "/eli/id/2026/07/27/26G00155/sg";
const NIR = "urn:nir:stato:decreto.legge:2026-07-27;133";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  resetPrisma();
});

describe("getPrisma", () => {
  it("restituisce null senza DATABASE_URL", () => {
    expect(getPrisma()).toBeNull();
  });
});

describe("letture con fallback seed", () => {
  it("restituisce le leggi seed", async () => {
    const leggi = await getLawsFromDBorSeed();
    expect(leggi.length).toBe(getSeedLaws().length);
  });

  it("trova una legge per ELI", async () => {
    const legge = await getLawByEli(ELI);
    expect(legge?.numero).toBe("133");
    expect(legge?.tipo).toBe("decreto.legge");
  });

  it("trova una legge per URL Normattiva", async () => {
    const legge = await getLawByEli(`https://www.normattiva.it${ELI}`);
    expect(legge?.eli).toBe(ELI);
  });

  it("trova una legge per ELI ignorando le maiuscole", async () => {
    const legge = await getLawByEli("/ELI/ID/2026/07/27/26G00155/SG");
    expect(legge?.eli).toBe(ELI);
    expect(legge?.numero).toBe("133");
  });

  it("trova una legge per NIR", async () => {
    const legge = await getLawByEli(NIR);
    expect(legge?.eli).toBe(ELI);
  });

  it("restituisce null per un ELI sconosciuto", async () => {
    expect(await getLawByEli("/eli/id/1999/01/01/00X00000/xx")).toBeNull();
    expect(await getLawByEli("")).toBeNull();
  });

  it("elenca 8 ministri", async () => {
    const ministri = await listMinisters();
    expect(ministri).toHaveLength(8);
    expect(ministri.map((m) => m.slug)).toContain("meloni");
  });

  it("trova un ministro per slug ignorando le maiuscole", async () => {
    const ministro = await getMinisterBySlug("GIORGETTI");
    expect(ministro?.nome).toBe("Giancarlo Giorgetti");
    expect(await getMinisterBySlug("inesistente")).toBeNull();
  });
});

describe("scritture senza DB", () => {
  it("persistLaws restituisce 0", async () => {
    expect(await persistLaws(getSeedLaws())).toBe(0);
  });

  it("recordIngestRun restituisce false", async () => {
    expect(await recordIngestRun({ source: "test", status: "ok" })).toBe(false);
  });
});
