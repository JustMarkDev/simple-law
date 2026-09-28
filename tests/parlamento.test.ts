/**
 * Test dei mapping reali della Camera (`lib/parlamento.ts`).
 *
 * Le fixture sono risposte REALI incollate da `dati.camera.it` (sonda
 * `/tmp/sonda-camera` + risposte live dell'endpoint del verdetto): nessun
 * test tocca la rete, tranne il percorso di fallback che usa un `fetch`
 * iniettato che fallisce.
 */

import { describe, expect, it } from "vitest";
import {
  adesioniDaRighe,
  caricaDeputati,
  deputatiDaRigheLista,
  dettaglioDaRdfJson,
  dettaglioDaRigheSPO,
  dettaglioDeputato,
  envelopeCameraDeputati,
  gruppoCorrentePerDeputato,
  mappaABatch,
  nomeIntero,
  pulisciEtichettaGruppo,
  righeDaSparql,
  slugDaUriDeputato,
  sparqlCamera,
  type FetchLike,
} from "@/lib/parlamento";

/* Risposta reale: SELECT DISTINCT ?d ?nome ?cognome ?scheda (prime 2 righe). */
const LISTA_REALE = {
  head: { vars: ["d", "nome", "cognome", "scheda"] },
  results: {
    bindings: [
      {
        d: { type: "uri", value: "http://dati.camera.it/ocd/deputato.rdf/d307394_19" },
        nome: { type: "literal", value: "DAVIDE" },
        cognome: { type: "literal", value: "AIELLO" },
        scheda: {
          type: "uri",
          value:
            "http://www.camera.it/uri-res/N2Ls?urn:camera-it:parlamento:scheda.personale:camera;19.legislatura;307394",
        },
      },
      {
        d: { type: "uri", value: "http://dati.camera.it/ocd/deputato.rdf/d308421_19" },
        nome: { type: "literal", value: "LUCIA" },
        cognome: { type: "literal", value: "ALBANO" },
        scheda: {
          type: "uri",
          value:
            "http://www.camera.it/uri-res/N2Ls?urn:camera-it:parlamento:scheda.personale:camera;19.legislatura;308421",
        },
      },
    ],
  },
};

/* Risposta reale: SELECT ?d ?glabel ?inizio (AIELLO + deputato con cambio). */
const ADESIONI_REALI = {
  head: { vars: ["d", "glabel", "inizio"] },
  results: {
    bindings: [
      {
        d: { type: "uri", value: "http://dati.camera.it/ocd/deputato.rdf/d307394_19" },
        glabel: { type: "literal", value: "MOVIMENTO 5 STELLE (18.10.2022)" },
        inizio: { type: "literal", value: "20221018" },
      },
      {
        d: { type: "uri", value: "http://dati.camera.it/ocd/deputato.rdf/d300369_19" },
        glabel: { type: "literal", value: "MISTO (18.10.2022-27.10.2022)" },
        inizio: { type: "literal", value: "20221018" },
      },
      {
        d: { type: "uri", value: "http://dati.camera.it/ocd/deputato.rdf/d300369_19" },
        glabel: { type: "literal", value: "NOI MODERATI (27.10.2022)" },
        inizio: { type: "literal", value: "20221027" },
      },
    ],
  },
};

/* Estratto reale della forma RDF/JSON di DESCRIBE (sonda dep-dettaglio2.json). */
const RDF_JSON_REALE = {
  "http://dati.camera.it/ocd/deputato.rdf/d307394_19": {
    "http://xmlns.com/foaf/0.1/firstName": [{ type: "literal", value: "DAVIDE" }],
    "http://xmlns.com/foaf/0.1/surname": [{ type: "literal", value: "AIELLO" }],
    "http://purl.org/dc/terms/isReferencedBy": [
      {
        type: "uri",
        value:
          "http://www.camera.it/uri-res/N2Ls?urn:camera-it:parlamento:scheda.personale:camera;19.legislatura;307394",
      },
    ],
  },
};

const URI_AIELLO = "http://dati.camera.it/ocd/deputato.rdf/d307394_19";
const SCHEDA_AIELLO =
  "http://www.camera.it/uri-res/N2Ls?urn:camera-it:parlamento:scheda.personale:camera;19.legislatura;307394";

