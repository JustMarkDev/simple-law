import { describe, expect, it } from "vite-plus/test";
import {
  ANNO_MAX,
  ANNO_MIN,
  ATTI_ESPANSI,
  NUMERI_RISERVATI,
  calcolaGulpease,
  contaParole,
  eliValido,
  nirValido,
  provaCercaPerEli,
  provaContaAtti,
  provaListaAtti,
} from "../lib/seed-data-espansa";

describe("seed espanso realistico", () => {
  it("contiene tra 60 e 120 atti", () => {
    expect(ATTI_ESPANSI.length).toBeGreaterThanOrEqual(60);
    expect(ATTI_ESPANSI.length).toBeLessThanOrEqual(120);
  });

  it("ha esattamente 2 atti di riferimento e gli altri dimostrativi", () => {
    const riferimento = ATTI_ESPANSI.filter((a) => !a.dimostrativo);
    const dimostrativi = ATTI_ESPANSI.filter((a) => a.dimostrativo);
    expect(riferimento.length).toBe(2);
    expect(dimostrativi.length).toBe(ATTI_ESPANSI.length - 2);
  });

  it("ogni ELI è valido", () => {
    for (const atto of ATTI_ESPANSI) {
      expect(eliValido(atto.eli), `ELI non valido: ${atto.eli}`).toBe(true);
    }
  });

  it("ogni NIR è valido", () => {
    for (const atto of ATTI_ESPANSI) {
      expect(nirValido(atto.nir), `NIR non valido: ${atto.nir}`).toBe(true);
    }
  });

  it("ELI e NIR sono unici", () => {
    const eli = ATTI_ESPANSI.map((a) => a.eli);
    const nir = ATTI_ESPANSI.map((a) => a.nir);
    expect(new Set(eli).size).toBe(eli.length);
    expect(new Set(nir).size).toBe(nir.length);
  });

  it("nessun numero riservato collide (8, 36, 124, 133, 139)", () => {
    const vietati = new Set<number>([...NUMERI_RISERVATI]);
    for (const atto of ATTI_ESPANSI) {
      expect(vietati.has(atto.numero), `Numero riservato usato: ${atto.eli}`).toBe(false);
    }
  });

  it("anni tra 1948 e 2026 e date coerenti con ELI e NIR", () => {
    for (const atto of ATTI_ESPANSI) {
      expect(atto.anno).toBeGreaterThanOrEqual(ANNO_MIN);
      expect(atto.anno).toBeLessThanOrEqual(ANNO_MAX);
      expect(atto.dataEmanazione.startsWith(String(atto.anno))).toBe(true);
      expect(atto.eli.includes(`/${atto.anno}/`)).toBe(true);
      expect(atto.nir.includes(`${atto.anno}-`)).toBe(true);
      const data = new Date(`${atto.dataEmanazione}T00:00:00.000Z`);
      expect(Number.isNaN(data.getTime())).toBe(false);
      expect(data.getUTCFullYear()).toBe(atto.anno);
    }
  });

  it("numero e anno coerenti tra ELI, NIR e scheda", () => {
    for (const atto of ATTI_ESPANSI) {
      expect(atto.eli.endsWith(`/${atto.numero}`)).toBe(true);
      expect(atto.nir.endsWith(`;${atto.numero}`)).toBe(true);
      expect(atto.numero).toBeGreaterThan(0);
    }
  });

  it("testi tra 300 e 800 parole con rinvii espliciti", () => {
    for (const atto of ATTI_ESPANSI) {
      const parole = contaParole(atto.testo);
      expect(parole, `Parole fuori intervallo per ${atto.eli}: ${parole}`).toBeGreaterThanOrEqual(
        300,
      );
      expect(parole, `Parole fuori intervallo per ${atto.eli}: ${parole}`).toBeLessThanOrEqual(800);
      expect(atto.testo.toLowerCase()).toMatch(/rinvi|ai sensi|art\./);
    }
  });

  it("titoli e sintesi sono in italiano, non ripetitivi e non segnaposto", () => {
    const titoli = ATTI_ESPANSI.map((a) => a.titolo);
    expect(new Set(titoli).size).toBe(titoli.length);
    for (const atto of ATTI_ESPANSI) {
      expect(atto.titolo.trim().length).toBeGreaterThan(12);
      expect(atto.sintesi.trim().length).toBeGreaterThan(30);
      expect(atto.testo).not.toMatch(/lorem ipsum/i);
      expect(atto.titolo.split(/\s+/).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("Gulpease calcolabile per ogni atto", () => {
    for (const atto of ATTI_ESPANSI) {
      const valore = calcolaGulpease(atto.testo);
      expect(valore, `Gulpease non calcolabile: ${atto.eli}`).not.toBeNull();
      expect(Number.isFinite(valore as number)).toBe(true);
    }
  });

  it("copre tipi diversi e un arco storico ampio", () => {
    const tipi = new Set(ATTI_ESPANSI.map((a) => a.tipo));
    expect(tipi.size).toBeGreaterThanOrEqual(5);
    const anni = ATTI_ESPANSI.map((a) => a.anno);
    expect(Math.max(...anni) - Math.min(...anni)).toBeGreaterThanOrEqual(40);
    expect(anni.some((a) => a <= 1970)).toBe(true);
    expect(anni.some((a) => a >= 2020)).toBe(true);
  });

  it("AIR, attuativi, fiducia e omnibus sono coerenti", () => {
    for (const atto of ATTI_ESPANSI) {
      expect(Number.isInteger(atto.attuativiPrevisti) && atto.attuativiPrevisti >= 0).toBe(true);
      expect(Number.isInteger(atto.attuativiAdottati) && atto.attuativiAdottati >= 0).toBe(true);
      expect(atto.attuativiAdottati).toBeLessThanOrEqual(atto.attuativiPrevisti);
      expect(typeof atto.air).toBe("boolean");
      expect(typeof atto.fiducia).toBe("boolean");
      expect(typeof atto.omnibus).toBe("boolean");
      if (atto.fiducia) {
        expect(["Decreto-Legge", "Legge"]).toContain(atto.tipo);
      }
    }
  });

  it("le funzioni di accesso non lanciano mai eccezioni", () => {
    expect(() => provaListaAtti()).not.toThrow();
    expect(() => provaContaAtti()).not.toThrow();
    expect(() => provaCercaPerEli(ATTI_ESPANSI[0]?.eli ?? "")).not.toThrow();
    expect(() => provaCercaPerEli(undefined)).not.toThrow();
    const lista = provaListaAtti();
    expect(lista.ok).toBe(true);
    const ricerca = provaCercaPerEli(ATTI_ESPANSI[0]?.eli ?? "");
    expect(ricerca.ok).toBe(true);
  });
});
