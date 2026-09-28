/**
 * Oversight ingest (ANAC/OCP 2025 + GA Focus 2026): parser/mapping su fixture
 * inline (zero rete) + integrazione disco tollerante (solo se i file esistono).
 * Mai inventare dati: campi assenti o malformati -> voce scartata (null).
 */

import { describe, expect, it } from "vitest";
import {
  gaDataIso,
  normalizzaGaVoce,
  normalizzaOcdsVoce,
  ocdsDataIso,
  parseGaArticoli,
} from "../scripts/ingest-reale-oversight";

const RISORSA_ANAC =
  "https://data.open-contracting.org/en/publication/117/download?name=2025.jsonl.gz";

const OCDS_VALIDA = {
  id: "ocds-hu01ve-3913112-2025-03-21 17:30:43.964T12:00:00Z",
  ocid: "ocds-hu01ve-3913112",
  buyer: { id: "92116650349", name: "AGENZIA INTERREGIONALE PER IL FIUME PO AIPO" },
  awards: [
    {
      id: "2314309",
      date: "2010-09-28T12:00:00Z",
      suppliers: [{ id: "09208530155", name: "DIZETA INGEGNERIA STUDIO ASSOCIATO" }],
    },
  ],
  tender: {
    id: "3913112",
    description: "SPESA PROPEDEUTICO PER INCARICO PROGETTAZIONE LAVORO TO-E-1271 M",
    tenderPeriod: { startDate: "2022-08-29T12:00:00Z", endDate: "2022-09-12T12:00:00Z" },
    items: [{ id: "9370439AE0", description: "DETTAGLIO LOTTO CIG 9370439AE0" }],
  },
};

const ARTICOLO_FOCUS = `<article class="ricerca--item"> <h3>
<a href="https://www.giustizia-amministrativa.it/web/guest/-/105486-2092" class="item-title" aria-label="Impugnazione degli atti di gara">Impugnazione degli atti di gara: l&rsquo;inversione procedimentale</a>
</h3> <div class="ricerca--item__footer row"> <div class="col-sm-12">
<a target="_blank" href="https://portali.giustizia-amministrativa.it/portale/pages/istituzionale/visualizza/?nodeRef=&amp;schema=tar_ct&amp;nrg=202600650&amp;nomeFile=202602398_01.pdf&amp;subDir=Provvedimenti" title="x">T.a.r. per la Sicilia, Catania, sezione I, 28 agosto 2026, n. 2398 - Pres. Savasta, Est. Commandatore</a><br />
</div> <div class="col-sm-12" style="font-size: 80%"> </div> </div>
<div class="ricerca--item__footer row"> <div class="col-sm-12">
<div class="col-sm-2" style="padding-left: 0px"> <strong>Materia: </strong> </div>
<div class="col-sm-10"> <span style="font-weight: bold;">CONTRATTI pubblici e obbligazioni della pubblica amministrazione</span> , <span>AGGIUDICAZIONE</span> <br /> </div>
<div class="col-sm-2" style="padding-left: 0px"> <strong>Tipologia: </strong> </div>
<div class="col-sm-10"> Focus di Giurisprudenza </div> </div> </div>
<div class="ricerca--item__footer row"> <div class="col-sm-6"> <strong>Anno di pubblicazione:</strong> 2026 </div> </div>
</article>`;

const ARTICOLO_DOTTRINA = `<article class="ricerca--item"> <h3>
<a href="https://www.giustizia-amministrativa.it/web/guest/-/158189-283" class="item-title" aria-label="Bardino N., Applicazione dei precedenti">Bardino N., Applicazione dei precedenti</a>
</h3> <div class="ricerca--item__footer row"> <div class="col-sm-12"> </div> </div>
<div class="ricerca--item__footer row"> <div class="col-sm-12">
<div class="col-sm-2" style="padding-left: 0px"> <strong>Materia: </strong> </div>
<div class="col-sm-10"> <span style="font-weight: bold;">Informatica</span> <br /> </div>
<div class="col-sm-2" style="padding-left: 0px"> <strong>Tipologia: </strong> </div>
<div class="col-sm-10"> Dottrina </div> </div> </div>
</article>`;

const RADICE = typeof process !== "undefined" ? process.cwd() : ".";
const FILE_ANAC = `${RADICE}/data/reali/oversight-anac-2025.json`;
const FILE_GA = `${RADICE}/data/reali/oversight-ga-2026.json`;

