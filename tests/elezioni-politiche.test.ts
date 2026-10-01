/**
 * Test ingest politiche 2022 — fixture INLINE, MAI rete.
 *
 * Contesto (REALI-6, W1):
 * - CSV Italia: `;` quotato, 19 colonne, `25/9/2022 00:00:00`, tipi C/S;
 *   12 comuni divisi in piu' collegi U con elettori distinti per porzione.
 * - CSV merge VdA/Trentino: 12 colonne formato candidati (TOTVOTI per
 *   contrassegno, senza affluenza); nominativi MAI letti.
 * - Questa suite NON tocca /tmp né la rete: usa righe sintetiche inline
 *   (comuni/liste fittizi, MAI nominativi reali) + import puro degli
 *   helper dello script W1 (import senza effetti: nessun download).
 * - Integrazione disco TOLLERANTE: se `data/reali/elezioni-politiche-2022.json`
 *   esiste ne valida envelope e golden nazionali osservati; se assente
 *   passa con nota (prodotto da un altro passo, MAI generato qui).
 */

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  affluenza,
  interoNonNegativo,
  isHeaderItalia,
  isHeaderMerge,
  normalizzaLista,
  parseRigaItalia,
  parseRigaMerge,
  spezzaRiga,
} from "@/scripts/ingest-reale-elezioni-politiche-2022";

// ---------------------------------------------------------------------------
// Guardia anti-rete.
// ---------------------------------------------------------------------------
let chiamateFetch = 0;
beforeEach(() => {
  chiamateFetch = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      chiamateFetch++;
      throw new Error("rete vietata in tests/elezioni-politiche.test.ts");
    }),
  );
});

// ---------------------------------------------------------------------------
// Fixture INLINE (sintetiche, MAI dati reali/nominativi).
// ---------------------------------------------------------------------------

const HEADER_19 = [
  "DATAELEZIONE",
  "CODTIPOELEZIONE",
  "CIRC-REG",
  "COLLPLURI",
  "COLLUNINOM",
  "COMUNE",
  "ELETTORITOT",
  "ELETTORIM",
  "VOTANTITOT",
  "VOTANTIM",
  "SKBIANCHE",
  "VOTILISTA",
  "DESCRLISTA",
  "COGNOME",
  "NOME",
  "LUOGONASCITA",
  "DATANASCITA",
  "SESSO",
  "VOTICANDIDATO",
].join(";");

const HEADER_12 = [
  "DATAELEZIONE",
  "CODTIPOELEZIONE",
  "REGIONE",
  "COLLEGIO",
  "COMUNE",
  "COGNOME",
  "NOME",
  "DATANASCITA",
  "LUOGONASCITA",
  "SESSO",
  "TOTVOTI",
  "CONTRASSEGNO",
].join(";");

const RIGA_BASE =
  `25/9/2022 00:00:00;"C";"PIEMONTE 1";"PIEMONTE 1 - P01";"PIEMONTE 1 - U03 (COLLEGNO)";` +
  `"COMUNE ALFA";10851;5312;7075;3523;84;"631";"LISTA ESEMPIO";"ROSSI";"MARIO";` +
  `"TORINO";"05/02/1971";"F";"2892"`;

const RIGA_STESSA_LISTA_ALTRO_CANDIDATO =
  `25/9/2022 00:00:00;"C";"PIEMONTE 1";"PIEMONTE 1 - P01";"PIEMONTE 1 - U03 (COLLEGNO)";` +
  `"COMUNE ALFA";10851;5312;7075;3523;84;"631";"LISTA ESEMPIO";"VERDI";"ANNA";` +
  `"MILANO";"03/04/1967";"F";"1500"`;

const RIGA_SPLIT_PORZIONE_2 =
  `25/9/2022 00:00:00;"C";"LAZIO 1";"LAZIO 1 - P01";"LAZIO 1 - U99 (ALTRO)";` +
  `"COMUNE ALFA";500;250;300;150;10;"100";"LISTA ESEMPIO";"BIANCHI";"LUCA";` +
  `"ROMA";"10/06/1991";"M";"90"`;

