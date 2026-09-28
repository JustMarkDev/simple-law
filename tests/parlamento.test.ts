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