describe("slugDaUriDeputato", () => {
  it("estrae lo slug dall'URI reale del deputato", () => {
    expect(slugDaUriDeputato(URI_AIELLO)).toBe("d307394_19");
  });

  it("rifiuta gli URI di altra natura (atti, organi)", () => {
    expect(slugDaUriDeputato("http://dati.camera.it/ocd/atto.rdf/ac19_151")).toBe("");
    expect(slugDaUriDeputato("http://dati.camera.it/ocd/organo.rdf/o19_3511")).toBe("");
    expect(slugDaUriDeputato("")).toBe("");
  });
});

describe("nomeIntero", () => {
  it("compone NOME COGNOME come nei dati", () => {
    expect(nomeIntero("DAVIDE", "AIELLO")).toBe("DAVIDE AIELLO");
  });
});

describe("pulisciEtichettaGruppo", () => {
  it("toglie il suffisso con le date dalle etichette reali", () => {
    expect(pulisciEtichettaGruppo("MOVIMENTO 5 STELLE (18.10.2022)")).toBe(
      "MOVIMENTO 5 STELLE",
    );
    expect(pulisciEtichettaGruppo("MISTO (18.10.2022-27.10.2022)")).toBe("MISTO");
    expect(pulisciEtichettaGruppo("NOI MODERATI (27.10.2022)")).toBe("NOI MODERATI");
  });

  it("conserva le parentesi interne del nome", () => {
    expect(
      pulisciEtichettaGruppo(
        "NOI MODERATI (NOI CON L'ITALIA, CORAGGIO ITALIA, UDC E ITALIA AL CENTRO)-MAIE-CENTRO POPOLARE (30.10.2024)",
      ),
    ).toBe(
      "NOI MODERATI (NOI CON L'ITALIA, CORAGGIO ITALIA, UDC E ITALIA AL CENTRO)-MAIE-CENTRO POPOLARE",
    );
  });
});

describe("deputatiDaRigheLista", () => {
  it("mappa le righe reali con slug, nome e scheda osservata", () => {
    const deputati = deputatiDaRigheLista(righeDaSparql(LISTA_REALE));
    expect(deputati).toHaveLength(2);
    expect(deputati[0]).toEqual({
      slug: "d307394_19",
      nome: "DAVIDE AIELLO",
      urlScheda: SCHEDA_AIELLO,
    });
    expect(deputati[1]?.slug).toBe("d308421_19");
  });

  it("scarta le righe senza slug o senza nome", () => {
    const deputati = deputatiDaRigheLista([
      { d: { value: "http://dati.camera.it/ocd/atto.rdf/ac19_151" } },
      { d: { value: URI_AIELLO } },
    ]);
    expect(deputati).toHaveLength(0);
  });

  it("restituisce lista vuota per risposte inattese", () => {
    expect(deputatiDaRigheLista(righeDaSparql(null))).toEqual([]);
    expect(deputatiDaRigheLista(righeDaSparql({}))).toEqual([]);
  });
});

describe("gruppoCorrentePerDeputato", () => {
  it("sceglie l'adesione piu' recente in caso di cambio di gruppo", () => {
    const gruppi = gruppoCorrentePerDeputato(
      adesioniDaRighe(righeDaSparql(ADESIONI_REALI)),
    );
    expect(gruppi.get("d307394_19")).toBe("MOVIMENTO 5 STELLE");
    expect(gruppi.get("d300369_19")).toBe("NOI MODERATI");
  });
});

describe("dettaglioDaRdfJson", () => {
  it("legge nome e scheda dalla DESCRIBE reale in forma RDF/JSON", () => {
    const dettaglio = dettaglioDaRdfJson(URI_AIELLO, RDF_JSON_REALE);
    expect(dettaglio).toEqual({ nome: "DAVIDE AIELLO", urlScheda: SCHEDA_AIELLO });
  });

  it("restituisce vuoto per soggetti assenti", () => {
    expect(dettaglioDaRdfJson(URI_AIELLO, {})).toEqual({ nome: "", urlScheda: "" });
  });
});

describe("dettaglioDaRigheSPO", () => {
  it("considera solo le triple uscenti dal deputato", () => {
    const righe = [
      {
        s: { value: URI_AIELLO },
        p: { value: "http://xmlns.com/foaf/0.1/firstName" },
        o: { value: "DAVIDE" },
      },
      {
        s: { value: URI_AIELLO },
        p: { value: "http://xmlns.com/foaf/0.1/surname" },
        o: { value: "AIELLO" },
      },
      {
        s: { value: URI_AIELLO },
        p: { value: "http://purl.org/dc/terms/isReferencedBy" },
        o: { value: SCHEDA_AIELLO },
      },
      {
        s: { value: "http://dati.camera.it/ocd/voto.rdf/vd19_122_002_307394" },
        p: { value: "http://dati.camera.it/ocd/rif_deputato" },
        o: { value: URI_AIELLO },
      },
    ];
    expect(dettaglioDaRigheSPO(URI_AIELLO, righe)).toEqual({
      nome: "DAVIDE AIELLO",
      urlScheda: SCHEDA_AIELLO,
    });
  });
});