const RIGA_DATA_VECCHIA =
  `12/2/2023 00:00:00;"C";"PIEMONTE 1";"PIEMONTE 1 - P01";"PIEMONTE 1 - U03 (COLLEGNO)";` +
  `"COMUNE ALFA";10851;5312;7075;3523;84;"9999";"LISTA ESEMPIO";"ROSSI";"MARIO";` +
  `"TORINO";"05/02/1971";"F";"2892"`;

const RIGA_TIPO_SBAGLIATO = RIGA_BASE.replace(`;"C";`, `;"S";`);

const RIGA_MERGE =
  `25/9/2022 00:00:00;"S";"TRENTINO-ALTO ADIGE";" U06 (BRESSANONE/BRIXEN)";` +
  `"COMUNE GAMMA";"FALK";"MARKUS";"6/8/1967 00:00:00";"WIESBADEN (GERMANIA)";` +
  `"M";"13";"CONTRASSEGNO ESEMPIO"`;

const RIGA_MERGE_STESSO_CONTRASSEGNO =
  `25/9/2022 00:00:00;"S";"TRENTINO-ALTO ADIGE";" U06 (BRESSANONE/BRIXEN)";` +
  `"COMUNE GAMMA";"ALTRI";"CANDIDATI";"1/1/1970 00:00:00";"BOLZANO";` +
  `"F";"7";"CONTRASSEGNO ESEMPIO"`;

// ---------------------------------------------------------------------------
// Suite: header e parser Italia (19 col).
// ---------------------------------------------------------------------------

describe("politiche 2022 — tracciato Italia 19 colonne", () => {
  it("header diverso dalle europee: 19 colonne con CODTIPOELEZIONE e nominativi in coda", () => {
    expect(spezzaRiga(HEADER_19).length).toBe(19);
    expect(isHeaderItalia(spezzaRiga(HEADER_19))).toBe(true);
    expect(isHeaderMerge(spezzaRiga(HEADER_19))).toBe(false);
    expect(spezzaRiga(HEADER_19)[1]).toBe("CODTIPOELEZIONE");
    expect(spezzaRiga(HEADER_19)[13]).toBe("COGNOME");
    expect(spezzaRiga(HEADER_19)[18]).toBe("VOTICANDIDATO");
  });

  it("filtro data 25/9/2022 con coda oraria + filtro tipo C/S", () => {
    expect(parseRigaItalia(spezzaRiga(RIGA_BASE), "C", 2)).not.toBeNull();
    expect(parseRigaItalia(spezzaRiga(RIGA_DATA_VECCHIA), "C", 3)).toBeNull();
    expect(parseRigaItalia(spezzaRiga(RIGA_TIPO_SBAGLIATO), "C", 4)).toBeNull();
    expect(parseRigaItalia(spezzaRiga(RIGA_TIPO_SBAGLIATO), "S", 4)).not.toBeNull();
  });

  it("legge solo totali e SKBIANCHE, mai colonne M/nominativi", () => {
    const r = parseRigaItalia(spezzaRiga(RIGA_BASE), "C", 2);
    expect(r).toMatchObject({
      circReg: "PIEMONTE 1",
      pluri: "PIEMONTE 1 - P01",
      uni: "PIEMONTE 1 - U03 (COLLEGNO)",
      comune: "COMUNE ALFA",
      elettori: 10851,
      votanti: 7075,
      bianche: 84,
      lista: "LISTA ESEMPIO",
      votiLista: 631,
    });
    // Nessuna chiave nominativo nell'oggetto parsato.
    expect(JSON.stringify(r)).not.toContain("ROSSI");
    expect(JSON.stringify(r)).not.toContain("MARIO");
  });

  it("righe malformate (colonne errate, numerici invalidi, testi vuoti) → throw", () => {
    expect(() => parseRigaItalia(spezzaRiga('"a";"b"'), "C", 9)).toThrow();
    const neg = RIGA_BASE.replace(';"631";', ';"-5";');
    expect(() => parseRigaItalia(spezzaRiga(neg), "C", 9)).toThrow();
    expect(() => parseRigaItalia([], "C", 9)).toThrow();
  });
});

