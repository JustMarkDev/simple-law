/**
 * Oversight (controllo pubblico: ANAC + GA): contratto dello scrittore UI/API.
 *
 * Tutto offline e deterministico:
 * - fixture INLINE come base obbligatoria (zero rete/disco obbligatorio);
 * - integrazione disco solo se `data/reali/anac-contratti-2025.json` o
 *   `data/reali/ga-provvedimenti-2026.json` esistono davvero (test tolleranti,
 *   mai falliti per file di W1/W2 ancora assenti);
 * - API `/api/controllo` mai-500 con bound su q/per;
 * - mai inventare dati: campi assenti -> omessi, mai ricostruiti;
 * - rete vietata (fetch stubbato a lanciare).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  aContratto,
  aDocumentoCnel,
  aProvvedimentoGA,
  cercaContratti,
  cercaDocumentiCnel,
  cercaProvvedimenti,
  contaPerGiudice,
  filtraPerEnte,
  filtraPerGiudice,
  normalizzaGiudiceGA,
  normalizzaOversight,
  paginaOversight,
  tuttiDocumentiCnel,
} from "@/lib/oversight-dati";
import { GET as controlloGET } from "@/app/api/controllo/route";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("rete vietata in tests/oversight-api.test.ts");
    }),
  );
});

const CONTRATTO_FIXTURE = {
  ocid: "ocds-2132f2-abc123",
  cig: "B123456789",
  stazioneAppaltante: { denominazione: "Comune di Esempio", cf: "01234567890" },
  oggetto: "Lavori di manutenzione straordinaria delle strade comunali",
  importo: 150000,
  valuta: "EUR",
  dataAward: "2025-03-14",
  fornitore: "Impresa Edile Rossi S.r.l.",
  schedaBDNCP: "https://dati.anticorruzione.it/superset/dashboard/1/?cig=B123456789",
  risorsaBulk: "https://dati.anticorruzione.it/open-data/bulk/2025/01.json",
};

const CONTRATTO_MINIMO = {
  ocid: "ocds-2132f2-def456",
  cig: "C987654321",
  stazioneAppaltante: "Provincia di Campione",
  oggetto: "Fornitura di arredi scolastici per gli istituti provinciali",
};

const GA_CDS = {
  numero: "1234",
  anno: "2026",
  giudice: "cds",
  sezione: "Sezione V",
  data: "2026-07-15",
  oggetto: "Appalti pubblici: annullamento aggiudicazione per offerta anomala",
  schedaUrl: "https://www.giustizia-amministrativa.it/web/guest/-/1234",
  pdfUrl: "https://www.giustizia-amministrativa.it/documents/2026/1234.pdf",
  ecli: "ECLI:IT:CDS:2026:1234SENT",
};

const GA_TAR = {
  numero: "567",
  anno: "2026",
  giudice: "tar",
  sezione: "TAR Lazio, Roma, Sez. II",
  data: "2026-08-02",
  oggetto: "Edilizia e urbanistica: permesso di costruire in zona vincolata",
  schedaUrl: "https://www.giustizia-amministrativa.it/web/guest/-/567",
};

const RADICE = typeof process !== "undefined" ? process.cwd() : ".";
const FILE_ANAC = `${RADICE}/data/reali/anac-contratti-2025.json`;
const FILE_GA = `${RADICE}/data/reali/ga-provvedimenti-2026.json`;

async function leggiEnvelope(
  percorso: string,
): Promise<{ provenance: Record<string, unknown>; byte: number; raw: Record<string, unknown> } | null> {
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(percorso)) return null;
    const raw = fs.readFileSync(percorso, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return {
      provenance: ((parsed as { provenance?: unknown }).provenance ?? {}) as Record<string, unknown>,
      byte: Buffer.byteLength(raw, "utf8"),
      raw: parsed,
    };
  } catch {
    return null;
  }
}

describe("oversight: normalizzazione fixture (zero rete, zero disco)", () => {
  it("aContratto accetta una voce completa con CIG e stazione", () => {
    const c = aContratto(CONTRATTO_FIXTURE);
    expect(c).not.toBeNull();
    expect(c?.ocid).toBe("ocds-2132f2-abc123");
    expect(c?.cig).toBe("B123456789");
    expect(c?.stazioneAppaltante.denominazione).toBe("Comune di Esempio");
    expect(c?.importo).toBe(150000);
    expect(c?.valuta).toBe("EUR");
    expect(c?.dataAward).toBe("2025-03-14");
    expect(c?.fornitore).toBe("Impresa Edile Rossi S.r.l.");
    expect(c?.schedaBDNCP).toContain("https://");
  });

  it("aContratto tollera la stazione come stringa e omette i campi malformati", () => {
    const c = aContratto({
      ...CONTRATTO_MINIMO,
      importo: -5,
      dataAward: "14-03-2025",
      schedaBDNCP: "http://inscure.example/x",
    });
    expect(c).not.toBeNull();
    expect(c?.stazioneAppaltante.denominazione).toBe("Provincia di Campione");
    expect(c?.importo).toBeUndefined();
    expect(c?.dataAward).toBeUndefined();
    expect(c?.schedaBDNCP).toBeUndefined();
  });

  it("aContratto scarta voci senza ocid, CIG, stazione o oggetto (mai inventare)", () => {
    expect(aContratto({ ...CONTRATTO_FIXTURE, ocid: "" })).toBeNull();
    expect(aContratto({ ...CONTRATTO_FIXTURE, cig: "XX" })).toBeNull();
    expect(aContratto({ ...CONTRATTO_FIXTURE, stazioneAppaltante: {} })).toBeNull();
    expect(aContratto({ ...CONTRATTO_FIXTURE, oggetto: "x" })).toBeNull();
    expect(aContratto(null)).toBeNull();
    expect(aContratto(undefined)).toBeNull();
    expect(aContratto([])).toBeNull();
  });

  it("aProvvedimentoGA accetta CdS e TAR, mai stato/vigenza", () => {
    const cds = aProvvedimentoGA(GA_CDS);
    expect(cds).not.toBeNull();
    expect(cds?.giudice).toBe("cds");
    expect(cds?.ecli).toBe("ECLI:IT:CDS:2026:1234SENT");
    expect(cds?.pdfUrl).toContain("https://");
    expect(cds as unknown as Record<string, unknown>).not.toHaveProperty("stato");
    const tar = aProvvedimentoGA(GA_TAR);
    expect(tar).not.toBeNull();
    expect(tar?.giudice).toBe("tar");
    expect(tar?.pdfUrl).toBeUndefined();
  });

  it("aProvvedimentoGA scarta voci senza giudice, scheda o oggetto (numero/anno opzionali)", () => {
    expect(aProvvedimentoGA({ ...GA_CDS, giudice: "cassazione" })).toBeNull();
    expect(aProvvedimentoGA({ ...GA_CDS, schedaUrl: "http://x.example" })).toBeNull();
    expect(aProvvedimentoGA({ ...GA_CDS, oggetto: "no" })).toBeNull();
    expect(aProvvedimentoGA(null)).toBeNull();
  });

  it("aProvvedimentoGA accetta voci reali senza numero/anno (mai inventati)", () => {
    const senzaNumeri = aProvvedimentoGA({ ...GA_CDS, numero: "", anno: "26" });
    expect(senzaNumeri).not.toBeNull();
    expect(senzaNumeri && "numero" in senzaNumeri).toBe(false);
    expect(senzaNumeri && "anno" in senzaNumeri).toBe(false);
    expect(senzaNumeri?.giudice).toBe("cds");
  });

  it("normalizzaGiudiceGA riconosce varianti senza lanciare", () => {
    expect(normalizzaGiudiceGA("CdS")).toBe("cds");
    expect(normalizzaGiudiceGA("Consiglio di Stato, Sez. V")).toBe("cds");
    expect(normalizzaGiudiceGA("TAR")).toBe("tar");
    expect(normalizzaGiudiceGA("T.a.r. per la Lombardia, Brescia, sezione I")).toBe("tar");
    expect(normalizzaGiudiceGA("Consiglio di giustizia amministrativa per la Regione Siciliana")).toBe("cga");
    expect(normalizzaGiudiceGA("cga")).toBe("cga");
    expect(normalizzaGiudiceGA("cassazione")).toBe("");
    expect(normalizzaGiudiceGA(null)).toBe("");
    expect(normalizzaOversight(null)).toBe("");
  });

  it("aProvvedimentoGA accetta voci reali con ente punteggiato e senza numero/anno", () => {
    const tar = aProvvedimentoGA({
      id: "https://www.giustizia-amministrativa.it/web/guest/-/105486-2075",
      titolo: "Sulla natura di intervento chirurgico della circoncisione",
      data: "2026-09-07",
      url: "https://www.giustizia-amministrativa.it/web/guest/-/105486-2075",
      ente: "T.a.r. per la Lombardia, Brescia, sezione I",
      oggetto: "SANITÀ pubblica e sanitari",
      numero: "328",
    });
    expect(tar?.giudice).toBe("tar");
    expect(tar?.sezione).toBe("Brescia, sezione I");
    expect(tar?.numero).toBe("328");
    // Senza numero/anno espliciti: accettata comunque, campi omessi (mai inventati).
    const senzaNumeri = aProvvedimentoGA({
      titolo: "Pianificazione faunistico-venatoria e calendario venatorio",
      data: "2026-09-04",
      url: "https://www.giustizia-amministrativa.it/web/guest/-/105486-2086",
      ente: "T.a.r. per la Lombardia, Brescia, sezione II",
      oggetto: "CACCIA e protezione della fauna",
    });
    expect(senzaNumeri).not.toBeNull();
    expect(senzaNumeri && "numero" in senzaNumeri).toBe(false);
    expect(senzaNumeri && "anno" in senzaNumeri).toBe(false);
    const cga = aProvvedimentoGA({
      id: "https://www.giustizia-amministrativa.it/web/guest/-/105486-2086",
      titolo: "Pianificazione faunistico-venatoria e calendario venatorio",
      data: "2026-09-04",
      url: "https://www.giustizia-amministrativa.it/web/guest/-/105486-2086",
      ente: "Consiglio di giustizia amministrativa per la Regione Siciliana, sezione giurisdizionale",
      oggetto: "CACCIA e protezione della fauna",
      numero: "296",
    });
    expect(cga?.giudice).toBe("cga");
    expect(cga?.sezione).toBe("sezione giurisdizionale");
  });

  it("aContratto accetta voci reali con CIG numerico e omette CIG invalido", () => {
    const ok = aContratto({
      id: "ocds-hu01ve-3913112",
      titolo: "Lavori di manutenzione straordinaria",
      data: "2010-09-28",
      url: "https://data.open-contracting.org/en/publication/117/download?name=2025.jsonl.gz",
      ente: "AGENZIA INTERREGIONALE PER IL FIUME PO AIPO",
      numero: "3913112",
    });
    expect(ok?.ocid).toBe("ocds-hu01ve-3913112");
    expect(ok?.cig).toBe("3913112");
    expect(ok?.stazioneAppaltante.denominazione).toContain("AIPO");
    const senzaCig = aContratto({
      id: "ocds-xx-1",
      titolo: "Un lavoro pubblico di esempio reale",
      data: "2024-01-01",
      url: "https://data.open-contracting.org/en/publication/117/download?name=2025.jsonl.gz",
      ente: "Comune di Esempio",
      numero: "XX",
    });
    expect(senzaCig).not.toBeNull();
    expect(senzaCig && "cig" in senzaCig).toBe(false);
  });

  it("never-throw su input malformati", () => {
    expect(() => aContratto({})).not.toThrow();    expect(() => aProvvedimentoGA({})).not.toThrow();
    expect(() => cercaContratti(null as never, "x")).not.toThrow();
    expect(() => filtraPerEnte(null as never, "x")).not.toThrow();
    expect(() => cercaProvvedimenti(null as never, "x")).not.toThrow();
    expect(() => filtraPerGiudice(null as never, "cds")).not.toThrow();
    expect(() => paginaOversight(null as never, 1, 20)).not.toThrow();
    expect(() => contaPerGiudice(null as never)).not.toThrow();
    expect(cercaContratti(null as never, "x")).toEqual([]);
    expect(filtraPerGiudice(null as never, "cds")).toEqual([]);
  });

  it("cerca, filtra per ente/giudice, paginazione bounded", () => {
    const contratti = [aContratto(CONTRATTO_FIXTURE), aProvvedimentoGA(GA_CDS)]
      .filter(Boolean)
      .map((v) => v as unknown as never);
    const elenco = [aContratto(CONTRATTO_FIXTURE), aContratto(CONTRATTO_MINIMO)].filter(
      (c): c is NonNullable<typeof c> => c !== null,
    );
    expect(contratti).toHaveLength(2);
    expect(cercaContratti(elenco, "b123456789")).toHaveLength(1);
    expect(cercaContratti(elenco, "arredi")).toHaveLength(1);
    expect(cercaContratti(elenco, "x")).toHaveLength(2);
    expect(filtraPerEnte(elenco, "comune di esempio")).toHaveLength(1);
    expect(filtraPerEnte(elenco, "z")).toHaveLength(2);
    expect(paginaOversight(elenco, 1, 10)).toHaveLength(2);
    expect(paginaOversight(elenco, 2, 10)).toHaveLength(0);
    expect(paginaOversight(elenco, 1, 999)).toHaveLength(2);

    const ga = [aProvvedimentoGA(GA_CDS), aProvvedimentoGA(GA_TAR)].filter(
      (p): p is NonNullable<typeof p> => p !== null,
    );
    expect(cercaProvvedimenti(ga, "anomala")).toHaveLength(1);
    expect(filtraPerGiudice(ga, "cds")).toHaveLength(1);
    expect(filtraPerGiudice(ga, "tar")).toHaveLength(1);
    expect(filtraPerGiudice(ga, "ignoto")).toHaveLength(2);
    expect(contaPerGiudice(ga)).toHaveLength(2);
  });
});

describe("oversight: API /api/controllo mai-500 e bounded", () => {
  it("tipo=contratti risponde 200 con bound q/per e disclaimer", async () => {
    const res = await controlloGET(
      new Request("http://localhost/api/controllo?tipo=contratti&q=" + "a".repeat(500) + "&per=999&page=-3"),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      tipo: string;
      items: unknown[];
      total: number;
      page: number;
      per: number;
      provenance: unknown;
      disclaimer: string;
    };
    expect(data.tipo).toBe("contratti");
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeLessThanOrEqual(50);
    expect([10, 20, 50]).toContain(data.per);
    expect(typeof data.disclaimer).toBe("string");
    expect(data.disclaimer.length).toBeGreaterThan(0);
  });

  it("tipo=ga risponde 200 e non espone mai stato/vigenza", async () => {
    const res = await controlloGET(
      new Request("http://localhost/api/controllo?tipo=ga&giudice=cds&q=appalti&page=1&per=10"),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      tipo: string;
      items: Record<string, unknown>[];
      total: number;
      provenance: unknown;
    };
    expect(data.tipo).toBe("ga");
    expect(Array.isArray(data.items)).toBe(true);
    for (const voce of data.items) {
      expect(voce).not.toHaveProperty("stato");
      expect(voce).not.toHaveProperty("vigenza");
    }
  });

  it("tipo ignoto ricade su contratti senza 500", async () => {
    const res = await controlloGET(
      new Request("http://localhost/api/controllo?tipo=leggi"),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tipo: string; items: unknown[] };
    expect(data.tipo).toBe("contratti");
    expect(Array.isArray(data.items)).toBe(true);
  });

  it("tipo=cnel risponde 200 con documenti mai-stato e disclaimer", async () => {
    const res = await controlloGET(
      new Request("http://localhost/api/controllo?tipo=cnel&q=lavoro&page=1&per=10"),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      tipo: string;
      items: Record<string, unknown>[];
      total: number;
      provenance: unknown;
      disclaimer: string;
    };
    expect(data.tipo).toBe("cnel");
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.disclaimer).toBe("string");
    for (const voce of data.items) {
      expect(voce).not.toHaveProperty("stato");
      expect(voce).not.toHaveProperty("vigenza");
      expect(typeof voce["titolo"]).toBe("string");
      expect(typeof voce["url"]).toBe("string");
    }
  });
});

describe("oversight: integrazione disco tollerante (solo se i file esistono)", () => {
  it("envelope ANAC con provenance e bound rispettati", async () => {
    const reali = await leggiEnvelope(FILE_ANAC);
    if (!reali) {
      expect(true).toBe(true);
      return;
    }
    expect(typeof reali.provenance["fonte"]).toBe("string");
    expect(typeof reali.provenance["licenza"]).toBe("string");
    expect(typeof reali.provenance["url"]).toBe("string");
    expect((reali.provenance["url"] as string).startsWith("https://")).toBe(true);
    expect(reali.byte).toBeLessThanOrEqual(1048576);
    const chiavi = ["contratti", "releases", "items"].filter((k) =>
      Array.isArray((reali.raw as Record<string, unknown>)[k]),
    );
    expect(chiavi.length).toBeGreaterThan(0);
    const lista = (reali.raw as Record<string, unknown>)[chiavi[0]] as unknown[];
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.length).toBeLessThanOrEqual(100);
    const visti = new Set<string>();
    for (const voce of lista) {
      const c = aContratto(voce);
      expect(c).not.toBeNull();
      // CIG opzionale (mai inventato): se presente e lungo almeno 7.
      if (c?.cig !== undefined) {
        expect(c.cig.length).toBeGreaterThanOrEqual(7);
      }
      expect((c?.oggetto ?? "").length).toBeGreaterThanOrEqual(5);
      expect(c as unknown as Record<string, unknown>).not.toHaveProperty("stato");
      const chiave = c?.cig ?? "";
      expect(visti.has(chiave)).toBe(false);
      visti.add(chiave);
    }
  });

  it("envelope GA con provenance e soli metadati + URL", async () => {
    const reali = await leggiEnvelope(FILE_GA);
    if (!reali) {
      expect(true).toBe(true);
      return;
    }
    expect(typeof reali.provenance["fonte"]).toBe("string");
    expect(typeof reali.provenance["url"]).toBe("string");
    expect((reali.provenance["url"] as string).startsWith("https://")).toBe(true);
    expect(reali.byte).toBeLessThanOrEqual(1048576);
    const chiavi = ["provvedimenti", "atti", "pronunce", "items"].filter((k) =>
      Array.isArray((reali.raw as Record<string, unknown>)[k]),
    );
    expect(chiavi.length).toBeGreaterThan(0);
    const lista = (reali.raw as Record<string, unknown>)[chiavi[0]] as unknown[];
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.length).toBeLessThanOrEqual(100);
    for (const voce of lista) {
      const p = aProvvedimentoGA(voce);
      expect(p).not.toBeNull();
      expect(["cds", "tar", "cga"]).toContain(p?.giudice);
      expect(p?.schedaUrl.startsWith("https://")).toBe(true);
      expect(p as unknown as Record<string, unknown>).not.toHaveProperty("stato");
    }
  });
});

describe("oversight: documenti CNEL (metadati + link, mai testo)", () => {
  it("aDocumentoCnel accetta voci reali e scarta senza id/titolo/url", () => {
    const ok = aDocumentoCnel({
      id: "https://www.cnel.it/osservazioni-e-proposte-esempio",
      titolo: "Osservazioni e proposte in materia di lavoro",
      data: "2026-07-23",
      url: "https://www.cnel.it/osservazioni-e-proposte-esempio",
      tipo: "osservazione",
    });
    expect(ok?.id.length).toBeGreaterThan(0);
    expect(ok?.titolo.length).toBeGreaterThan(0);
    expect(ok?.url.startsWith("https://")).toBe(true);
    expect(ok && "testo" in ok).toBe(false);
    expect(aDocumentoCnel({ titolo: "x", url: "https://www.cnel.it/y" })).toBeNull();
    expect(aDocumentoCnel({ id: "x", titolo: "yyyyy", url: "http://inscure.example/y" })).toBeNull();
    expect(aDocumentoCnel(null)).toBeNull();
  });

  it("tuttiDocumentiCnel carica il file reale con provenance (tollerante se assente)", async () => {
    const docs = await tuttiDocumentiCnel();
    expect(Array.isArray(docs)).toBe(true);
    for (const d of docs.slice(0, 5)) {
      expect(d.titolo.length).toBeGreaterThanOrEqual(5);
      expect(d.url.startsWith("https://")).toBe(true);
      expect(d).not.toHaveProperty("stato");
      expect(d).not.toHaveProperty("testo");
    }
  });

  it("cercaDocumentiCnel bound e min-2 (mai throw)", async () => {
    const docs = await tuttiDocumentiCnel();
    expect(cercaDocumentiCnel(docs, "lavoro").length).toBeLessThanOrEqual(docs.length);
    expect(cercaDocumentiCnel(docs, "x")).toEqual(
      docs.length > 0 ? expect.any(Array) : [],
    );
    expect(() => cercaDocumentiCnel(null as never, null)).not.toThrow();
  });
});
