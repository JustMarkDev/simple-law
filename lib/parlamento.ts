/**
 * Deputati della Camera, legislatura 19 - dati reali da `dati.camera.it`.
 *
 * Il modulo e' diviso in due livelli:
 *  - **mapping puri**: funzioni deterministiche che estraggono
 *    `{slug, nome, gruppo, urlScheda}` dalle risposte SPARQL. Non toccano la
 *    rete e non lanciano mai eccezioni: in caso di forma inattesa restituiscono
 *    stringhe vuote o liste vuote.
 *  - **fetch never-throw**: interrogazioni all'endpoint SPARQL con timeout
 *    (8s). Gli errori sono restituiti come `Esito.errore`, mai lanciati.
 *
 * Regole dati reali (vedi verdetto giudice):
 *  - `slug` deriva solo dall'URI osservato (`.../deputato.rdf/d{ID}_19`);
 *  - `urlScheda` solo da `dcterms:isReferencedBy` osservato, mai costruito;
 *  - `gruppo` solo dall'etichetta di adesione osservata (pulita dal suffisso
 *    con le date, che non e' parte del nome);
 *  - `collegio` OMESSO: assente nelle risposte osservate della sonda;
 *  - righe senza `slug` o senza `nome` vengono scartate.
 */

export const CAMERA_SPARQL_ENDPOINT = "https://dati.camera.it/sparql";
export const CAMERA_FONTE = "dati.camera.it";
export const CAMERA_LICENZA = "CC BY-SA 4.0";
export const CAMERA_LEGISLATURA = "19";
export const CAMERA_LEGISLATURA_URI =
  "http://dati.camera.it/ocd/legislatura.rdf/repubblica_19";
export const CAMERA_DEPUTATO_TIPO = "http://dati.camera.it/ocd/deputato";

const PRED_RIF_LEG = "http://dati.camera.it/ocd/rif_leg";
const PRED_NOME = "http://xmlns.com/foaf/0.1/firstName";
const PRED_COGNOME = "http://xmlns.com/foaf/0.1/surname";
const PRED_ADERISCE = "http://dati.camera.it/ocd/aderisce";
const PRED_ETICHETTA = "http://www.w3.org/2000/01/rdf-schema#label";
const PRED_INIZIO = "http://dati.camera.it/ocd/startDate";
const PRED_SCHEDA = "http://purl.org/dc/terms/isReferencedBy";

const TIMEOUT_MS_DEFAULT = 8000;

/** Esito never-throw: il valore oppure la descrizione italiana dell'errore. */
export type Esito<T> = { ok: true; valore: T } | { ok: false; errore: string };

/** Sottoinsieme di `fetch` necessario al client (iniettabile per i test). */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface OpzioniFetch {
  readonly fetchImpl?: FetchLike;
  readonly timeoutMs?: number;
}

/** Deputato con i soli campi osservati nelle risposte reali. */
export interface Deputato {
  readonly slug: string;
  readonly nome: string;
  readonly gruppo?: string;
  readonly urlScheda?: string;
}

/** Gruppo parlamentare (solo URI ed etichetta osservati). */
export interface GruppoCamera {
  readonly uri: string;
  readonly label: string;
}

/** Adesione di un deputato a un gruppo (etichetta + inizio osservati). */
export interface Adesione {
  readonly uriDeputato: string;
  readonly etichetta: string;
  readonly inizio: string;
}

/** Provenance obbligatoria per l'envelope dei dati reali. */
export interface ProvenanceCamera {
  readonly fonte: string;
  readonly url: string;
  readonly recuperatoIl: string;
  readonly licenza: string;
}

export interface EnvelopeDeputati {
  readonly provenance: ProvenanceCamera;
  readonly legislatura: string;
  readonly deputati: Deputato[];
}

/* ---------------------------------------------------------------------------
 * Utility pure.
 * ------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function testo(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Legge `?var` da un binding SPARQL (`{var: {value: ...}}`); `""` se assente. */
export function valoreBinding(binding: unknown, variabile: string): string {
  if (!isRecord(binding)) return "";
  const cella = binding[variabile];
  if (!isRecord(cella)) return "";
  return testo(cella.value);
}