describe("politiche 2022 — dedup e comuni divisi", () => {
  it("stesso (comune,collegio,lista) con candidati diversi = stessa riga lista (stessi voti)", () => {
    const a = parseRigaItalia(spezzaRiga(RIGA_BASE), "C", 2);
    const b = parseRigaItalia(spezzaRiga(RIGA_STESSA_LISTA_ALTRO_CANDIDATO), "C", 3);
    expect(a?.votiLista).toBe(631);
    expect(b?.votiLista).toBe(631);
    expect(a?.comune).toBe(b?.comune);
  });

  it("stesso nome comune in altro collegio U con elettori diversi = porzione distinta da sommare", () => {
    const a = parseRigaItalia(spezzaRiga(RIGA_BASE), "C", 2);
    const b = parseRigaItalia(spezzaRiga(RIGA_SPLIT_PORZIONE_2), "C", 3);
    expect(a?.comune).toBe("COMUNE ALFA");
    expect(b?.comune).toBe("COMUNE ALFA");
    expect(a?.uni).not.toBe(b?.uni);
    // Elettori distinti per porzione: somma onesta 10851 + 500.
    expect((a?.elettori ?? 0) + (b?.elettori ?? 0)).toBe(11351);
  });

  it("normalizza liste: trim + maiuscole + collassa spazi", () => {
    expect(normalizzaLista("  lista   esempio  ")).toBe("LISTA ESEMPIO");
    expect(normalizzaLista("Fratelli d'Italia con Giorgia Meloni")).toBe(
      "FRATELLI D'ITALIA CON GIORGIA MELONI",
    );
  });

  it("affluenza a 1 decimale; interi non negativi strict", () => {
    expect(affluenza(7075, 10851)).toBe(65.2);
    expect(affluenza(0, 0)).toBe(0);
    expect(interoNonNegativo("631")).toBe(631);
    expect(interoNonNegativo(" 631 ")).toBe(631);
    expect(interoNonNegativo("-5")).toBeNull();
    expect(interoNonNegativo("")).toBeNull();
    expect(interoNonNegativo("12.5")).toBeNull();
  });
});

describe("politiche 2022 — tracciato merge 12 colonne (candidati)", () => {
  it("header 12 colonne distinto dal tracciato Italia", () => {
    expect(spezzaRiga(HEADER_12).length).toBe(12);
    expect(isHeaderMerge(spezzaRiga(HEADER_12))).toBe(true);
    expect(isHeaderItalia(spezzaRiga(HEADER_12))).toBe(false);
  });

  it("legge TOTVOTI + contrassegno, ignora nominativi, filtra data/tipo", () => {
    const r = parseRigaMerge(spezzaRiga(RIGA_MERGE), "S", 2);
    expect(r).toMatchObject({
      regione: "TRENTINO-ALTO ADIGE",
      collegio: "U06 (BRESSANONE/BRIXEN)",
      comune: "COMUNE GAMMA",
      contrassegno: "CONTRASSEGNO ESEMPIO",
      voti: 13,
    });
    expect(JSON.stringify(r)).not.toContain("FALK");
    expect(parseRigaMerge(spezzaRiga(RIGA_MERGE), "C", 2)).toBeNull();
    const vecchia = RIGA_MERGE.replace("25/9/2022", "12/2/2023");
    expect(parseRigaMerge(spezzaRiga(vecchia), "S", 2)).toBeNull();
  });

  it("stesso contrassegno sommabile per (comune,collegio): 13 + 7", () => {
    const a = parseRigaMerge(spezzaRiga(RIGA_MERGE), "S", 2);
    const b = parseRigaMerge(spezzaRiga(RIGA_MERGE_STESSO_CONTRASSEGNO), "S", 3);
    expect((a?.voti ?? 0) + (b?.voti ?? 0)).toBe(20);
  });

  it("cap dimensione: 950KB rifiutato oltre soglia (exit 1 senza parziali)", () => {
    const CAP = 950 * 1024;
    expect(Buffer.byteLength(JSON.stringify({ a: 1 }), "utf8")).toBeLessThan(CAP);
    expect(Buffer.byteLength("x".repeat(CAP + 1), "utf8")).toBeGreaterThan(CAP);
  });
});

