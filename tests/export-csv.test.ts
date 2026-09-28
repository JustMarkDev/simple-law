import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LawRecordExtra } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  queryLaws: vi.fn(),
}));

import { queryLaws } from "@/lib/db";
import { GET as exportGET } from "@/app/api/export/route";

function row(titolo: string, numero = "1"): LawRecordExtra {
  return {
    eli: `/eli/id/2026/01/01/26G0000${numero}/sg`,
    nir: `urn:nir:stato:legge:2026-01-01;${numero}`,
    tipo: "legge",
    numero,
    dataEmanazione: "2026-01-01",
    titolo,
    sintesi: "Sintesi di prova.",
    stato: "in_vigore",
    gulpease: 50,
    fonti: null,
  };
}

beforeEach(() => {
  vi.mocked(queryLaws).mockReset();
});

describe("GET /api/export (CSV injection)", () => {
  it("antepone un apice alle celle che iniziano con = + - @", async () => {
    vi.mocked(queryLaws).mockResolvedValue([
      row("=cmd|' /C calc'!A0", "1"),
      row("+39 06 1234", "2"),
      row("-2+3", "3"),
      row("@SUM(1)", "4"),
      row("Titolo normale", "5"),
    ]);

    const res = await exportGET(new Request("http://localhost/api/export"));
    const csv = await res.text();

    expect(res.status).toBe(200);
    expect(csv).toContain("eli,nir,tipo");
    expect(csv).toContain("'=cmd|' /C calc'!A0");
    expect(csv).toContain("'+39 06 1234");
    expect(csv).toContain("'-2+3");
    expect(csv).toContain("'@SUM(1)");
    expect(csv).toContain("Titolo normale");
    expect(csv).not.toContain("'Titolo normale");
  });

  it("mantiene il quoting delle celle che contengono virgole dopo la protezione", async () => {
    vi.mocked(queryLaws).mockResolvedValue([row("=1,2", "1")]);

    const csv = await (await exportGET(new Request("http://localhost/api/export"))).text();

    expect(csv).toContain('"\'=1,2"');
  });
});