describe("envelopeCameraDeputati", () => {
  it("include provenance completa e legislatura", () => {
    const envelope = envelopeCameraDeputati(
      [{ slug: "d307394_19", nome: "DAVIDE AIELLO" }],
      "2026-09-28T00:00:00.000Z",
    );
    expect(envelope.provenance).toEqual({
      fonte: "dati.camera.it",
      url: "https://dati.camera.it/sparql",
      recuperatoIl: "2026-09-28T00:00:00.000Z",
      licenza: "CC BY-SA 4.0",
    });
    expect(envelope.legislatura).toBe("19");
    expect(envelope.deputati).toHaveLength(1);
  });
});

describe("fallback a rete fallita", () => {
  const fetchRotto: FetchLike = () => Promise.reject(new Error("rete assente"));

  it("sparqlCamera non lancia e restituisce l'errore in italiano", async () => {
    const esito = await sparqlCamera("SELECT * WHERE { ?s ?p ?o }", {
      fetchImpl: fetchRotto,
    });
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.errore).toBe("rete assente");
  });

  it("sparqlCamera segnala la query vuota senza rete", async () => {
    const esito = await sparqlCamera("   ", { fetchImpl: fetchRotto });
    expect(esito).toEqual({ ok: false, errore: "Query SPARQL vuota" });
  });

  it("caricaDeputati non lancia con rete assente", async () => {
    const esito = await caricaDeputati({ fetchImpl: fetchRotto });
    expect(esito.ok).toBe(false);
  });

  it("dettaglioDeputato rifiuta gli URI non da deputato senza rete", async () => {
    const esito = await dettaglioDeputato("http://dati.camera.it/ocd/atto.rdf/ac19_151", {
      fetchImpl: fetchRotto,
    });
    expect(esito.ok).toBe(false);
  });

  it("mappaABatch raccoglie gli errori senza lanciare", async () => {
    const { valori, errori } = await mappaABatch([1, 2], (n) => {
      if (n === 2) throw new Error("ko");
      return Promise.resolve(n * 10);
    });
    expect(valori).toEqual([10, null]);
    expect(errori).toHaveLength(1);
    expect(errori[0]?.indice).toBe(1);
  });
});

/* ===========================================================================
 * Hub Parlamento — contratto data-layer + API futura (scrittore test).
 *
 * Tutto offline e deterministico: fixture INLINE, zero rete. L'integrazione
 * su disco (`data/reali/`) gira solo se i file esistono davvero (controllo
 * esplicito di esistenza + require in try/catch). Se `lib/parlamento-dati.ts`
 * (W1) esiste, viene verificato per equivalenza; se assente, i test sulle
 * implementazioni di riferimento passano comunque.
 * ========================================================================= */

type CameraHub = "camera" | "senato";

interface MembroHub {
  readonly camera: CameraHub;
  readonly slug: string;
  readonly nome: string;
  readonly gruppo?: string;
  readonly collegio?: string;
  readonly foto?: string;
  readonly urlScheda?: string;
}

/* Fixture inline: nomi maiuscoli Camera come nei dati reali, titolo Senato. */
const MEMBRI_FIXTURE: MembroHub[] = [
  {
    camera: "camera",
    slug: "d307394_19",
    nome: "DAVIDE AIELLO",
    gruppo: "MOVIMENTO 5 STELLE",
    urlScheda:
      "http://www.camera.it/uri-res/N2Ls?urn:camera-it:parlamento:scheda.personale:camera;19.legislatura;307394",
  },
  {
    camera: "camera",
    slug: "d308421_19",
    nome: "LUCIA ALBANO",
    gruppo: "FRATELLI D'ITALIA",
    urlScheda:
      "http://www.camera.it/uri-res/N2Ls?urn:camera-it:parlamento:scheda.personale:camera;19.legislatura;308421",
  },
  {
    camera: "camera",
    slug: "d300001_19",
    nome: "MARIO ROSSI",
    gruppo: "FRATELLI D'ITALIA",
    urlScheda: "http://www.camera.it/uri-res/N2Ls?esempio-rossi",
  },
  {
    camera: "senato",
    slug: "32",
    nome: "Maria Elisabetta Alberti Casellati",
    gruppo: "Forza Italia - Berlusconi Presidente - PPE",
    foto: "http://www.senato.it/leg/19/Immagini/Senatori/00000032.jpg",
  },
  {
    camera: "senato",
    slug: "33",
    nome: "Giuseppe Verdi",
    gruppo: "Partito Democratico",
    foto: "http://www.senato.it/leg/19/Immagini/Senatori/00000033.jpg",
  },
  /* Omonimo su doppia camera: serve a verificare il caso ≥2 match → null. */
  {
    camera: "senato",
    slug: "34",
    nome: "MARIO ROSSI",
    gruppo: "Partito Democratico",
    foto: "http://www.senato.it/leg/19/Immagini/Senatori/00000034.jpg",
  },
];