async function leggiEnvelope(file: string): Promise<{
  provenance: Record<string, unknown>;
  voci: unknown[];
  byte: number;
} | null> {
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const voci = (parsed as { voci?: unknown }).voci;
    if (!Array.isArray(voci)) return null;
    return {
      provenance: ((parsed as { provenance?: unknown }).provenance ?? {}) as Record<
        string,
        unknown
      >,
      voci,
      byte: Buffer.byteLength(raw, "utf8"),
    };
  } catch {
    return null;
  }
}

function voceValida(v: unknown): v is Record<string, unknown> {
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
    /^https?:\/\//i.test(o["url"]) &&
    typeof o["ente"] === "string" &&
    o["ente"].length > 0
  );
}

describe("oversight: mapping OCDS/ANAC (zero rete, zero disco)", () => {
  it("normalizza una release valida con soli campi osservati", () => {
    const v = normalizzaOcdsVoce(OCDS_VALIDA, RISORSA_ANAC);
    expect(v).not.toBeNull();
    expect(v?.id).toBe("ocds-hu01ve-3913112");
    expect(v?.titolo).toBe("SPESA PROPEDEUTICO PER INCARICO PROGETTAZIONE LAVORO TO-E-1271 M");
    expect(v?.data).toBe("2010-09-28");
    expect(v?.ente).toBe("AGENZIA INTERREGIONALE PER IL FIUME PO AIPO");
    expect(v?.numero).toBe("3913112");
    expect(v?.url).toBe(RISORSA_ANAC);
    expect(v?.oggetto).toBe("DETTAGLIO LOTTO CIG 9370439AE0");
  });

  it("scarta voci senza titolo, ente, data o url assoluto (mai inventare)", () => {
    expect(normalizzaOcdsVoce(null, RISORSA_ANAC)).toBeNull();
    expect(normalizzaOcdsVoce("stringa", RISORSA_ANAC)).toBeNull();
    expect(normalizzaOcdsVoce([], RISORSA_ANAC)).toBeNull();
    expect(
      normalizzaOcdsVoce({ ...OCDS_VALIDA, tender: { id: "1" } }, RISORSA_ANAC),
    ).toBeNull();
    expect(
      normalizzaOcdsVoce({ ...OCDS_VALIDA, buyer: { id: "x" } }, RISORSA_ANAC),
    ).toBeNull();
    expect(
      normalizzaOcdsVoce({ ...OCDS_VALIDA, awards: [], tender: { id: "1" } }, RISORSA_ANAC),
    ).toBeNull();
    expect(normalizzaOcdsVoce(OCDS_VALIDA, "/relativo/non-valido")).toBeNull();
  });

  it("ocdsDataIso preferisce awards.date, poi tenderPeriod.startDate", () => {
    expect(ocdsDataIso(OCDS_VALIDA as unknown as Record<string, unknown>)).toBe("2010-09-28");
    expect(
      ocdsDataIso({
        tender: { tenderPeriod: { startDate: "2022-08-29T12:00:00Z" } },
      }),
    ).toBe("2022-08-29");
    expect(ocdsDataIso({ tender: { tenderPeriod: {} } })).toBe("");
    expect(ocdsDataIso({})).toBe("");
  });

  it("never-throw su input malformati", () => {
    expect(() => normalizzaOcdsVoce({}, RISORSA_ANAC)).not.toThrow();
    expect(() => normalizzaOcdsVoce({ ocid: 1, buyer: [], tender: [] }, RISORSA_ANAC)).not.toThrow();
    expect(() => ocdsDataIso({} as Record<string, unknown>)).not.toThrow();
    expect(normalizzaOcdsVoce({}, RISORSA_ANAC)).toBeNull();
  });
});

