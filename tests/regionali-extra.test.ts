/**
 * Test ingest regionali-extra Liguria 2024 + Calabria 2025 — SOLO fixture
 * INLINE, MAI rete.
 *
 * Contesto (direttiva REALI-13, scrittore verticale-1):
 * - Liguria: voce `Regionali_Liguria_2024_Scrutini.csv` dello ZIP DAIT
 *   `regionali-20241027.zip` (20 colonne, livello sezione, tipo-Umbria).
 * - Calabria: voce `20251005_REGIONALI_CALABRIA_SCRUTINI.csv` dello ZIP DAIT
 *   `regionali-20251005.zip` (16 colonne, livello comunale, tipo-Toscana).
 * - Whitelist loader: solo REGIONE;CIRCOSCRIZIONE;COMUNE;ELETTORI;VOTANTI;
 *   BIANCHE;NULLE;CONTESTATE;LISTA;VOTI_LISTA. Colonne candidato
 *   (NUM_CANDIDATO/COGNOME/NOME/...) MAI lette, voti presidente scartati.
 *   File `*Preferenze*.csv` mai aperti in ingest.
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
} from "@/scripts/ingest-reale-regionali-extra";

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
      throw new Error("rete vietata in tests/regionali-extra.test.ts");
    }),
  );
});

async function modScript(): Promise<Record<string, unknown>> {
  return (await import(
    "@/scripts/ingest-reale-regionali-extra"
  )) as unknown as Record<string, unknown>;
}

async function modLib(): Promise<Record<string, unknown>> {
  return (await import(
    "@/lib/regionali-extra-dati"
  )) as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Fixture INLINE (sintetiche, MAI dati reali/nominativi).
// Le colonne candidato contengono segnaposto fittizi MAI letti dal parser.
// ---------------------------------------------------------------------------

const HEADER_LIGURIA = [
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

const HEADER_CALABRIA = [
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

function rigaLiguria(over: Record<string, string> = {}): string[] {
  const base: Record<string, string> = {
    REGIONE: "LIGURIA",
    CIRCOSCRIZIONE: "PROVINCIA ESEMPIO",
    COMUNE: "COMUNE ALFA",
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
  return HEADER_LIGURIA.map((k) => over[k] ?? base[k] ?? "");
}

function rigaCalabria(over: Record<string, string> = {}): string[] {
  const base: Record<string, string> = {
    REGIONE: "CALABRIA",
    CIRCOSCRIZIONE: "AREA ESEMPIO",
    COMUNE: "COMUNE GAMMA",
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
  return HEADER_CALABRIA.map((k) => over[k] ?? base[k] ?? "");
}

describe("regionali-extra ingest — header e whitelist (fixture inline, MAI rete)", () => {
  it("header Liguria 20 colonne / Calabria 16 colonne negli ordini reali DAIT", async () => {
    const mod = await modScript();
    const isL = mod["isHeaderLiguria"] as (c: string[]) => boolean;
    const isC = mod["isHeaderCalabria"] as (c: string[]) => boolean;
    expect(HEADER_LIGURIA.length).toBe(20);
    expect(HEADER_CALABRIA.length).toBe(16);
    expect(isL(HEADER_LIGURIA)).toBe(true);
    expect(isC(HEADER_CALABRIA)).toBe(true);
    expect(isL(HEADER_CALABRIA)).toBe(false);
    expect(isC(HEADER_LIGURIA)).toBe(false);
    expect(isL(HEADER_LIGURIA.slice(0, 19))).toBe(false);
    expect(chiamateFetch).toBe(0);
  });

  it("header con colonna scambiata o mancante -> false", async () => {
    const mod = await modScript();
    const isL = mod["isHeaderLiguria"] as (c: string[]) => boolean;
    const isC = mod["isHeaderCalabria"] as (c: string[]) => boolean;
    const scambiato = [...HEADER_LIGURIA];
    const t = scambiato[10]!;
    scambiato[10] = scambiato[11]!;
    scambiato[11] = t;
    expect(isL(scambiato)).toBe(false);
    expect(isC([...HEADER_CALABRIA, "EXTRA"])).toBe(false);
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

describe("regionali-extra ingest — parser puri, MAI nominativi (fixture inline)", () => {
  it("Liguria: riga valida con sezione, solo totali (M/F ignorati), filtro REGIONE", async () => {
    const mod = await modScript();
    const parse = mod["parseRigaLiguria"] as (c: string[], n: number) => RigaRegionale | null;
    const r = parse(rigaLiguria(), 2);
    expect(r).toMatchObject({
      regione: "LIGURIA",
      comune: "COMUNE ALFA",
      sezione: "1",
      elettori: 220,
      votanti: 130,
      bianche: 4,
      nulle: 3,
      contestate: 1,
      lista: "LISTA ESEMPIO DUE",
      votiLista: 40,
    });
    expect(parse(rigaLiguria({ REGIONE: "CALABRIA" }), 3)).toBeNull();
    expect(() => parse(rigaLiguria({ ELETTORI_TOTALI: "x" }), 4)).toThrow();
    expect(() => parse(rigaLiguria({ SEZIONE: "" }), 5)).toThrow();
    expect(chiamateFetch).toBe(0);
  });

  it("Liguria: riga solo-presidente (lista vuota, 0 voti) -> solo affluenza", async () => {
    const mod = await modScript();
    const parse = mod["parseRigaLiguria"] as (c: string[], n: number) => RigaRegionale | null;
    const r = parse(rigaLiguria({ LISTA: "", NUM_LISTA: "", VOTI_LISTA: "0" }), 2);
    expect(r).toMatchObject({ lista: "", votiLista: 0, elettori: 220, votanti: 130 });
    expect(() => parse(rigaLiguria({ LISTA: "", VOTI_LISTA: "5" }), 3)).toThrow();
    expect(chiamateFetch).toBe(0);
  });

  it("Calabria: riga valida, filtro REGIONE, numerici invalidi -> throw", async () => {
    const mod = await modScript();
    const parse = mod["parseRigaCalabria"] as (c: string[], n: number) => RigaRegionale | null;
    const r = parse(rigaCalabria(), 2);
    expect(r).toMatchObject({
      regione: "CALABRIA",
      circoscrizione: "AREA ESEMPIO",
      comune: "COMUNE GAMMA",
      elettori: 1000,
      votanti: 600,
      bianche: 10,
      nulle: 20,
      contestate: 2,
      lista: "LISTA ESEMPIO UNO",
      votiLista: 100,
    });
    expect(parse(rigaCalabria({ REGIONE: "LIGURIA" }), 3)).toBeNull();
    expect(() => parse(rigaCalabria({ VOTANTI: "-5" }), 4)).toThrow();
    expect(() => parse(rigaCalabria({ LISTA: "  " }), 5)).toThrow();
    expect(() => parse(rigaCalabria().slice(0, 15), 6)).toThrow();
    expect(chiamateFetch).toBe(0);
  });

  it("onesta': l'output non contiene MAI chiavi nominativo/candidato", async () => {
    const mod = await modScript();
    const parseL = mod["parseRigaLiguria"] as (c: string[], n: number) => RigaRegionale | null;
    const parseC = mod["parseRigaCalabria"] as (c: string[], n: number) => RigaRegionale | null;
    const serializzato = JSON.stringify([parseL(rigaLiguria(), 2), parseC(rigaCalabria(), 2)]);
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

describe("regionali-extra ingest — aggregazione e envelope (fixture inline)", () => {
  it("Calabria: e/v/b/k 1x per comune (dedup), liste sommate, k=nulle+contestaste", async () => {
    const mod = await modScript();
    const parse = mod["parseRigaCalabria"] as (c: string[], n: number) => RigaRegionale | null;
    const nuovo = mod["nuovoStato"] as () => StatoRegione;
    const applica = mod["applicaRiga"] as (s: StatoRegione, r: RigaRegionale) => void;
    const stato = nuovo();
    const righe = [
      rigaCalabria({ LISTA: "LISTA ESEMPIO UNO", VOTI_LISTA: "100" }),
      rigaCalabria({ LISTA: "LISTA ESEMPIO DUE", VOTI_LISTA: "200" }),
      rigaCalabria({ COMUNE: "COMUNE DELTA", ELETTORI: "500", VOTANTI: "300", LISTA: "LISTA ESEMPIO UNO", VOTI_LISTA: "50" }),
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

  it("Liguria: e/v 1x per sezione, solo-presidente senza liste ma con affluenza", async () => {
    const mod = await modScript();
    const parse = mod["parseRigaLiguria"] as (c: string[], n: number) => RigaRegionale | null;
    const nuovo = mod["nuovoStato"] as () => StatoRegione;
    const applica = mod["applicaRiga"] as (s: StatoRegione, r: RigaRegionale) => void;
    const stato = nuovo();
    const righe = [
      rigaLiguria({ SEZIONE: "1", LISTA: "LISTA ESEMPIO DUE", VOTI_LISTA: "40" }),
      rigaLiguria({ SEZIONE: "1", LISTA: "LISTA ESEMPIO TRE", VOTI_LISTA: "10" }),
      rigaLiguria({ SEZIONE: "2", ELETTORI_TOTALI: "100", VOTANTI_TOTALI: "50", LISTA: "", NUM_LISTA: "", VOTI_LISTA: "0" }),
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
    expect(stato.righeSoloPresidente).toBe(1);
    expect(stato.liste.has("")).toBe(false);
    expect(stato.comuni.size).toBe(1);
    expect(stato.comuni.get("LIGURIA||PROVINCIA ESEMPIO||COMUNE ALFA")).toMatchObject({ e: 320, v: 180 });
    expect(stato.liste.get("LISTA ESEMPIO DUE")).toBe(40);
    expect(chiamateFetch).toBe(0);
  });

  it("envelope: chiavi contratto, percentuali a 1 decimale, comuni senza per-lista", async () => {
    const mod = await modScript();
    const parse = mod["parseRigaCalabria"] as (c: string[], n: number) => RigaRegionale | null;
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
      rigaCalabria({ LISTA: "LISTA ESEMPIO UNO", VOTI_LISTA: "100" }),
      rigaCalabria({ LISTA: "LISTA ESEMPIO DUE", VOTI_LISTA: "300" }),
    ].entries()) {
      const r = parse(celle, idx + 2);
      if (r) applica(stato, r);
    }
    const src = {
      nome: "calabria-2025",
      urlZip: "https://example.invalid/zip",
      voceZip: "voce.csv",
      csvLocale: "/tmp/inesistente.csv",
      zipLocale: "/tmp/inesistente.zip",
      csvOverride: null,
      regioneAttesa: "CALABRIA",
      dataIso: "2025-10-05",
      formato: "calabria",
    } as unknown as SorgenteRegionale;
    const env = costruisci(stato, src, "metodologia-test", "avvertenze-test", "https://example.invalid/zip", "2026-01-01");
    expect(Object.keys(env).sort()).toEqual(
      ["avvertenze", "comuni", "elezione", "liste", "metodologia", "provenance", "regioni"].sort(),
    );
    const elezione = env["elezione"] as Record<string, unknown>;
    expect(elezione["tipo"]).toBe("regionali");
    expect(elezione["data"]).toBe("2025-10-05");
    const liste = env["liste"] as { n: string; v: number; p: number }[];
    expect(liste).toHaveLength(2);
    expect(liste[0]).toMatchObject({ n: "LISTA ESEMPIO DUE", v: 300, p: 75 });
    expect(liste[1]).toMatchObject({ n: "LISTA ESEMPIO UNO", v: 100, p: 25 });
    const regioni = env["regioni"] as { r: string; liste: unknown[] }[];
    expect(regioni).toHaveLength(1);
    expect(regioni[0]?.["r"]).toBe("CALABRIA");
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
    expect(parseArgs(["--csv-liguria", "/tmp/a.csv"])).toMatchObject({ csvLiguria: "/tmp/a.csv" });
    expect(parseArgs(["--csv-calabria=/tmp/b.csv"])).toMatchObject({ csvCalabria: "/tmp/b.csv" });
    expect(parseArgs(["--limite-righe", "0"])).toBeNull();
    expect(parseArgs(["--frobnicate"])).toBeNull();
  });
});

describe("regionali-extra lib — loader never-throw (MAI rete)", () => {
  it("normalizzaId/isId/voceRegistro: noti vs ignoti, mai throw", async () => {
    const lib = await modLib();
    const norm = lib["normalizzaIdRegionaleExtra"] as (v: unknown) => unknown;
    const isId = lib["isIdRegionaleExtra"] as (v: unknown) => boolean;
    const voce = lib["voceRegistroRegionaleExtra"] as (v: unknown) => unknown;
    expect(norm("regionali-2024-liguria")).toBe("regionali-2024-liguria");
    expect(norm("  REGIONALI-2025-CALABRIA ")).toBe("regionali-2025-calabria");
    expect(norm("regioni-2024")).toBeNull();
    expect(norm(null)).toBeNull();
    expect(isId("regionali-2024-liguria")).toBe(true);
    expect(isId("europee-2024")).toBe(false);
    expect(voce("regionali-2025-calabria")).toMatchObject({ id: "regionali-2025-calabria" });
    expect(voce("ignoto")).toBeNull();
    expect(chiamateFetch).toBe(0);
  });

  it("cercaComuneExtra/topListeExtra/paginaExtra: bound e mai throw", async () => {
    const lib = await modLib();
    const cerca = lib["cercaComuneExtra"] as (c: unknown, q: unknown) => unknown[];
    const top = lib["topListeExtra"] as (l: unknown, n: unknown) => unknown[];
    const pagina = lib["paginaExtra"] as (e: unknown, p: unknown, per: unknown) => unknown[];
    const comuni = [
      { c: "COMUNE ALFA", p: "AREA ESEMPIO", r: "CALABRIA", e: 100, v: 50, a: 50 },
      { c: "COMUNE BETA", p: "ALTRA AREA", r: "CALABRIA", e: 200, v: 100, a: 50 },
    ];
    expect((cerca(comuni, "alf") as unknown[]).length).toBe(1);
    expect((cerca(comuni, "x") as unknown[]).length).toBe(0);
    expect((cerca(comuni, null) as unknown[]).length).toBe(0);
    const liste = [{ n: "A", v: 10, p: 10 }, { n: "B", v: 30, p: 30 }];
    expect((top(liste, 1) as { n: string }[])[0]?.["n"]).toBe("B");
    expect((pagina([1, 2, 3], 2, 2) as unknown[])).toEqual([3]);
    expect((pagina(null, null, null) as unknown[])).toEqual([]);
    expect(chiamateFetch).toBe(0);
  });

  it("caricaRegionaleExtra: id ignoto -> null, mai throw, mai rete", async () => {
    const lib = await modLib();
    const carica = lib["caricaRegionaleExtra"] as (id: unknown) => Promise<unknown>;
    expect(await carica("id-inesistente")).toBeNull();
    expect(await carica(null)).toBeNull();
    expect(chiamateFetch).toBe(0);
  });
});

describe("regionali-extra — integrazione tollerante sui JSON reali (MAI rete)", () => {
  const FILE_LIGURIA = resolve(process.cwd(), "data/reali/elezioni-regionali-2024-liguria.json");
  const FILE_CALABRIA = resolve(process.cwd(), "data/reali/elezioni-regionali-2025-calabria.json");
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

  it("envelope Liguria 2024 valido (o assente: passa con nota)", () => {
    verificaEnvelope(FILE_LIGURIA, "2024-10-27", "LIGURIA");
    expect(chiamateFetch).toBe(0);
  });

  it("envelope Calabria 2025 valido (o assente: passa con nota)", () => {
    verificaEnvelope(FILE_CALABRIA, "2025-10-05", "CALABRIA");
    expect(chiamateFetch).toBe(0);
  });

  it("lib elencaRegionaliExtra: voci presenti con file reali, mai throw", async () => {
    const lib = await modLib();
    const elenca = lib["elencaRegionaliExtra"] as () => Promise<{ id: string }[]>;
    const azzera = lib["azzeraCacheExtra"] as () => void;
    azzera();
    const voci = await elenca();
    if (!existsSync(FILE_LIGURIA) || !existsSync(FILE_CALABRIA)) return;
    expect(voci.map((v) => v.id).sort()).toEqual(
      ["regionali-2024-liguria", "regionali-2025-calabria"],
    );
    expect(chiamateFetch).toBe(0);
  });
});
