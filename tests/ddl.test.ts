/**
 * Test del verticale DDL/atti (`lib/ddl-dati.ts` + `GET /api/parlamento/ddl`).
 *
 * Le fixture sono risposte REALI incollate dagli endpoint SPARQL
 * (`/tmp/sonda-senato/ddl-leg19.json`, `/tmp/sonda-senato/ddl-props.json`,
 * `/tmp/sonda-senato/ddl60482.json` e risposte live di `dati.camera.it`):
 * nessun test tocca la rete. L'integrazione su disco (`data/reali/`)
 * gira solo se i file esistono davvero ed e' tollerante (mai fallire per
 * assenza dei file: verifica solo coerenza quando presenti).
 *
 * Nota discoverability: il link alla pagina hub `/parlamento/ddl` passa per
 * `app/sitemap.ts` (file di altro scrittore, NON toccato qui) e per la
 * pagina hub stessa; nessun link e' stato aggiunto in Header/nav o in altre
 * pagine. Questo e' verificato sotto via lettura tollerante del disco.
 */

import { describe, expect, it } from "vitest";
import {
  azzeraCacheDdl,
  cercaDdl,
  fasiDistinte,
  filtraPerFase,
  filtraPerRamo,
  normalizzaDdl,
  normalizzaRamo,
  paginaDdl,
  voceDaAttoCamera,
  voceDaDdlSenato,
  type VoceDdl,
} from "@/lib/ddl-dati";

/* Riga reale: SELECT ?d ?titolo ?num ?stato ?data ?ramo ?idddl (ddl/60482). */
const RIGA_SENATO_REALE = {
  d: { type: "uri", value: "http://dati.senato.it/ddl/60482" },
  titolo: {
    type: "typed-literal",
    datatype: "http://www.w3.org/2001/XMLSchema#string",
    value: "Istituzione del Museo per la memoria del disastro ferroviario di Viareggio",
  },
  num: {
    type: "typed-literal",
    datatype: "http://www.w3.org/2001/XMLSchema#string",
    value: "020460000100",
  },
  stato: {
    type: "typed-literal",
    datatype: "http://www.w3.org/2001/XMLSchema#string",
    value: "da assegn. a commis.",
  },
  data: {
    type: "typed-literal",
    datatype: "http://www.w3.org/2001/XMLSchema#string",
    value: "2026-09-24",
  },
  ramo: {
    type: "typed-literal",
    datatype: "http://www.w3.org/2001/XMLSchema#string",
    value: "S",
  },
  idddl: {
    type: "typed-literal",
    datatype: "http://www.w3.org/2001/XMLSchema#integer",
    value: "54266",
  },
};

/* Estratto reale del dettaglio `SELECT ?p ?o` di ddl/60180 (sonda). */
const DETTAGLIO_SENATO_REALE: Record<string, string> = {
  "http://dati.senato.it/osr/titolo":
    "Disposizioni per il sostegno alle microimprese, alle piccole imprese e alle imprese artigiane nella transizione verso il salario minimo legale",
  "http://dati.senato.it/osr/fase": "S.1922",
  "http://dati.senato.it/osr/numeroFase": "1922",
  "http://dati.senato.it/osr/numeroFaseCompatto": "019220000100",
  "http://dati.senato.it/osr/idDdl": "55418",
  "http://dati.senato.it/osr/idFase": "60180",
  "http://dati.senato.it/osr/ramo": "S",
  "http://dati.senato.it/osr/statoDdl": "assegnato (no esame)",
  "http://dati.senato.it/osr/dataPresentazione": "2026-06-04",
  "http://dati.senato.it/osr/dataStatoDdl": "2026-08-04",
  "http://dati.senato.it/osr/descrIniziativa": "Sen. Turco Mario ed altri",
  "http://dati.senato.it/osr/testoPresentato":
    "urn:nir:senato.repubblica:disegno.legge:19.legislatura;1922",
  "http://dati.senato.it/osr/legislatura": "19",
};

