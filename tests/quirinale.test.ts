/**
 * Quirinale (comunicati + atti): contratto REALI-4, Writer B.
 *
 * Tutto offline e deterministico:
 * - fixture INLINE come base obbligatoria (zero rete/disco obbligatorio);
 * - integrazione disco solo se `data/reali/quirinale-*.json` esistono
 *   davvero (esistenza + parse in try/catch, test tolleranti);
 * - mai inventare dati: campi assenti -> null, mai ricostruiti; nessun
 *   numero/stato deriva dagli atti.
 */

import { describe, expect, it } from "vite-plus/test";
import { aAttoQuirinale, aComunicato, cercaQuirinale, normalizza } from "@/lib/quirinale-dati";

const COMUNICATO_FIXTURE = {
  id: "https://www.quirinale.it/it/comunicato/dichiarazione-presidente-mattarella-occasione-capodanno-ebraico-6",
  tipo: "comunicato-quirinale",
  titolo: "Dichiarazione del Presidente Mattarella in occasione del Capodanno ebraico",
  data: "2026-09-12",
  sintesi:
    "Il Presidente della Repubblica, Sergio Mattarella, in occasione del Capodanno ebraico...",
  url: "https://www.quirinale.it/it/comunicato/dichiarazione-presidente-mattarella-occasione-capodanno-ebraico-6",
};

const ATTO_FIXTURE = {
  id: "https://www.quirinale.it/elementi/412665",
  tipo: "atto-quirinale",
  titolo: "Decreto Legge 28/09/2026 (In attesa di pubblicazione)",
  sottotipo: "ATTI NORMATIVI - Emanazione decreti-legge",
  descrizione: "Misure urgenti per la circolazione dei veicoli ad alimentazione diesel Euro 5.",
  data: "2026-09-28",
  url: "https://www.quirinale.it/elementi/412665",
};

const RADICE = typeof process !== "undefined" ? process.cwd() : ".";
const FILE_COM = `${RADICE}/data/reali/quirinale-comunicati.json`;
const FILE_ATTI = `${RADICE}/data/reali/quirinale-atti.json`;

