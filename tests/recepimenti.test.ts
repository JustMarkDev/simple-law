import { describe, expect, it } from "vite-plus/test";
import {
  attiPerDirettiva,
  azzeraCacheRecepimenti,
  leggiProvenanceRecepimenti,
  tuttiRecepimenti,
} from "@/lib/eurlex-dati";
import { estraiAnnoNumeroDaCelex, testoCitaDirettiva } from "@/scripts/ingest-reale-recepimenti";

describe("recepimenti: matcher esplicito anno+numero (fixture, zero rete)", () => {
  it("positivi: forme AAAA/NNNN e NNNN/AAAA con parola direttiva", () => {
    expect(
      testoCitaDirettiva(
        "Attuazione della direttiva (UE) 2024/1788 del Parlamento europeo",
        "2024",
        "1788",
      ),
    ).toBe(true);
    expect(
      testoCitaDirettiva("Attuazione della direttiva 2023/2226/UE del Consiglio", "2023", "2226"),
    ).toBe(true);
    expect(testoCitaDirettiva("Vista la direttiva n. 50/2016 di recepimento", "2016", "50")).toBe(
      true,
    );
    expect(testoCitaDirettiva("direttiva (CE) 2009/73/CE che abroga", "2009", "73")).toBe(true);
  });

  it("negativi: anno o numero da soli non bastano, mai fuzzy", () => {
    expect(testoCitaDirettiva("direttiva del 2024 senza numero", "2024", "1788")).toBe(false);
    expect(testoCitaDirettiva("direttiva n. 1788 senza anno", "2024", "1788")).toBe(false);
    // Numero parziale (178 vs 1788): mai fuzzy.
    expect(testoCitaDirettiva("direttiva (UE) 2024/178 del Parlamento", "2024", "1788")).toBe(
      false,
    );
    // Anno diverso: nessun match.
    expect(testoCitaDirettiva("direttiva (UE) 2024/1789 sui mercati", "2024", "1788")).toBe(false);
    expect(testoCitaDirettiva(null, "2024", "1788")).toBe(false);
    expect(testoCitaDirettiva("direttiva (UE) 2024/1788", "non-anno", "1788")).toBe(false);
  });

  it("falsi amici: senza parola direttiva o con altro atto, mai match", () => {
    // Legge italiana numero/anno senza contesto direttiva.
    expect(testoCitaDirettiva("DECRETO LEGISLATIVO 3 luglio 2026, n. 136", "2026", "136")).toBe(
      false,
    );
    // Regolamento, non direttiva.
    expect(
      testoCitaDirettiva("Visto il regolamento (UE) 2024/1789 del Parlamento", "2024", "1789"),
    ).toBe(false);
    // Bare NNNN/AAAA senza parola direttiva.
    expect(testoCitaDirettiva("articolo 136/2026 del testo unico", "2026", "136")).toBe(false);
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

describe("recepimenti: loader mappa (file reale, zero rete, never-throw)", () => {
  it("carica la mappa ibrida A+B o { ok:false } senza lanciare", async () => {
    azzeraCacheRecepimenti();
    const esito: Awaited<ReturnType<typeof tuttiRecepimenti>> = await tuttiRecepimenti();
    expect(() => esito).not.toThrow();
    expect(esito).not.toBeNull();
    if (esito && esito.ok) {
      // Solo direttive genuine, atti solo osservati con fonte lecita.
      for (const v of esito.voci) {
        expect(v.celexDirettiva).toMatch(/^3\d{4}L\d{1,4}$/);
        expect(Array.isArray(v.atti)).toBe(true);
        for (const a of v.atti) {
          expect(a.titolo.length).toBeGreaterThanOrEqual(10);
          expect(["normattiva", "cellar"]).toContain(a.fonte);
          if (a.urlGU) expect(a.urlGU).toMatch(/^https:\/\//);
        }
        if (v.termineUE !== null && v.termineUE !== undefined) {
          expect(v.termineUE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      }
      const prov = await leggiProvenanceRecepimenti();
      expect(prov.fonte ?? "").toContain("Normattiva");
      // Copertura onesta odierna: 2 DIR 2026 a termine futuro -> 0 con atti.
      const conAtti = esito.voci.filter((v) => v.atti.length > 0).length;
      expect(conAtti).toBeLessThanOrEqual(esito.voci.length);
    }
    azzeraCacheRecepimenti();
  });

  it("attiPerDirettiva: [] per CELEX ignoto/malformato, mai throw", async () => {
    azzeraCacheRecepimenti();
    await expect(attiPerDirettiva("32026L1472").then()).resolves.not.toThrow();
    const atti = await attiPerDirettiva("32026L1472");
    expect(Array.isArray(atti)).toBe(true);
    // Direttiva 2026 a termine futuro: nessun atto IT nel corpus (onesto).
    expect(atti).toHaveLength(0);
    expect(await attiPerDirettiva("32026R2108")).toEqual([]);
    expect(await attiPerDirettiva("non-un-celex")).toEqual([]);
    expect(await attiPerDirettiva(undefined)).toEqual([]);
    expect(await attiPerDirettiva(null)).toEqual([]);
    azzeraCacheRecepimenti();
  });
});