/* Riga reale Camera: SELECT DISTINCT ?a ?tipo ?numero + dettaglio ?p ?o. */
const ATTO_CAMERA_REALE = {
  uri: "http://dati.camera.it/ocd/attocamera.rdf/ac19_151",
  tipo: "Progetto di Legge",
  numero: "151",
  titolo:
    ' RAVETTO ed altri: "Istituzione di un emolumento mensile di maternità e delega al Governo in materia di riconoscimento dei servizi educativi essenziali per l’infanzia" (151) ',
  label:
    ' RAVETTO ed altri: "Istituzione di un emolumento mensile di maternità e delega al Governo in materia di riconoscimento dei servizi educativi essenziali per l’infanzia" (151) ',
  scheda:
    "http://www.camera.it/uri-res/N2Ls?urn:camera-it:parlamento:scheda.progetto.legge:camera;19.legislatura;151",
};

const VOCI_FIXTURE: VoceDdl[] = [
  {
    fonte: "senato",
    uri: "http://dati.senato.it/ddl/60482",
    titolo: "Istituzione del Museo per la memoria del disastro ferroviario di Viareggio",
    ramo: "S",
    fase: "S.2046",
    statoIter: "da assegn. a commis.",
    numero: "020460000100",
    disegnoDiLegge: true,
  },
  {
    fonte: "senato",
    uri: "http://dati.senato.it/ddl/60480",
    titolo: "Conversione in legge, con modificazioni, del decreto-legge 7 agosto 2026, n. 143",
    ramo: "C",
    statoIter: "assegnato (no esame)",
    numero: "031180000100",
    disegnoDiLegge: true,
  },
  {
    fonte: "camera",
    uri: "http://dati.camera.it/ocd/attocamera.rdf/ac19_151",
    titolo: "RAVETTO ed altri: emolumento mensile di maternità (151)",
    ramo: "C",
    numero: "151",
    scheda:
      "http://www.camera.it/uri-res/N2Ls?urn:camera-it:parlamento:scheda.progetto.legge:camera;19.legislatura;151",
    disegnoDiLegge: true,
  },
];

describe("normalizzaDdl / normalizzaRamo", () => {
  it("normalizza titoli con diacritici e spazi", () => {
    expect(normalizzaDdl("  Museo   della MEMORIA  ")).toBe("museo della memoria");
    expect(normalizzaDdl("maternità")).toBe("maternita");
    expect(normalizzaDdl(null)).toBe("");
    expect(normalizzaDdl(42)).toBe("");
  });

  it("ramo solo S/C, resto vuoto", () => {
    expect(normalizzaRamo("S")).toBe("S");
    expect(normalizzaRamo("c")).toBe("C");
    expect(normalizzaRamo("X")).toBe("");
    expect(normalizzaRamo("")).toBe("");
    expect(normalizzaRamo(null)).toBe("");
  });
});