async function leggiReali(
  percorso: string,
  chiave: string,
): Promise<{
  provenance: Record<string, unknown>;
  voci: unknown[];
  byte: number;
} | null> {
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(percorso)) return null;
    const raw = fs.readFileSync(percorso, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const voci = (parsed as Record<string, unknown>)[chiave];
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

describe("quirinale: normalizzazione fixture (zero rete, zero disco)", () => {
  it("aComunicato accetta una voce valida", () => {
    const c = aComunicato(COMUNICATO_FIXTURE);
    expect(c).not.toBeNull();
    expect(c?.tipo).toBe("comunicato-quirinale");
    expect(c?.data).toBe("2026-09-12");
    expect(c?.url.startsWith("https://www.quirinale.it/it/comunicato/")).toBe(true);
  });

  it("aAttoQuirinale accetta una voce valida senza numero/stato", () => {
    const a = aAttoQuirinale(ATTO_FIXTURE);
    expect(a).not.toBeNull();
    expect(a?.tipo).toBe("atto-quirinale");
    expect(a?.sottotipo).toBe("ATTI NORMATIVI - Emanazione decreti-legge");
    expect(a ? "numero" in a : false).toBe(false);
    expect(a ? "stato" in a : false).toBe(false);
  });

  it("scarta voci senza data+titolo+link assoluto (mai inventare)", () => {
    expect(aComunicato({ ...COMUNICATO_FIXTURE, titolo: "corto" })).toBeNull();
    expect(aComunicato({ ...COMUNICATO_FIXTURE, data: "12/09/2026" })).toBeNull();
    expect(aComunicato({ ...COMUNICATO_FIXTURE, url: "/it/comunicato/relativo" })).toBeNull();
    expect(aComunicato({ ...COMUNICATO_FIXTURE, url: "https://malevolo.example/x" })).toBeNull();
    expect(aAttoQuirinale({ ...ATTO_FIXTURE, titolo: "" })).toBeNull();
    expect(aAttoQuirinale({ ...ATTO_FIXTURE, data: "non-una-data" })).toBeNull();
    expect(aAttoQuirinale(null)).toBeNull();
    expect(aAttoQuirinale(undefined)).toBeNull();
    expect(aAttoQuirinale("stringa")).toBeNull();
    expect(aAttoQuirinale([])).toBeNull();
  });

  it("never-throw su input malformati", () => {
    expect(() => aComunicato({})).not.toThrow();
    expect(() => aAttoQuirinale({})).not.toThrow();
    expect(() => cercaQuirinale(null as never, "x")).not.toThrow();
    expect(() => normalizza(null)).not.toThrow();
    expect(cercaQuirinale(null as never, "x")).toEqual([]);
    expect(normalizza(null)).toBe("");
  });

  it("cerca per titolo/sottotipo, min 2 caratteri", () => {
    const elenco = [aComunicato(COMUNICATO_FIXTURE), aAttoQuirinale(ATTO_FIXTURE)].filter(
      (v): v is NonNullable<typeof v> => v !== null,
    );
    expect(cercaQuirinale(elenco, "mattarella")).toHaveLength(1);
    expect(cercaQuirinale(elenco, "decreti-legge")).toHaveLength(1);
    expect(cercaQuirinale(elenco, "x")).toHaveLength(2);
  });
});

describe("quirinale: integrazione disco tollerante (solo se i file esistono)", () => {
  it("comunicati: envelope + bound + validazione", async () => {
    const reali = await leggiReali(FILE_COM, "comunicati");
    if (!reali) {
      expect(true).toBe(true);
      return;
    }
    expect(reali.provenance["fonte"]).toBe("quirinale.it");
    expect(typeof reali.provenance["url"]).toBe("string");
    expect((reali.provenance["url"] as string).startsWith("https://")).toBe(true);
    expect(typeof reali.provenance["licenza"]).toBe("string");
    expect(reali.voci.length).toBeGreaterThan(0);
    expect(reali.voci.length).toBeLessThanOrEqual(25);
    expect(reali.byte).toBeLessThanOrEqual(950 * 1024);
    const visti = new Set<string>();
    for (const voce of reali.voci) {
      const c = aComunicato(voce);
      expect(c).not.toBeNull();
      expect((c?.titolo ?? "").length).toBeGreaterThanOrEqual(10);
      expect(/^\d{4}-\d{2}-\d{2}$/.test(c?.data ?? "")).toBe(true);
      expect(c?.url.startsWith("https://www.quirinale.it/it/comunicato/")).toBe(true);
      expect(visti.has(c?.url ?? "")).toBe(false);
      visti.add(c?.url ?? "");
    }
  });

  it("atti: envelope + bound + mai numero/stato", async () => {
    const reali = await leggiReali(FILE_ATTI, "atti");
    if (!reali) {
      expect(true).toBe(true);
      return;
    }
    expect(reali.provenance["fonte"]).toBe("quirinale.it");
    expect(reali.voci.length).toBeGreaterThan(0);
    expect(reali.voci.length).toBeLessThanOrEqual(25);
    expect(reali.byte).toBeLessThanOrEqual(950 * 1024);
    const visti = new Set<string>();
    for (const voce of reali.voci) {
      const a = aAttoQuirinale(voce);
      expect(a).not.toBeNull();
      expect((a?.titolo ?? "").length).toBeGreaterThanOrEqual(10);
      expect(/^\d{4}-\d{2}-\d{2}$/.test(a?.data ?? "")).toBe(true);
      expect(a?.url.startsWith("https://www.quirinale.it/elementi/")).toBe(true);
      expect(
        voce && typeof voce === "object"
          ? "numero" in (voce as object)
            ? (voce as Record<string, unknown>)["numero"]
            : undefined
          : undefined,
      ).toBeUndefined();
      expect(
        voce && typeof voce === "object"
          ? "stato" in (voce as object)
            ? (voce as Record<string, unknown>)["stato"]
            : undefined
          : undefined,
      ).toBeUndefined();
      expect(visti.has(a?.url ?? "")).toBe(false);
      visti.add(a?.url ?? "");
    }
  });
});