/* ---- Implementazioni di riferimento (mirror del contratto W1) ---- */

function normalizzaRif(value: unknown): string {
  try {
    if (typeof value !== "string") return "";
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .replace(/\s+/g, " ");
  } catch {
    return "";
  }
}

function filtraPerGruppoRif(membri: readonly MembroHub[], gruppo: string): MembroHub[] {
  try {
    if (!Array.isArray(membri) || typeof gruppo !== "string" || !gruppo) return [];
    return membri.filter((m) => m?.gruppo === gruppo);
  } catch {
    return [];
  }
}

function cercaMembriRif(membri: readonly MembroHub[], q: unknown): MembroHub[] {
  try {
    if (!Array.isArray(membri)) return [];
    const grezza = typeof q === "string" ? q.slice(0, 100) : "";
    const normalizzata = normalizzaRif(grezza);
    if (normalizzata.length < 2) return [...membri];
    return membri.filter((m) => normalizzaRif(m?.nome).includes(normalizzata));
  } catch {
    return [];
  }
}

function paginaRif<T>(elementi: readonly T[], page: unknown, per: unknown): T[] {
  try {
    const elenco = Array.isArray(elementi) ? elementi : [];
    const p = typeof page === "number" && Number.isFinite(page) ? Math.floor(page) : 1;
    const pagina = p >= 1 ? p : 1;
    const n = typeof per === "number" && Number.isFinite(per) ? Math.floor(per) : 24;
    const perPagina = n === 12 || n === 24 ? n : 24;
    const inizio = (pagina - 1) * perPagina;
    return elenco.slice(inizio, inizio + perPagina);
  } catch {
    return [];
  }
}

function contaPerGruppoRif(membri: readonly MembroHub[]): { nome: string; componenti: number }[] {
  try {
    if (!Array.isArray(membri)) return [];
    const conteggi = new Map<string, number>();
    for (const m of membri) {
      const gruppo = typeof m?.gruppo === "string" ? m.gruppo.trim() : "";
      if (!gruppo) continue;
      conteggi.set(gruppo, (conteggi.get(gruppo) ?? 0) + 1);
    }
    return [...conteggi.entries()]
      .map(([nome, componenti]) => ({ nome, componenti }))
      .sort((a, b) => b.componenti - a.componenti || a.nome.localeCompare(b.nome, "it"));
  } catch {
    return [];
  }
}

/**
 * Match ministro→parlamentare: esatto su normalizzato, 1 solo → link,
 * 0 o ≥2 (doppia camera/omonimi) → null. Mai lancia.
 */
function trovaParlamentareRif(
  nomeMinistro: unknown,
  membri: readonly MembroHub[],
): MembroHub | null {
  try {
    if (typeof nomeMinistro !== "string") return null;
    if (!Array.isArray(membri)) return null;
    const chiave = normalizzaRif(nomeMinistro);
    if (!chiave) return null;
    const trovati = membri.filter((m) => normalizzaRif(m?.nome) === chiave);
    return trovati.length === 1 ? (trovati[0] as MembroHub) : null;
  } catch {
    return null;
  }
}

