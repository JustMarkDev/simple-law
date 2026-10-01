/**
 * Test ingest Emilia-Romagna 2024 — fixture INLINE, MAI rete.
 *
 * Tracciato DAIT 20 colonne a livello candidato×sezione (header reale
 * incollato dallo ZIP regionali-20241117): il parser legge SOLO gli indici
 * whitelist 0,1,2,3,4,5,6,7,8,9,10,11,12,18,19; MAI 13-17 (candidato,
 * NUM_LISTA). Aggregazione onesta: e/v/b/nulle/contestate 1x per sezione,
 * voti per lista sommati.
 */

import { describe, expect, it } from "vite-plus/test";
import {
  affluenza,
  interoNonNegativo,
  isHeader,
  normalizzaLista,
  parseRiga,
  spezzaRiga,
  unaDecimale,
} from "@/scripts/ingest-reale-elezioni-emilia-2024";

const HEADER_REALE = [
  "REGIONE",
  "CIRCOSCRIZIONE",
  "COMUNE",
  "SEZIONE",
  "ELETTORI_UOMINI",
  "ELETTORI_DONNE",
  "ELETTORI_TOTALI",
  "VOTANTI_UOMINI",
  "VOTANTI_DONNE",
  "VOTANTI_TOTALI",
  "SCHEDE_NULLE",
  "SCHEDE_BIANCHE",
  "SCHEDE_CONTESTATE",
  "NUM_CANDIDATO",
  "COGNOME_CANDIDATO",
  "NOME_CANDIDATO",
  "VOTI_CANDIDATO",
  "NUM_LISTA",
  "LISTA",
  "VOTI_LISTA",
];

function riga(campi: string[]): string[] {
  return campi;
}

describe("emilia 2024 — parser puro (zero rete, zero disco)", () => {
  it("isHeader riconosce il tracciato 20 colonne e rifiuta gli altri", () => {
    expect(isHeader(HEADER_REALE)).toBe(true);
    expect(isHeader([...HEADER_REALE.slice(0, 19)])).toBe(false);
    expect(isHeader([])).toBe(false);
  });

  it("spezzaRiga gestisce ; quotati", () => {
    expect(spezzaRiga('A;"B;C";D')).toEqual(["A", "B;C", "D"]);
    expect(spezzaRiga('"X""Y";Z')).toEqual(['X"Y', "Z"]);
  });

  it("parseRiga legge solo whitelist e ignora i candidati", () => {
    const campi = [
      "EMILIA-ROMAGNA",
      "BOLOGNA",
      "ALTO RENO TERME",
      "1",
      "477",
      "497",
      "974",
      "148",
      "147",
      "295",
      "4",
      "2",
      "0",
      "2",
      "UGOLINI",
      "ELENA",
      "143",
      "6",
      "FRATELLI D'ITALIA - GIORGIA MELONI",
      "90",
    ];
    const r = parseRiga(riga(campi), 2);
    expect(r).not.toBeNull();
    expect(r?.comune).toBe("ALTO RENO TERME");
    expect(r?.elettori).toBe(974);
    expect(r?.votanti).toBe(295);
    expect(r?.lista).toBe("FRATELLI D'ITALIA - GIORGIA MELONI");
    expect(r?.votiLista).toBe(90);
  });

  it("parseRiga scarta regioni diverse e righe malformate", () => {
    const altra = [
      "LOMBARDIA",
      "MILANO",
      "MILANO",
      "1",
      "1",
      "1",
      "2",
      "1",
      "1",
      "2",
      "0",
      "0",
      "0",
      "1",
      "ROSSI",
      "MARIO",
      "1",
      "1",
      "LISTA X",
      "1",
    ];
    expect(parseRiga(riga(altra), 2)).toBeNull();
    const corta = ["EMILIA-ROMAGNA", "BOLOGNA"];
    expect(() => parseRiga(riga(corta), 3)).toThrow();
  });

  it("parseRiga rifiuta lista vuota con voti e accetta lista vuota a zero", () => {
    const base = [
      "EMILIA-ROMAGNA",
      "BOLOGNA",
      "VERGATO",
      "2",
      "100",
      "100",
      "200",
      "50",
      "50",
      "100",
      "1",
      "2",
      "0",
      "",
      "",
      "",
      "",
      "",
      "",
      "0",
    ];
    const r = parseRiga(riga(base), 2);
    expect(r?.lista).toBe("");
    expect(r?.votiLista).toBe(0);
    const ko = [...base];
    ko[19] = "5";
    expect(() => parseRiga(riga(ko), 2)).toThrow();
  });

  it("helper numerici never-throw e deterministici", () => {
    expect(interoNonNegativo("007")).toBe(7);
    expect(interoNonNegativo("-1")).toBeNull();
    expect(interoNonNegativo("x")).toBeNull();
    expect(normalizzaLista("  Forza   Italia ")).toBe("FORZA ITALIA");
    expect(unaDecimale(46.44)).toBe(46.4);
    expect(affluenza(0, 0)).toBe(0);
    expect(affluenza(8334, 15640)).toBe(53.3);
  });
});

describe("emilia 2024 — integrazione disco (tollerante se assente)", () => {
  it("envelope reale valido oppure nota di assenza", async () => {
    const { existsSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const percorso = join(
      process.cwd(),
      "data",
      "reali",
      "elezioni-regionali-2024-emilia-romagna.json",
    );
    if (!existsSync(percorso)) {
      expect(true).toBe(true);
      return;
    }
    expect(statSync(percorso).size).toBeLessThanOrEqual(950 * 1024);
    const d = JSON.parse(readFileSync(percorso, "utf8")) as Record<string, unknown>;
    const el = d["elezione"] as Record<string, unknown>;
    expect(el["data"]).toBe("2024-11-17");
    expect(el["e"]).toBe(3576451);
    expect(el["v"]).toBe(1660042);
    const liste = d["liste"] as { n: string; v: number }[];
    expect(liste.length).toBe(11);
    expect(liste[0]?.n).toContain("PARTITO DEMOCRATICO");
    const comuni = d["comuni"] as Record<string, unknown>[];
    expect(comuni.length).toBe(330);
    const serializzato = JSON.stringify(d);
    for (const k of ["COGNOME_CANDIDATO", "NOME_CANDIDATO", "PREFERENZE"]) {
      expect(serializzato).not.toContain(`"${k}"`);
    }
  });
});
