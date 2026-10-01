/**
 * Ingest reale DDL/atti verticali (Senato + Camera, legislatura 19).
 *
 * Uso: `bunx tsx scripts/ingest-reale-ddl.ts`
 *
 * Sorgenti (solo dati osservati, mai inventati):
 *  - Senato: endpoint SPARQL `https://dati.senato.it/sparql`, lista max 100
 *    `SELECT ?d ?titolo ?num ?stato ?data ?ramo ?idddl WHERE { ?d a osr:Ddl ;
 *    osr:legislatura 19 ; ... } ORDER BY DESC(?data) LIMIT 100`, poi dettagli
 *    `SELECT ?p ?o WHERE { <ddl> ?p ?o }` a batch da 5 (timeout 8s, 1 retry,
 *    pausa 150ms). Su 403 WAF si ferma subito (stop su 403).
 *  - Camera: endpoint SPARQL `https://dati.camera.it/sparql`, max 200 atti
 *    `SELECT DISTINCT ?a ?tipo ?numero ... rif_leg repubblica_19` con
 *    LIMIT/OFFSET, poi dettagli `SELECT ?p ?o WHERE { <atto> ?p ?o }`
 *    (label/titolo/scheda osservati, mai costruiti).
 *
 * Record Senato (solo campi osservati): uri, idDdl, idFase, titolo,
 * numeroFase, numeroFaseCompatto, fase, ramo, statoDdl_raw (grezzo, MAI
 * mappato a stati propri), dataPresentazione, dataStatoDdl?,
 * descrIniziativa?, testoNIR?, legislatura 19. Niente GU/codici oltre SPARQL.
 * Record Camera (solo campi osservati): uri, slug (da URI reale
 * `.../attocamera.rdf/ac19_N`), tipo, numero, titolo?, label?, scheda?
 * (solo da `dcterms:isReferencedBy` osservato).
 *
 * Scrive `data/reali/parlamento-ddl.json` + `data/reali/camera-atti.json`
 * (<=1MB cad.) con envelope `{provenance, legislatura, ddl|atti}`.
 * Fallimento di rete o dati vuoti -> exit 1 SENZA scrivere file parziali:
 * nessun file viene toccato finche' entrambe le sorgenti non sono complete.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SENATO_SPARQL = "https://dati.senato.it/sparql";
const CAMERA_SPARQL = "https://dati.camera.it/sparql";
const SENATO_LICENZA = "CC BY 3.0 IT";
const CAMERA_LICENZA = "CC BY-SA 4.0";
const LEGISLATURA_SENATO = 19;
const LEGISLATURA_CAMERA = "19";
const LEGISLATURA_CAMERA_URI = "http://dati.camera.it/ocd/legislatura.rdf/repubblica_19";
const SENATO_MAX = 100;
const CAMERA_MAX = 200;
const CAMERA_PAGINA = 50;
const TIMEOUT_MS = 8000;
const BATCH = 5;
const PAUSA_BATCH_MS = 150;
const MAX_RETRY = 1;
const MAX_BYTE = 1_048_576;

const DIR_REALI = fileURLToPath(new URL("../data/reali/", import.meta.url));
const FILE_SENATO = fileURLToPath(new URL("../data/reali/parlamento-ddl.json", import.meta.url));
const FILE_CAMERA = fileURLToPath(new URL("../data/reali/camera-atti.json", import.meta.url));

const OSR = "http://dati.senato.it/osr/";

const QUERY_SENATO_LISTA = [
  `PREFIX osr:<${OSR}>`,
  "SELECT ?d ?titolo ?num ?stato ?data ?ramo ?idddl WHERE {",
  "  ?d a osr:Ddl ; osr:legislatura 19 ;",
  "     osr:titolo ?titolo ; osr:numeroFaseCompatto ?num ;",
  "     osr:statoDdl ?stato ; osr:dataPresentazione ?data ;",
  "     osr:ramo ?ramo ; osr:idDdl ?idddl .",
  "} ORDER BY DESC(?data)",
  `LIMIT ${SENATO_MAX}`,
].join(" ");

function querySenatoDettaglio(uri: string): string {
  return `SELECT ?p ?o WHERE { <${uri}> ?p ?o }`;
}

function queryCameraLista(limite: number, offset: number): string {
  return [
    "SELECT DISTINCT ?a ?tipo ?numero WHERE {",
    `  ?a a <http://dati.camera.it/ocd/atto> ;`,
    `     <http://dati.camera.it/ocd/rif_leg> <${LEGISLATURA_CAMERA_URI}> ;`,
    "     <http://purl.org/dc/elements/1.1/type> ?tipo ;",
    "     <http://purl.org/dc/elements/1.1/identifier> ?numero .",
    "} ORDER BY ?numero",
    `LIMIT ${limite} OFFSET ${offset}`,
  ].join(" ");
}

const QUERY_CAMERA_LISTA_BASE =
  "SELECT DISTINCT ?a ?tipo ?numero WHERE { ?a a " +
  "<http://dati.camera.it/ocd/atto> ; " +
  `<http://dati.camera.it/ocd/rif_leg> <${LEGISLATURA_CAMERA_URI}> ; ` +
  "<http://purl.org/dc/elements/1.1/type> ?tipo ; " +
  "<http://purl.org/dc/elements/1.1/identifier> ?numero }";

function queryCameraDettaglio(uri: string): string {
  return `SELECT ?p ?o WHERE { <${uri}> ?p ?o }`;
}

/* ------------------------------------------------------------------ tipi */

