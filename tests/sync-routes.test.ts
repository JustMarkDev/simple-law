import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { SyncReport } from "@/lib/sync";

vi.mock("@/lib/sync", () => ({
  runStoricoSync: vi.fn(),
  runRecenteSync: vi.fn(),
}));

import { runRecenteSync, runStoricoSync } from "@/lib/sync";
import { GET as storicoGET } from "@/app/api/sync/storico/route";
import { GET as recenteGET } from "@/app/api/sync/recente/route";

function report(source: SyncReport["source"]): SyncReport {
  const ora = new Date().toISOString();
  return {
    source,
    ok: true,
    fetched: 0,
    simplified: 0,
    persisted: 0,
    collections: [],
    errors: [],
    notes: [],
    startedAt: ora,
    finishedAt: ora,
  };
}

interface StoricoCall {
  zipDir?: unknown;
  maxPages?: number;
  denominazioni?: string[];
}

function opzioniStorico(): StoricoCall {
  const chiamata = vi.mocked(runStoricoSync).mock.calls[0];
  return (chiamata?.[0] ?? {}) as StoricoCall;
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "");
  vi.mocked(runStoricoSync).mockReset();
  vi.mocked(runRecenteSync).mockReset();
  vi.mocked(runStoricoSync).mockResolvedValue(report("storico"));
  vi.mocked(runRecenteSync).mockResolvedValue(report("recente"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CRON_SECRET sulle route di sync", () => {
  it("senza CRON_SECRET lo storico resta aperto", async () => {
    const res = await storicoGET(new Request("http://localhost/api/sync/storico"));
    expect(res.status).toBe(200);
    expect(runStoricoSync).toHaveBeenCalledTimes(1);
  });

  it("con CRON_SECRET senza header risponde 401", async () => {
    vi.stubEnv("CRON_SECRET", "topsecret");
    const res = await storicoGET(new Request("http://localhost/api/sync/storico"));
    const data = (await res.json()) as { ok: boolean; error: string };
    expect(res.status).toBe(401);
    expect(data.ok).toBe(false);
    expect(runStoricoSync).not.toHaveBeenCalled();
  });

  it("con CRON_SECRET e header errato risponde 401", async () => {
    vi.stubEnv("CRON_SECRET", "topsecret");
    const res = await storicoGET(
      new Request("http://localhost/api/sync/storico", {
        headers: { authorization: "Bearer sbagliato" },
      }),
    );
    expect(res.status).toBe(401);
    expect(runStoricoSync).not.toHaveBeenCalled();
  });

  it("con CRON_SECRET e Bearer corretto procede", async () => {
    vi.stubEnv("CRON_SECRET", "topsecret");
    const res = await storicoGET(
      new Request("http://localhost/api/sync/storico", {
        headers: { authorization: "Bearer topsecret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(runStoricoSync).toHaveBeenCalledTimes(1);
  });

  it("recente e' protetta allo stesso modo", async () => {
    vi.stubEnv("CRON_SECRET", "topsecret");
    const mancante = await recenteGET(new Request("http://localhost/api/sync/recente"));
    expect(mancante.status).toBe(401);
    expect(runRecenteSync).not.toHaveBeenCalled();

    const corretto = await recenteGET(
      new Request("http://localhost/api/sync/recente", {
        headers: { authorization: "Bearer topsecret" },
      }),
    );
    expect(corretto.status).toBe(200);
    expect(runRecenteSync).toHaveBeenCalledTimes(1);
  });

  it("senza CRON_SECRET recente resta aperta", async () => {
    const res = await recenteGET(new Request("http://localhost/api/sync/recente"));
    expect(res.status).toBe(200);
    expect(runRecenteSync).toHaveBeenCalledTimes(1);
  });
});

describe("parametri dello storico", () => {
  it("limita maxPages a 10 e rispetta i valori entro il tetto", async () => {
    await storicoGET(new Request("http://localhost/api/sync/storico?maxPages=100"));
    expect(opzioniStorico().maxPages).toBe(10);

    vi.mocked(runStoricoSync).mockClear();
    await storicoGET(new Request("http://localhost/api/sync/storico?maxPages=3"));
    expect(opzioniStorico().maxPages).toBe(3);
  });

  it("non accetta zipDir: nessun input influenza il percorso di scrittura", async () => {
    await storicoGET(
      new Request(
        "http://localhost/api/sync/storico?zipDir=/tmp/attacco&collezioni=Collezione%20A",
      ),
    );
    const opzioni = opzioniStorico();
    expect(Object.prototype.hasOwnProperty.call(opzioni, "zipDir")).toBe(false);
    expect(opzioni.zipDir).toBeUndefined();
  });

  it("tronca le liste CSV a 20 voci da 80 caratteri e lo annota", async () => {
    const voceLunga = "x".repeat(100);
    const denominazioni = Array.from({ length: 25 }, () => voceLunga).join(",");
    const res = await storicoGET(
      new Request(
        `http://localhost/api/sync/storico?denominazioni=${encodeURIComponent(denominazioni)}`,
      ),
    );
    const data = (await res.json()) as { notes: string[] };
    const voci = opzioniStorico().denominazioni ?? [];

    expect(voci).toHaveLength(20);
    expect(voci.every((voce) => voce.length === 80)).toBe(true);
    expect(data.notes.some((nota) => nota.includes("troncato"))).toBe(true);
  });

  it("non annota nulla quando le liste rispettano i limiti", async () => {
    const res = await storicoGET(
      new Request("http://localhost/api/sync/storico?denominazioni=LEGGE,DECRETO-LEGGE"),
    );
    const data = (await res.json()) as { notes: string[] };
    expect(data.notes.some((nota) => nota.includes("troncato"))).toBe(false);
    expect(opzioniStorico().denominazioni).toEqual(["LEGGE", "DECRETO-LEGGE"]);
  });
});
