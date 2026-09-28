import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LawRecordExtra } from "@/lib/db";
import { SEED_LAWS } from "@/lib/seed-data";

vi.mock("@/lib/db", () => ({
  getLawByEli: vi.fn(),
  getLawsFromDBorSeed: vi.fn(),
}));

import { getLawByEli } from "@/lib/db";
import { GET as lawGET } from "@/app/api/leggi/[...eli]/route";
import { normalizeLaw } from "@/components/seed-fallback";

function recordSenzaOverride(): LawRecordExtra {
  const base = SEED_LAWS.find((law) => law.numero === "124");
  if (!base) throw new Error("seed 124 assente");
  return { ...base, qualita: 77 } as LawRecordExtra;
}

const PARZIALE: LawRecordExtra = {
  ...recordSenzaOverride(),
  semplificata: {
    in10Secondi: "Parziale",
    perTe: { guida: "solo guida" },
    cosaFare: ["x"],
    statoLavora: { colore: "verde", motivo: "ok" },
    proContro: { pro: ["p"], contro: ["c"] },
    gulpease: 50,
  },
};

beforeEach(() => {
  vi.mocked(getLawByEli).mockReset();
  vi.mocked(getLawByEli).mockResolvedValue(PARZIALE);
});

describe("parita' API <-> UI (stored vs derived)", () => {
  it("la route completa le chiavi perTe mancanti", async () => {
    const res = await lawGET(
      new Request("http://localhost/api/leggi/eli/id/2025/12/19/25G00134/sg"),
      {
        params: Promise.resolve({
          eli: ["eli", "id", "2025", "12", "19", "25G00134", "sg"],
        }),
      },
    );
    const data = (await res.json()) as {
      simplified: { perTe: Record<string, string> };
      quality: { totale: number };
      memorizzata: boolean;
    };

    expect(res.status).toBe(200);
    expect(data.memorizzata).toBe(true);
    expect(Object.keys(data.simplified.perTe).sort()).toEqual([
      "guida",
      "impresa",
      "lavoro",
      "studio",
    ]);
    expect(data.simplified.perTe.guida).toBe("solo guida");
  });

  it("API e normalizeLaw concordano sulla qualita' memorizzata", async () => {
    const res = await lawGET(
      new Request("http://localhost/api/leggi/eli/id/2025/12/19/25G00134/sg"),
      {
        params: Promise.resolve({
          eli: ["eli", "id", "2025", "12", "19", "25G00134", "sg"],
        }),
      },
    );
    const data = (await res.json()) as { quality: { totale: number } };
    const atteso = normalizeLaw(PARZIALE).qualita;

    expect(atteso).toBe(77);
    expect(data.quality.totale).toBe(77);
    expect(data.quality.totale).toBe(atteso);
  });

  it("una qualita' non finita viene ricalcolata da entrambe le parti", async () => {
    const invalido = { ...PARZIALE, qualita: Number.NaN } as LawRecordExtra;
    vi.mocked(getLawByEli).mockResolvedValue(invalido);

    const res = await lawGET(
      new Request("http://localhost/api/leggi/eli/id/2025/12/19/25G00134/sg"),
      {
        params: Promise.resolve({
          eli: ["eli", "id", "2025", "12", "19", "25G00134", "sg"],
        }),
      },
    );
    const data = (await res.json()) as { quality: { totale: number } };

    expect(Number.isFinite(data.quality.totale)).toBe(true);
    expect(data.quality.totale).toBe(normalizeLaw(invalido).qualita);
  });
});
