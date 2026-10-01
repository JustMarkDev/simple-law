import { describe, expect, it } from "vite-plus/test";
import {
  PERSONA_NUMERI,
  PERSONA_NUMERO_ARCHIVIO,
  PERSONA_NUMERO_HOME,
  coloreSemaforoRecord,
  personeDelRecord,
  personaRilevanteRecord,
} from "@/lib/filtri-leggi";
import { normalizeLaw, personaRelevant } from "@/components/seed-fallback";
import { getSeedLaws } from "@/lib/sources";

const PERSONE = ["guida", "lavoro", "impresa", "studio"] as const;

describe("lib/filtri-leggi: contratto condiviso", () => {
  it("PERSONA_NUMERI copre i numeri noti 133/139/124/36/8", () => {
    expect(PERSONA_NUMERI["133"]).toEqual(["impresa", "lavoro", "guida"]);
    expect(PERSONA_NUMERI["139"]).toEqual(["guida", "impresa", "lavoro"]);
    expect(PERSONA_NUMERI["124"]).toEqual(["impresa", "lavoro"]);
    expect(PERSONA_NUMERI["36"]).toEqual(["lavoro", "impresa", "studio"]);
    expect(PERSONA_NUMERI["8"]).toEqual(["lavoro", "impresa"]);
  });

  it("alias di compatibilita' HOME e ARCHIVIO", () => {
    expect(PERSONA_NUMERO_HOME).toBe(PERSONA_NUMERI);
    expect(PERSONA_NUMERO_ARCHIVIO).toBe(PERSONA_NUMERI);
  });

  it("coloreSemaforoRecord: regole non-vigore, scaduti, da adottare, verde", () => {
    expect(coloreSemaforoRecord({ stato: "in_vigore" })).toBe("verde");
    expect(
      coloreSemaforoRecord({
        stato: "in_vigore",
        attuativi: { daAdottare: 2, adottati: 0, scaduti: 0 },
      }),
    ).toBe("giallo");
    expect(
      coloreSemaforoRecord({
        stato: "in_vigore",
        attuativi: { daAdottare: 2, adottati: 2, scaduti: 0 },
      }),
    ).toBe("verde");
    expect(
      coloreSemaforoRecord({
        stato: "in_vigore",
        attuativi: { daAdottare: 2, adottati: 0, scaduti: 1 },
      }),
    ).toBe("rosso");
    for (const stato of ["non vigente", "abrogata", "decaduta", "sospesa"]) {
      expect(coloreSemaforoRecord({ stato })).toBe("rosso");
    }
  });

  it("personaRilevanteRecord: tutti e stringa vuota sono sempre veri", () => {
    const record = { numero: "9999", titolo: "Energia", sintesi: "Sintesi" };
    expect(personaRilevanteRecord(record, "tutti")).toBe(true);
    expect(personaRilevanteRecord(record, "")).toBe(true);
  });

  it("personeDelRecord: mappa per numero e fallback", () => {
    expect(personeDelRecord({ numero: "133", titolo: "", sintesi: "" })).toEqual([
      "impresa",
      "lavoro",
      "guida",
    ]);
    // Testo vuoto dopo trim: fallback lavoro+impresa
    expect(personeDelRecord({ numero: "9999", titolo: "  ", sintesi: " " })).toEqual([
      "lavoro",
      "impresa",
    ]);
    // Regex su testo in minuscolo
    expect(
      personeDelRecord({ numero: "9999", titolo: "Nuove regole per la patente", sintesi: "" }),
    ).toContain("guida");
    expect(
      personeDelRecord({ numero: "9999", titolo: "Contratti di lavoro", sintesi: "" }),
    ).toContain("lavoro");
  });

  it("never-throw con input malformati", () => {
    const malformati: unknown[] = [
      undefined,
      null,
      0,
      42,
      "",
      [],
      {},
      { stato: 42, attuativi: "no" },
      { numero: null, titolo: 7, sintesi: {} },
      { attuativi: { daAdottare: Number.NaN, adottati: Infinity, scaduti: -3 } },
    ];
    for (const input of malformati) {
      expect(() => coloreSemaforoRecord(input as never)).not.toThrow();
      expect(() => personeDelRecord(input as never)).not.toThrow();
      expect(() => personaRilevanteRecord(input as never, "lavoro")).not.toThrow();
      expect(() => personaRilevanteRecord(input as never, "tutti")).not.toThrow();
    }
    expect(coloreSemaforoRecord(undefined as never)).toBe("verde");
    expect(coloreSemaforoRecord(null as never)).toBe("verde");
    expect(personeDelRecord(undefined as never)).toEqual(["lavoro", "impresa"]);
    expect(personaRilevanteRecord(undefined as never, "tutti")).toBe(true);
    expect(personaRilevanteRecord(undefined as never, "")).toBe(true);
  });
});

describe("equivalenza condiviso vs seed-fallback (campione seed)", () => {
  it("colore e persona coincidono con normalizeLaw/personaRelevant su almeno 200 record", () => {
    const seed = getSeedLaws();
    expect(seed.length).toBeGreaterThanOrEqual(200);
    const campione = seed.slice(0, Math.max(200, Math.min(seed.length, 500)));
    expect(campione.length).toBeGreaterThanOrEqual(200);

    const divergenzeColore: string[] = [];
    const divergenzePersona: string[] = [];

    for (const record of campione) {
      const atteso = normalizeLaw(record).stato;
      const ottenuto = coloreSemaforoRecord(record);
      if (ottenuto !== atteso) {
        divergenzeColore.push(
          `numero=${String(record.numero)} eli=${String(record.eli)} atteso=${atteso} ottenuto=${ottenuto}`,
        );
      }
      const normalizzata = normalizeLaw(record);
      for (const persona of [...PERSONE, "tutti", ""] as const) {
        const att = personaRelevant(normalizzata, persona);
        const ott = personaRilevanteRecord(record, persona);
        if (ott !== att) {
          divergenzePersona.push(
            `numero=${String(record.numero)} persona=${persona} atteso=${att} ottenuto=${ott}`,
          );
        }
      }
      // Coerenza interna: personeDelRecord contiene persona <=> personaRilevanteRecord vera
      const elenco = personeDelRecord(record);
      for (const persona of PERSONE) {
        const inElenco = elenco.includes(persona);
        const rilevante = personaRilevanteRecord(record, persona);
        if (inElenco !== rilevante) {
          divergenzePersona.push(
            `numero=${String(record.numero)} persona=${persona} elenco=${inElenco} rilevante=${rilevante} (incoerenza interna)`,
          );
        }
      }
    }

    // Tolleranza vietata al silenzio: ogni divergenza deve essere documentata,
    // mai nascosta. Se compaiono, il messaggio le elenca per registrarle come
    // skip motivati.
    expect(
      divergenzeColore,
      divergenzeColore.length > 0
        ? `Divergenze colore trovate (${divergenzeColore.length}): ${divergenzeColore.slice(0, 10).join(" | ")}`
        : "nessuna divergenza colore",
    ).toEqual([]);
    expect(
      divergenzePersona,
      divergenzePersona.length > 0
        ? `Divergenze persona trovate (${divergenzePersona.length}): ${divergenzePersona.slice(0, 10).join(" | ")}`
        : "nessuna divergenza persona",
    ).toEqual([]);
  });
});