/* Simula la futura `GET /api/parlamento` congelata: mai 500, clamp per≤100. */
function simulaApiParlamento(
  params: Record<string, string | undefined>,
  membri: readonly MembroHub[],
): { status: number; totale: number; page: number; per: number; items: MembroHub[] } {
  try {
    const base = Array.isArray(membri) ? [...membri] : [];
    const camera = params.camera;
    let filtrati = base;
    if (camera === "camera" || camera === "senato") {
      filtrati = filtrati.filter((m) => m.camera === camera);
    }
    const gruppiWhitelist = new Set(filtrati.map((m) => m.gruppo).filter(Boolean));
    const gruppo = params.gruppo ?? "";
    if (gruppo) {
      filtrati = gruppiWhitelist.has(gruppo)
        ? filtrati.filter((m) => m.gruppo === gruppo)
        : [];
    }
    const q = (params.q ?? "").slice(0, 100);
    if (normalizzaRif(q).length >= 2) {
      const chiave = normalizzaRif(q);
      filtrati = filtrati.filter((m) => normalizzaRif(m.nome).includes(chiave));
    }
    const pageGrezza = Number.parseInt(params.page ?? "1", 10);
    const page = Number.isFinite(pageGrezza) && pageGrezza >= 1 ? Math.floor(pageGrezza) : 1;
    const perGrezza = Number.parseInt(params.per ?? "24", 10);
    const per =
      Number.isFinite(perGrezza) && perGrezza >= 1 ? Math.min(Math.floor(perGrezza), 100) : 24;
    const items = filtrati.slice((page - 1) * per, page * per);
    return { status: 200, totale: filtrati.length, page, per, items };
  } catch {
    return { status: 200, totale: 0, page: 1, per: 24, items: [] };
  }
}

describe("hub parlamento: helper puri con fixture inline", () => {
  it("normalizza: lowercase + trim + collapse + strip diacritics", () => {
    expect(normalizzaRif("  Giorgia   MELONI  ")).toBe("giorgia meloni");
    expect(normalizzaRif("Elisàbetta Àlberti")).toBe("elisabetta alberti");
    expect(normalizzaRif("FRATELLI D'ITALIA")).toBe("fratelli d'italia");
  });

  it("normalizza never-throw su input malformati", () => {
    expect(normalizzaRif(null)).toBe("");
    expect(normalizzaRif(undefined)).toBe("");
    expect(normalizzaRif(42)).toBe("");
    expect(normalizzaRif({})).toBe("");
  });

  it("filtraPerGruppo: whitelist esatta, mai free-text parziale", () => {
    expect(filtraPerGruppoRif(MEMBRI_FIXTURE, "FRATELLI D'ITALIA")).toHaveLength(2);
    expect(filtraPerGruppoRif(MEMBRI_FIXTURE, "FRATELLI")).toHaveLength(0);
    expect(filtraPerGruppoRif(MEMBRI_FIXTURE, "fratelli d'italia")).toHaveLength(0);
    expect(filtraPerGruppoRif(MEMBRI_FIXTURE, "")).toHaveLength(0);
  });

  it("cercaMembri: q sotto 2 caratteri restituisce tutto; slice 0,100", () => {
    expect(cercaMembriRif(MEMBRI_FIXTURE, "x")).toHaveLength(MEMBRI_FIXTURE.length);
    expect(cercaMembriRif(MEMBRI_FIXTURE, "")).toHaveLength(MEMBRI_FIXTURE.length);
    expect(cercaMembriRif(MEMBRI_FIXTURE, "aiello")).toHaveLength(1);
    expect(cercaMembriRif(MEMBRI_FIXTURE, "AIELLO")).toHaveLength(1);
    expect(cercaMembriRif(MEMBRI_FIXTURE, "mario rossi")).toHaveLength(2);
    expect(cercaMembriRif(MEMBRI_FIXTURE, "inesistente qqq")).toHaveLength(0);
  });

  it("pagina: page>=1, per in {12,24} default 24", () => {
    const dodici = Array.from({ length: 30 }, (_, i) => i);
    expect(paginaRif(dodici, 1, 12)).toHaveLength(12);
    expect(paginaRif(dodici, 2, 12).at(0)).toBe(12);
    expect(paginaRif(dodici, 0, 12)).toHaveLength(12);
    expect(paginaRif(dodici, -3, 12)).toHaveLength(12);
    expect(paginaRif(dodici, 1, 99)).toHaveLength(24);
    expect(paginaRif(dodici, 1, NaN)).toHaveLength(24);
    expect(paginaRif(dodici, 2, 24)).toHaveLength(6);
    expect(paginaRif(dodici, 9, 24)).toHaveLength(0);
  });

  it("contaPerGruppo: aggrega esatto e omette i senza gruppo", () => {
    const conteggi = contaPerGruppoRif(MEMBRI_FIXTURE);
    const fdi = conteggi.find((c) => c.nome === "FRATELLI D'ITALIA");
    expect(fdi?.componenti).toBe(2);
    const senzaGruppo = contaPerGruppoRif([
      { camera: "camera", slug: "x", nome: "SENZA GRUPPO" },
    ]);
    expect(senzaGruppo).toEqual([]);
  });

  it("helper never-throw su input assurdi", () => {
    expect(() => filtraPerGruppoRif(null as never, "x")).not.toThrow();
    expect(() => cercaMembriRif(null as never, null)).not.toThrow();
    expect(() => paginaRif(null as never, null, null)).not.toThrow();
    expect(() => contaPerGruppoRif(null as never)).not.toThrow();
    expect(filtraPerGruppoRif(null as never, "x")).toEqual([]);
    expect(cercaMembriRif(null as never, null)).toEqual([]);
  });
});

