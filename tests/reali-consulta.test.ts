/**
 * Consulta (Corte Costituzionale, pronunce 2001): contratto W3.
 *
 * Tutto offline e deterministico:
 * - fixture INLINE come base obbligatoria (zero rete/disco obbligatorio);
 * - integrazione disco solo se `data/reali/consulta-pronunce-2001.json`
 *   esiste davvero (esistenza + parse in try/catch, test tolleranti);
 * - mai inventare dati: campi assenti -> omessi, mai ricostruiti.
 */

import { describe, expect, it } from "vite-plus/test";
import {
  aPronuncia,
  cercaPronunce,
  contaPerTipologia,
  filtraPerTipologia,
  pagina,
} from "@/lib/consulta";

const VOCE_FIXTURE = {
  numero: "1",
  anno: "2001",
  dataDecisione: "2000-12-15",
  dataDeposito: "2001-01-04",
  tipologia: "O",
  presidente: "SANTOSUOSSO",
  redattore: "",
  relatore: "Massimo Vari",
  epigrafe: "nei giudizi di legittimita costituzionale dell'art. 6, comma 5",
  dispositivo: "LA CORTE COSTITUZIONALE dichiara la manifesta infondatezza",
  testo_troncato: true,
  ecli: "ECLI:IT:COST:2001:1",
  scheda: "https://www.cortecostituzionale.it/scheda-pronuncia/2001/1",
};

const VOCE_SENTENZA = {
  numero: "2",
  anno: "2001",
  dataDecisione: "2001-01-10",
  dataDeposito: "2001-02-01",
  tipologia: "S",
  presidente: "SANTOSUOSSO",
  relatore: "Annibale Marini",
  epigrafe: "giudizio di legittimita costituzionale",
  dispositivo: "dichiara non fondata la questione",
  ecli: "ECLI:IT:COST:2001:2",
  scheda: "https://www.cortecostituzionale.it/scheda-pronuncia/2001/2",
};

const RADICE = typeof process !== "undefined" ? process.cwd() : ".";
const FILE_CONSULTA = `${RADICE}/data/reali/consulta-pronunce-2001.json`;

async function leggiReali(): Promise<{
  provenance: Record<string, unknown>;
  anno: unknown;
  totaleAnno: unknown;
  pronunce: unknown[];
  byte: number;
} | null> {
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(FILE_CONSULTA)) return null;
    const raw = fs.readFileSync(FILE_CONSULTA, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const pronunce = (parsed as { pronunce?: unknown }).pronunce;
    if (!Array.isArray(pronunce)) return null;
    return {
      provenance: ((parsed as { provenance?: unknown }).provenance ?? {}) as Record<
        string,
        unknown
      >,
      anno: (parsed as { anno?: unknown }).anno,
      totaleAnno: (parsed as { totaleAnno?: unknown }).totaleAnno,
      pronunce,
      byte: Buffer.byteLength(raw, "utf8"),
    };
  } catch {
    return null;
  }
}