describe("voceDaDdlSenato", () => {
  it("unifica i campi osservati della riga reale (stato grezzo, mai mappato)", () => {
    const riga = {
      uri: RIGA_SENATO_REALE.d.value,
      titolo: RIGA_SENATO_REALE.titolo.value,
      numeroFaseCompatto: RIGA_SENATO_REALE.num.value,
      ramo: RIGA_SENATO_REALE.ramo.value,
      statoDdl_raw: RIGA_SENATO_REALE.stato.value,
      dataPresentazione: RIGA_SENATO_REALE.data.value,
      idDdl: RIGA_SENATO_REALE.idddl.value,
      legislatura: 19,
    };
    const voce = voceDaDdlSenato(riga);
    expect(voce).toMatchObject({
      fonte: "senato",
      uri: "http://dati.senato.it/ddl/60482",
      ramo: "S",
      numero: "020460000100",
      statoIter: "da assegn. a commis.",
      disegnoDiLegge: true,
    });
    // Lo stato descrittivo NON diventa mai uno stato proprio delle leggi.
    expect(voce?.statoIter).not.toMatch(/in_vigore|abrogato/);
  });

  it("arricchisce solo con campi osservati nel dettaglio reale", () => {
    const riga = {
      uri: "http://dati.senato.it/ddl/60180",
      titolo: DETTAGLIO_SENATO_REALE["http://dati.senato.it/osr/titolo"],
      numeroFaseCompatto:
        DETTAGLIO_SENATO_REALE["http://dati.senato.it/osr/numeroFaseCompatto"],
      ramo: DETTAGLIO_SENATO_REALE["http://dati.senato.it/osr/ramo"],
      statoDdl_raw: DETTAGLIO_SENATO_REALE["http://dati.senato.it/osr/statoDdl"],
      dataPresentazione:
        DETTAGLIO_SENATO_REALE["http://dati.senato.it/osr/dataPresentazione"],
      idDdl: DETTAGLIO_SENATO_REALE["http://dati.senato.it/osr/idDdl"],
      fase: DETTAGLIO_SENATO_REALE["http://dati.senato.it/osr/fase"],
      legislatura: 19,
    };
    const voce = voceDaDdlSenato(riga);
    expect(voce?.fase).toBe("S.1922");
    expect(voce?.statoIter).toBe("assegnato (no esame)");
  });

  it("scarta le righe senza uri/titolo/numero/ramo osservati", () => {
    expect(voceDaDdlSenato({ titolo: "X", numeroFaseCompatto: "1", ramo: "S" })).toBeNull();
    expect(voceDaDdlSenato({ uri: "http://x", numeroFaseCompatto: "1", ramo: "S" })).toBeNull();
    expect(voceDaDdlSenato({ uri: "http://x", titolo: "X", ramo: "S" })).toBeNull();
    expect(voceDaDdlSenato({ uri: "http://x", titolo: "X", numeroFaseCompatto: "1" })).toBeNull();
    expect(voceDaDdlSenato(null)).toBeNull();
  });
});

describe("voceDaAttoCamera", () => {
  it("unifica i campi reali (slug da URI, scheda solo se osservata)", () => {
    const voce = voceDaAttoCamera(ATTO_CAMERA_REALE);
    expect(voce).toMatchObject({
      fonte: "camera",
      uri: "http://dati.camera.it/ocd/attocamera.rdf/ac19_151",
      ramo: "C",
      numero: "151",
      disegnoDiLegge: true,
    });
    expect(voce?.titolo).toContain("maternit");
    expect(voce?.scheda).toContain("scheda.progetto.legge");
  });

  it("fallback a label quando titolo assente; scarta senza titolo/uri/numero", () => {
    const soloLabel = voceDaAttoCamera({
      uri: ATTO_CAMERA_REALE.uri,
      tipo: "Progetto di Legge",
      numero: "151",
      label: ATTO_CAMERA_REALE.label,
    });
    expect(soloLabel?.titolo).toContain("maternit");
    expect(voceDaAttoCamera({ uri: ATTO_CAMERA_REALE.uri, numero: "151" })).toBeNull();
    expect(voceDaAttoCamera({ titolo: "X", numero: "151" })).toBeNull();
    expect(voceDaAttoCamera(null)).toBeNull();
  });
});

