/**
 * Ingest reale Senato — senatori e gruppi della legislatura 19.
 *
 * Sorgente unica: endpoint SPARQL ufficiale `https://dati.senato.it/sparql`.
 * Nessun dato inventato: ogni campo proviene da triple osservate
 * (`foaf:firstName/lastName`, `rdfs:label`, `foaf:depiction`,
 * `ocd:aderisce` + `osr:gruppo/osr:inizio/osr:legislatura`,
 * `osr:denominazione` + `osr:titolo/osr:titoloBreve/osr:inizio/osr:fine`).
 * Campi assenti nelle risposte vengono omessi, mai ricostruiti.
 *
 * Strategia: 1 query di lista + N dettagli per senatore a batch da 5
 * (timeout 8000ms, mai oltre 1 retry) + 1 query bulk per le denominazioni
 * dei gruppi. Nota: `DESCRIBE <senatore>` sull'endpoint live restituisce
 * solo decine di migliaia di righe di votazioni senza depiction/label,
 * quindi il dettaglio usa una `SELECT` mirata sugli stessi predicati
 * verificati in sonda (stessa disciplina di batch/timeout).
 *
 * Fallimento di rete o risposte vuote -> exit 1 senza scrivere alcun file.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SENATO_SPARQL = "https://dati.senato.it/sparql";
const LEGISLATURA = "19";
const LEG19_SOGLIA = "2022-10-13";
const LICENZA = "CC BY 3.0 IT";
const TIMEOUT_MS = 8000;
const BATCH = 5;
const PAUSA_BATCH_MS = 150;
const MAX_RETRY = 1;
const MAX_BYTE = 1_048_576;

const DIR_REALI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "reali");
const FILE_SENATORI = resolve(DIR_REALI, "senato-senatori.json");
const FILE_GRUPPI = resolve(DIR_REALI, "senato-gruppi.json");

const QUERY_LISTA = [
  "PREFIX osr:<http://dati.senato.it/osr/>",
  "PREFIX foaf:<http://xmlns.com/foaf/0.1/>",
  "PREFIX ocd:<http://dati.camera.it/ocd/>",
  "SELECT DISTINCT ?s ?nome ?cognome ?label WHERE {",
  "  ?s ocd:aderisce ?a . ?a osr:legislatura 19 .",
  "  ?s foaf:firstName ?nome ; foaf:lastName ?cognome .",
  "  OPTIONAL { ?s <http://www.w3.org/2000/01/rdf-schema#label> ?label }",
  "} ORDER BY ?cognome ?nome",
].join(" ");

const QUERY_DENOMINAZIONI = [
  "PREFIX osr:<http://dati.senato.it/osr/>",
  "SELECT DISTINCT ?gr ?nome ?breve ?inizio ?fine WHERE {",
  "  ?gr <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>",
  "    <http://dati.camera.it/ocd/gruppoParlamentare> ;",
  "    osr:denominazione ?den .",
  "  ?den osr:titolo ?nome .",
  "  OPTIONAL { ?den osr:titoloBreve ?breve }",
  "  OPTIONAL { ?den osr:inizio ?inizio }",
  "  OPTIONAL { ?den osr:fine ?fine }",
  "} ORDER BY ?gr ?inizio",
].join(" ");

function queryDettaglio(uriSenatore: string): string {
  return [
    "PREFIX osr:<http://dati.senato.it/osr/>",
    "PREFIX foaf:<http://xmlns.com/foaf/0.1/>",
    "PREFIX ocd:<http://dati.camera.it/ocd/>",
    "SELECT ?foto ?gruppo ?inizio ?leg WHERE {",
    `  OPTIONAL { <${uriSenatore}> foaf:depiction ?foto }`,
    `  OPTIONAL { <${uriSenatore}> ocd:aderisce ?adesione .`,
    "    ?adesione osr:gruppo ?gruppo ; osr:legislatura ?leg .",
    "    OPTIONAL { ?adesione osr:inizio ?inizio } }",
    "}",
  ].join(" ");
}

interface SparqlTermine {
  readonly type?: unknown;
  readonly value?: unknown;
}

type SparqlRiga = Record<string, SparqlTermine | undefined>;

interface Adesione {
  readonly gruppo: string;
  readonly inizio: string;
}

interface DettaglioSenatore {
  readonly foto: string;
  readonly adesioni: Adesione[];
}

interface VoceLista {
  readonly uri: string;
  readonly nome: string;
  readonly cognome: string;
  readonly label: string;
}

interface Denominazione {
  readonly uri: string;
  readonly nome: string;
  readonly breve: string;
  readonly inizio: string;
  readonly fine: string;
}

function dormi(ms: number): Promise<void> {
  return new Promise((resolveAttesa) => setTimeout(resolveAttesa, ms));
}

function testo(riga: SparqlRiga, variabile: string): string {
  const termine = riga[variabile];
  if (!termine || typeof termine.value !== "string") return "";
  return termine.value.trim();
}

function isoValida(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

async function fetchConTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/sparql-results+json, application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
}

function righeDaJson(json: unknown): SparqlRiga[] {
  if (typeof json !== "object" || json === null) return [];
  const results = (json as { results?: unknown }).results;
  if (typeof results !== "object" || results === null) return [];
  const bindings = (results as { bindings?: unknown }).bindings;
  if (!Array.isArray(bindings)) return [];
  return bindings.filter((riga): riga is SparqlRiga => typeof riga === "object" && riga !== null);
}

async function sparqlSelect(query: string): Promise<SparqlRiga[]> {
  const url = `${SENATO_SPARQL}?query=${encodeURIComponent(query)}&format=${encodeURIComponent("application/sparql-results+json")}`;
  let ultimoErrore = "";
  for (let tentativo = 0; tentativo <= MAX_RETRY; tentativo += 1) {
    try {
      const risposta = await fetchConTimeout(url);
      if (!risposta.ok) {
        ultimoErrore = `SPARQL ${risposta.status}`;
        continue;
      }
      const json = (await risposta.json()) as unknown;
      return righeDaJson(json);
    } catch (errore) {
      ultimoErrore = errore instanceof Error ? errore.message : "errore di rete";
    }
  }
  throw new Error(`interrogazione SPARQL fallita: ${ultimoErrore}`);
}

async function dettaglioSenatore(uri: string): Promise<DettaglioSenatore> {
  const righe = await sparqlSelect(queryDettaglio(uri));
  let foto = "";
  const adesioni: Adesione[] = [];
  for (const riga of righe) {
    const fotoOsservata = testo(riga, "foto");
    if (fotoOsservata.startsWith("http") && !foto) foto = fotoOsservata;
    const gruppo = testo(riga, "gruppo");
    const leg = testo(riga, "leg");
    if (gruppo.startsWith("http") && leg === LEGISLATURA) {
      adesioni.push({ gruppo, inizio: testo(riga, "inizio") });
    }
  }
  return { foto, adesioni };
}

function slugDaUri(uri: string): string {
  const match = /\/senatore\/(\d+)\s*$/.exec(uri);
  return match?.[1] ?? "";
}

function adesionePiuRecente(adesioni: Adesione[]): Adesione | null {
  let migliore: Adesione | null = null;
  for (const adesione of adesioni) {
    if (!migliore || adesione.inizio > migliore.inizio) migliore = adesione;
  }
  return migliore;
}

async function main(): Promise<void> {
  const recuperatoIl = new Date().toISOString();

  const righeLista = await sparqlSelect(QUERY_LISTA);
  if (righeLista.length === 0) throw new Error("lista senatori vuota");
  const voci: VoceLista[] = [];
  for (const riga of righeLista) {
    const uri = testo(riga, "s");
    if (!uri.startsWith("http") || !slugDaUri(uri)) continue;
    voci.push({
      uri,
      nome: testo(riga, "nome"),
      cognome: testo(riga, "cognome"),
      label: testo(riga, "label"),
    });
  }
  if (voci.length === 0) throw new Error("nessun senatore utilizzabile");

  const dettagli = new Map<string, DettaglioSenatore>();
  let falliti = 0;
  for (let i = 0; i < voci.length; i += BATCH) {
    const blocco = voci.slice(i, i + BATCH);
    // Mai abortire l'intero ingest per un singolo dettaglio KO: ogni voce
    // e' isolata, i falliti restano senza gruppo/foto ma con nome reale.
    const risultati = await Promise.all(
      blocco.map(async (voce): Promise<DettaglioSenatore | null> => {
        try {
          return await dettaglioSenatore(voce.uri);
        } catch {
          falliti += 1;
          return null;
        }
      }),
    );
    blocco.forEach((voce, indice) => {
      const dettaglio = risultati[indice];
      if (dettaglio) dettagli.set(voce.uri, dettaglio);
    });
    if (i + BATCH < voci.length) await dormi(PAUSA_BATCH_MS);
  }
  if (dettagli.size === 0) {
    throw new Error(`nessun dettaglio senatore riuscito (${falliti} falliti)`);
  }
  if (falliti > 0) {
    console.warn(`[ingest-senato] ${falliti} dettagli falliti: senatori senza gruppo/foto`);
  }

  const righeDenominazioni = await sparqlSelect(QUERY_DENOMINAZIONI);
  if (righeDenominazioni.length === 0) throw new Error("denominazioni gruppi vuote");
  const perGruppo = new Map<string, Denominazione[]>();
  for (const riga of righeDenominazioni) {
    const uri = testo(riga, "gr");
    const nome = testo(riga, "nome");
    if (!uri.startsWith("http") || !nome) continue;
    const voce: Denominazione = {
      uri,
      nome,
      breve: testo(riga, "breve"),
      inizio: testo(riga, "inizio"),
      fine: testo(riga, "fine"),
    };
    const lista = perGruppo.get(uri) ?? [];
    lista.push(voce);
    perGruppo.set(uri, lista);
  }

  const gruppiOsservati = new Set<string>();
  for (const dettaglio of dettagli.values()) {
    for (const adesione of dettaglio.adesioni) gruppiOsservati.add(adesione.gruppo);
  }
  if (gruppiOsservati.size === 0) throw new Error("nessun gruppo osservato dalle adesioni");

  const etichettaCorrente = new Map<string, string>();
  const gruppiFinali: {
    uri: string;
    nome: string;
    breve?: string;
    inizio?: string;
    fine?: string;
  }[] = [];
  for (const uri of [...gruppiOsservati].sort()) {
    const denominazioni = (perGruppo.get(uri) ?? []).filter(
      (d) => d.fine === "" || d.fine >= LEG19_SOGLIA,
    );
    if (denominazioni.length === 0) continue;
    denominazioni.sort((a, b) => (a.inizio < b.inizio ? -1 : a.inizio > b.inizio ? 1 : 0));
    const corrente = denominazioni[denominazioni.length - 1];
    if (corrente) etichettaCorrente.set(uri, corrente.nome);
    for (const d of denominazioni) {
      const record: {
        uri: string;
        nome: string;
        breve?: string;
        inizio?: string;
        fine?: string;
      } = { uri: d.uri, nome: d.nome };
      if (d.breve) record.breve = d.breve;
      if (isoValida(d.inizio)) record.inizio = d.inizio;
      if (isoValida(d.fine)) record.fine = d.fine;
      gruppiFinali.push(record);
    }
  }
  if (gruppiFinali.length === 0) throw new Error("nessun gruppo della leg. 19 ricostruito");
  gruppiFinali.sort((a, b) => a.nome.localeCompare(b.nome, "it"));

  const senatori: { slug: string; nome: string; gruppo?: string; foto?: string }[] = [];
  let scartati = 0;
  for (const voce of voci) {
    const nome = voce.label || `${voce.nome} ${voce.cognome}`.trim();
    if (!nome) {
      scartati += 1;
      continue;
    }
    const dettaglio = dettagli.get(voce.uri);
    const record: { slug: string; nome: string; gruppo?: string; foto?: string } = {
      slug: slugDaUri(voce.uri),
      nome,
    };
    const recente = dettaglio ? adesionePiuRecente(dettaglio.adesioni) : null;
    const etichetta = recente ? etichettaCorrente.get(recente.gruppo) : undefined;
    if (etichetta) record.gruppo = etichetta;
    if (dettaglio && dettaglio.foto) record.foto = dettaglio.foto;
    senatori.push(record);
  }
  if (senatori.length === 0) throw new Error("nessun senatore ricostruito");

  const envelopeSenatori = {
    provenance: {
      fonte: "dati.senato.it",
      url: SENATO_SPARQL,
      recuperatoIl,
      licenza: LICENZA,
    },
    legislatura: LEGISLATURA,
    senatori,
  };
  const envelopeGruppi = {
    provenance: {
      fonte: "dati.senato.it",
      url: SENATO_SPARQL,
      recuperatoIl,
      licenza: LICENZA,
    },
    legislatura: LEGISLATURA,
    gruppi: gruppiFinali,
  };

  const jsonSenatori = `${JSON.stringify(envelopeSenatori, null, 2)}\n`;
  const jsonGruppi = `${JSON.stringify(envelopeGruppi, null, 2)}\n`;
  if (Buffer.byteLength(jsonSenatori, "utf8") > MAX_BYTE) {
    throw new Error("senato-senatori.json oltre 1MB");
  }
  if (Buffer.byteLength(jsonGruppi, "utf8") > MAX_BYTE) {
    throw new Error("senato-gruppi.json oltre 1MB");
  }

  mkdirSync(DIR_REALI, { recursive: true });
  writeFileSync(FILE_SENATORI, jsonSenatori, "utf8");
  writeFileSync(FILE_GRUPPI, jsonGruppi, "utf8");

  const conGruppo = senatori.filter((s) => s.gruppo).length;
  const conFoto = senatori.filter((s) => s.foto).length;
  console.log(
    `Senato leg. 19: ${senatori.length} senatori (${conGruppo} con gruppo, ${conFoto} con foto), ` +
      `${gruppiFinali.length} denominazioni di ${gruppiOsservati.size} gruppi` +
      (scartati > 0 ? `, ${scartati} scartati (senza nome)` : "") +
      `. File scritti: data/reali/senato-senatori.json, data/reali/senato-gruppi.json.`,
  );
}

main().catch((errore: unknown) => {
  const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
  console.error(`Ingest Senato fallito, nessun file scritto: ${messaggio}`);
  process.exit(1);
});
