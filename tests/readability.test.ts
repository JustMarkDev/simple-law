import { describe, expect, it } from "vite-plus/test";
import {
  calcFleschVacca,
  calcGulpease,
  contaBisTer,
  contaFrasi,
  contaLettere,
  contaParole,
  contaRinvii,
  livelloSemplice,
} from "@/lib/readability";

describe("conteggi di base", () => {
  it("conta parole, lettere e frasi", () => {
    const testo = "Questo e' un testo molto lungo e complicato.";
    expect(contaParole(testo)).toBe(8);
    expect(contaLettere(testo)).toBe(35);
    expect(contaFrasi(testo)).toBe(1);
  });

  it("gestisce testo vuoto", () => {
    expect(contaParole("")).toBe(0);
    expect(contaLettere("")).toBe(0);
    expect(contaFrasi("")).toBe(0);
  });

  it("conta piu' frasi", () => {
    expect(contaFrasi("Uno. Due! Tre?")).toBe(3);
  });
});

describe("calcGulpease", () => {
  it("applica la formula e arrotonda", () => {
    expect(calcGulpease("Questo e' un testo molto lungo e complicato.")).toEqual({
      indice: 83,
      parole: 8,
      frasi: 1,
      lettere: 35,
    });
  });

  it("limita l'indice a 100", () => {
    expect(calcGulpease("Ciao mondo.").indice).toBe(100);
  });

  it("restituisce zeri per testo vuoto", () => {
    expect(calcGulpease("")).toEqual({ indice: 0, parole: 0, frasi: 0, lettere: 0 });
  });

  it("assegna un indice piu' alto al testo semplice", () => {
    const semplice = "Il gatto dorme. Il cane corre. La casa e' bella.";
    const complesso =
      "Considerata la complessita' delle disposizioni normative vigenti, l'amministrazione procede all'adeguamento dei procedimenti entro i termini stabiliti dalla normativa di settore applicabile.";
    expect(calcGulpease(semplice).indice).toBeGreaterThan(calcGulpease(complesso).indice);
  });
});

describe("calcFleschVacca", () => {
  it("restituisce un valore nell'intervallo 0-100", () => {
    const valore = calcFleschVacca("Ciao mondo.");
    expect(valore).toBeGreaterThanOrEqual(0);
    expect(valore).toBeLessThanOrEqual(100);
  });
});

describe("rinvii e bis/ter", () => {
  it("conta i rinvii", () => {
    const testo =
      "Ai sensi dell'articolo 5 e della legge n. 3 del 2020, si applica il decreto legislativo n. 36.";
    expect(contaRinvii(testo)).toBeGreaterThanOrEqual(3);
  });

  it("conta gli articoli/comi bis e ter", () => {
    expect(contaBisTer("Il comma 2-bis e l'articolo 3 ter e il 4 quater")).toBe(3);
  });

  it("non conta nulla su testo semplice", () => {
    expect(contaRinvii("Il gatto dorme.")).toBe(0);
    expect(contaBisTer("Il gatto dorme.")).toBe(0);
  });
});

describe("livelloSemplice", () => {
  it("classifica le soglie", () => {
    expect(livelloSemplice(85)).toBe("facile");
    expect(livelloSemplice(80)).toBe("facile");
    expect(livelloSemplice(65)).toBe("medio");
    expect(livelloSemplice(60)).toBe("medio");
    expect(livelloSemplice(59)).toBe("difficile");
  });
});