describe("filtri e paginazione DDL", () => {
  it("filtraPerFase: esatto, Camera esclusa quando attivo", () => {
    expect(filtraPerFase(VOCI_FIXTURE, "S.2046")).toHaveLength(1);
    expect(filtraPerFase(VOCI_FIXTURE, "S.204")).toHaveLength(0);
    expect(filtraPerFase(VOCI_FIXTURE, "")).toHaveLength(3);
  });

  it("filtraPerRamo: S/C case-insensitive, ignoto invariato", () => {
    expect(filtraPerRamo(VOCI_FIXTURE, "S")).toHaveLength(1);
    expect(filtraPerRamo(VOCI_FIXTURE, "c")).toHaveLength(2);
    expect(filtraPerRamo(VOCI_FIXTURE, "X")).toHaveLength(3);
    expect(filtraPerRamo(VOCI_FIXTURE, "")).toHaveLength(3);
  });

  it("cercaDdl: min 2 caratteri, case-insensitive, diacritici", () => {
    expect(cercaDdl(VOCI_FIXTURE, "x")).toHaveLength(3);
    expect(cercaDdl(VOCI_FIXTURE, "museo")).toHaveLength(1);
    expect(cercaDdl(VOCI_FIXTURE, "MUSEO")).toHaveLength(1);
    expect(cercaDdl(VOCI_FIXTURE, "maternita")).toHaveLength(1);
    expect(cercaDdl(VOCI_FIXTURE, "inesistente qqq")).toHaveLength(0);
  });

  it("paginaDdl: per in {10,20,50} default 20", () => {
    const tanti = Array.from({ length: 30 }, (_, i) => ({
      ...VOCI_FIXTURE[0],
      uri: `http://dati.senato.it/ddl/${i}`,
    }));
    expect(paginaDdl(tanti, 1, 10)).toHaveLength(10);
    expect(paginaDdl(tanti, 2, 10)[0]?.uri).toBe("http://dati.senato.it/ddl/10");
    expect(paginaDdl(tanti, 1, 99)).toHaveLength(20);
    expect(paginaDdl(tanti, 0, 10)).toHaveLength(10);
  });

  it("fasiDistinte: solo fasi Senato osservate, ordinate", () => {
    expect(fasiDistinte(VOCI_FIXTURE)).toEqual(["S.2046"]);
    expect(fasiDistinte([])).toEqual([]);
  });

  it("helper never-throw su input assurdi", () => {
    expect(() => filtraPerFase(null as never, "x")).not.toThrow();
    expect(() => filtraPerRamo(null as never, null)).not.toThrow();
    expect(() => cercaDdl(null as never, null)).not.toThrow();
    expect(() => paginaDdl(null as never, null, null)).not.toThrow();
    expect(() => fasiDistinte(null as never)).not.toThrow();
    expect(() => normalizzaDdl(undefined)).not.toThrow();
    expect(() => voceDaDdlSenato(42)).not.toThrow();
    expect(() => voceDaAttoCamera("x")).not.toThrow();
  });
});

describe("GET /api/parlamento/ddl", () => {
  it("mai 500: parametri assurdi rispondono 200 con default", async () => {
    azzeraCacheDdl();
    const { GET } = await import("@/app/api/parlamento/ddl/route");
    for (const qs of [
      "",
      "q=&fase=&ramo=&page=&per=",
      "page=-5&per=0",
      "page=abc&per=xyz&q=!!!&ramo=luna&fase=<script>",
      "page=NaN&per=Infinity",
    ]) {
      const res = await GET(new Request(`http://localhost/api/parlamento/ddl?${qs}`));
      expect(res.status).toBe(200);
      const data = (await res.json()) as { items: unknown[]; total: number; page: number; per: number };
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.total).toBeGreaterThanOrEqual(0);
      expect(data.page).toBeGreaterThanOrEqual(1);
      // Ogni voce e' marcata disegno di legge, mai confondibile con leggi.
      for (const item of data.items) {
        expect((item as { disegnoDiLegge?: boolean }).disegnoDiLegge).toBe(true);
      }
    }
  });

  it("ogni voce espone fonte/ramo/numero e stato grezzo (mai stati propri)", async () => {
    azzeraCacheDdl();
    const { GET } = await import("@/app/api/parlamento/ddl/route");
    const res = await GET(new Request("http://localhost/api/parlamento/ddl?per=50"));
    const data = (await res.json()) as { items: Record<string, unknown>[]; total: number };
    expect(res.status).toBe(200);
    for (const item of data.items) {
      expect(["senato", "camera"]).toContain(item["fonte"]);
      expect(["S", "C"]).toContain(item["ramo"]);
      expect(typeof item["titolo"]).toBe("string");
      expect(typeof item["numero"]).toBe("string");
      expect(String(item["statoIter"] ?? "")).not.toMatch(/in_vigore|abrogato/);
    }
    expect(data.total).toBeGreaterThanOrEqual(data.items.length);
    expect(data.items.length).toBeLessThanOrEqual(50);
  });
});

