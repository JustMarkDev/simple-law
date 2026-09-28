/**
 * Test ingest regionali Toscana 2025 + Umbria 2024 — SOLO fixture INLINE, MAI rete.
 *
 * Contesto (direttiva REALI-12, scrittore elezioni W1):
 * - Toscana: voce `20251012_REGIONALI_TOSCANA_SCRUTINI.csv` dello ZIP DAIT
 *   `regionali-20251012.zip` (16 colonne, livello comunale).
 * - Umbria: voce `Regionali_Umbria_ 2024_Scrutini.csv` dello ZIP DAIT
 *   `regionali-20241117.zip` (20 colonne, livello sezione, circoscrizione unica).
 * - Whitelist loader: solo REGIONE;CIRCOSCRIZIONE;COMUNE;ELETTORI;VOTANTI;
 *   BIANCHE;NULLE;CONTESTATE;LISTA;VOTI_LISTA. Colonne candidato
 *   (NUM_CANDIDATO/COGNOME/NOME/...) MAI lette, voti presidente scartati.
 * - Questa suite NON tocca /tmp né la rete: usa righe sintetiche inline
 *   (comuni/liste fittizi, MAI nominativi reali).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type {
  RigaRegionale,
  SorgenteRegionale,
  StatoRegione,
} from "@/scripts/ingest-reale-elezioni-regionali";

// ---------------------------------------------------------------------------
// Guardia anti-rete: se il parser provasse fetch, fallisce subito il test.
// ---------------------------------------------------------------------------
let chiamateFetch = 0;
beforeEach(() => {
  chiamateFetch = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      chiamateFetch++;
      throw new Error("rete vietata in tests/elezioni-regionali-ingest.test.ts");
    }),
  );
});

async function modScript(): Promise<Record<string, unknown>> {
  return (await import(
    "@/scripts/ingest-reale-elezioni-regionali"
  )) as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Fixture INLINE (sintetiche, MAI dati reali/nominativi).
// Le colonne candidato contengono segnaposto fittizi MAI letti dal parser.
// ---------------------------------------------------------------------------

const HEADER_TOSCANA = [
  "REGIONE",
  "CIRCOSCRIZIONE",
  "COMUNE",
  "ELETTORI",
  "VOTANTI",
  "SCHEDE_BIANCHE",
  "SCHEDE_NULLE",
  "SCHEDE_CONTESTATE",
  "NUM_CANDIDATO",
  "NOME",
  "COGNOME",
  "ALTRO_NOME",
  "VOTI_CANDIDATO",
  "NUM_LISTA",
  "LISTA",
  "VOTI_LISTA",
];

const HEADER_UMBRIA = [
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

function rigaToscana(over: Record<string, string> = {}): string[] {
  const base: Record<string, string> = {
    REGIONE: "TOSCANA",
    CIRCOSCRIZIONE: "CIRCO A",
    COMUNE: "COMUNE ALFA",
    ELETTORI: "1000",
    VOTANTI: "600",
    SCHEDE_BIANCHE: "10",
    SCHEDE_NULLE: "20",
    SCHEDE_CONTESTATE: "2",
    NUM_CANDIDATO: "9",
    NOME: "NOME-ESEMPIO",
    COGNOME: "COGNOME-ESEMPIO",
    ALTRO_NOME: "",
    VOTI_CANDIDATO: "111",
    NUM_LISTA: "7",
    LISTA: "LISTA ESEMPIO UNO",
    VOTI_LISTA: "100",
  };
  return HEADER_TOSCANA.map((k) => over[k] ?? base[k] ?? "");
}

function rigaUmbria(over: Record<string, string> = {}): string[] {
  const base: Record<string, string> = {
    REGIONE: "UMBRIA",
    CIRCOSCRIZIONE: "CIRCOSCRIZIONE UMBRIA",
    COMUNE: "COMUNE BETA",
    SEZIONE: "1",
    ELETTORI_UOMINI: "100",
    ELETTORI_DONNE: "120",
    ELETTORI_TOTALI: "220",
    VOTANTI_UOMINI: "60",
    VOTANTI_DONNE: "70",
    VOTANTI_TOTALI: "130",
    SCHEDE_NULLE: "3",
    SCHEDE_BIANCHE: "4",
    SCHEDE_CONTESTATE: "1",
    NUM_CANDIDATO: "5",
    COGNOME_CANDIDATO: "COGNOME-ESEMPIO",
    NOME_CANDIDATO: "NOME-ESEMPIO",
    VOTI_CANDIDATO: "55",
    NUM_LISTA: "3",
    LISTA: "LISTA ESEMPIO DUE",
    VOTI_LISTA: "40",
  };
  return HEADER_UMBRIA.map((k) => over[k] ?? base[k] ?? "");
}

describe("regionali ingest — header e whitelist (fixture inline, MAI rete)", () => {
  it("header Toscana 16 colonne / Umbria 20 colonne negli ordini reali DAIT", async () => {
    const mod = await modScript();
    const isT = mod["isHeaderToscana"] as (c: string[]) => boolean;
    const isU = mod["isHeaderUmbria"] as (c: string[]) => boolean;
    expect(HEADER_TOSCANA.length).toBe(16);
    expect(HEADER_UMBRIA.length).toBe(20);
    expect(isT(HEADER_TOSCANA)).toBe(true);
    expect(isU(HEADER_UMBRIA)).toBe(true);
    expect(isT(HEADER_UMBRIA)).toBe(false);
    expect(isU(HEADER_TOSCANA)).toBe(false);
    expect(isT(HEADER_TOSCANA.slice(0, 15))).toBe(false);
    expect(chiamateFetch).toBe(0);
  });

  it("header con colonna candidata scambiata o mancante -> false", async () => {
    const mod = await modScript();
    const isT = mod["isHeaderToscana"] as (c: string[]) => boolean;
    const isU = mod["isHeaderUmbria"] as (c: string[]) => boolean;
    const scambiato = [...HEADER_TOSCANA];
    const t = scambiato[5]!;
    scambiato[5] = scambiato[6]!;
    scambiato[6] = t;
    expect(isT(scambiato)).toBe(false);
    expect(isU([...HEADER_UMBRIA, "EXTRA"])).toBe(false);
  });

  it("spezzaRiga: ';' quotato e '\"\"' interni restano un unico campo", async () => {
    const mod = await modScript();
    const spezza = mod["spezzaRiga"] as (r: string) => string[];
    expect(spezza('A;"B;C";D')).toEqual(["A", "B;C", "D"]);
    expect(spezza('"E""F";G')).toEqual(['E"F', "G"]);
    expect(spezza("A;B;C").length).toBe(3);
  });

  it("normalizzaLista: trim + maiuscole + spazi compattati", async () => {
    const mod = await modScript();
    const norm = mod["normalizzaLista"] as (s: string) => string;
    expect(norm("  lista   esempio  ")).toBe("LISTA ESEMPIO");
    expect(norm("Forza Italia")).toBe("FORZA ITALIA");
  });
});

describe("regionali ingest — parser puri, MAI nominativi (fixture inline)", () => {
  it("Toscana: riga valida, filtro REGIONE, numerici invalidi -> throw", async () => {
    const mod = await modScript();
    const parse = mod["parseRigaToscana"] as (c: string[], n: number) => RigaRegionale | null;
    const r = parse(rigaToscana(), 2);
    expect(r).toMatchObject({
      regione: "TOSCANA",
      circoscrizione: "CIRCO A",
      comune: "COMUNE ALFA",
      elettori: 1000,
      votanti: 600,
      bianche: 10,
      nulle: 20,
      contestate: 2,
      lista: "LISTA ESEMPIO UNO",
      votiLista: 100,
    });
    expect(parse(rigaToscana({ REGIONE: "UMBRIA" }), 3)).toBeNull();
    expect(() => parse(rigaToscana({ VOTANTI: "-5" }), 4)).toThrow();
    expect(() => parse(rigaToscana({ LISTA: "  " }), 5)).toThrow();
    expect(() => parse(rigaToscana().slice(0, 15), 6)).toThrow();
    expect(chiamateFetch).toBe(0);
  });

  it("Umbria: riga valida con sezione, solo totali (M/F ignorati), filtro REGIONE", async () => {
    const mod = await modScript();
    const parse = mod["parseRigaUmbria"] as (c: string[], n: number) => RigaRegionale | null;
    const r = parse(rigaUmbria(), 2);
    expect(r).toMatchObject({
      regione: "UMBRIA",
      comune: "COMUNE BETA",
      sezione: "1",
      elettori: 220,
      votanti: 130,
      bianche: 4,
      nulle: 3,
      contestate: 1,
      lista: "LISTA ESEMPIO DUE",
      votiLista: 40,
    });
    expect(parse(rigaUmbria({ REGIONE: "TOSCANA" }), 3)).toBeNull();
    expect(() => parse(rigaUmbria({ ELETTORI_TOTALI: "x" }), 4)).toThrow();
    expect(() => parse(rigaUmbria({ SEZIONE: "" }), 5)).toThrow();
    expect(chiamateFetch).toBe(0);
  });

  it("onesta': l'output non contiene MAI chiavi nominativo/candidato", async () => {
    const mod = await modScript();
    const parseT = mod["parseRigaToscana"] as (c: string[], n: number) => RigaRegionale | null;
    const parseU = mod["parseRigaUmbria"] as (c: string[], n: number) => RigaRegionale | null;
    const serializzato = JSON.stringify([parseT(rigaToscana(), 2), parseU(rigaUmbria(), 2)]);
    for (const vietata of [
      "NUM_CANDIDATO",
      "COGNOME",
      "NOME",
      "ALTRO_NOME",
      "VOTI_CANDIDATO",
      "NUM_LISTA",
      "PREFERENZE",
      "NOME-ESEMPIO",
      "COGNOME-ESEMPIO",
    ]) {
      expect(serializzato).not.toContain(vietata);
    }
  });
});

describe("regionali ingest — aggregazione e envelope (fixture inline)", () => {
  it("Toscana: e/v/b/k 1x per comune (dedup), liste sommate, k=nulle+contestaste", async () => {
    const mod = await modScript();
    const parse = mod["parseRigaToscana"] as (c: string[], n: number) => RigaRegionale | null;
    const nuovo = mod["nuovoStato"] as () => StatoRegione;
    const applica = mod["applicaRiga"] as (s: StatoRegione, r: RigaRegionale) => void;
    const stato = nuovo();
    const righe = [
      rigaToscana({ LISTA: "LISTA ESEMPIO UNO", VOTI_LISTA: "100" }),
      rigaToscana({ LISTA: "LISTA ESEMPIO DUE", VOTI_LISTA: "200" }),
      rigaToscana({ COMUNE: "COMUNE GAMMA", ELETTORI: "500", VOTANTI: "300", LISTA: "LISTA ESEMPIO UNO", VOTI_LISTA: "50" }),
    ];
    let n = 2;
    for (const celle of righe) {
      const r = parse(celle, n);
      n += 1;
      expect(r).not.toBeNull();
      if (r) applica(stato, r);
    }
    expect(stato.e).toBe(1500); // 1000 + 500, non 1000*2 + 500
    expect(stato.v).toBe(900); // 600 + 300
    expect(stato.b).toBe(20); // bianche 10 + 10, 1x per comune
    expect(stato.k).toBe(44); // (nulle+contestaste) 22 + 22, 1x per comune
    expect(stato.liste.get("LISTA ESEMPIO UNO")).toBe(150);
    expect(stato.liste.get("LISTA ESEMPIO DUE")).toBe(200);
    expect(stato.comuni.size).toBe(2);
    expect(chiamateFetch).toBe(0);
  });

  it("Umbria: e/v 1x per sezione e sommati per comune su piu' sezioni", async () => {
    const mod = await modScript();
    const parse = mod["parseRigaUmbria"] as (c: string[], n: number) => RigaRegionale | null;
    const nuovo = mod["nuovoStato"] as () => StatoRegione;
    const applica = mod["applicaRiga"] as (s: StatoRegione, r: RigaRegionale) => void;
    const stato = nuovo();
    const righe = [
      rigaUmbria({ SEZIONE: "1", LISTA: "LISTA ESEMPIO DUE", VOTI_LISTA: "40" }),
      rigaUmbria({ SEZIONE: "1", LISTA: "LISTA ESEMPIO TRE", VOTI_LISTA: "10" }),
      rigaUmbria({ SEZIONE: "2", ELETTORI_TOTALI: "100", VOTANTI_TOTALI: "50", LISTA: "LISTA ESEMPIO DUE", VOTI_LISTA: "20" }),
    ];
    let num = 2;
    for (const celle of righe) {
      const r = parse(celle, num);
      num += 1;
      expect(r).not.toBeNull();
      if (r) applica(stato, r);
    }
    expect(stato.e).toBe(320); // 220 (sez 1, 1x) + 100 (sez 2)
    expect(stato.v).toBe(180); // 130 + 50
    expect(stato.comuni.size).toBe(1);
    expect(stato.comuni.get("UMBRIA||CIRCOSCRIZIONE UMBRIA||COMUNE BETA")).toMatchObject({ e: 320, v: 180 });
    expect(stato.liste.get("LISTA ESEMPIO DUE")).toBe(60);
    expect(chiamateFetch).toBe(0);
  });

  it("envelope: chiavi contratto, percentuali a 1 decimale, comuni senza per-lista", async () => {
    const mod = await modScript();
    const parse = mod["parseRigaToscana"] as (c: string[], n: number) => RigaRegionale | null;
    const nuovo = mod["nuovoStato"] as () => StatoRegione;
    const applica = mod["applicaRiga"] as (s: StatoRegione, r: RigaRegionale) => void;
    const costruisci = mod["costruisciEnvelope"] as (
      s: StatoRegione,
      src: SorgenteRegionale,
      met: string,
      avv: string,
      url: string,
      data: string,
    ) => Record<string, unknown>;
    const stato = nuovo();
    for (const [idx, celle] of [
      rigaToscana({ LISTA: "LISTA ESEMPIO UNO", VOTI_LISTA: "100" }),
      rigaToscana({ LISTA: "LISTA ESEMPIO DUE", VOTI_LISTA: "300" }),
    ].entries()) {
      const r = parse(celle, idx + 2);
      if (r) applica(stato, r);
    }
    const src = {
      nome: "toscana-2025",
      urlZip: "https://example.invalid/zip",
      voceZip: "voce.csv",
      csvLocale: "/tmp/inesistente.csv",
      zipLocale: "/tmp/inesistente.zip",
      csvOverride: null,
      regioneAttesa: "TOSCANA",
      dataIso: "2025-10-12",
      formato: "toscana",
    } as unknown as SorgenteRegionale;
    const env = costruisci(stato, src, "metodologia-test", "avvertenze-test", "https://example.invalid/zip", "2026-01-01");
    expect(Object.keys(env).sort()).toEqual(
      ["avvertenze", "comuni", "elezione", "liste", "metodologia", "provenance", "regioni"].sort(),
    );
    const elezione = env["elezione"] as Record<string, unknown>;
    expect(elezione["tipo"]).toBe("regionali");
    expect(elezione["data"]).toBe("2025-10-12");
    const liste = env["liste"] as { n: string; v: number; p: number }[];
    expect(liste).toHaveLength(2);
    expect(liste[0]).toMatchObject({ n: "LISTA ESEMPIO DUE", v: 300, p: 75 });
    expect(liste[1]).toMatchObject({ n: "LISTA ESEMPIO UNO", v: 100, p: 25 });
    const regioni = env["regioni"] as { r: string; liste: unknown[] }[];
    expect(regioni).toHaveLength(1);
    expect(regioni[0]?.["r"]).toBe("TOSCANA");
    const comuni = env["comuni"] as Record<string, unknown>[];
    expect(comuni).toHaveLength(1);
    expect(Object.keys(comuni[0] ?? {}).sort()).toEqual(["a", "c", "e", "p", "r", "v"]);
    const serializzato = JSON.stringify(env);
    expect(serializzato).not.toContain("PREFERENZE");
    expect(serializzato).not.toContain("VOTI_CANDIDATO");
  });

  it("parseArgomenti: --help, --limite-righe, --csv-*, sconosciuti -> null", async () => {
    const mod = await modScript();
    const parseArgs = mod["parseArgomenti"] as (a: string[]) => unknown;
    expect(parseArgs(["--help"])).toBe("help");
    expect(parseArgs(["-h"])).toBe("help");
    expect(parseArgs(["--limite-righe", "5"])).toMatchObject({ limiteRighe: 5 });
    expect(parseArgs(["--limite-righe=7"])).toMatchObject({ limiteRighe: 7 });
    expect(parseArgs(["--csv-toscana", "/tmp/a.csv"])).toMatchObject({ csvToscana: "/tmp/a.csv" });
    expect(parseArgs(["--csv-umbria=/tmp/b.csv"])).toMatchObject({ csvUmbria: "/tmp/b.csv" });
    expect(parseArgs(["--limite-righe", "0"])).toBeNull();
    expect(parseArgs(["--frobnicate"])).toBeNull();
  });
});

describe("regionali ingest — integrazione tollerante sui JSON reali (MAI rete)", () => {
  const FILE_TOSCANA = resolve(process.cwd(), "data/reali/elezioni-regionali-2025-toscana.json");
  const FILE_UMBRIA = resolve(process.cwd(), "data/reali/elezioni-regionali-2024-umbria.json");
  const CAP = 950 * 1024;
  const VIETATE = ["COGNOME", "NOME", "PREFERENZE", "VOTI_CANDIDATO", "NUM_CANDIDATO", "NUM_LISTA"];

  function verificaEnvelope(percorso: string, dataAttesa: string, regioneAttesa: string): void {
    if (!existsSync(percorso)) return; // W1 non ancora eseguito: passa con nota
    const byte = statSync(percorso).size;
    expect(byte).toBeLessThanOrEqual(CAP);
    const env = JSON.parse(readFileSync(percorso, "utf8")) as Record<string, unknown>;
    expect(Object.keys(env).sort()).toEqual(
      ["avvertenze", "comuni", "elezione", "liste", "metodologia", "provenance", "regioni"].sort(),
    );
    const prov = env["provenance"] as Record<string, unknown>;
    expect(typeof prov["fonte"]).toBe("string");
    expect(String(prov["url"] ?? "")).toMatch(/^https?:\/\//);
    const elezione = env["elezione"] as Record<string, unknown>;
    expect(elezione["tipo"]).toBe("regionali");
    expect(elezione["data"]).toBe(dataAttesa);
    const liste = env["liste"] as { n: string; v: number; p: number }[];
    expect(liste.length).toBeGreaterThan(0);
    expect(liste.length).toBeLessThanOrEqual(64);
    const regioni = env["regioni"] as { r: string; e: number; v: number; b: number; k: number; a: number; liste: unknown[] }[];
    expect(regioni.length).toBeGreaterThanOrEqual(1);
    expect(regioni.length).toBeLessThanOrEqual(10);
    expect(regioni[0]?.["r"]).toBe(regioneAttesa);
    const comuni = env["comuni"] as Record<string, unknown>[];
    expect(comuni.length).toBeGreaterThan(0);
    for (const c of comuni.slice(0, 20)) {
      expect(Object.keys(c).sort()).toEqual(["a", "c", "e", "p", "r", "v"]);
    }
    const serializzato = JSON.stringify(env);
    for (const v of VIETATE) expect(serializzato).not.toContain(`"${v}"`);
  }

  it("envelope Toscana 2025 valido (o assente: passa con nota)", () => {
    verificaEnvelope(FILE_TOSCANA, "2025-10-12", "TOSCANA");
    expect(chiamateFetch).toBe(0);
  });

  it("envelope Umbria 2024 valido (o assente: passa con nota)", () => {
    verificaEnvelope(FILE_UMBRIA, "2024-11-17", "UMBRIA");
    expect(chiamateFetch).toBe(0);
  });
});