describe("oversight: mapping GA Focus (zero rete, zero disco)", () => {
  it("gaDataIso converte date italiane 2026 e rifiuta il resto", () => {
    expect(gaDataIso("T.a.r. per la Sicilia, 28 agosto 2026, n. 2398")).toBe("2026-08-28");
    expect(gaDataIso("Consiglio di Stato, sezione V, 9 settembre 2026, n. 8")).toBe("2026-09-09");
    expect(gaDataIso("Consiglio di Stato, 9 settembre 2025, n. 8")).toBe("");
    expect(gaDataIso("senza data")).toBe("");
    expect(gaDataIso("32 gennaio 2026")).toBe("");
  });

  it("normalizza un articolo Focus con ente/numero/data osservati", () => {
    const v = normalizzaGaVoce(ARTICOLO_FOCUS);
    expect(v).not.toBeNull();
    expect(v?.id).toBe("https://www.giustizia-amministrativa.it/web/guest/-/105486-2092");
    expect(v?.url).toBe(v?.id);
    expect(v?.titolo).toContain("Impugnazione degli atti di gara");
    expect(v?.data).toBe("2026-08-28");
    expect(v?.ente).toBe("T.a.r. per la Sicilia, Catania, sezione I");
    expect(v?.numero).toBe("2398");
    expect(v?.oggetto).toContain("CONTRATTI pubblici");
  });

  it("scarta Dottrina, schede relative e articoli senza provvedimento datato", () => {
    expect(normalizzaGaVoce(ARTICOLO_DOTTRINA)).toBeNull();
    expect(normalizzaGaVoce(null)).toBeNull();
    expect(normalizzaGaVoce("")).toBeNull();
    expect(normalizzaGaVoce("<article></article>")).toBeNull();
    expect(
      normalizzaGaVoce(ARTICOLO_FOCUS.replace("28 agosto 2026", "28 agosto 2024")),
    ).toBeNull();
    expect(
      normalizzaGaVoce(
        ARTICOLO_FOCUS.replace(
          "https://www.giustizia-amministrativa.it/web/guest/-/105486-2092",
          "/relativa/scheda",
        ),
      ),
    ).toBeNull();
  });

  it("parseGaArticoli estrae i blocchi articolo (never-throw)", () => {
    expect(() => parseGaArticoli("html senza articoli")).not.toThrow();
    expect(parseGaArticoli("html senza articoli")).toEqual([]);
    expect(parseGaArticoli(`${ARTICOLO_FOCUS}${ARTICOLO_DOTTRINA}`)).toHaveLength(2);
  });
});

describe("oversight: integrazione disco tollerante (solo se i file esistono)", () => {
  it("envelope ANAC con provenance CC BY 4.0 e bound rispettati", async () => {
    const reali = await leggiEnvelope(FILE_ANAC);
    if (!reali) {
      expect(true).toBe(true);
      return;
    }
    expect(reali.provenance["fonte"]).toContain("open-contracting");
    expect(reali.provenance["licenza"]).toBe("CC BY 4.0");
    expect(typeof reali.provenance["url"]).toBe("string");
    expect((reali.provenance["url"] as string).startsWith("https://")).toBe(true);
    expect(typeof reali.provenance["recuperatoIl"]).toBe("string");
    expect(reali.voci.length).toBeGreaterThan(0);
    expect(reali.voci.length).toBeLessThanOrEqual(100);
    expect(reali.byte).toBeLessThanOrEqual(950 * 1024);
  });

  it("ogni voce ANAC ha id+titolo+data+url assoluto+ente (mai inventati)", async () => {
    const reali = await leggiEnvelope(FILE_ANAC);
    if (!reali) {
      expect(true).toBe(true);
      return;
    }
    const visti = new Set<string>();
    for (const voce of reali.voci) {
      expect(voceValida(voce)).toBe(true);
      const o = voce as Record<string, unknown>;
      expect(visti.has(o["id"] as string)).toBe(false);
      visti.add(o["id"] as string);
      // Le voci salvate hanno gia' lo schema semplificato {id,titolo,data,
      // url,ente,numero?}: la validita' e' garantita da voceValida sopra
      // (il normalizzatore OCDS accetta solo release grezze, non voci salvate).
      expect(Object.keys(o).sort()).toEqual(
        expect.arrayContaining(["data", "ente", "id", "titolo", "url"]),
      );
    }
  });

  it("envelope GA con provenance onesta e bound rispettati", async () => {
    const reali = await leggiEnvelope(FILE_GA);
    if (!reali) {
      expect(true).toBe(true);
      return;
    }
    expect(reali.provenance["fonte"]).toContain("giustizia-amministrativa");
    expect(typeof reali.provenance["licenza"]).toBe("string");
    expect(typeof reali.provenance["url"]).toBe("string");
    expect((reali.provenance["url"] as string).startsWith("https://")).toBe(true);
    expect(reali.voci.length).toBeGreaterThan(0);
    expect(reali.voci.length).toBeLessThanOrEqual(50);
    expect(reali.byte).toBeLessThanOrEqual(950 * 1024);
  });

  it("ogni voce GA ha id+titolo+data 2026+url scheda+ente (mai inventati)", async () => {
    const reali = await leggiEnvelope(FILE_GA);
    if (!reali) {
      expect(true).toBe(true);
      return;
    }
    const visti = new Set<string>();
    for (const voce of reali.voci) {
      expect(voceValida(voce)).toBe(true);
      const o = voce as Record<string, unknown>;
      expect((o["data"] as string).startsWith("2026-")).toBe(true);
      expect((o["url"] as string).includes("/web/guest/-/")).toBe(true);
      expect(visti.has(o["id"] as string)).toBe(false);
      visti.add(o["id"] as string);
    }
  });
});
