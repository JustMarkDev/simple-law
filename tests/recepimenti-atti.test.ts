import { describe, expect, it } from "vitest";
import {
  attiCollegatiPerDirettiva,
  azzeraCacheAttiCollegati,
  leggiProvenanceAttiCollegati,
  tuttiAttiCollegati,
} from "@/lib/eurlex-dati";
import {
  estraiAnnoNumeroDaCelex,
  testoCitaDirettiva,
} from "@/scripts/ingest-reale-recepimenti-atti";

describe("recepimenti-atti: matcher esplicito anno+numero (fixture, zero rete)", () => {
  it("positivi: label Camera / titolo Normattiva con parola direttiva entro 60ch", () => {
    expect(
      testoCitaDirettiva(
        "BRAMBILLA: Modifiche al decreto legislativo n. 122, recante attuazione della direttiva 2008/120/CE che stabilisce norme minime",
        "2008",
        "120",
      ),
    ).toBe(true);
    expect(
      testoCitaDirettiva(
        "Attuazione della direttiva (UE) 2019/944 relativa al mercato interno",
        "2019",
        "944",
      ),
    ).toBe(true);
    expect(
      testoCitaDirettiva(
        "attuazione della direttiva 2014/65/UE del Parlamento europeo",
        "2014",
        "65",
      ),
    ).toBe(true);
  });

  it("negativi: anno o numero da soli non bastano, mai fuzzy", () => {
    expect(testoCitaDirettiva("direttiva del 2019 senza numero", "2019", "944")).toBe(false);
    expect(testoCitaDirettiva("direttiva n. 944 senza anno", "2019", "944")).toBe(false);
    expect(
      testoCitaDirettiva("direttiva (UE) 2019/94 sul mercato", "2019", "944"),
    ).toBe(false);
    expect(
      testoCitaDirettiva("direttiva (UE) 2019/945 sul mercato", "2019", "944"),
    ).toBe(false);
    expect(testoCitaDirettiva(null, "2019", "944")).toBe(false);
    expect(testoCitaDirettiva("direttiva (UE) 2019/944", "non-anno", "944")).toBe(false);
  });

  it("falsi amici: regolamenti, leggi, anni scolastici e bare NNNN/AAAA mai match", () => {
    expect(
      testoCitaDirettiva("Visto il regolamento (UE) 2014/65 del Parlamento", "2014", "65"),
    ).toBe(false);
    expect(
      testoCitaDirettiva("DECRETO LEGISLATIVO 3 luglio 2026, n. 136", "2026", "136"),
    ).toBe(false);
    expect(testoCitaDirettiva("articolo 944/2019 del testo unico", "2019", "944")).toBe(false);
    expect(
      testoCitaDirettiva("a.s. 2024/2025 e organico scolastico", "2024", "2025"),
    ).toBe(false);
    // Parola direttiva troppo lontana (>60ch prima del riferimento): no match.
    expect(
      testoCitaDirettiva(
        `direttiva europea ${"x".repeat(80)} 2019/944`,
        "2019",
        "944",
      ),
    ).toBe(false);
    expect(() => testoCitaDirettiva(undefined, undefined, undefined)).not.toThrow();
  });

  it("estrae anno/numero dal CELEX direttiva, mai throw", () => {
    expect(estraiAnnoNumeroDaCelex("32026L1472")).toEqual({ anno: "2026", numero: "1472" });
    expect(estraiAnnoNumeroDaCelex("32026l1194")).toEqual({ anno: "2026", numero: "1194" });
    expect(estraiAnnoNumeroDaCelex("32026R2108")).toBeNull();
    expect(estraiAnnoNumeroDaCelex("non-un-celex")).toBeNull();
    expect(() => estraiAnnoNumeroDaCelex(undefined)).not.toThrow();
  });
});

describe("recepimenti-atti: loader mappa (file reale, zero rete, never-throw)", () => {
  it("carica la mappa o { ok:false } senza lanciare; solo voci con atti osservati", async () => {
    azzeraCacheAttiCollegati();
    const esito: Awaited<ReturnType<typeof tuttiAttiCollegati>> =
      await tuttiAttiCollegati();
    expect(() => esito).not.toThrow();
    expect(esito).not.toBeNull();
    if (esito && esito.ok) {
      // Copertura onesta odierna: 2 DIR 2026 a termine futuro, non citate
      // nei corpora Camera/Normattiva -> 0 voci (direttive senza match assenti).
      for (const v of esito.voci) {
        expect(v.celexDirettiva).toMatch(/^3\d{4}L\d{1,4}$/);
        // Direttive senza match -> assenti: mai voci vuote.
        expect(v.atti.length).toBeGreaterThan(0);
        expect(v.atti.length).toBeLessThanOrEqual(20);
        for (const a of v.atti) {
          expect(a.titolo.length).toBeGreaterThanOrEqual(10);
          expect(["camera", "normattiva"]).toContain(a.fonte);
          if (a.uri) {
            expect(a.uri).toMatch(
              /^https?:\/\/(dati\.camera\.it|www\.camera\.it|www\.normattiva\.it|www\.gazzettaufficiale\.it)\//,
            );
          }
        }
      }
      const prov = await leggiProvenanceAttiCollegati();
      expect(prov.fonte ?? "").toContain("Camera");
      expect(prov.vociConMatch ?? 0).toBe(esito.voci.length);
    }
    azzeraCacheAttiCollegati();
  });

  it("attiCollegatiPerDirettiva: [] per CELEX ignoto/malformato, mai throw", async () => {
    azzeraCacheAttiCollegati();
    await expect(attiCollegatiPerDirettiva("32026R2108").then()).resolves.not.toThrow();
    expect(await attiCollegatiPerDirettiva("32026R2108")).toEqual([]);
    expect(await attiCollegatiPerDirettiva("non-un-celex")).toEqual([]);
    expect(await attiCollegatiPerDirettiva(undefined)).toEqual([]);
    expect(await attiCollegatiPerDirettiva(null)).toEqual([]);
    // CELEX direttiva genuino ma senza match nel corpus -> [] onesto.
    const vuoti = await attiCollegatiPerDirettiva("32026L1472");
    expect(Array.isArray(vuoti)).toBe(true);
    const esito = await tuttiAttiCollegati();
    if (esito.ok) {
      const nota = esito.voci.find((v) => v.celexDirettiva === "32026L1472");
      expect(vuoti).toEqual(nota ? nota.atti : []);
    } else {
      expect(vuoti).toEqual([]);
    }
    azzeraCacheAttiCollegati();
  });
});