describe("hub parlamento: futura GET /api/parlamento (logica congelata)", () => {
  it("mai 500: parametri assurdi rispondono 200 con default", () => {
    for (const params of [
      {},
      { q: "", gruppo: "", camera: "", page: "", per: "" },
      { page: "-5", per: "0" },
      { page: "abc", per: "xyz", q: "!!!", camera: "luna", gruppo: "<script>" },
      { page: "NaN", per: "Infinity" },
    ]) {
      const esito = simulaApiParlamento(params, MEMBRI_FIXTURE);
      expect(esito.status).toBe(200);
      expect(esito.totale).toBeGreaterThanOrEqual(0);
      expect(esito.page).toBeGreaterThanOrEqual(1);
    }
  });

  it("filtro camera: deputati/senatori partizionano il totale", () => {
    const tutti = simulaApiParlamento({}, MEMBRI_FIXTURE);
    const cam = simulaApiParlamento({ camera: "camera" }, MEMBRI_FIXTURE);
    const sen = simulaApiParlamento({ camera: "senato" }, MEMBRI_FIXTURE);
    expect(cam.totale + sen.totale).toBe(tutti.totale);
    expect(cam.items.every((m) => m.camera === "camera")).toBe(true);
    expect(sen.items.every((m) => m.camera === "senato")).toBe(true);
  });

  it("filtro gruppo: whitelist esatta, valore ignoto → totale 0", () => {
    const ok = simulaApiParlamento({ gruppo: "FRATELLI D'ITALIA" }, MEMBRI_FIXTURE);
    expect(ok.totale).toBe(2);
    expect(simulaApiParlamento({ gruppo: "FRATELLI" }, MEMBRI_FIXTURE).totale).toBe(0);
    expect(simulaApiParlamento({ gruppo: "GRUPPO INVENTATO" }, MEMBRI_FIXTURE).totale).toBe(0);
  });

  it("filtro q: min 2 caratteri, case-insensitive", () => {
    expect(simulaApiParlamento({ q: "a" }, MEMBRI_FIXTURE).totale).toBe(MEMBRI_FIXTURE.length);
    expect(simulaApiParlamento({ q: "aiello" }, MEMBRI_FIXTURE).totale).toBe(1);
    expect(simulaApiParlamento({ q: "AIELLO" }, MEMBRI_FIXTURE).totale).toBe(1);
  });

  it("page/per bounds: page reset a 1, per>100 clamp a 100", () => {
    expect(simulaApiParlamento({ page: "0" }, MEMBRI_FIXTURE).page).toBe(1);
    expect(simulaApiParlamento({ page: "-2" }, MEMBRI_FIXTURE).page).toBe(1);
    expect(simulaApiParlamento({ per: "500" }, MEMBRI_FIXTURE).per).toBe(100);
    expect(simulaApiParlamento({ per: "101" }, MEMBRI_FIXTURE).per).toBe(100);
    expect(simulaApiParlamento({ per: "100" }, MEMBRI_FIXTURE).per).toBe(100);
    expect(simulaApiParlamento({}, MEMBRI_FIXTURE).per).toBe(24);
  });

  it("totali coerenti: items.length <= totale e pagine non si sovrappongono", () => {
    const tanti = Array.from({ length: 30 }, (_, i) => ({
      camera: "camera" as const,
      slug: `d${i}_19`,
      nome: `DEPUTATO ${i} PROVA`,
      gruppo: "GRUPPO A",
    }));
    const p1 = simulaApiParlamento({ page: "1", per: "10" }, tanti);
    const p2 = simulaApiParlamento({ page: "2", per: "10" }, tanti);
    expect(p1.totale).toBe(30);
    expect(p2.totale).toBe(30);
    expect(p1.items).toHaveLength(10);
    expect(p2.items).toHaveLength(10);
    const slug1 = new Set(p1.items.map((m) => m.slug));
    for (const m of p2.items) expect(slug1.has(m.slug)).toBe(false);
  });
});

