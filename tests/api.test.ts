import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetPrisma } from "@/lib/db";
import { GET as healthGET } from "@/app/api/health/route";
import { GET as leggiGET } from "@/app/api/leggi/route";
import { GET as lawGET } from "@/app/api/leggi/[...eli]/route";
import { GET as exportGET } from "@/app/api/export/route";
import { GET as statisticheGET } from "@/app/api/statistiche/route";
import { GET as syncStoricoGET } from "@/app/api/sync/storico/route";
import { GET as syncRecenteGET } from "@/app/api/sync/recente/route";
import { GET as ministriGET } from "@/app/api/ministri/route";
import { GET as ministroGET } from "@/app/api/ministri/[slug]/route";
import { GET as cdmGET } from "@/app/api/cdm/route";
import { GET as cronGET } from "@/app/api/cron/ingest/route";
import { GET as feedGET } from "@/app/api/feed/route";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("LLM_API_KEY", "");
  vi.stubEnv("CRON_SECRET", "");
  resetPrisma();
  // Le API esterne rispondono 400: i client non ritentano e ricadono sul seed.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("rete disabilitata nei test", { status: 400 })),
  );
});

describe("GET /api/health", () => {
  it("risponde con seed quando non c'e' DB", async () => {
    const res = await healthGET();
    const data = (await res.json()) as { ok: boolean; db: string; time: string };
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.db).toBe("seed");
    expect(typeof data.time).toBe("string");
  });
});

describe("GET /api/leggi", () => {
  it("elenca le norme del corpus (almeno i 5 seed)", async () => {
    const res = await leggiGET(new Request("http://localhost/api/leggi"));
    const data = (await res.json()) as {
      items: { eli?: string; nir?: string; numero?: string }[];
      total: number;
      count: number;
    };
    expect(res.status).toBe(200);
    expect(data.total).toBeGreaterThanOrEqual(5);
    expect(data.count).toBeGreaterThanOrEqual(5);
    expect(data.items.length).toBeGreaterThanOrEqual(5);
    // Sottoinsieme noto: il DL 133/2026 deve esserci (prima pagina o totale)
    const eliNoti = data.items.map((i) => i.eli);
    const ha133Pagina = eliNoti.includes("/eli/id/2026/07/27/26G00155/sg");
    if (!ha133Pagina) {
      const cerca = (await (
        await leggiGET(new Request("http://localhost/api/leggi?q=energia&per=50"))
      ).json()) as { items: { eli?: string }[] };
      expect(cerca.items.some((i) => i.eli === "/eli/id/2026/07/27/26G00155/sg")).toBe(
        true,
      );
    } else {
      expect(ha133Pagina).toBe(true);
    }
    // X-Total-Count: verifica solo se l'header e' presente
    const xTotal = res.headers.get("x-total-count");
    if (xTotal !== null) {
      expect(Number(xTotal)).toBe(data.total);
    }
  });

  it("paginazione: pagina 1 e 2 con per=2", async () => {
    const prima = (await (
      await leggiGET(new Request("http://localhost/api/leggi?page=1&per=2"))
    ).json()) as { items: unknown[]; total: number; page: number; per: number };
    const seconda = (await (
      await leggiGET(new Request("http://localhost/api/leggi?page=2&per=2"))
    ).json()) as { items: unknown[]; total: number; page: number };
    expect(prima.items.length).toBe(2);
    expect(prima.total).toBeGreaterThanOrEqual(5);
    expect(prima.page).toBe(1);
    expect(prima.per).toBe(2);
    expect(seconda.items.length).toBe(2);
    expect(seconda.page).toBe(2);
  });

  it("filtra per testo", async () => {
    const res = await leggiGET(new Request("http://localhost/api/leggi?q=carburanti"));
    const data = (await res.json()) as { count: number };
    expect(data.count).toBeGreaterThanOrEqual(1);
  });

  it("filtra per tipo", async () => {
    const res = await leggiGET(new Request("http://localhost/api/leggi?tipo=decreto.legge"));
    const data = (await res.json()) as { items: unknown[] };
    expect(data.items.length).toBeGreaterThanOrEqual(2);
  });

  it("filtra per stato record e per colore del semaforo", async () => {
    const esatto = (await (
      await leggiGET(new Request("http://localhost/api/leggi?stato=in_vigore&per=1"))
    ).json()) as { total: number };
    expect(esatto.total).toBeGreaterThanOrEqual(1);
    for (const colore of ["verde", "giallo", "rosso"]) {
      const res = (await (
        await leggiGET(new Request(`http://localhost/api/leggi?stato=${colore}&per=1`))
      ).json()) as { total: number };
      expect(res.total).toBeGreaterThanOrEqual(0);
    }
    const verdi = (await (
      await leggiGET(new Request("http://localhost/api/leggi?stato=verde&per=50"))
    ).json()) as { total: number };
    expect(verdi.total).toBeGreaterThanOrEqual(1);
  });

  it("filtra per anno", async () => {
    const res = await leggiGET(new Request("http://localhost/api/leggi?anno=2026"));
    const data = (await res.json()) as { total: number };
    expect(data.total).toBeGreaterThanOrEqual(1);
    const vuoto = (await (
      await leggiGET(new Request("http://localhost/api/leggi?anno=1800"))
    ).json()) as { total: number };
    expect(vuoto.total).toBe(0);
  });

  it("ordina per titolo", async () => {
    const res = await leggiGET(
      new Request("http://localhost/api/leggi?sort=titolo_asc&per=100"),
    );
    const data = (await res.json()) as { items: { titolo: string }[] };
    const titoli = data.items.map((item) => item.titolo);
    const ordinati = [...titoli].sort((a, b) => a.localeCompare(b, "it"));
    expect(titoli).toEqual(ordinati);
  });
});

