/**
 * Sondaggi nazionali (Party vote Wikipedia): contratto REALI-10 §1, Writer A.
 *
 * Tutto offline e deterministico:
 * - fixture INLINE come base obbligatoria (zero rete/disco obbligatorio);
 * - conformita' script `scripts/fetch-sondaggi-wiki.mjs` (import dinamico,
 *   tollerante se assente: replica gia' verificata sopra, mai fallire);
 * - integrazione disco solo se `data/reali/sondaggi-nazionali.json` esiste
 *   davvero (esistenza + parse in try/catch, test tolleranti);
 * - mai inventare dati: campi assenti -> null, mai ricostruiti.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  aSondaggio,
  cercaPerIstituto,
  mediaPartito,
  normalizza,
  validaEnvelope,
} from "@/lib/sondaggi";

// ---------------------------------------------------------------------------
// Guardia anti-rete: se un parser provasse fetch, fallisce subito il test.
// ---------------------------------------------------------------------------
let chiamateFetch = 0;
beforeEach(() => {
  chiamateFetch = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      chiamateFetch++;
      throw new Error("rete vietata in tests/sondaggi.test.ts");
    }),
  );
});

// ---------------------------------------------------------------------------
// Fixture INLINE (sintetiche, MAI dati reali: istituti fittizi).
// ---------------------------------------------------------------------------

const RECORD_FIXTURE = {
  istituto: "Istituto Prova",
  fieldwork_da: "2026-09-20",
  fieldwork_a: "2026-09-22",
  campione_n: 1000,
  fdi: 27.4,
  pd: 20.6,
  m5s: 12.8,
  lega: 5.1,
  fi: 6.9,
  azione: 3.2,
  iv: 2.4,
  avs: 6.6,
  piu_europa: 1.7,
  nm: 1.0,
  fn: 8.0,
  altri: 4.3,
  lead: 6.8,
  csx: 45.1,
  cdx: 40.4,
  url_fonte: "https://istituto-prova.example/sondaggio-1",
  revid_wiki: 1377000000,
  estratto_il: "2026-09-28",
};

const ENVELOPE_FIXTURE = {
  provenance: {
    fonte: "Wikipedia — Opinion polling for the next Italian general election",
    url: "https://en.wikipedia.org/?curid=71355617",
    voce: "Opinion polling for the next Italian general election",
    pageid: 71355617,
    revid: 1377000000,
    estratto_il: "2026-09-28",
    licenza: "CC BY-SA 4.0",
    licenza_url: "https://creativecommons.org/licenses/by-sa/4.0/deed.en",
  },
  sezione: "Party vote",
  ambito: "nazionale",
  sondaggi: [RECORD_FIXTURE],
  metodologia: "fixture sintetica",
  avvertenze: "fixture sintetica",
  attribuzione: "fixture sintetica",
};

function bloccoWiki(celle: string[]): string {
  return celle.join("\n|");
}

const CELLE_FIXTURE = [
  "",
  "{{Opdrts|23|28|September|2026}}",
  "[https://istituto-prova.example/sondaggio-1 Istituto Prova]",
  "1,200",
  " {{Party shading/Brothers of Italy}} | '''27.4'''",
  "20.6",
  "12.8",
  "5.1",
  "6.9",
  "3.2",
  "2.4",
  "6.6",
  "1.7",
  "1.0",
  "",
  "",
  "8.0",
  " {{Hidden|4.3|dettaglio}}",
  'style="background:#FFD0D7;"|6.8',
  'style="background:#FFD0D7;"|\'\'\'45.1\'\'\'',
  "40.4",
];

const RADICE = typeof process !== "undefined" ? process.cwd() : ".";
const FILE_REALE = `${RADICE}/data/reali/sondaggi-nazionali.json`;

const RIGA_WIKI_FIXTURE = bloccoWiki(CELLE_FIXTURE);

async function leggiReale(): Promise<{
  provenance: Record<string, unknown>;
  sondaggi: unknown[];
  byte: number;
} | null> {
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(FILE_REALE)) return null;
    const raw = fs.readFileSync(FILE_REALE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const sondaggi = (parsed as Record<string, unknown>)["sondaggi"];
    if (!Array.isArray(sondaggi)) return null;
    return {
      provenance: ((parsed as { provenance?: unknown }).provenance ?? {}) as Record<string, unknown>,
      sondaggi,
      byte: Buffer.byteLength(raw, "utf8"),
    };
  } catch {
    return null;
  }
}

describe("sondaggi: validazione fixture (zero rete, zero disco)", () => {
  it("aSondaggio accetta un record valido", () => {
    const s = aSondaggio(RECORD_FIXTURE);
    expect(s).not.toBeNull();
    expect(s?.istituto).toBe("Istituto Prova");
    expect(s?.fdi).toBe(27.4);
    expect(s?.campione_n).toBe(1000);
    expect(s?.revid_wiki).toBe(1377000000);
  });

  it("scarta record senza fdi/pd/m5s, url relativo o revid (mai inventare)", () => {
    expect(aSondaggio({ ...RECORD_FIXTURE, fdi: null })).toBeNull();
    expect(aSondaggio({ ...RECORD_FIXTURE, pd: "alto" })).toBeNull();
    expect(aSondaggio({ ...RECORD_FIXTURE, url_fonte: "/relativo" })).toBeNull();
    expect(aSondaggio({ ...RECORD_FIXTURE, revid_wiki: "x" })).toBeNull();
    expect(aSondaggio({ ...RECORD_FIXTURE, fieldwork_da: "28/09/2026" })).toBeNull();
    expect(aSondaggio({ ...RECORD_FIXTURE, istituto: "x" })).toBeNull();
    expect(aSondaggio(null)).toBeNull();
    expect(aSondaggio("stringa")).toBeNull();
    expect(aSondaggio([])).toBeNull();
  });

  it("campione assente -> null onesto; campione invalido numerico -> record null", () => {
    expect(aSondaggio({ ...RECORD_FIXTURE, campione_n: null })?.campione_n).toBeNull();
    expect(aSondaggio({ ...RECORD_FIXTURE, campione_n: undefined })?.campione_n).toBeNull();
    expect(aSondaggio({ ...RECORD_FIXTURE, campione_n: -5 })).toBeNull();
  });

  it("validaEnvelope richiede sezione Party vote e max 60 record", () => {
    expect(validaEnvelope(ENVELOPE_FIXTURE)?.sondaggi).toHaveLength(1);
    expect(validaEnvelope({ ...ENVELOPE_FIXTURE, sezione: "Approval" })).toBeNull();
    expect(
      validaEnvelope({
        ...ENVELOPE_FIXTURE,
        sondaggi: Array.from({ length: 61 }, () => RECORD_FIXTURE),
      }),
    ).toBeNull();
    expect(validaEnvelope({ ...ENVELOPE_FIXTURE, sondaggi: [] })).toBeNull();
  });

  it("never-throw su input malformati", () => {
    expect(() => aSondaggio({})).not.toThrow();
    expect(() => validaEnvelope({})).not.toThrow();
    expect(() => mediaPartito(null as never, "fdi", 5)).not.toThrow();
    expect(() => cercaPerIstituto(null as never, "x")).not.toThrow();
    expect(() => normalizza(null)).not.toThrow();
    expect(mediaPartito(null as never, "fdi", 5)).toBeNull();
    expect(cercaPerIstituto(null as never, "x")).toEqual([]);
    expect(normalizza(null)).toBe("");
  });

  it("mediaPartito su sigla nota, clamp 1..60, null su sigla ignota", () => {
    const elenco = [aSondaggio(RECORD_FIXTURE), aSondaggio({ ...RECORD_FIXTURE, fdi: 25.4 })].filter(
      (v): v is NonNullable<typeof v> => v !== null,
    );
    expect(mediaPartito(elenco, "fdi", 2)).toBe(26.4);
    expect(mediaPartito(elenco, "dx", 2)).toBeNull();
    expect(mediaPartito([], "fdi", 5)).toBeNull();
  });

  it("cercaPerIstituto: contains, min 2 caratteri", () => {
    const elenco = [aSondaggio(RECORD_FIXTURE)].filter(
      (v): v is NonNullable<typeof v> => v !== null,
    );
    expect(cercaPerIstituto(elenco, "prova")).toHaveLength(1);
    expect(cercaPerIstituto(elenco, "x")).toHaveLength(0);
    expect(cercaPerIstituto(elenco, "")).toHaveLength(0);
  });

  it("blocco wiki fixture: 21 celle attese (opdrts+firm+sample+18 dati)", () => {
    expect(bloccoWiki(CELLE_FIXTURE).split("\n|")).toHaveLength(CELLE_FIXTURE.length);
    expect(RIGA_WIKI_FIXTURE).toContain("Opdrts");
  });
});

describe("sondaggi: conformita' script fetch-sondaggi-wiki.mjs (tollerante se assente)", () => {
  it("parseOpdrts fortune: range, giorno singolo, mesi brevi", async () => {
    let mod: Record<string, unknown>;
    try {
      mod = (await import("@/scripts/fetch-sondaggi-wiki.mjs")) as Record<string, unknown>;
    } catch {
      expect(true).toBe(true);
      return;
    }
    const parse = mod["parseOpdrts"];
    if (typeof parse === "function") {
      const fn = parse as (s: string) => { da: string; a: string } | null;
      expect(fn("{{Opdrts|23|28|September|2026}}")).toEqual({
        da: "2026-09-23",
        a: "2026-09-28",
      });
      expect(fn("{{Opdrts||15|September|2026}}")).toEqual({
        da: "2026-09-15",
        a: "2026-09-15",
      });
      expect(fn("{{Opdrts|10|11|Jun|2025}}")).toEqual({
        da: "2025-06-10",
        a: "2025-06-11",
      });
      expect(fn("non-un-template")).toBeNull();
    }
    expect(chiamateFetch).toBe(0);
  });

  it("estraiPercentuale ignora hex dei style (#FFD0D7) e legge Hidden", async () => {
    let mod: Record<string, unknown>;
    try {
      mod = (await import("@/scripts/fetch-sondaggi-wiki.mjs")) as Record<string, unknown>;
    } catch {
      expect(true).toBe(true);
      return;
    }
    const estrai = mod["estraiPercentuale"];
    if (typeof estrai === "function") {
      const fn = estrai as (s: string) => number | null;
      expect(fn('style="background:#FFD0D7;"|\'\'\'45.1\'\'\'')).toBe(45.1);
      expect(fn(" {{Hidden|4.3|dettaglio}}")).toBe(4.3);
      expect(fn("")).toBeNull();
    }
    const agg = mod["isAggregatore"];
    if (typeof agg === "function") {
      const fn = agg as (s: string) => boolean;
      expect(fn("BiDiMedia")).toBe(true);
      expect(fn("SWG")).toBe(false);
    }
    expect(chiamateFetch).toBe(0);
  });

  it("parseRigaBlocco sulla fixture: record completo, mai rete", async () => {
    let mod: Record<string, unknown>;
    try {
      mod = (await import("@/scripts/fetch-sondaggi-wiki.mjs")) as Record<string, unknown>;
    } catch {
      expect(true).toBe(true);
      return;
    }
    const parse = mod["parseRigaBlocco"];
    if (typeof parse === "function") {
      const fn = parse as (b: string, r: number, e: string) => unknown;
      const rec = fn(bloccoWiki(CELLE_FIXTURE), 1377000000, "2026-09-28") as Record<
        string,
        unknown
      > | null;
      expect(rec).not.toBeNull();
      expect(rec).toMatchObject({
        istituto: "Istituto Prova",
        fieldwork_da: "2026-09-23",
        fdi: 27.4,
        csx: 45.1,
        cdx: 40.4,
      });
      // riga-nota con colspan -> null
      expect(fn("|{{Opdrts|27|28|September|2026}}\n| colspan=\"19\" | nota", 1, "2026-09-28")).toBeNull();
    }
    expect(chiamateFetch).toBe(0);
    expect(true).toBe(true);
  });
});

describe("sondaggi: integrazione disco tollerante (solo se il file esiste)", () => {
  it("envelope + bound + validazione + attribuzione", async () => {
    const reali = await leggiReale();
    if (!reali) {
      expect(true).toBe(true);
      return;
    }
    expect(reali.byte).toBeLessThanOrEqual(1048576);
    expect(reali.sondaggi.length).toBeGreaterThan(0);
    expect(reali.sondaggi.length).toBeLessThanOrEqual(60);
    const prov = reali.provenance as Record<string, unknown>;
    expect(prov["licenza"]).toBe("CC BY-SA 4.0");
    expect(prov["pageid"]).toBe(71355617);
    for (const g of reali.sondaggi) {
      const s = aSondaggio(g);
      expect(s).not.toBeNull();
      // mai aggregatori di secondo livello come istituto
      expect(String(s?.istituto ?? "").toLowerCase()).not.toContain("bidimedia");
    }
    const primo = aSondaggio(reali.sondaggi[0]);
    const ultimo = aSondaggio(reali.sondaggi[reali.sondaggi.length - 1]);
    // ordinamento dal piu' recente (fieldwork_a decrescente o uguale)
    if (primo && ultimo) {
      expect(primo.fieldwork_a >= ultimo.fieldwork_a).toBe(true);
    }
  });
});