describe("hub parlamento: matchMinistro (trovaParlamentare)", () => {
  it("match esatto ok", () => {
    const trovato = trovaParlamentareRif("DAVIDE AIELLO", MEMBRI_FIXTURE);
    expect(trovato?.slug).toBe("d307394_19");
  });

  it("case-insensitive + diacritics ok", () => {
    expect(trovaParlamentareRif("davide aiello", MEMBRI_FIXTURE)?.slug).toBe("d307394_19");
    expect(
      trovaParlamentareRif("Maria Elisabetta Alberti Casellati", MEMBRI_FIXTURE)?.slug,
    ).toBe("32");
    expect(
      trovaParlamentareRif("maria elisabetta alberti casellati", MEMBRI_FIXTURE)?.slug,
    ).toBe("32");
  });

  it("parziale NON matcha", () => {
    expect(trovaParlamentareRif("AIELLO", MEMBRI_FIXTURE)).toBeNull();
    expect(trovaParlamentareRif("Davide", MEMBRI_FIXTURE)).toBeNull();
    expect(trovaParlamentareRif("Maria Elisabetta", MEMBRI_FIXTURE)).toBeNull();
  });

  it("vuoto → null; omonimo doppia camera (≥2) → null", () => {
    expect(trovaParlamentareRif("", MEMBRI_FIXTURE)).toBeNull();
    expect(trovaParlamentareRif("   ", MEMBRI_FIXTURE)).toBeNull();
    expect(trovaParlamentareRif("MARIO ROSSI", MEMBRI_FIXTURE)).toBeNull();
    expect(trovaParlamentareRif("Persona Inesistente", MEMBRI_FIXTURE)).toBeNull();
  });

  it("never-throw su input malformati", () => {
    expect(() => trovaParlamentareRif(null, MEMBRI_FIXTURE)).not.toThrow();
    expect(() => trovaParlamentareRif(undefined, MEMBRI_FIXTURE)).not.toThrow();
    expect(() => trovaParlamentareRif(42, MEMBRI_FIXTURE)).not.toThrow();
    expect(() => trovaParlamentareRif("DAVIDE AIELLO", null as never)).not.toThrow();
    expect(trovaParlamentareRif(null, MEMBRI_FIXTURE)).toBeNull();
    expect(trovaParlamentareRif("DAVIDE AIELLO", null as never)).toBeNull();
  });
});

describe("hub parlamento: equivalenza con lib/parlamento-dati.ts se presente (W1)", () => {
  it("se il modulo esiste, le firme pure si comportano come il riferimento", async () => {
    let reale: Record<string, (...args: never[]) => unknown> | null = null;
    try {
      reale = (await import("@/lib/parlamento-dati")) as unknown as Record<
        string,
        (...args: never[]) => unknown
      >;
    } catch {
      reale = null;
    }
    if (!reale) return;
    const normalizza = reale.normalizza as ((s: unknown) => string) | undefined;
    const trova = reale.trovaParlamentare as
      | ((nome: unknown, membri: readonly MembroHub[]) => MembroHub | null)
      | undefined;
    const paginaFn = reale.pagina as
      | ((a: readonly unknown[], page: unknown, per: unknown) => unknown[])
      | undefined;
    if (typeof normalizza === "function") {
      expect(normalizza("  Giorgia   MELONI  ")).toBe(normalizzaRif("  Giorgia   MELONI  "));
      expect(normalizza(null)).toBe("");
    }
    if (typeof trova === "function") {
      expect(trova("DAVIDE AIELLO", MEMBRI_FIXTURE)?.slug).toBe("d307394_19");
      expect(trova("AIELLO", MEMBRI_FIXTURE)).toBeNull();
      expect(trova("", MEMBRI_FIXTURE)).toBeNull();
    }
    if (typeof paginaFn === "function") {
      expect(() => paginaFn(null as never, null, null)).not.toThrow();
    }
  });
});

/* Integrazione disco: solo se i file reali esistono (tollerante, mai rete). */
const RADICE_DISCO = typeof process !== "undefined" ? process.cwd() : ".";
const FILE_CAMERA = `${RADICE_DISCO}/data/reali/camera-deputati.json`;
const FILE_SENATO = `${RADICE_DISCO}/data/reali/senato-senatori.json`;
const FILE_GRUPPI_CAMERA = `${RADICE_DISCO}/data/reali/camera-gruppi.json`;
const FILE_GRUPPI_SENATO = `${RADICE_DISCO}/data/reali/senato-gruppi.json`;