/**
 * `slug` dall'URI osservato (`.../deputato.rdf/d{ID}_19` -> `d{ID}_19`).
 * Restituisce `""` per URI di altra natura (atti, organi, ...).
 */
export function slugDaUriDeputato(uri: string): string {
  const match = /\/deputato\.rdf\/(d\d+_19)\s*$/.exec(testo(uri));
  return match?.[1] ?? "";
}

/** Nome completo `NOME COGNOME` in maiuscolo come da dati (es. `DAVIDE AIELLO`). */
export function nomeIntero(nome: string, cognome: string): string {
  return `${testo(nome)} ${testo(cognome)}`.trim().replace(/\s+/g, " ");
}

/**
 * Pulisce l'etichetta di adesione dal suffisso con le date
 * (`MISTO (18.10.2022-27.10.2022)` -> `MISTO`). Le date non fanno parte del
 * nome del gruppo; le parentesi interne (es. `NOI MODERATI (...)`) restano.
 */
export function pulisciEtichettaGruppo(etichetta: string): string {
  const pulita = testo(etichetta).replace(
    /\s*\([^()]*\d{2}\.\d{2}\.\d{4}[^()]*\)?\s*$/,
    "",
  );
  return pulita.replace(/\s+/g, " ").trim();
}

/** Estrae l'array `results.bindings` da una risposta SPARQL; `[]` se inatteso. */
export function righeDaSparql(risposta: unknown): Record<string, unknown>[] {
  if (!isRecord(risposta)) return [];
  const results = risposta.results;
  if (!isRecord(results)) return [];
  const bindings = results.bindings;
  if (!Array.isArray(bindings)) return [];
  return bindings.filter((riga): riga is Record<string, unknown> => isRecord(riga));
}

/**
 * Deputati dalla lista (`SELECT ?d ?nome ?cognome ?scheda`).
 * Scarta le righe senza `slug` o senza `nome`.
 */
export function deputatiDaRigheLista(righe: readonly Record<string, unknown>[]): Deputato[] {
  const risultato: Deputato[] = [];
  const visti = new Set<string>();
  for (const riga of righe) {
    const uri = valoreBinding(riga, "d");
    const slug = slugDaUriDeputato(uri);
    const nome = nomeIntero(valoreBinding(riga, "nome"), valoreBinding(riga, "cognome"));
    if (!slug || !nome || visti.has(slug)) continue;
    visti.add(slug);
    const scheda = testo(valoreBinding(riga, "scheda"));
    risultato.push(
      scheda ? { slug, nome, urlScheda: scheda } : { slug, nome },
    );
  }
  return risultato;
}

/** Adesioni (`SELECT ?d ?glabel ?inizio`); salta le righe senza URI o etichetta. */
export function adesioniDaRighe(righe: readonly Record<string, unknown>[]): Adesione[] {
  const risultato: Adesione[] = [];
  for (const riga of righe) {
    const uriDeputato = valoreBinding(riga, "d");
    const etichetta = valoreBinding(riga, "glabel");
    if (!uriDeputato || !slugDaUriDeputato(uriDeputato) || !etichetta) continue;
    risultato.push({
      uriDeputato,
      etichetta,
      inizio: testo(valoreBinding(riga, "inizio")),
    });
  }
  return risultato;
}

/**
 * Gruppo corrente per deputato: a parita' di deputato vince l'adesione con
 * `inizio` maggiore (formato `YYYYMMDD`, confrontabile come stringa); le
 * etichette vengono pulite dalle date. Restituisce `slug -> gruppo`.
 */
export function gruppoCorrentePerDeputato(
  adesioni: readonly Adesione[],
): Map<string, string> {
  const migliori = new Map<string, Adesione>();
  for (const adesione of adesioni) {
    const slug = slugDaUriDeputato(adesione.uriDeputato);
    if (!slug) continue;
    const prev = migliori.get(slug);
    if (!prev || adesione.inizio >= prev.inizio) migliori.set(slug, adesione);
  }
  const risultato = new Map<string, string>();
  for (const [slug, adesione] of migliori) {
    const gruppo = pulisciEtichettaGruppo(adesione.etichetta);
    if (gruppo) risultato.set(slug, gruppo);
  }
  return risultato;
}

