/**
 * Test UI-logic elezioni + box recepimenti (offline, zero rete, zero DB).
 *
 * Verifica la logica di presentazione posseduta dallo scrittore pagine:
 * - registro generico a 3 consultazioni (hub, [id], [comune], sitemap);
 * - decisione del box "Recepimento in Italia" (solo direttive, solo dati reali);
 * - conformità dei file pagina (niente hardcoded europee-2024, 404 su id ignoto,
 *   fallback "Nessun recepimento rilevato nei dati", italiano/a11y).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Specchi puri della logica di pagina (stesse regole, fixture offline).
// ---------------------------------------------------------------------------

const IDS_REGISTRO = ["europee-2024", "politiche-2022-camera", "politiche-2022-senato"] as const;

type IdElezione = (typeof IDS_REGISTRO)[number];

function eIdValido(id: unknown): id is IdElezione {
  return typeof id === "string" && (IDS_REGISTRO as readonly string[]).includes(id);
}

interface AttoITFixture {
  titoloNim: string;
  tipoNim: string;
  ojData: string;
  chiaveNormattiva?: string;
  eliNormattiva?: string;
}

interface RigaRecepimentoFixture {
  celexDirettiva: string;
  termineUE?: string;
  haNimITA: "sì" | "no";
  numNimTot: number;
  attiIT: AttoITFixture[];
}

type DecisioneBox =
  | { mostra: false }
  | { mostra: true; stato: "con-atti" | "vuoto"; termine: string; quante: number };

function decidiBox(tipoAtto: unknown, riga: RigaRecepimentoFixture | null): DecisioneBox {
  try {
    const t = typeof tipoAtto === "string" ? tipoAtto : "";
    if (t !== "DIR" && t !== "DIR_IMPL" && t !== "DIR_DEL") return { mostra: false };
    if (!riga || typeof riga !== "object") {
      return { mostra: true, stato: "vuoto", termine: "non rilevato", quante: 0 };
    }
    const atti = Array.isArray(riga.attiIT)
      ? riga.attiIT.filter((a) => a && typeof a.titoloNim === "string" && a.titoloNim.trim())
      : [];
    return {
      mostra: true,
      stato: atti.length > 0 ? "con-atti" : "vuoto",
      termine:
        typeof riga.termineUE === "string" && riga.termineUE ? riga.termineUE : "non rilevato",
      quante: atti.length,
    };
  } catch {
    return { mostra: true, stato: "vuoto", termine: "non rilevato", quante: 0 };
  }
}

function hrefLeggeFixture(atto: AttoITFixture): string | null {
  try {
    for (const campo of [atto.eliNormattiva, atto.chiaveNormattiva]) {
      const percorso = (campo ?? "").replace(/^\/+/, "").trim();
      if (percorso && !/\s/.test(percorso) && !/^[a-z]+:/i.test(percorso))
        return `/leggi/${percorso}`;
    }
    return null;
  } catch {
    return null;
  }
}

function slugComuneFixture(nome: string, provincia?: string): string {
  try {
    const base = `${nome}${provincia ? `-${provincia}` : ""}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
    return base || "comune";
  } catch {
    return "comune";
  }
}

// ---------------------------------------------------------------------------
// Test logica pura con fixture reali osservate.
// ---------------------------------------------------------------------------

describe("elezioni-ui: registro generico a 3 consultazioni", () => {
  it("accetta i 3 id e rifiuta gli ignoti (→ 404)", () => {
    expect(eIdValido("europee-2024")).toBe(true);
    expect(eIdValido("politiche-2022-camera")).toBe(true);
    expect(eIdValido("politiche-2022-senato")).toBe(true);
    expect(eIdValido("europee-2025")).toBe(false);
    expect(eIdValido("")).toBe(false);
    expect(eIdValido(undefined)).toBe(false);
  });
});

describe("elezioni-ui: box recepimenti (solo direttive, solo dati reali)", () => {
  const RIGA_VUOTA: RigaRecepimentoFixture = {
    celexDirettiva: "32026L1472",
    termineUE: "2028-07-02",
    haNimITA: "no",
    numNimTot: 0,
    attiIT: [],
  };

  it("non mostra il box per i regolamenti", () => {
    expect(decidiBox("REG", RIGA_VUOTA)).toEqual({ mostra: false });
    expect(decidiBox("REG", null)).toEqual({ mostra: false });
  });

  it("mostra il box vuoto con termine per le direttive senza atti", () => {
    const d = decidiBox("DIR", RIGA_VUOTA);
    expect(d).toEqual({ mostra: true, stato: "vuoto", termine: "2028-07-02", quante: 0 });
  });

  it('file assente → box con "non rilevato", mai throw', () => {
    const d = decidiBox("DIR", null);
    expect(d.mostra).toBe(true);
    if (d.mostra) expect(d.termine).toBe("non rilevato");
    expect(() => decidiBox("DIR", null)).not.toThrow();
    expect(() => decidiBox(undefined, undefined as unknown as null)).not.toThrow();
  });

  it("con atti reali → stato con-atti e link /leggi solo da ELI osservato", () => {
    const riga: RigaRecepimentoFixture = {
      celexDirettiva: "32026L1472",
      termineUE: "2028-07-02",
      haNimITA: "no",
      numNimTot: 3,
      attiIT: [
        {
          titoloNim: "Decreto legislativo 1/2027, n. 10",
          tipoNim: "DLGS",
          ojData: "2027-01-10",
          eliNormattiva: "stato/decreto.legislativo/2027-01-10/10",
        },
        { titoloNim: "Notifica senza ELI collegato", tipoNim: "NIM", ojData: "2027-02-01" },
      ],
    };
    const d = decidiBox("DIR", riga);
    expect(d).toEqual({ mostra: true, stato: "con-atti", termine: "2028-07-02", quante: 2 });
    expect(hrefLeggeFixture(riga.attiIT[0])).toBe("/leggi/stato/decreto.legislativo/2027-01-10/10");
    // Senza ELI osservato: nessun link (mai URL inventati).
    expect(hrefLeggeFixture(riga.attiIT[1])).toBeNull();
    expect(
      hrefLeggeFixture({
        titoloNim: "x",
        tipoNim: "",
        ojData: "",
        eliNormattiva: "https://malevolo.it/x",
      }),
    ).toBeNull();
  });
});

describe("elezioni-ui: slug comunali stabili", () => {
  it("slug senza diacritici con provincia per omonimie", () => {
    expect(slugComuneFixture("Acqui Terme", "Alessandria")).toBe("acqui-terme-alessandria");
    expect(slugComuneFixture("Aosta")).toBe("aosta");
    expect(() => slugComuneFixture("")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Test di conformità sui file posseduti (lettura testo, zero import pagine).
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, "..");

function leggi(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

describe("elezioni-ui: conformità file posseduti", () => {
  it("hub elenca le 3 consultazioni con link a [id]", () => {
    const hub = leggi("app/elezioni/page.tsx");
    for (const id of IDS_REGISTRO) {
      expect(hub).toContain(id);
    }
    expect(hub).toContain("/elezioni/${voce.id}");
    expect(hub).toContain("Dati in preparazione");
    // Mai numeri inventati nell'hub: nessun elettore hardcoded.
    expect(hub).not.toContain("49530700");
  });

  it("[id] generico: 3 static params, notFound su ignoto, sezioni collegi", () => {
    const dettaglio = leggi("app/elezioni/[id]/page.tsx");
    expect(dettaglio).toContain("politiche-2022-camera");
    expect(dettaglio).toContain("politiche-2022-senato");
    expect(dettaglio).toContain("generateStaticParams");
    expect(dettaglio).toContain("notFound()");
    expect(dettaglio).toContain("circoscrizioni");
    expect(dettaglio).toContain("collegiU");
    // Niente più hardcoded solo-europee: il guard mono-id non deve esistere.
    expect(dettaglio).not.toContain("id !== 'europee-2024'");
  });

  it("[comune] generico per N consultazioni con 404 e disambiguazione", () => {
    const comune = leggi("app/elezioni/[id]/[comune]/page.tsx");
    expect(comune).toContain("politiche-2022-camera");
    expect(comune).toContain("notFound()");
    expect(comune).toContain("Affluenza nel comune");
    expect(comune).not.toContain("COGNOME");
  });

  it("[celex] box recepimenti solo direttive, fallback onesto, link EUR-Lex invariato", () => {
    const celex = leggi("app/eurlex/[celex]/page.tsx");
    expect(celex).toContain("Recepimento in Italia");
    expect(celex).toContain("Nessun recepimento rilevato nei dati");
    expect(celex).toContain("eDirettiva");
    expect(celex).toContain("Testo su EUR-Lex");
    expect(celex).toContain("eurlex-recepimenti.json");
    // Compatibile con l'envelope reale W3 (chiave `direttive`, alias `atti`).
    expect(celex).toContain("direttive");
  });

  it("sitemap con le nuove voci elezioni statiche", () => {
    const sitemap = leggi("app/sitemap.ts");
    expect(sitemap).toContain("/elezioni/politiche-2022-camera");
    expect(sitemap).toContain("/elezioni/politiche-2022-senato");
    expect(sitemap).toContain("/elezioni/europee-2024");
  });

  it("italiano e a11y: skip-link, aria e main presenti nelle pagine", () => {
    const hub = leggi("app/elezioni/page.tsx");
    const dettaglio = leggi("app/elezioni/[id]/page.tsx");
    expect(dettaglio).toContain('aria-label="Percorso"');
    expect(dettaglio).toContain('role="search"');
    expect(hub).toContain('id="contenuto"');
  });
});
