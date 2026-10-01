/**
 * CNEL ingest (osservazioni + rapporti + pareri UE): parser/mapping su
 * fixture inline (zero rete) + integrazione disco tollerante (solo se il
 * file esiste). Mai inventare dati: campi assenti o malformati -> voce
 * scartata (null).
 */

import { describe, expect, it } from "vite-plus/test";
import {
  CNEL_MAX_DOC,
  estraiVociGrezze,
  isUrlSchedaCnel,
  normalizzaVoceCnel,
  parseDataIt,
} from "../scripts/ingest-reale-cnel";

const OSS_VALIDO = {
  relatore: "Giuntoli",
  publicationDate: "23/07/2026",
  title: "Osservazioni e proposte in materia di Piano Casa e Politiche nazionali dell'abitare",
  summary: "  Documento   assembleare  sul Piano Casa  ",
  url: "/osservazioni-e-proposte-in-materia-di--piano-casa",
};

const RAPPORTO_VALIDO = {
  relatore: "Braga",
  publicationDate: "25/06/2026",
  title: "Rapporto sulla transizione scuola - lavoro",
  summary: "",
  url: "https://www.cnel.it/rapporto-sulla-transizione-scuola---lavoro",
  documents: [{ title: "Rapporto.pdf", url: "/media/docs/x.pdf" }],
};

const PARERE_PDF_SOLO = {
  relatore: "X",
  publicationDate: "28/01/2026",
  title: "Parere su atti UE",
  summary: "",
  url: "/media/docs/default-source/parere/x.pdf",
};

const RADICE = typeof process !== "undefined" ? process.cwd() : ".";
const FILE_CNEL = `${RADICE}/data/reali/oversight-cnel-2026.json`;

async function leggiEnvelope(file: string): Promise<{
  provenance: Record<string, unknown>;
  documenti: unknown[];
  metodologia: unknown;
  avvertenze: unknown;
  byte: number;
} | null> {
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const documenti = (parsed as { documenti?: unknown }).documenti;
    if (!Array.isArray(documenti)) return null;
    return {
      provenance: ((parsed as { provenance?: unknown }).provenance ?? {}) as Record<
        string,
        unknown
      >,
      documenti,
      metodologia: (parsed as { metodologia?: unknown }).metodologia,
      avvertenze: (parsed as { avvertenze?: unknown }).avvertenze,
      byte: Buffer.byteLength(raw, "utf8"),
    };
  } catch {
    return null;
  }
}

function documentoValido(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["id"] === "string" &&
    o["id"].length > 0 &&
    typeof o["titolo"] === "string" &&
    o["titolo"].length > 0 &&
    typeof o["data"] === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(o["data"]) &&
    typeof o["url"] === "string" &&
    /^https:\/\/www\.cnel\.it\//.test(o["url"]) &&
    (o["tipo"] === "osservazione" || o["tipo"] === "rapporto" || o["tipo"] === "parere-ue") &&
    typeof o["abstract"] === "string"
  );
}

describe("cnel: parseDataIt (zero rete, zero disco)", () => {
  it("converte dd/mm/yyyy valide e rifiuta il resto", () => {
    expect(parseDataIt("23/07/2026")).toBe("2026-07-23");
    expect(parseDataIt("9/9/2026")).toBe("2026-09-09");
    expect(parseDataIt("2026-07-23")).toBe("");
    expect(parseDataIt("32/01/2026")).toBe("");
    expect(parseDataIt("29/02/2025")).toBe("");
    expect(parseDataIt("")).toBe("");
    expect(parseDataIt(null)).toBe("");
    expect(parseDataIt(123)).toBe("");
  });

  it("never-throw su input malformati", () => {
    expect(() => parseDataIt({})).not.toThrow();
    expect(() => parseDataIt([])).not.toThrow();
    expect(parseDataIt({})).toBe("");
  });
});