/** Gruppi distinti (`SELECT ?g ?label`); salta le righe senza URI o etichetta. */
export function gruppiDaRighe(righe: readonly Record<string, unknown>[]): GruppoCamera[] {
  const risultato: GruppoCamera[] = [];
  const visti = new Set<string>();
  for (const riga of righe) {
    const uri = valoreBinding(riga, "g");
    const label = testo(valoreBinding(riga, "label"));
    if (!uri || !label || visti.has(uri)) continue;
    visti.add(uri);
    risultato.push({ uri, label });
  }
  return risultato;
}

interface RigheSPO {
  readonly s: string;
  readonly p: string;
  readonly o: string;
}

function righeSPODaBinding(righe: readonly Record<string, unknown>[]): RigheSPO[] {
  const risultato: RigheSPO[] = [];
  for (const riga of righe) {
    const s = valoreBinding(riga, "s");
    const p = valoreBinding(riga, "p");
    const o = valoreBinding(riga, "o");
    if (s && p && o) risultato.push({ s, p, o });
  }
  return risultato;
}

/**
 * Dettaglio da righe `s/p/o` (DESCRIBE in `sparql-results+json` oppure
 * `SELECT ?p ?o` con `s` = URI del deputato): considera solo le triple
 * uscenti dal deputato (`s == uri`) ed estrae nome e scheda osservati.
 */
export function dettaglioDaRigheSPO(
  uri: string,
  righe: readonly Record<string, unknown>[],
): { nome: string; urlScheda: string } {
  let nome = "";
  let cognome = "";
  let urlScheda = "";
  for (const riga of righeSPODaBinding(righe)) {
    if (riga.s !== uri) continue;
    if (riga.p === PRED_NOME && !nome) nome = riga.o;
    else if (riga.p === PRED_COGNOME && !cognome) cognome = riga.o;
    else if (riga.p === PRED_SCHEDA && !urlScheda) urlScheda = riga.o;
  }
  return { nome: nomeIntero(nome, cognome), urlScheda };
}

interface VoceRdfJson {
  readonly tipo: string;
  readonly valore: string;
}

/** Legge una voce RDF/JSON (`{type, value}`); `null` se non valida. */
function voceRdfJson(voce: unknown): VoceRdfJson | null {
  if (!isRecord(voce)) return null;
  const tipo = testo(voce.type);
  const valore = testo(voce.value);
  if (!tipo || !valore) return null;
  return { tipo, valore };
}

/**
 * Dettaglio dalla forma RDF/JSON di DESCRIBE (come la sonda
 * `dep-dettaglio2.json`: soggetto -> predicato -> `[{type, value}]`).
 * Considera solo il soggetto del deputato; la scheda solo da
 * `dcterms:isReferencedBy`.
 */
export function dettaglioDaRdfJson(uri: string, documento: unknown): {
  nome: string;
  urlScheda: string;
} {
  if (!isRecord(documento)) return { nome: "", urlScheda: "" };
  const soggetto = documento[uri];
  if (!isRecord(soggetto)) return { nome: "", urlScheda: "" };
  let nome = "";
  let cognome = "";
  let urlScheda = "";
  for (const [predicato, voci] of Object.entries(soggetto)) {
    if (!Array.isArray(voci)) continue;
    for (const voce of voci) {
      const parsed = voceRdfJson(voce);
      if (!parsed) continue;
      if (predicato === PRED_NOME && !nome) nome = parsed.valore;
      else if (predicato === PRED_COGNOME && !cognome) cognome = parsed.valore;
      else if (predicato === PRED_SCHEDA && !urlScheda) urlScheda = parsed.valore;
    }
  }
  return { nome: nomeIntero(nome, cognome), urlScheda };
}

/**
 * Unisce lista e gruppi correnti: il gruppo viene aggiunto solo se osservato
 * nelle adesioni; la scheda solo se osservata nella lista.
 */
