import { describe, expect, it, vi } from "vitest";
import {
  SOURCE_URLS,
  fetchGovernoComunicati,
  fetchNormattivaELI,
  getSeedCdm,
  getSeedLaws,
  getSeedMinisters,
  searchSeedLaws,
  sparqlCamera,
  sparqlSenato,
} from "@/lib/sources";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<item>
  <title>Comunicato stampa del Consiglio dei ministri n. 190</title>
  <link>https://www.governo.it/it/articolo/esempio</link>
  <pubDate>Mon, 15 Sep 2026 10:00:00 GMT</pubDate>
  <description><![CDATA[<p>Testo <b>importante</b> del comunicato.</p>]]></description>
  <guid>gov-190</guid>
</item>
</channel></rss>`;

function fetchCheRisponde(body: string): typeof fetch {
  return vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
}

function fetchCheFallisce(): typeof fetch {
  return vi.fn(async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
}

describe("seed in-memory", () => {
  it("espone leggi, ministri e comunicati", () => {
    expect(getSeedLaws().length).toBeGreaterThanOrEqual(5);
    expect(getSeedMinisters().length).toBe(8);
    expect(getSeedCdm().length).toBeGreaterThanOrEqual(1);
  });

  it("restituisce copie difensive", () => {
    const prime = getSeedLaws();
    prime[0].titolo = "MODIFICATO";
    expect(getSeedLaws()[0].titolo).not.toBe("MODIFICATO");
  });

  it("cerca nelle leggi seed", () => {
    expect(searchSeedLaws("carburanti").length).toBeGreaterThanOrEqual(1);
    expect(searchSeedLaws("").length).toBe(getSeedLaws().length);
    expect(searchSeedLaws("zzz-inesistente")).toHaveLength(0);
  });
});

describe("fetchNormattivaELI", () => {
  it("costruisce l'URL da un ELI (senza /sg: Normattiva usa CONSOLIDATED)", () => {
    expect(fetchNormattivaELI("/eli/id/2026/07/27/26G00155/sg")).toBe(
      "https://www.normattiva.it/eli/id/2026/07/27/26G00155",
    );
  });

  it("funziona anche con path senza prefisso eli", () => {
    expect(fetchNormattivaELI("2026/07/27/26G00155/sg")).toContain("/eli/id/2026/07/27/26G00155");
  });

  it("ricade sulla home per input vuoto", () => {
    expect(fetchNormattivaELI("")).toBe(SOURCE_URLS.normattiva);
  });
});

describe("fetchGovernoComunicati", () => {
  it("analizza il feed RSS", async () => {
    const items = await fetchGovernoComunicati(5, { fetchImpl: fetchCheRisponde(RSS) });
    expect(items).toHaveLength(1);
    expect(items[0].numero).toBe("190");
    expect(items[0].id).toBe("gov-190");
    expect(items[0].data).toBe("2026-09-15");
    expect(items[0].sintesi).toContain("Testo importante");
    expect(items[0].sintesi).not.toContain("<b>");
  });

  it("se la rete fallisce ricade sui reali e poi sul seed (mai errore)", async () => {
    const items = await fetchGovernoComunicati(5, { fetchImpl: fetchCheFallisce() });
    expect(items.length).toBeGreaterThanOrEqual(1);
    // Catena onesta: rete -> file reali (se presenti nel repo) -> seed.
    // In ogni caso forma valida e mai throw.
    for (const item of items) {
      expect(typeof item.id).toBe("string");
      expect(item.id.length).toBeGreaterThan(0);
      expect(typeof item.titolo).toBe("string");
      expect(typeof item.url).toBe("string");
    }
    expect(items.length).toBeLessThanOrEqual(5);
  });

  it("rispetta il limite", async () => {
    const items = await fetchGovernoComunicati(2, { fetchImpl: fetchCheFallisce() });
    expect(items).toHaveLength(2);
  });
});

describe("SPARQL", () => {
  it("fallisce in modo controllato con query vuota", async () => {
    await expect(sparqlCamera("")).resolves.toEqual({ ok: false, error: "Query SPARQL vuota" });
  });

  it("non lancia se la rete fallisce", async () => {
    const camera = await sparqlCamera("SELECT * WHERE { ?s ?p ?o }", { fetchImpl: fetchCheFallisce() });
    expect(camera.ok).toBe(false);
    const senato = await sparqlSenato("SELECT * WHERE { ?s ?p ?o }", { fetchImpl: fetchCheFallisce() });
    expect(senato.ok).toBe(false);
  });

  it("restituisce i dati se la rete risponde", async () => {
    const body = JSON.stringify({ head: { vars: [] }, results: { bindings: [] } });
    const result = await sparqlCamera("SELECT * WHERE { ?s ?p ?o }", {
      fetchImpl: fetchCheRisponde(body),
    });
    expect(result.ok).toBe(true);
  });
});