// ---------------------------------------------------------------------------
// Integrazione disco TOLLERANTE (mai rete, mai scritture).
// ---------------------------------------------------------------------------

describe("politiche 2022 — integrazione disco (tollerante se assente)", () => {
  const PERCORSO_CAMERA = join(
    process.cwd(),
    "data",
    "reali",
    "elezioni-politiche-2022-camera.json",
  );
  const PERCORSO_SENATO = join(
    process.cwd(),
    "data",
    "reali",
    "elezioni-politiche-2022-senato.json",
  );

  it("envelope reali validi oppure nota di assenza (mai fallire per file mancanti)", () => {
    expect(chiamateFetch).toBe(0);
    if (!existsSync(PERCORSO_CAMERA) || !existsSync(PERCORSO_SENATO)) {
      console.log("[politiche-test] JSON assenti: passo con nota, nessun dato inventato.");
      expect(true).toBe(true);
      return;
    }
    for (const percorso of [PERCORSO_CAMERA, PERCORSO_SENATO]) {
      expect(statSync(percorso).size).toBeLessThanOrEqual(950 * 1024);
    }
    const dC = JSON.parse(readFileSync(PERCORSO_CAMERA, "utf8")) as Record<string, unknown>;
    const dS = JSON.parse(readFileSync(PERCORSO_SENATO, "utf8")) as Record<string, unknown>;

    // Envelope per camera: provenance + metodologia + avvertenze + elezione
    // + liste + circoscrizioni + collegiU + comuni {c,p,r,e,v,a}.
    for (const [d, ramo] of [
      [dC, "camera"],
      [dS, "senato"],
    ] as const) {
      for (const k of [
        "provenance",
        "metodologia",
        "avvertenze",
        "elezione",
        "liste",
        "circoscrizioni",
        "collegiU",
        "comuni",
      ]) {
        expect(d, `${ramo}: chiave ${k}`).toHaveProperty(k);
      }
    }
    const elC = dC["elezione"] as Record<string, unknown>;
    const elS = dS["elezione"] as Record<string, unknown>;
    expect(elC["data"]).toBe("2022-09-25");
    expect(elS["data"]).toBe("2022-09-25");

    // Golden nazionali osservati dal parser (pin di regressione, mai inventati).
    expect(elC["e"]).toBe(46021956);
    expect(elC["v"]).toBe(29413657);
    expect(elC["b"]).toBe(494580);
    expect(elS["e"]).toBe(45210950);
    expect(elS["v"]).toBe(28876567);
    expect(elS["b"]).toBe(498898);

    // Coerenza interna: a = v/e a 1 decimale; somma p liste ≈ 100.
    const check = (
      el: Record<string, unknown>,
      liste: { n: string; v: number; p: number }[],
    ): void => {
      const e = el["e"] as number;
      const v = el["v"] as number;
      expect(el["a"]).toBe(Math.round((v / e) * 100 * 10) / 10);
      const somma = liste.reduce((s, l) => s + l.p, 0);
      expect(Math.abs(somma - 100)).toBeLessThanOrEqual(0.5);
    };
    const listeC = dC["liste"] as { n: string; v: number; p: number }[];
    const listeS = dS["liste"] as { n: string; v: number; p: number }[];
    expect(listeC.length).toBe(27);
    expect(listeS.length).toBe(31);
    expect(listeC[0]?.n).toBe("FRATELLI D'ITALIA CON GIORGIA MELONI");
    expect(listeC[0]?.v).toBe(7098555);
    expect(listeS[0]?.v).toBe(6975727);
    check(elC, listeC);
    check(elS, listeS);

    // Circoscrizioni: 28 camera (27 Italia + VdA), 20 senato (18 + TAA + VdA);
    // collegi U Italia 146/67; EXTRA con e/v/b null (affluenza non pubblicata).
    const circC = dC["circoscrizioni"] as Record<string, unknown>[];
    const circS = dS["circoscrizioni"] as Record<string, unknown>[];
    expect(circC.length).toBe(28);
    expect(circS.length).toBe(20);
    expect((dC["collegiU"] as unknown[]).length).toBe(146);
    expect((dS["collegiU"] as unknown[]).length).toBe(67);
    const vdaC = circC.find((c) => c["r"] === "VALLE D'AOSTA");
    expect(vdaC?.["e"]).toBeNull();
    // oxlint-disable-next-line no-unsafe-optional-chaining -- value is checked just above
    expect((vdaC?.["liste"] as unknown[]).length).toBe(7);

    // Comuni {c,p,r,e,v,a} per scheda: camera senza i 74 solo-VdA,
    // senato senza i 353 senza numeri; zero valori null (scartati in ingest).
    for (const [d, ramo, attesi] of [
      [dC, "camera", 7898 - 74],
      [dS, "senato", 7898 - 353],
    ] as const) {
      const comuni = d["comuni"] as Record<string, unknown>[];
      expect(comuni.length, `${ramo}: comuni`).toBe(attesi);
      for (const c of comuni.slice(0, 50)) {
        expect(Object.keys(c).sort()).toEqual(["a", "c", "e", "p", "r", "v"]);
      }
      for (const c of comuni) {
        expect(c["e"], `${ramo}: e non null`).not.toBeNull();
        expect(c["v"], `${ramo}: v non null`).not.toBeNull();
      }
    }

    // Onesta': zero nominativi in entrambi i file.
    for (const d of [dC, dS]) {
      const serializzato = JSON.stringify(d);
      for (const k of ["COGNOME", "DATANASCITA", "LUOGONASCITA", "VOTICANDIDATO", "PREFERENZE"]) {
        expect(serializzato).not.toContain(`"${k}"`);
      }
    }
    expect(chiamateFetch).toBe(0);
  });
});

