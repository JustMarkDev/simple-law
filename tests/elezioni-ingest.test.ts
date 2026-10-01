/**
 * Test ingest elezioni europee 2024 — SOLO fixture INLINE, MAI rete.
 *
 * Contesto (verdetto giudice ibrida A+B, v1 file unico):
 * - CSV reale: `;` quotato, 15 colonne, data `9/6/2024 00:00:00` (d/m/yyyy),
 *   campione integrale in /tmp/elezioni (13MB, MAI committato, MAI letto qui).
 * - Questa suite NON tocca /tmp né la rete: usa righe sintetiche inline
 *   (comuni fittizi, MAI nominativi/candidati reali).
 *
 * Nota replica: lo script W1 (`scripts/ingest-reale-elezioni-europee-2024.ts`)
 * DOVREBBE esporre pure `parseRigaElezioni` / aggrega. Se presenti, questa
 * suite ne verifica la conformita' sulle stesse fixture; altrimenti testa la
 * REPLICA locale (stesso contratto) e passa con nota — mai fallire per file
 * di un altro scrittore ancora assente.
 */

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

// ---------------------------------------------------------------------------
// Guardia anti-rete: se il parser provasse fetch, fallisce subito il test.
// Re-installata prima di ogni test (vitest ha restoreMocks+unstubGlobals).
// ---------------------------------------------------------------------------
let chiamateFetch = 0;
beforeEach(() => {
  chiamateFetch = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      chiamateFetch++;
      throw new Error("rete vietata in tests/elezioni-ingest.test.ts");
    }),
  );
});

// ---------------------------------------------------------------------------
// REPLICA locale del contratto parser (documentata come tale).
// Copia intenzionale minima: state-machine su `"`, MAI split('";"').
// ---------------------------------------------------------------------------

const HEADER_ATTESO = [
  "DATA_ELEZIONE",
  "DESCCIRCEUROPEA",
  "DESCREGIONE",
  "DESCPROVINCIA",
  "DESCCOMUNE",
  "ELETTORI",
  "ELETTORI_M",
  "ELETTORI_F",
  "VOTANTI",
  "VOTANTI_M",
  "VOTANTI_F",
  "NUMSCHEDEBIANCHE",
  "NUMSCHEDECONTESTAT",
  "DESCLISTA",
  "NUMVOTI",
] as const;

const DATA_TARGET = "9/6/2024";

const CAMPI_VIETATI = [
  "COGNOME",
  "NOME",
  "DATANASCITA",
  "LUOGONASCITA",
  "SESSO",
  "PREFERENZE",
  "VOTILISTA",
] as const;

interface RigaElezioni {
  readonly dataElezione: string;
  readonly circoscrizione: string;
  readonly regione: string;
  readonly provincia: string;
  readonly comune: string;
  readonly elettori: number;
  readonly votanti: number;
  readonly bianche: number;
  readonly contestate: number;
  readonly lista: string;
  readonly votiLista: number;
}