export function unisciDeputati(
  lista: readonly Deputato[],
  gruppi: ReadonlyMap<string, string>,
): Deputato[] {
  return lista.map((dep) => {
    const gruppo = gruppi.get(dep.slug);
    if (gruppo && !dep.gruppo) return { ...dep, gruppo };
    return { ...dep };
  });
}

/** Envelope con provenance completa (obbligatoria per `dimostrativo=false`). */
export function envelopeCameraDeputati(
  deputati: readonly Deputato[],
  recuperatoIl: string,
): EnvelopeDeputati {
  return {
    provenance: {
      fonte: CAMERA_FONTE,
      url: CAMERA_SPARQL_ENDPOINT,
      recuperatoIl,
      licenza: CAMERA_LICENZA,
    },
    legislatura: CAMERA_LEGISLATURA,
    deputati: [...deputati],
  };
}

/* ---------------------------------------------------------------------------
 * Query SPARQL (endpoint del verdetto).
 * ------------------------------------------------------------------------- */

/** Lista dei deputati leg. 19 con nome, cognome e scheda osservati. */
export function queryListaDeputati(): string {
  return (
    `SELECT DISTINCT ?d ?nome ?cognome ?scheda WHERE { ` +
    `?d a <${CAMERA_DEPUTATO_TIPO}> ; ` +
    `<${PRED_RIF_LEG}> <${CAMERA_LEGISLATURA_URI}> ; ` +
    `<${PRED_NOME}> ?nome ; ` +
    `<${PRED_COGNOME}> ?cognome . ` +
    `OPTIONAL { ?d <${PRED_SCHEDA}> ?scheda } } ` +
    `ORDER BY ?cognome ?nome`
  );
}

/** Adesioni ai gruppi della leg. 19 con etichetta e inizio osservati. */
export function queryAdesioni(): string {
  return (
    `SELECT ?d ?glabel ?inizio WHERE { ` +
    `?d <${PRED_RIF_LEG}> <${CAMERA_LEGISLATURA_URI}> ; ` +
    `<${PRED_ADERISCE}> ?ad . ` +
    `?ad <${PRED_ETICHETTA}> ?glabel . ` +
    `OPTIONAL { ?ad <${PRED_INIZIO}> ?inizio } } ` +
    `ORDER BY ?d ?inizio`
  );
}

/** Gruppi parlamentari della leg. 19 (solo URI ed etichetta osservati). */
export function queryGruppi(): string {
  return (
    `SELECT DISTINCT ?g ?label WHERE { ` +
    `?d <${PRED_RIF_LEG}> <${CAMERA_LEGISLATURA_URI}> ; ` +
    `<${PRED_ADERISCE}> ?ad . ` +
    `?ad <http://dati.camera.it/ocd/rif_gruppoParlamentare> ?g . ` +
    `?g <${PRED_ETICHETTA}> ?label } ORDER BY ?label`
  );
}

/** Dettaglio limitato di un deputato (triple uscenti, senza il rumore dei voti). */
export function queryDettaglio(uri: string): string {
  return `SELECT ?p ?o WHERE { <${uri}> ?p ?o }`;
}

/** DESCRIBE del verdetto per il dettaglio del singolo deputato. */
export function queryDescribe(uri: string): string {
  return `DESCRIBE <${uri}>`;
}

/* ---------------------------------------------------------------------------
 * Fetch never-throw.
 * ------------------------------------------------------------------------- */

function erroreDa(cause: unknown): string {
  if (cause instanceof Error) {
    if (cause.name === "AbortError") return "Timeout della richiesta SPARQL";
    return cause.message || "Errore di rete sconosciuto";
  }
  return String(cause ?? "Errore di rete sconosciuto");
}