interface Termine {
  readonly type?: unknown;
  readonly value?: unknown;
}

type Riga = Record<string, Termine | undefined>;

export interface DdlSenato {
  readonly uri: string;
  readonly idDdl: string;
  readonly idFase?: string;
  readonly titolo: string;
  readonly numeroFase?: string;
  readonly numeroFaseCompatto: string;
  readonly fase?: string;
  readonly ramo: string;
  readonly statoDdl_raw: string;
  readonly dataPresentazione: string;
  readonly dataStatoDdl?: string;
  readonly descrIniziativa?: string;
  readonly testoNIR?: string;
  readonly legislatura: 19;
}

export interface AttoCamera {
  readonly uri: string;
  readonly slug: string;
  readonly tipo: string;
  readonly numero: string;
  readonly titolo?: string;
  readonly label?: string;
  readonly scheda?: string;
}

/* ------------------------------------------------------------- utilities */

function esci(messaggio: string): never {
  console.error(`[ingest-ddl] ERRORE: ${messaggio}`);
  process.exit(1);
}

function dormi(ms: number): Promise<void> {
  return new Promise((risolvi) => setTimeout(risolvi, ms));
}

function testo(riga: Riga, variabile: string): string {
  const termine = riga[variabile];
  if (!termine || typeof termine.value !== "string") return "";
  return termine.value.trim();
}