describe("consulta: normalizzazione fixture (zero rete, zero disco)", () => {
  it("aPronuncia accetta una voce valida con scheda prescritta", () => {
    const p = aPronuncia(VOCE_FIXTURE);
    expect(p).not.toBeNull();
    expect(p?.numero).toBe("1");
    expect(p?.anno).toBe("2001");
    expect(p?.tipologia).toBe("O");
    expect(p?.ecli).toBe("ECLI:IT:COST:2001:1");
    expect(p?.scheda).toBe("https://www.cortecostituzionale.it/scheda-pronuncia/2001/1");
    expect(p?.testo_troncato).toBe(true);
  });

  it("scarta voci senza numero, anno o scheda (mai inventare)", () => {
    expect(aPronuncia({ ...VOCE_FIXTURE, numero: "" })).toBeNull();
    expect(aPronuncia({ ...VOCE_FIXTURE, anno: "" })).toBeNull();
    expect(aPronuncia({ ...VOCE_FIXTURE, scheda: "http://malevolo.example/x" })).toBeNull();
    expect(aPronuncia(null)).toBeNull();
    expect(aPronuncia(undefined)).toBeNull();
    expect(aPronuncia("stringa")).toBeNull();
    expect(aPronuncia([])).toBeNull();
  });

  it("omette ECLI e date malformate invece di inventarle", () => {
    const p = aPronuncia({ ...VOCE_FIXTURE, ecli: "NON-UN-ECLI", dataDecisione: "15-12-2000" });
    expect(p).not.toBeNull();
    expect(p?.ecli).toBeUndefined();
    expect(p?.dataDecisione).toBeUndefined();
  });

  it("never-throw su input malformati", () => {
    expect(() => aPronuncia({})).not.toThrow();
    expect(() => cercaPronunce(null as never, "x")).not.toThrow();
    expect(() => filtraPerTipologia(null as never, "S")).not.toThrow();
    expect(() => pagina(null as never, 1, 20)).not.toThrow();
    expect(() => contaPerTipologia(null as never)).not.toThrow();
    expect(cercaPronunce(null as never, "x")).toEqual([]);
    expect(filtraPerTipologia(null as never, "S")).toEqual([]);
  });

  it("cerca per numero/ECLI/giudice, filtro tipologia, paginazione bounded", () => {
    const elenco = [aPronuncia(VOCE_FIXTURE), aPronuncia(VOCE_SENTENZA)].filter(
      (p): p is NonNullable<typeof p> => p !== null,
    );
    expect(cercaPronunce(elenco, "ecli:it:cost:2001:2")).toHaveLength(1);
    expect(cercaPronunce(elenco, "vari")).toHaveLength(1);
    expect(cercaPronunce(elenco, "x")).toHaveLength(2);
    expect(filtraPerTipologia(elenco, "S")).toHaveLength(1);
    expect(filtraPerTipologia(elenco, "O")).toHaveLength(1);
    expect(pagina(elenco, 1, 10)).toHaveLength(2);
    expect(pagina(elenco, 2, 10)).toHaveLength(0);
    expect(pagina(elenco, 1, 999)).toHaveLength(2);
    const conteggi = contaPerTipologia(elenco);
    expect(conteggi).toHaveLength(2);
  });
});

describe("consulta: integrazione disco tollerante (solo se il file esiste)", () => {
  it("envelope con provenance CC BY-SA 3.0 e bound rispettati", async () => {
    const reali = await leggiReali();
    if (!reali) {
      expect(true).toBe(true);
      return;
    }
    expect(reali.provenance["fonte"]).toBe("cortecostituzionale");
    expect(reali.provenance["licenza"]).toBe("CC BY-SA 3.0");
    expect(typeof reali.provenance["url"]).toBe("string");
    expect((reali.provenance["url"] as string).startsWith("https://")).toBe(true);
    expect(reali.anno).toBe("2001");
    expect(reali.totaleAnno).toBe(447);
    expect(reali.pronunce.length).toBeGreaterThan(0);
    expect(reali.pronunce.length).toBeLessThanOrEqual(50);
    expect(reali.byte).toBeLessThanOrEqual(950 * 1024);
  });

  it("ogni record ha numero+anno+scheda reali, mai campi inventati", async () => {
    const reali = await leggiReali();
    if (!reali) {
      expect(true).toBe(true);
      return;
    }
    const visti = new Set<string>();
    for (const voce of reali.pronunce) {
      const p = aPronuncia(voce);
      expect(p).not.toBeNull();
      expect(/^\d+$/.test(p?.numero ?? "")).toBe(true);
      expect(p?.anno).toBe("2001");
      expect(p?.scheda).toBe(
        `https://www.cortecostituzionale.it/scheda-pronuncia/2001/${p?.numero}`,
      );
      if (p?.ecli) expect(/^ECLI:IT:COST:2001:\d+$/.test(p.ecli)).toBe(true);
      if (p?.dataDecisione) expect(/^\d{4}-\d{2}-\d{2}$/.test(p.dataDecisione)).toBe(true);
      if (p?.dataDeposito) expect(/^\d{4}-\d{2}-\d{2}$/.test(p.dataDeposito)).toBe(true);
      if (p?.tipologia) expect(["S", "O"]).toContain(p.tipologia);
      const chiave = `${p?.anno}/${p?.numero}`;
      expect(visti.has(chiave)).toBe(false);
      visti.add(chiave);
    }
    const numeri = [...visti].map((k) => Number(k.split("/")[1])).sort((a, b) => a - b);
    expect(numeri[0]).toBe(1);
  });
});