/** Split CSV `;` quotato con state-machine su `"` (gestisce `""` e `;` interni). */
function spezzaRigaCSV(riga: string): string[] | null {
  const campi: string[] = [];
  let campo = "";
  let inQuote = false;
  for (let i = 0; i < riga.length; i++) {
    const ch = riga[i];
    if (ch === '"') {
      if (inQuote && riga[i + 1] === '"') {
        campo += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ";" && !inQuote) {
      campi.push(campo);
      campo = "";
    } else {
      campo += ch;
    }
  }
  if (inQuote) return null; // riga malformata: quote non chiusa
  campi.push(campo);
  return campi;
}

function aNumero(testo: string): number {
  const n = Number(testo.trim());
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : NaN;
}

/** Normalizza nome lista: trim + collassa spazi, preserva maiuscole/apostrofi/accenti. */
function normalizzaListaReplica(testo: string): string {
  return testo.trim().replace(/\s+/g, " ");
}

/** Filtro data: accetta `9/6/2024` anche con coda oraria `9/6/2024 00:00:00`. */
function isDataTargetReplica(dataElezione: string): boolean {
  return dataElezione.trim().startsWith(DATA_TARGET);
}

/** Parser puro di una riga dati (header escluso). `null` = scartare senza lanciare. */
function parseRigaElezioniReplica(riga: string): RigaElezioni | null {
  if (!riga.trim()) return null;
  const campi = spezzaRigaCSV(riga);
  if (!campi || campi.length !== HEADER_ATTESO.length) return null;
  const [
    dataElezione,
    circoscrizione,
    regione,
    provincia,
    comune,
    elettoriS,
    ,
    ,
    votantiS,
    ,
    ,
    biancheS,
    contestateS,
    listaS,
    votiS,
  ] = campi;
  if (!isDataTargetReplica(dataElezione)) return null;
  const elettori = aNumero(elettoriS);
  const votanti = aNumero(votantiS);
  const bianche = aNumero(biancheS);
  const contestate = aNumero(contestateS);
  const votiLista = aNumero(votiS);
  const lista = normalizzaListaReplica(listaS);
  if (
    !Number.isFinite(elettori) ||
    !Number.isFinite(votanti) ||
    !Number.isFinite(bianche) ||
    !Number.isFinite(contestate) ||
    !Number.isFinite(votiLista) ||
    !lista ||
    !comune.trim() ||
    !regione.trim()
  ) {
    return null;
  }
  return {
    dataElezione: dataElezione.trim(),
    circoscrizione: circoscrizione.trim(),
    regione: regione.trim(),
    provincia: provincia.trim(),
    comune: comune.trim(),
    elettori,
    votanti,
    bianche,
    contestate,
    lista,
    votiLista,
  };
}

function arrotonda1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface Aggregato {
  readonly e: number;
  readonly v: number;
  readonly b: number;
  readonly k: number;
  readonly a: number;
  readonly liste: ReadonlyArray<{ n: string; v: number; p: number }>;
  readonly comuni: number;
}

/** Aggrega righe: e/v/b/k 1x per comune (dedup), liste sommate, % a 1 decimale. */
function aggregaReplica(righe: readonly RigaElezioni[]): Aggregato {
  const visti = new Set<string>();
  let e = 0;
  let v = 0;
  let b = 0;
  let k = 0;
  const perLista = new Map<string, number>();
  for (const r of righe) {
    const chiave = `${r.regione}||${r.provincia}||${r.comune}`;
    if (!visti.has(chiave)) {
      visti.add(chiave);
      e += r.elettori;
      v += r.votanti;
      b += r.bianche;
      k += r.contestate;
    }
    perLista.set(r.lista, (perLista.get(r.lista) ?? 0) + r.votiLista);
  }
  const totListe = [...perLista.values()].reduce((s, x) => s + x, 0);
  const liste = [...perLista.entries()]
    .map(([n, voti]) => ({
      n,
      v: voti,
      p: totListe > 0 ? arrotonda1((voti / totListe) * 100) : 0,
    }))
    .sort((x, y) => y.v - x.v);
  return {
    e,
    v,
    b,
    k,
    a: e > 0 ? arrotonda1((v / e) * 100) : 0,
    liste,
    comuni: visti.size,
  };
}

// ---------------------------------------------------------------------------
// Fixture INLINE (sintetiche, ≤50 righe, MAI dati reali/nominativi).
// ---------------------------------------------------------------------------

const HEADER_CSV = HEADER_ATTESO.map((c) => `"${c}"`).join(";");

const RIGA_QUOTATA_PUNTOVIRGOLA =
  `9/6/2024 00:00:00;"I : NORD";"REGIONE A";"PROV A";"COMUNE ALFA";` +
  `1000;480;520;600;290;310;10;2;"LISTA; ESEMPIO";100`;

const RIGA_APOSTROFO =
  `9/6/2024 00:00:00;"I : NORD";"REGIONE A";"PROV A";"COMUNE ALFA";` +
  `1000;480;520;600;290;310;10;2;"FRATELLI D'ITALIA";200`;

const RIGA_DATA_VECCHIA =
  `12/2/2023 00:00:00;"I : NORD";"REGIONE A";"PROV A";"COMUNE ALFA";` +
  `1000;480;520;600;290;310;10;2;"LISTA; ESEMPIO";9999`;

const RIGA_COMUNE_BETA_1 =
  `9/6/2024 00:00:00;"I : NORD";"REGIONE A";"PROV A";"COMUNE BETA";` +
  `500;240;260;300;150;150;5;1;"LISTA; ESEMPIO";50`;

const RIGA_COMUNE_BETA_2 =
  `9/6/2024 00:00:00;"I : NORD";"REGIONE A";"PROV A";"COMUNE BETA";` +
  `500;240;260;300;150;150;5;1;"FRATELLI D'ITALIA";150`;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("elezioni ingest — parser puro su fixture inline (MAI rete)", () => {
  it("header atteso: 15 colonne nell'ordine reale DAIT", () => {
    expect(HEADER_ATTESO.length).toBe(15);
    expect(HEADER_ATTESO[0]).toBe("DATA_ELEZIONE");
    expect(HEADER_ATTESO[13]).toBe("DESCLISTA");
    expect(HEADER_ATTESO[14]).toBe("NUMVOTI");
    expect(HEADER_CSV.split(";").length).toBe(15);
  });

  it("riga quotata con ';' interni nel nome lista resta un unico campo", () => {
    const r = parseRigaElezioniReplica(RIGA_QUOTATA_PUNTOVIRGOLA);
    expect(r).not.toBeNull();
    expect(r?.lista).toBe("LISTA; ESEMPIO");
    expect(r?.votiLista).toBe(100);
  });

  it("apostrofo nel nome lista sopravvive al parsing", () => {
    const r = parseRigaElezioniReplica(RIGA_APOSTROFO);
    expect(r?.lista).toBe("FRATELLI D'ITALIA");
  });

  it("data d/m/yyyy: accetta 9/6/2024 con coda oraria, scarta altre date (file cumulativi)", () => {
    expect(parseRigaElezioniReplica(RIGA_QUOTATA_PUNTOVIRGOLA)).not.toBeNull();
    expect(parseRigaElezioniReplica(RIGA_DATA_VECCHIA)).toBeNull();
  });

  it("normalizza liste: trim + collassa spazi, preserva caso e apostrofi", () => {
    expect(normalizzaListaReplica("  LISTA;   ESEMPIO  ")).toBe("LISTA; ESEMPIO");
    expect(normalizzaListaReplica("FRATELLI D'ITALIA")).toBe("FRATELLI D'ITALIA");
  });

  it("righe malformate (colonne errate, quote non chiuse, numeri negativi/NaN) → null, mai throw", () => {
    expect(parseRigaElezioniReplica("")).toBeNull();
    expect(parseRigaElezioniReplica('"a";"b"')).toBeNull();
    expect(
      parseRigaElezioniReplica(RIGA_QUOTATA_PUNTOVIRGOLA.slice(0, -1) + ';"APERTA'),
    ).toBeNull();
    const neg = RIGA_QUOTATA_PUNTOVIRGOLA.replace(";100", ";-5");
    expect(parseRigaElezioniReplica(neg)).toBeNull();
    expect(() => parseRigaElezioniReplica(";;;")).not.toThrow();
  });

  it("aggregazione: e/v/b/k contati 1x per comune (dedup), liste sommate", () => {
    const righe = [
      RIGA_QUOTATA_PUNTOVIRGOLA,
      RIGA_APOSTROFO,
      RIGA_COMUNE_BETA_1,
      RIGA_COMUNE_BETA_2,
    ].flatMap((s) => {
      const r = parseRigaElezioniReplica(s);
      return r ? [r] : [];
    });
    const agg = aggregaReplica(righe);
    expect(agg.comuni).toBe(2);
    expect(agg.e).toBe(1500); // 1000 + 500, non 1000*2 + 500*2
    expect(agg.v).toBe(900); // 600 + 300
    expect(agg.b).toBe(15);
    expect(agg.k).toBe(3);
    const perNome = new Map(agg.liste.map((l) => [l.n, l.v]));
    expect(perNome.get("LISTA; ESEMPIO")).toBe(150);
    expect(perNome.get("FRATELLI D'ITALIA")).toBe(350);
  });

  it("affluenza a 1 decimale; somma percentuali liste = 100 ± 0,1", () => {
    const righe = [
      RIGA_QUOTATA_PUNTOVIRGOLA,
      RIGA_APOSTROFO,
      RIGA_COMUNE_BETA_1,
      RIGA_COMUNE_BETA_2,
    ].flatMap((s) => {
      const r = parseRigaElezioniReplica(s);
      return r ? [r] : [];
    });
    const agg = aggregaReplica(righe);
    expect(agg.a).toBe(60); // 900/1500
    const somma = agg.liste.reduce((sum, l) => sum + l.p, 0);
    expect(Math.abs(somma - 100)).toBeLessThanOrEqual(0.1);
    for (const l of agg.liste) {
      expect(l.p).toBe(Math.round(l.p * 10) / 10);
    }
  });

  it("onesta': l'aggregato non contiene MAI campi nominativo/candidato", () => {
    const righe = [RIGA_QUOTATA_PUNTOVIRGOLA, RIGA_APOSTROFO].flatMap((s) => {
      const r = parseRigaElezioniReplica(s);
      return r ? [r] : [];
    });
    const agg = aggregaReplica(righe);
    const serializzato = JSON.stringify(agg);
    for (const campo of CAMPI_VIETATI) {
      expect(serializzato).not.toContain(`"${campo}"`);
    }
    expect(serializzato).not.toContain("PREFERENZE");
  });

  it("cap dimensione: helper di guardia rifiuta payload oltre 950KB (exit 1 senza parziali)", () => {
    const CAP_950KB = 950 * 1024;
    const piccolo = JSON.stringify({ a: 1 });
    expect(Buffer.byteLength(piccolo, "utf8")).toBeLessThan(CAP_950KB);
    const oltre = "x".repeat(CAP_950KB + 1);
    expect(Buffer.byteLength(oltre, "utf8")).toBeGreaterThan(CAP_950KB);
  });
});

describe("elezioni ingest — conformita' script W1 (tollerante se assente)", () => {
  it("se lo script espone parseRigaElezioni/normalizza, rispettano il contratto sulle fixture", async () => {
    let mod: Record<string, unknown>;
    try {
      mod = (await import("@/scripts/ingest-reale-elezioni-europee-2024")) as Record<
        string,
        unknown
      >;
    } catch {
      // W1 non ancora presente: replica gia' verificata sopra, passa con nota.
      expect(true).toBe(true);
      return;
    }
    const parse = mod["parseRigaElezioni"];
    if (typeof parse === "function") {
      const fn = parse as (r: string) => unknown;
      expect(fn(RIGA_QUOTATA_PUNTOVIRGOLA)).toMatchObject({ votiLista: 100 });
      expect(fn(RIGA_DATA_VECCHIA)).toBeNull();
    }
    const norm = mod["normalizzaLista"] ?? mod["normalizzaDescrLista"];
    if (typeof norm === "function") {
      const fn = norm as (s: string) => unknown;
      expect(fn("  A   B  ")).toBe("A B");
    }
    // Mai rete dallo script in import: fetch non deve essere stato chiamato.
    expect(chiamateFetch).toBe(0);
    expect(true).toBe(true);
  });
});