describe("cnel: normalizzaVoceCnel (zero rete, zero disco)", () => {
  it("normalizza osservazione con URL relativo e abstract compattato", () => {
    const v = normalizzaVoceCnel(OSS_VALIDO, "osservazione");
    expect(v).not.toBeNull();
    expect(v?.titolo).toBe(
      "Osservazioni e proposte in materia di Piano Casa e Politiche nazionali dell'abitare",
    );
    expect(v?.data).toBe("2026-07-23");
    expect(v?.url).toBe("https://www.cnel.it/osservazioni-e-proposte-in-materia-di--piano-casa");
    expect(v?.id).toBe(v?.url);
    expect(v?.tipo).toBe("osservazione");
    expect(v?.abstract).toBe("Documento assembleare sul Piano Casa");
  });

  it("normalizza rapporto con URL assoluto e abstract vuoto onesto", () => {
    const v = normalizzaVoceCnel(RAPPORTO_VALIDO, "rapporto");
    expect(v).not.toBeNull();
    expect(v?.data).toBe("2026-06-25");
    expect(v?.tipo).toBe("rapporto");
    expect(v?.abstract).toBe("");
  });

  it("scarta voci senza titolo, data valida o scheda (mai inventare)", () => {
    expect(normalizzaVoceCnel(null, "osservazione")).toBeNull();
    expect(normalizzaVoceCnel("stringa", "osservazione")).toBeNull();
    expect(normalizzaVoceCnel([], "osservazione")).toBeNull();
    expect(normalizzaVoceCnel({}, "osservazione")).toBeNull();
    expect(normalizzaVoceCnel({ ...OSS_VALIDO, title: "  " }, "osservazione")).toBeNull();
    expect(
      normalizzaVoceCnel({ ...OSS_VALIDO, publicationDate: "luglio 2026" }, "osservazione"),
    ).toBeNull();
    expect(normalizzaVoceCnel({ ...OSS_VALIDO, url: "" }, "osservazione")).toBeNull();
    expect(
      normalizzaVoceCnel({ ...OSS_VALIDO, url: "https://esterno.it/x" }, "osservazione"),
    ).toBeNull();
    // URL /media/docs (allegato PDF) non e' una scheda: scartato, mai promosso a voce
    expect(normalizzaVoceCnel(PARERE_PDF_SOLO, "parere-ue")).toBeNull();
    expect(normalizzaVoceCnel(OSS_VALIDO, "decreto" as never)).toBeNull();
  });

  it("never-throw su input malformati", () => {
    expect(() =>
      normalizzaVoceCnel({ title: 1, url: [], publicationDate: {} }, "rapporto"),
    ).not.toThrow();
    expect(normalizzaVoceCnel({ title: 1, url: [], publicationDate: {} }, "rapporto")).toBeNull();
  });
});

describe("cnel: helper URL ed estrazione (zero rete, zero disco)", () => {
  it("isUrlSchedaCnel accetta solo schede https www.cnel.it", () => {
    expect(isUrlSchedaCnel("https://www.cnel.it/osservazioni-x")).toBe(true);
    expect(isUrlSchedaCnel("http://www.cnel.it/osservazioni-x")).toBe(false);
    expect(isUrlSchedaCnel("https://www.cnel.it/media/docs/x.pdf")).toBe(false);
    expect(isUrlSchedaCnel("https://esterno.it/x")).toBe(false);
    expect(isUrlSchedaCnel("/relativa/x")).toBe(false);
    expect(isUrlSchedaCnel("")).toBe(false);
  });

  it("estraiVociGrezze legge {items} o array diretto (never-throw)", () => {
    expect(estraiVociGrezze({ items: [OSS_VALIDO] })).toHaveLength(1);
    expect(estraiVociGrezze([OSS_VALIDO])).toHaveLength(1);
    expect(estraiVociGrezze({})).toEqual([]);
    expect(estraiVociGrezze(null)).toEqual([]);
    expect(() => estraiVociGrezze("x")).not.toThrow();
  });
});

describe("cnel: integrazione disco tollerante (solo se il file esiste)", () => {
  it("envelope con provenance onesta e bound rispettati", async () => {
    const reali = await leggiEnvelope(FILE_CNEL);
    if (!reali) {
      expect(true).toBe(true);
      return;
    }
    expect(reali.provenance["fonte"]).toContain("CNEL");
    expect(typeof reali.provenance["url"]).toBe("string");
    expect((reali.provenance["url"] as string).startsWith("https://")).toBe(true);
    expect(typeof reali.provenance["recuperatoIl"]).toBe("string");
    expect(typeof reali.provenance["licenza"]).toBe("string");
    expect((reali.provenance["licenza"] as string).toLowerCase()).toContain("nessun mirror");
    expect(typeof reali.metodologia).toBe("string");
    expect(typeof reali.avvertenze).toBe("string");
    expect(reali.documenti.length).toBeGreaterThan(0);
    expect(reali.documenti.length).toBeLessThanOrEqual(CNEL_MAX_DOC);
    expect(reali.byte).toBeLessThanOrEqual(950 * 1024);
  });

  it("ogni documento ha id+titolo+data+url scheda+tipo+abstract (mai inventati)", async () => {
    const reali = await leggiEnvelope(FILE_CNEL);
    if (!reali) {
      expect(true).toBe(true);
      return;
    }
    const visti = new Set<string>();
    for (const doc of reali.documenti) {
      expect(documentoValido(doc)).toBe(true);
      const o = doc as Record<string, unknown>;
      expect(visti.has(o["id"] as string)).toBe(false);
      visti.add(o["id"] as string);
      expect(o["id"]).toBe(o["url"]);
      expect(o["url"] as string).not.toContain("/media/docs/");
      expect(Object.keys(o).sort()).toEqual(["abstract", "data", "id", "tipo", "titolo", "url"]);
    }
  });
});