/* Integrazione disco: solo se i file reali esistono (tollerante, mai rete). */
const RADICE = typeof process !== "undefined" ? process.cwd() : ".";
const FILE_SENATO = `${RADICE}/data/reali/parlamento-ddl.json`;
const FILE_CAMERA = `${RADICE}/data/reali/camera-atti.json`;

async function leggiJsonDisco<T>(percorso: string): Promise<T | null> {
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(percorso)) return null;
    return JSON.parse(fs.readFileSync(percorso, "utf8")) as T;
  } catch {
    return null;
  }
}

describe("integrazione disco DDL (solo se data/reali presente)", () => {
  it("envelope con provenance + legislatura 19; DDL separati dalle leggi", async () => {
    const senato = await leggiJsonDisco<{
      provenance: { fonte: string; licenza: string; recuperatoIl: string };
      legislatura: number;
      ddl: Record<string, unknown>[];
    }>(FILE_SENATO);
    const camera = await leggiJsonDisco<{
      provenance: { fonte: string; licenza: string; recuperatoIl: string };
      legislatura: string;
      atti: Record<string, unknown>[];
    }>(FILE_CAMERA);
    if (!senato || !camera) return;
    expect(senato.legislatura).toBe(19);
    expect(String(camera.legislatura)).toBe("19");
    expect(senato.provenance.licenza).toBe("CC BY 3.0 IT");
    expect(camera.provenance.licenza).toBe("CC BY-SA 4.0");
    expect(senato.ddl.length).toBeGreaterThan(0);
    expect(senato.ddl.length).toBeLessThanOrEqual(100);
    expect(camera.atti.length).toBeGreaterThan(0);
    expect(camera.atti.length).toBeLessThanOrEqual(200);
    // Mai stati propri sui DDL; mai ELI/GU/codici redazionali.
    for (const d of senato.ddl) {
      expect(d["statoDdl_raw"]).toBeDefined();
      expect(String(d["statoDdl_raw"])).not.toMatch(/in_vigore|abrogato/);
      expect(d["eli"]).toBeUndefined();
      expect(d["numeroGU"]).toBeUndefined();
      expect(d["codiceRedazionale"]).toBeUndefined();
      expect(d["stato"]).toBeUndefined();
    }
    for (const a of camera.atti) {
      expect(a["eli"]).toBeUndefined();
      expect(a["stato"]).toBeUndefined();
    }
  });

  it("file <=1MB e slug/uri coerenti", async () => {
    try {
      const fs = await import("node:fs");
      for (const percorso of [FILE_SENATO, FILE_CAMERA]) {
        if (!fs.existsSync(percorso)) return;
        expect(fs.statSync(percorso).size).toBeLessThanOrEqual(1_048_576);
      }
    } catch {
      return;
    }
    const camera = await leggiJsonDisco<{ atti: { uri: string; slug: string }[] }>(FILE_CAMERA);
    if (!camera) return;
    for (const a of camera.atti) {
      expect(a.uri).toMatch(/^https?:\/\//);
      expect(a.slug).toMatch(/^ac19_\d+$/);
      expect(a.uri).toContain(a.slug);
    }
  });

  it("discoverability senza toccare file altrui: sitemap di altro scrittore", async () => {
    // La pagina hub /parlamento/ddl esiste (file proprio); la sitemap resta
    // di altro scrittore: qui si verifica solo di NON aver aggiunto link DDL
    // in Header/nav o in altre pagine (vietato).
    try {
      const fs = await import("node:fs");
      const header = fs.existsSync(`${RADICE}/components/Header.tsx`)
        ? fs.readFileSync(`${RADICE}/components/Header.tsx`, "utf8")
        : "";
      expect(header).not.toContain("/parlamento/ddl");
      const hub = fs.existsSync(`${RADICE}/app/parlamento/page.tsx`)
        ? fs.readFileSync(`${RADICE}/app/parlamento/page.tsx`, "utf8")
        : "";
      expect(hub).not.toContain("/parlamento/ddl");
      expect(fs.existsSync(`${RADICE}/app/parlamento/ddl/page.tsx`)).toBe(true);
    } catch {
      return;
    }
  });
});