async function fetchConTimeout(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      headers: { accept: "application/sparql-results+json, application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Interroga l'endpoint SPARQL; non lancia mai, restituisce `Esito`. */
export async function sparqlCamera(
  query: string,
  opzioni: OpzioniFetch = {},
): Promise<Esito<unknown>> {
  if (!query.trim()) return { ok: false, errore: "Query SPARQL vuota" };
  const fetchImpl =
    opzioni.fetchImpl ??
    ((globalThis.fetch as unknown as FetchLike | undefined) as FetchLike);
  if (!fetchImpl) return { ok: false, errore: "fetch non disponibile" };
  const timeoutMs = opzioni.timeoutMs ?? TIMEOUT_MS_DEFAULT;
  const url =
    `${CAMERA_SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}` +
    `&format=application%2Fsparql-results%2Bjson`;
  try {
    const risposta = await fetchConTimeout(url, fetchImpl, timeoutMs);
    if (!risposta.ok) {
      return {
        ok: false,
        errore: `SPARQL ${CAMERA_FONTE} ha risposto ${risposta.status}`,
      };
    }
    return { ok: true, valore: await risposta.json() };
  } catch (cause) {
    return { ok: false, errore: erroreDa(cause) };
  }
}

/**
 * Esegue `fn` su ogni elemento a batch di `concorrenza` (default 5, come da
 * verdetto). Non lancia mai: gli errori del singolo elemento sono raccolti in
 * `errori` con il suo indice.
 */
export async function mappaABatch<T, R>(
  elementi: readonly T[],
  fn: (elemento: T, indice: number) => Promise<R>,
  concorrenza = 5,
): Promise<{ valori: (R | null)[]; errori: { indice: number; errore: string }[] }> {
  const valori: (R | null)[] = new Array(elementi.length).fill(null);
  const errori: { indice: number; errore: string }[] = [];
  const passo = Math.max(1, Math.floor(concorrenza));
  for (let inizio = 0; inizio < elementi.length; inizio += passo) {
    const fine = Math.min(elementi.length, inizio + passo);
    const promesse: Promise<void>[] = [];
    for (let i = inizio; i < fine; i += 1) {
      const elemento = elementi[i] as T;
      const indice = i;
      promesse.push(
        Promise.resolve()
          .then(() => fn(elemento, indice))
          .then(
          (valore) => {
            valori[indice] = valore;
          },
          (cause) => {
            errori.push({ indice, errore: erroreDa(cause) });
          },
        ),
      );
    }
    await Promise.all(promesse);
  }
  return { valori, errori };
}

/**
 * Carica i deputati reali: 1 lista + 1 query adesioni, poi unione.
 * Non lancia mai; in caso di rete fallita restituisce `ok:false`.
 */
export async function caricaDeputati(
  opzioni: OpzioniFetch = {},
): Promise<Esito<Deputato[]>> {
  const lista = await sparqlCamera(queryListaDeputati(), opzioni);
  if (!lista.ok) return lista;
  const adesioni = await sparqlCamera(queryAdesioni(), opzioni);
  if (!adesioni.ok) return adesioni;
  const deputati = deputatiDaRigheLista(righeDaSparql(lista.valore));
  if (deputati.length === 0) {
    return { ok: false, errore: "Lista deputati vuota" };
  }
  const gruppi = gruppoCorrentePerDeputato(
    adesioniDaRighe(righeDaSparql(adesioni.valore)),
  );
  return { ok: true, valore: unisciDeputati(deputati, gruppi) };
}

/**
 * Dettaglio di un singolo deputato via DESCRIBE (endpoint del verdetto).
 * Accetta sia la forma `sparql-results+json` sia la forma RDF/JSON.
 */
export async function dettaglioDeputato(
  uri: string,
  opzioni: OpzioniFetch = {},
): Promise<Esito<{ nome: string; urlScheda: string }>> {
  const slug = slugDaUriDeputato(uri);
  if (!slug) return { ok: false, errore: "URI deputato non valido" };
  const esito = await sparqlCamera(queryDescribe(uri), opzioni);
  if (!esito.ok) return esito;
  if (isRecord(esito.valore) && isRecord(esito.valore.results)) {
    const { nome, urlScheda } = dettaglioDaRigheSPO(uri, righeDaSparql(esito.valore));
    return { ok: true, valore: { nome, urlScheda } };
  }
  const { nome, urlScheda } = dettaglioDaRdfJson(uri, esito.valore);
  if (!nome && !urlScheda) return { ok: false, errore: "Dettaglio deputato vuoto" };
  return { ok: true, valore: { nome, urlScheda } };
}