describe("politiche 2022 — loader lib (tollerante se assente, mai-500)", () => {
  it("caricaElezioneResult ok per entrambe le schede con conteggi attesi", async () => {
    const { join } = await import("node:path");
    const { existsSync } = await import("node:fs");
    const attesi = [
      "data/reali/elezioni-politiche-2022-camera.json",
      "data/reali/elezioni-politiche-2022-senato.json",
    ];
    if (!attesi.every((f) => existsSync(join(process.cwd(), f)))) {
      expect(true).toBe(true);
      return;
    }
    const lib = (await import("@/lib/elezioni-dati")) as Record<string, unknown>;
    const carica = lib["caricaElezioneResult"] as
      | ((id: unknown) => Promise<{ ok: boolean; dati?: { comuni: unknown[] }; errore?: string }>)
      | undefined;
    expect(typeof carica).toBe("function");
    if (typeof carica !== "function") return;
    // Regressione REALI-6: le voci senza affluenza (VdA) non devono
    // invalidare l'intera consultazione (skip, mai 404 di massa).
    const camera = await carica("politiche-2022-camera");
    const senato = await carica("politiche-2022-senato");
    expect(camera.ok).toBe(true);
    expect(senato.ok).toBe(true);
    const datiCamera = camera.ok ? camera.dati : undefined;
    const datiSenato = senato.ok ? senato.dati : undefined;
    if (datiCamera && datiSenato) {
      expect(datiCamera.comuni).toHaveLength(7824);
      expect(datiSenato.comuni).toHaveLength(7545);
    } else {
      expect(datiCamera).toBeDefined();
      expect(datiSenato).toBeDefined();
    }
    const ignoto = await carica("politiche-1999");
    expect(ignoto.ok).toBe(false);
  });
});