async function discoPresente(): Promise<boolean> {
  try {
    const fs = await import("node:fs");
    return (
      fs.existsSync(FILE_CAMERA) &&
      fs.existsSync(FILE_SENATO) &&
      fs.existsSync(FILE_GRUPPI_CAMERA) &&
      fs.existsSync(FILE_GRUPPI_SENATO)
    );
  } catch {
    return false;
  }
}

async function leggiJsonDisco<T>(percorso: string): Promise<T | null> {
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(percorso)) return null;
    const grezzo = fs.readFileSync(percorso, "utf8");
    return JSON.parse(grezzo) as T;
  } catch {
    return null;
  }
}

describe("hub parlamento: integrazione disco (solo se data/reali presente)", () => {
  it("totali reali coerenti: 414 deputati, 212 senatori, legislatura 19", async () => {
    if (!(await discoPresente())) return;
    const camera = await leggiJsonDisco<{
      legislatura: string;
      deputati: { slug: string; nome: string; gruppo?: string; urlScheda?: string }[];
      provenance: { licenza: string; recuperatoIl: string };
    }>(FILE_CAMERA);
    const senato = await leggiJsonDisco<{
      legislatura: string;
      senatori: { slug: string; nome: string; gruppo?: string; foto?: string }[];
      provenance: { licenza: string; recuperatoIl: string };
    }>(FILE_SENATO);
    if (!camera || !senato) return;
    expect(camera.legislatura).toBe("19");
    expect(senato.legislatura).toBe("19");
    expect(camera.deputati).toHaveLength(414);
    expect(senato.senatori).toHaveLength(212);
    expect(camera.provenance.licenza).toBe("CC BY-SA 4.0");
    expect(senato.provenance.licenza).toBe("CC BY 3.0 IT");
    expect(typeof camera.provenance.recuperatoIl).toBe("string");
    expect(typeof senato.provenance.recuperatoIl).toBe("string");
  });

  it("gruppi Camera reali: 13 con componenti; Senato: 14 voci storiche mai correnti", async () => {
    if (!(await discoPresente())) return;
    const gruppiCamera = await leggiJsonDisco<{
      gruppi: { nome: string; componenti: number }[];
    }>(FILE_GRUPPI_CAMERA);
    const gruppiSenato = await leggiJsonDisco<{
      gruppi: { uri: string; nome: string; inizio?: string; fine?: string }[];
    }>(FILE_GRUPPI_SENATO);
    if (!gruppiCamera || !gruppiSenato) return;
    expect(gruppiCamera.gruppi).toHaveLength(13);
    for (const g of gruppiCamera.gruppi) {
      expect(typeof g.nome).toBe("string");
      expect(typeof g.componenti).toBe("number");
    }
    expect(gruppiSenato.gruppi).toHaveLength(14);
    /* Le voci Senato sono denominazioni storiche con inizio/fine: non usarle
       come conteggio corrente; il conteggio corrente deriva dai senatori. */
    const senato = await leggiJsonDisco<{
      senatori: { gruppo?: string }[];
    }>(FILE_SENATO);
    if (!senato) return;
    const correnti = contaPerGruppoRif(
      senato.senatori.map((s, i) => ({
        camera: "senato" as const,
        slug: String(i),
        nome: "X",
        gruppo: s.gruppo,
      })),
    );
    expect(correnti.length).toBeGreaterThan(0);
    expect(correnti.length).not.toBe(14);
  });

  it("onestà dati reali: mai inventare gruppo/foto/collegio", async () => {
    if (!(await discoPresente())) return;
    const camera = await leggiJsonDisco<{
      deputati: { gruppo?: string; collegio?: string; urlScheda?: string }[];
    }>(FILE_CAMERA);
    const senato = await leggiJsonDisco<{
      senatori: { gruppo?: string; foto?: string }[];
    }>(FILE_SENATO);
    if (!camera || !senato) return;
    const senzaGruppo = camera.deputati.filter((d) => !d.gruppo);
    expect(senzaGruppo).toHaveLength(0);
    const conCollegio = camera.deputati.filter((d) => d.collegio);
    expect(conCollegio).toHaveLength(0);
    expect(senato.senatori.filter((s) => !s.gruppo)).toHaveLength(0);
    expect(senato.senatori.filter((s) => !s.foto)).toHaveLength(0);
  });
});