function righeDaJson(json: unknown): Riga[] {
  if (typeof json !== "object" || json === null) return [];
  const results = (json as { results?: unknown }).results;
  if (typeof results !== "object" || results === null) return [];
  const bindings = (results as { bindings?: unknown }).bindings;
  if (!Array.isArray(bindings)) return [];
  return bindings.filter((riga): riga is Riga => typeof riga === "object" && riga !== null);
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

async function sparqlSelect(endpoint: string, query: string, etichetta: string): Promise<Riga[]> {
  const url =
    `${endpoint}?query=${encodeURIComponent(query)}` +
    `&format=${encodeURIComponent("application/sparql-results+json")}`;
  let ultimoErrore = "";
  let visto403 = false;
  for (let tentativo = 0; tentativo <= MAX_RETRY; tentativo += 1) {
    try {
      const risposta = await fetchConTimeout(url);
      if (risposta.status === 403 || risposta.status === 409) {
        visto403 = true;
        ultimoErrore = `SPARQL ${risposta.status} (stop su ${risposta.status})`;
        break;
      }
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
  if (visto403) throw new Error(`${etichetta}: ${ultimoErrore}`);
  throw new Error(`${etichetta}: interrogazione SPARQL fallita (${ultimoErrore})`);
}

function slugCameraDaUri(uri: string): string {
  const match = /\/attocamera\.rdf\/(ac19_\d+)\s*$/.exec(uri);
  return match?.[1] ?? "";
}

/* ------------------------------------------------------------- senato */

interface VoceSenatoLista {
  readonly uri: string;
  readonly titolo: string;
  readonly num: string;
  readonly stato: string;
  readonly data: string;
  readonly ramo: string;
  readonly idddl: string;
}

async function caricaSenato(): Promise<DdlSenato[]> {
  const righe = await sparqlSelect(SENATO_SPARQL, QUERY_SENATO_LISTA, "senato/lista-ddl");
  const voci: VoceSenatoLista[] = [];
  for (const riga of righe) {
    const uri = testo(riga, "d");
    const titolo = testo(riga, "titolo");
    const num = testo(riga, "num");
    const stato = testo(riga, "stato");
    const data = testo(riga, "data");
    const ramo = testo(riga, "ramo");
    const idddl = testo(riga, "idddl");
    // Solo righe complete osservate: uri http + titolo + numero compatto.
    if (!uri.startsWith("http") || !titolo || !num) continue;
    voci.push({ uri, titolo, num, stato, data, ramo, idddl });
    if (voci.length >= SENATO_MAX) break;
  }
  if (voci.length === 0) throw new Error("senato: lista DDL vuota");

  // Dettagli `SELECT ?p ?o` a batch da 5, mai oltre 1 retry, pausa 150ms.
  const dettagli = new Map<string, Map<string, string[]>>();
  for (let i = 0; i < voci.length; i += BATCH) {
    const blocco = voci.slice(i, i + BATCH);
    const risultati = await Promise.all(
      blocco.map(async (voce): Promise<Map<string, string[]> | null> => {
        try {
          const righeDettaglio = await sparqlSelect(
            SENATO_SPARQL,
            querySenatoDettaglio(voce.uri),
            `senato/dettaglio ${voce.uri}`,
          );
          const mappa = new Map<string, string[]>();
          for (const riga of righeDettaglio) {
            const p = testo(riga, "p");
            const o = testo(riga, "o");
            if (!p || !o) continue;
            const lista = mappa.get(p) ?? [];
            lista.push(o);
            mappa.set(p, lista);
          }
          return mappa;
        } catch {
          return null;
        }
      }),
    );
    blocco.forEach((voce, indice) => {
      const mappa = risultati[indice];
      if (mappa) dettagli.set(voce.uri, mappa);
    });
    if (i + BATCH < voci.length) await dormi(PAUSA_BATCH_MS);
  }

  const primo = (mappa: Map<string, string[]> | undefined, predicato: string): string => {
    const valori = mappa?.get(`${OSR}${predicato}`);
    const valore = valori?.[0]?.trim() ?? "";
    return valore;
  };

  const ddl: DdlSenato[] = [];
  for (const voce of voci) {
    const mappa = dettagli.get(voce.uri);
    const record: Record<string, string | number> = {
      uri: voce.uri,
      idDdl: voce.idddl,
      titolo: voce.titolo,
      numeroFaseCompatto: voce.num,
      ramo: voce.ramo,
      statoDdl_raw: voce.stato,
      dataPresentazione: voce.data,
      legislatura: LEGISLATURA_SENATO,
    };
    // Arricchimenti SOLO se osservati nel dettaglio `?p ?o` reale.
    if (mappa) {
      const idFase = primo(mappa, "idFase");
      if (idFase) record.idFase = idFase;
      const numeroFase = primo(mappa, "numeroFase");
      if (numeroFase) record.numeroFase = numeroFase;
      const fase = primo(mappa, "fase");
      if (fase) record.fase = fase;
      const dataStato = primo(mappa, "dataStatoDdl");
      if (dataStato) record.dataStatoDdl = dataStato;
      const descr = primo(mappa, "descrIniziativa");
      if (descr) record.descrIniziativa = descr;
      const nir = primo(mappa, "testoPresentato");
      if (nir.startsWith("urn:nir:")) record.testoNIR = nir;
    }
    ddl.push(record as unknown as DdlSenato);
  }
  return ddl;
}

/* ------------------------------------------------------------- camera */

async function caricaCamera(): Promise<AttoCamera[]> {
  const perUri = new Map<string, { tipo: string; numero: string }>();
  for (let offset = 0; offset < CAMERA_MAX; offset += CAMERA_PAGINA) {
    const righe = await sparqlSelect(
      CAMERA_SPARQL,
      queryCameraLista(CAMERA_PAGINA, offset),
      `camera/lista-atti offset=${offset}`,
    );
    if (righe.length === 0) break;
    for (const riga of righe) {
      const uri = testo(riga, "a");
      const tipo = testo(riga, "tipo");
      const numero = testo(riga, "numero");
      if (!uri.startsWith("http") || !slugCameraDaUri(uri) || !tipo || !numero) continue;
      if (!perUri.has(uri)) perUri.set(uri, { tipo, numero });
      if (perUri.size >= CAMERA_MAX) break;
    }
    if (perUri.size >= CAMERA_MAX) break;
    if (righe.length < CAMERA_PAGINA) break;
  }
  const uris = [...perUri.keys()];
  if (uris.length === 0) throw new Error("camera: lista atti vuota");

  const dettagli = new Map<string, { titolo: string; label: string; scheda: string }>();
  for (let i = 0; i < uris.length; i += BATCH) {
    const blocco = uris.slice(i, i + BATCH);
    const risultati = await Promise.all(
      blocco.map(async (uri): Promise<{ titolo: string; label: string; scheda: string } | null> => {
        try {
          const righeDettaglio = await sparqlSelect(
            CAMERA_SPARQL,
            queryCameraDettaglio(uri),
            `camera/dettaglio ${uri}`,
          );
          let titolo = "";
          let label = "";
          let scheda = "";
          for (const riga of righeDettaglio) {
            const p = testo(riga, "p");
            const o = testo(riga, "o");
            if (!p || !o) continue;
            if (p === "http://purl.org/dc/elements/1.1/title" && !titolo) titolo = o;
            else if (p === "http://www.w3.org/2000/01/rdf-schema#label" && !label) label = o;
            else if (
              p === "http://purl.org/dc/terms/isReferencedBy" &&
              !scheda &&
              o.startsWith("http")
            ) {
              scheda = o;
            }
          }
          return { titolo, label, scheda };
        } catch {
          return null;
        }
      }),
    );
    blocco.forEach((uri, indice) => {
      const dettaglio = risultati[indice];
      if (dettaglio) dettagli.set(uri, dettaglio);
    });
    if (i + BATCH < uris.length) await dormi(PAUSA_BATCH_MS);
  }

  const atti: AttoCamera[] = [];
  for (const uri of uris) {
    const base = perUri.get(uri);
    if (!base) continue;
    const dettaglio = dettagli.get(uri);
    const record: Record<string, string> = {
      uri,
      slug: slugCameraDaUri(uri),
      tipo: base.tipo,
      numero: base.numero,
    };
    if (dettaglio?.titolo) record.titolo = dettaglio.titolo;
    if (dettaglio?.label) record.label = dettaglio.label;
    if (dettaglio?.scheda) record.scheda = dettaglio.scheda;
    atti.push(record as unknown as AttoCamera);
  }
  if (atti.length === 0) throw new Error("camera: nessun atto ricostruito");
  return atti;
}

/* ------------------------------------------------------------- main */

async function main(): Promise<void> {
  // REALI-9 W3: modalita' full Camera, senza toccare il flusso esistente
  // (Senato + sample Camera 200) che resta invariato qui sotto.
  if (process.argv.includes("--camera-full")) {
    await mainCameraFull();
    return;
  }
  const recuperatoIl = new Date().toISOString();
  console.log(`[ingest-ddl] Senato: ${SENATO_SPARQL} (max ${SENATO_MAX})`);
  console.log(`[ingest-ddl] Camera: ${CAMERA_SPARQL} (max ${CAMERA_MAX})`);

  // Entrambe le sorgenti vengono completate in memoria PRIMA di scrivere:
  // su errore nessun file viene toccato (mai parziali), exit 1.
  const [esitoSenato, esitoCamera] = await Promise.allSettled([caricaSenato(), caricaCamera()]);

  if (esitoSenato.status === "rejected") {
    esci(
      `senato fallito: ${esitoSenato.reason instanceof Error ? esitoSenato.reason.message : String(esitoSenato.reason)} (nessun file scritto)`,
    );
  }
  if (esitoCamera.status === "rejected") {
    esci(
      `camera fallita: ${esitoCamera.reason instanceof Error ? esitoCamera.reason.message : String(esitoCamera.reason)} (nessun file scritto)`,
    );
  }
  if (esitoSenato.status !== "fulfilled" || esitoCamera.status !== "fulfilled") {
    esci("sorgenti incomplete (nessun file scritto)");
  }

  const ddl = esitoSenato.value;
  const atti = esitoCamera.value;

  const envelopeSenato = {
    provenance: {
      fonte: "senato",
      url: SENATO_SPARQL,
      sparql: QUERY_SENATO_LISTA,
      recuperatoIl,
      licenza: SENATO_LICENZA,
    },
    legislatura: LEGISLATURA_SENATO,
    ddl,
  };
  const envelopeCamera = {
    provenance: {
      fonte: "camera",
      url: CAMERA_SPARQL,
      sparql: QUERY_CAMERA_LISTA_BASE,
      recuperatoIl,
      licenza: CAMERA_LICENZA,
    },
    legislatura: LEGISLATURA_CAMERA,
    atti,
  };

  const jsonSenato = `${JSON.stringify(envelopeSenato, null, 2)}\n`;
  const jsonCamera = `${JSON.stringify(envelopeCamera, null, 2)}\n`;
  if (Buffer.byteLength(jsonSenato, "utf8") > MAX_BYTE) esci("parlamento-ddl.json oltre 1MB");
  if (Buffer.byteLength(jsonCamera, "utf8") > MAX_BYTE) esci("camera-atti.json oltre 1MB");

  await mkdir(DIR_REALI, { recursive: true });
  await writeFile(FILE_SENATO, jsonSenato, "utf8");
  await writeFile(FILE_CAMERA, jsonCamera, "utf8");
  console.log(`[ingest-ddl] DDL Senato leg.19: ${ddl.length} record -> ${FILE_SENATO}`);
  console.log(`[ingest-ddl] Atti Camera leg.19: ${atti.length} record -> ${FILE_CAMERA}`);
}

/* L'invocazione di `main()` e' in fondo al file: le costanti `const` dei
 * blocchi successivi (es. camera-full) devono essere inizializzate prima. */

/* ---------------------------------------------------------------------------
 * REALI-9 W3: ingest full Camera (legislatura 19) in 3 shard.
 *
 * Uso: `bunx tsx scripts/ingest-reale-ddl.ts --camera-full`
 *
 * Solo dati osservati, mai inventati:
 *  - conteggio atteso letto dal vivo (`COUNT DISTINCT ?a`, osservato 3144 il
 *    2026-09-28: 6288 righe doppie, ogni URI x2). Se il conteggio dal vivo
 *    non coincide con le righe distinte scaricate -> exit 1, nessun file.
 *  - lista `SELECT DISTINCT ?a ?tipo ?numero ... ORDER BY ?a` paginata
 *    LIMIT 500 (stabile; `?numero` e' lessicografico e NON si usa per
 *    ordinare), poi dettagli `SELECT ?p ?o` a batch da 5 con gli stessi
 *    bound del flusso esistente (timeout 8s, 1 retry, pausa 150ms,
 *    stop su 403/409).
 *  - record con la stessa forma del flusso esistente
 *    `{uri,slug,tipo,numero,titolo?,label?,scheda?}`: titolo da
 *    `dc:title` osservato, label da `rdfs:label`, scheda solo da
 *    `dcterms:isReferencedBy` osservato. Niente ELI/stati/codici.
 *  - gli URI reali includono varianti non numeriche osservate
 *    (`ac19_1038-B`, `ac19_643-bis`, `ac19_384-B` per numero
 *    `384-446-459-B` ...): lo slug ammette il charset osservato
 *    `[A-Za-z0-9-]` dopo `ac19_`, MAI ricostruito.
 *  - partizione in 3 shard disgiunti, contigui per `numero` crescente e
 *    bilanciati in terzi quasi uguali (3144 atti -> 1048/1048/1048, ognuno
 *    <=1100 atti e <=950KB): `numero` e' 1:1 con l'URI (3144 numeri
 *    distinti su 3144 URI distinti, osservato dal vivo); i confini rigidi
 *    1-1100/1101-2200/2201+ non sono usabili perche' i numeri puri 1..1100
 *    esistono tutti (1100 atti) piu' le varianti con intero iniziale nel
 *    range (osservato 1115 atti), oltre il cap di accettazione.
 *  - ogni shard <=950KB verificato PRIMA di scrivere; exit 1 senza parziali
 *    su errore/cap/mismatch (nessun file toccato finche' tutto non e'
 *    completo in memoria). Dedup per URI intra e cross-shard.
 * ------------------------------------------------------------------------- */

const CAMERA_FULL_PAGINA = 500;
const CAMERA_FULL_SHARD_CAP = 972_800; // 950KB
const CAMERA_FULL_FONTE = "Camera SPARQL";

const FILE_CAMERA_FULL_A = fileURLToPath(
  new URL("../data/reali/camera-atti-leg19-a.json", import.meta.url),
);
const FILE_CAMERA_FULL_B = fileURLToPath(
  new URL("../data/reali/camera-atti-leg19-b.json", import.meta.url),
);
const FILE_CAMERA_FULL_C = fileURLToPath(
  new URL("../data/reali/camera-atti-leg19-c.json", import.meta.url),
);

const QUERY_CAMERA_FULL_COUNT =
  `SELECT (COUNT(DISTINCT ?a) AS ?c) WHERE { ` +
  `?a a <http://dati.camera.it/ocd/atto> ; ` +
  `<http://dati.camera.it/ocd/rif_leg> <${LEGISLATURA_CAMERA_URI}> }`;

const QUERY_CAMERA_FULL_LISTA_BASE =
  "SELECT DISTINCT ?a ?tipo ?numero WHERE { ?a a " +
  "<http://dati.camera.it/ocd/atto> ; " +
  `<http://dati.camera.it/ocd/rif_leg> <${LEGISLATURA_CAMERA_URI}> ; ` +
  "<http://purl.org/dc/elements/1.1/type> ?tipo ; " +
  "<http://purl.org/dc/elements/1.1/identifier> ?numero } ORDER BY ?a";

function queryCameraFullLista(limite: number, offset: number): string {
  return [
    "SELECT DISTINCT ?a ?tipo ?numero WHERE {",
    `  ?a a <http://dati.camera.it/ocd/atto> ;`,
    `     <http://dati.camera.it/ocd/rif_leg> <${LEGISLATURA_CAMERA_URI}> ;`,
    "     <http://purl.org/dc/elements/1.1/type> ?tipo ;",
    "     <http://purl.org/dc/elements/1.1/identifier> ?numero .",
    "} ORDER BY ?a",
    `LIMIT ${limite} OFFSET ${offset}`,
  ].join(" ");
}

/**
 * Slug dallo URI reale, charset osservato `ac19_` + `[A-Za-z0-9-]`
 * (copre `ac19_151` e le varianti reali `ac19_1038-B`, `ac19_643-bis`,
 * `ac19_384-B`). Stringa vuota se lo URI non corrisponde: la riga viene
 * scartata e il mismatch con il conteggio dal vivo fa fallire l'ingest.
 */
function slugCameraFullDaUri(uri: string): string {
  const match = /\/attocamera\.rdf\/(ac19_[A-Za-z0-9-]+)\s*$/.exec(uri);
  return match?.[1] ?? "";
}

/**
 * Chiave di ordinamento per `numero` osservato: intero iniziale crescente,
 * poi stringa completa, poi URI (deterministico). Le varianti reali
 * (`643-bis`, `384-446-459-B` ...) si ordinano per intero iniziale.
 */
function chiaveNumeroCamera(numero: string, uri: string): [number, string, string] {
  const match = /^\s*(\d+)/.exec(numero);
  const n = match ? Number.parseInt(match[1] ?? "", 10) : Number.MAX_SAFE_INTEGER;
  return [Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER, numero, uri];
}

/** Cap atti per shard (accettazione: nessuno shard oltre 1100 atti). */
const CAMERA_FULL_SHARD_MAX_ATTI = 1100;

async function mainCameraFull(): Promise<void> {
  const recuperatoIl = new Date().toISOString();
  console.log(`[ingest-ddl:camera-full] Camera: ${CAMERA_SPARQL} (tutti gli atti leg.19)`);

  // 1) Conteggio atteso dal vivo, MAI pre-riempito.
  const righeConteggio = await sparqlSelect(
    CAMERA_SPARQL,
    QUERY_CAMERA_FULL_COUNT,
    "camera-full/conteggio",
  );
  const attesi = Number.parseInt(testo(righeConteggio[0] ?? {}, "c"), 10);
  if (!Number.isFinite(attesi) || attesi <= 0) {
    esci("camera-full: conteggio dal vivo assente o nullo (nessun file scritto)");
  }
  console.log(`[ingest-ddl:camera-full] attesi dal vivo (DISTINCT ?a): ${attesi}`);

  // 2) Lista paginata DISTINCT, stabile su ORDER BY ?a, dedup per URI.
  const perUri = new Map<string, { tipo: string; numero: string }>();
  for (let offset = 0; ; offset += CAMERA_FULL_PAGINA) {
    if (offset > attesi + CAMERA_FULL_PAGINA * 2) {
      esci("camera-full: paginazione oltre l'atteso (nessun file scritto)");
    }
    const righe = await sparqlSelect(
      CAMERA_SPARQL,
      queryCameraFullLista(CAMERA_FULL_PAGINA, offset),
      `camera-full/lista offset=${offset}`,
    );
    if (righe.length === 0) break;
    for (const riga of righe) {
      const uri = testo(riga, "a");
      const tipo = testo(riga, "tipo");
      const numero = testo(riga, "numero");
      if (!uri.startsWith("http") || !slugCameraFullDaUri(uri) || !tipo || !numero) continue;
      if (!perUri.has(uri)) perUri.set(uri, { tipo, numero });
    }
    if (righe.length < CAMERA_FULL_PAGINA) break;
  }
  if (perUri.size !== attesi) {
    esci(
      `camera-full: distinti scaricati ${perUri.size} != attesi ${attesi} (nessun file scritto)`,
    );
  }
  const uris = [...perUri.keys()];

  // 3) Dettagli `SELECT ?p ?o` a batch da 5 (stessi bound del flusso base).
  const dettagli = new Map<string, { titolo: string; label: string; scheda: string }>();
  for (let i = 0; i < uris.length; i += BATCH) {
    const blocco = uris.slice(i, i + BATCH);
    const risultati = await Promise.all(
      blocco.map(async (uri): Promise<{ titolo: string; label: string; scheda: string } | null> => {
        try {
          const righeDettaglio = await sparqlSelect(
            CAMERA_SPARQL,
            queryCameraDettaglio(uri),
            `camera-full/dettaglio ${uri}`,
          );
          let titolo = "";
          let label = "";
          let scheda = "";
          for (const riga of righeDettaglio) {
            const p = testo(riga, "p");
            const o = testo(riga, "o");
            if (!p || !o) continue;
            if (p === "http://purl.org/dc/elements/1.1/title" && !titolo) titolo = o;
            else if (p === "http://www.w3.org/2000/01/rdf-schema#label" && !label) label = o;
            else if (
              p === "http://purl.org/dc/terms/isReferencedBy" &&
              !scheda &&
              o.startsWith("http")
            ) {
              scheda = o;
            }
          }
          return { titolo, label, scheda };
        } catch {
          return null;
        }
      }),
    );
    blocco.forEach((uri, indice) => {
      const dettaglio = risultati[indice];
      if (dettaglio) dettagli.set(uri, dettaglio);
    });
    if (i + BATCH < uris.length) await dormi(PAUSA_BATCH_MS);
    if ((i + BATCH) % 500 === 0 || i + BATCH >= uris.length) {
      console.log(
        `[ingest-ddl:camera-full] dettagli ${Math.min(i + BATCH, uris.length)}/${uris.length}`,
      );
    }
  }

  // 4) Record (stessa forma del flusso base) + partizione in 3 shard
  // disgiunti, contigui per `numero` crescente e bilanciati (terzi quasi
  // uguali: con 3144 atti -> 1048/1048/1048, ognuno <=1100 atti). I range
  // 1-1100/1101-2200/2201+ non sono usabili come confini rigidi: i numeri
  // puri 1..1100 esistono tutti (1100 atti) piu' le varianti con intero
  // iniziale nel range (osservato: 1115 atti), oltre il cap di accettazione.
  const ordinati: AttoCamera[] = [];
  const vistiShard = new Set<string>();
  let senzaTitolo = 0;
  const righeOrdinate = uris
    .map((uri) => {
      const base = perUri.get(uri);
      if (!base) esci(`camera-full: base mancante per ${uri} (nessun file scritto)`);
      return {
        uri,
        tipo: (base as { tipo: string }).tipo,
        numero: (base as { numero: string }).numero,
      };
    })
    .sort((x, y) => {
      const kx = chiaveNumeroCamera(x.numero, x.uri);
      const ky = chiaveNumeroCamera(y.numero, y.uri);
      if (kx[0] !== ky[0]) return kx[0] - ky[0];
      if (kx[1] !== ky[1]) return kx[1] < ky[1] ? -1 : 1;
      return kx[2] < ky[2] ? -1 : kx[2] > ky[2] ? 1 : 0;
    });
  for (const { uri, tipo, numero } of righeOrdinate) {
    if (vistiShard.has(uri)) {
      esci(`camera-full: URI duplicato tra shard ${uri} (nessun file scritto)`);
    }
    vistiShard.add(uri);
    const dettaglio = dettagli.get(uri);
    const record: Record<string, string> = {
      uri,
      slug: slugCameraFullDaUri(uri),
      tipo,
      numero,
    };
    if (dettaglio?.titolo) record.titolo = dettaglio.titolo;
    if (dettaglio?.label) record.label = dettaglio.label;
    if (dettaglio?.scheda) record.scheda = dettaglio.scheda;
    if (!dettaglio?.titolo && !dettaglio?.label) senzaTitolo += 1;
    ordinati.push(record as unknown as AttoCamera);
  }
  if (ordinati.length !== attesi) {
    esci("camera-full: somma shard diversa dall'atteso (nessun file scritto)");
  }
  const terzo = Math.ceil(ordinati.length / 3);
  const shardA = ordinati.slice(0, terzo);
  const shardB = ordinati.slice(terzo, terzo * 2);
  const shardC = ordinati.slice(terzo * 2);
  for (const [nome, shard] of [
    ["a", shardA],
    ["b", shardB],
    ["c", shardC],
  ] as const) {
    if (shard.length === 0) esci(`camera-full: shard-${nome} vuoto (nessun file scritto)`);
    if (shard.length > CAMERA_FULL_SHARD_MAX_ATTI) {
      esci(`camera-full: shard-${nome} oltre 1100 atti (${shard.length}) (nessun file scritto)`);
    }
  }

  // 5) Envelope + verifica byte PRIMA di scrivere (exit 1, mai parziali).
  const envelope = (atti: AttoCamera[]) => ({
    provenance: {
      fonte: CAMERA_FULL_FONTE,
      url: CAMERA_SPARQL,
      sparql: QUERY_CAMERA_FULL_LISTA_BASE,
      recuperatoIl,
      licenza: CAMERA_LICENZA,
    },
    legislatura: LEGISLATURA_CAMERA,
    atti,
  });
  const jsonA = `${JSON.stringify(envelope(shardA), null, 2)}\n`;
  const jsonB = `${JSON.stringify(envelope(shardB), null, 2)}\n`;
  const jsonC = `${JSON.stringify(envelope(shardC), null, 2)}\n`;
  const byteA = Buffer.byteLength(jsonA, "utf8");
  const byteB = Buffer.byteLength(jsonB, "utf8");
  const byteC = Buffer.byteLength(jsonC, "utf8");
  if (byteA > CAMERA_FULL_SHARD_CAP) esci(`camera-full: shard-a oltre 950KB (${byteA}B)`);
  if (byteB > CAMERA_FULL_SHARD_CAP) esci(`camera-full: shard-b oltre 950KB (${byteB}B)`);
  if (byteC > CAMERA_FULL_SHARD_CAP) esci(`camera-full: shard-c oltre 950KB (${byteC}B)`);

  await mkdir(DIR_REALI, { recursive: true });
  await writeFile(FILE_CAMERA_FULL_A, jsonA, "utf8");
  await writeFile(FILE_CAMERA_FULL_B, jsonB, "utf8");
  await writeFile(FILE_CAMERA_FULL_C, jsonC, "utf8");
  console.log(
    `[ingest-ddl:camera-full] shard-a: ${shardA.length} atti (${byteA}B) -> ${FILE_CAMERA_FULL_A}`,
  );
  console.log(
    `[ingest-ddl:camera-full] shard-b: ${shardB.length} atti (${byteB}B) -> ${FILE_CAMERA_FULL_B}`,
  );
  console.log(
    `[ingest-ddl:camera-full] shard-c: ${shardC.length} atti (${byteC}B) -> ${FILE_CAMERA_FULL_C}`,
  );
  console.log(
    `[ingest-ddl:camera-full] totale ${shardA.length + shardB.length + shardC.length}/${attesi}` +
      ` (senza titolo/label osservati: ${senzaTitolo}, conservati comunque)`,
  );
}

main().catch((cause: unknown) => {
  esci(cause instanceof Error ? cause.message : String(cause));
});