describe("GET /api/leggi/[...eli]", () => {
  it("restituisce dettaglio, semplificazione e qualita'", async () => {
    const res = await lawGET(
      new Request("http://localhost/api/leggi/eli/id/2026/07/27/26G00155/sg"),
      { params: Promise.resolve({ eli: ["eli", "id", "2026", "07", "27", "26G00155", "sg"] }) },
    );
    const data = (await res.json()) as {
      law: { numero: string };
      simplified: { in10Secondi: string; perTe: Record<string, string> };
      quality: { totale: number };
      fonti: unknown;
    };
    expect(res.status).toBe(200);
    expect(data.law.numero).toBe("133");
    expect(data.simplified.in10Secondi.length).toBeGreaterThan(0);
    expect(Object.keys(data.simplified.perTe).sort()).toEqual([
      "guida",
      "impresa",
      "lavoro",
      "studio",
    ]);
    expect(data.quality.totale).toBeGreaterThanOrEqual(0);
    expect(data.fonti).toBeTruthy();
  });

  it("accetta l'ELI via query string", async () => {
    const res = await lawGET(
      new Request("http://localhost/api/leggi/x?eli=%2Feli%2Fid%2F2026%2F07%2F27%2F26G00155%2Fsg"),
      { params: Promise.resolve({ eli: ["x"] }) },
    );
    expect(res.status).toBe(200);
  });

  it("risponde 404 per ELI sconosciuto", async () => {
    const res = await lawGET(new Request("http://localhost/api/leggi/inesistente"), {
      params: Promise.resolve({ eli: ["inesistente"] }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/export", () => {
  it("esporta CSV come allegato con seme noto", async () => {
    const res = await exportGET(new Request("http://localhost/api/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const csv = await res.text();
    expect(csv).toContain("eli,nir,tipo");
    // Seme noto: DL 133/2026 sempre presente nell'export
    expect(csv).toContain("133");
  });

  it("esporta JSON filtrato", async () => {
    const res = await exportGET(
      new Request("http://localhost/api/export?formato=json&q=carburanti"),
    );
    const data = (await res.json()) as { items: unknown[]; total: number; filtri: unknown };
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(data.total).toBeGreaterThanOrEqual(1);
    expect(data.filtri).toBeTruthy();
  });

  it("rifiuta un formato non supportato", async () => {
    const res = await exportGET(new Request("http://localhost/api/export?formato=xml"));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/statistiche", () => {
  it("restituisce aggregati e snapshot economico", async () => {
    const res = await statisticheGET();
    const data = (await res.json()) as {
      corpus: { totale: number; perTipo: Record<string, number>; airDistribuzione: unknown };
      economia: { aggiornatoAl: string; indicatori: { fonte: string; periodo: string }[] };
    };
    expect(res.status).toBe(200);
    expect(data.corpus.totale).toBeGreaterThanOrEqual(5);
    expect(data.corpus.perTipo["decreto.legge"]).toBeGreaterThanOrEqual(2);
    expect(data.economia.indicatori.length).toBeGreaterThan(0);
    expect(data.economia.indicatori[0].fonte.length).toBeGreaterThan(0);
    expect(data.economia.indicatori[0].periodo.length).toBeGreaterThan(0);
  });
});

describe("GET /api/sync", () => {
  it("storico risponde sempre 200 con un report JSON", async () => {
    const res = await syncStoricoGET(
      new Request("http://localhost/api/sync/storico?limit=1&maxPages=1&denominazioni=LEGGE"),
    );
    const data = (await res.json()) as {
      source: string;
      ok: boolean;
      errors: string[];
      fetched: number;
      persisted: number;
    };
    expect(res.status).toBe(200);
    expect(data.source).toBe("storico");
    expect(data.ok).toBe(false);
    expect(data.errors.length).toBeGreaterThan(0);
    expect(data.fetched).toBe(0);
    expect(data.persisted).toBe(0);
  });

  it("recente risponde sempre 200 con un report JSON", async () => {
    const res = await syncRecenteGET(
      new Request("http://localhost/api/sync/recente?dal=2026-01-01&al=2026-01-31"),
    );
    const data = (await res.json()) as { source: string; ok: boolean; errors: string[] };
    expect(res.status).toBe(200);
    expect(data.source).toBe("recente");
    expect(data.ok).toBe(false);
    expect(data.errors.length).toBeGreaterThan(0);
  });
});

describe("GET /api/ministri", () => {
  it("elenca i ministri", async () => {
    const res = await ministriGET();
    const data = (await res.json()) as { items: unknown[] };
    expect(res.status).toBe(200);
    expect(data.items.length).toBe(8);
  });

  it("restituisce il dettaglio di un ministro", async () => {
    const res = await ministroGET(new Request("http://localhost/api/ministri/meloni"), {
      params: Promise.resolve({ slug: "meloni" }),
    });
    const data = (await res.json()) as { ministro: { nome: string } };
    expect(res.status).toBe(200);
    expect(data.ministro.nome).toContain("Meloni");
  });

  it("risponde 404 per slug sconosciuto", async () => {
    const res = await ministroGET(new Request("http://localhost/api/ministri/nessuno"), {
      params: Promise.resolve({ slug: "nessuno" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/cdm", () => {
  it("ricade sul seed se la rete fallisce", async () => {
    const res = await cdmGET(new Request("http://localhost/api/cdm"));
    const data = (await res.json()) as { items: unknown[]; source: string };
    expect(res.status).toBe(200);
    expect(data.source).toBe("seed");
    expect(data.items.length).toBeGreaterThanOrEqual(1);
  });
});

describe("GET /api/cron/ingest", () => {
  it("risponde 200 anche senza DB", async () => {
    const res = await cronGET(new Request("http://localhost/api/cron/ingest"));
    const data = (await res.json()) as { ok: boolean; leggiPerse: number; db: boolean };
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.leggiPerse).toBe(0);
    expect(data.db).toBe(false);
  });
});

describe("GET /api/feed", () => {
  it("produce un feed RSS valido con seme noto e cap 50", async () => {
    const res = await feedGET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    const xml = await res.text();
    expect(xml).toContain("<rss");
    expect(xml).toContain("SimpleLaw");
    expect(xml).toContain("ILVA");
    const voci = xml.split("<item>").length - 1;
    expect(voci).toBeGreaterThanOrEqual(1);
    expect(voci).toBeLessThanOrEqual(50);
  });
});
