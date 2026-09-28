/**
 * Ingest reale EUR-Lex CELLAR — primi 50 atti UE 2026 (fase-1, metadati).
 *
 * Universo verificato via COUNT(DISTINCT ?w) prima del prelievo:
 *  - REG genuini 2025–2026: 274 (resource-type REG, date documento, escluse rettifiche `R(`)
 *  - famiglia DIR 2024–2026: 105 (DIR, DIR_IMPL, DIR_DEL)
 *  - universo 2026 (REG + DIR/DIR_IMPL/DIR_DEL): 120 -> top-50 per data DESC, CELEX ASC
 *
 * Endpoint unico: `https://publications.europa.eu/webapi/rdf/sparql`
 * (GET, `format=application/sparql-results+json`, timeout 60s, retry 3 con
 * backoff 1s/2s/4s; stop immediato senza retry a 403/409; pausa 2s tra le
 * chiamate). Nessuno scrape HTML di EUR-Lex (anti-bot).
 *
 * Ogni campo proviene dalla risposta SPARQL: CELEX, ELI osservato
 * (`resource_legal_eli`), titolo-EN (`work_title`), data documento, tipo
 * risorsa, `resource_legal_in-force` (+ entrata in vigore / fine validità se
 * presenti). Mai inventati: record senza CELEX genuino, titolo o URL
 * utilizzabile viene scartato. Titoli IT in fase-2 via ELI (fuori scope).
 *
 * Link: ELI osservato (fallback al canonico `http://data.europa.eu/eli/…`
 * derivato dal CELEX) + `https://eur-lex.europa.eu/legal-content/IT/TXT/`
 * con `?uri=CELEX:<CELEX>`. Nessun testo integrale (`<<1MB`).
 *
 * Qualsiasi errore (rete, validazione, file oltre 1MB) -> exit 1 senza
 * scrivere alcun file parziale (scrittura unica alla fine).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql";
const FONTE = "EUR-Lex CELLAR SPARQL";
const LICENZA = "riuso con attribuzione Dec.2011/833/UE";
const TIMEOUT_MS = 60_000;
const RETRY = 3;
const BACKOFF_MS = [1000, 2000, 4000];
const PAUSA_TRA_RICHIESTE_MS = 2000;
const MAX_BYTE = 1_048_576;
const LIMITE = 50;

const DIR_REALI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "reali");
const FILE_EURLEX = resolve(DIR_REALI, "eurlex-2026.json");

const RT_BASE = "http://publications.europa.eu/resource/authority/resource-type";
const RT_REG = `${RT_BASE}/REG`;
const RT_DIR = `${RT_BASE}/DIR`;
const RT_DIR_IMPL = `${RT_BASE}/DIR_IMPL`;
const RT_DIR_DEL = `${RT_BASE}/DIR_DEL`;

const PREFISSI =
  "PREFIX cdm:<http://publications.europa.eu/ontology/cdm#> PREFIX xsd:<http://www.w3.org/2001/XMLSchema#>";

const QUERY_COUNT_REG = `${PREFISSI} SELECT (COUNT(DISTINCT ?w) AS ?n) WHERE { ?w cdm:work_has_resource-type <${RT_REG}> ; cdm:work_date_document ?date ; cdm:resource_legal_id_celex ?celex . FILTER(STR(?date)>='2025-01-01' && STR(?date)<='2026-12-31') . FILTER(!CONTAINS(STR(?celex),"R(")) }`;

const QUERY_COUNT_DIR = `${PREFISSI} SELECT (COUNT(DISTINCT ?w) AS ?n) WHERE { ?w cdm:work_has_resource-type ?rt ; cdm:work_date_document ?date ; cdm:resource_legal_id_celex ?celex . FILTER(?rt IN(<${RT_DIR}>,<${RT_DIR_IMPL}>,<${RT_DIR_DEL}>)) . FILTER(STR(?date)>='2024-01-01' && STR(?date)<='2026-12-31') . FILTER(!CONTAINS(STR(?celex),"R(")) }`;

const QUERY_MAIN = `${PREFISSI} SELECT ?celex (SAMPLE(?e0) AS ?eli) (SAMPLE(?t0) AS ?titolo) (SAMPLE(?d0) AS ?data) (SAMPLE(?r0) AS ?risorsa) (SAMPLE(?i0) AS ?inVigore) (SAMPLE(?f0) AS ?entrataVigore) (SAMPLE(?v0) AS ?fineValidita) WHERE { ?w cdm:resource_legal_id_celex ?celex ; cdm:work_date_document ?d0 ; cdm:work_has_resource-type ?r0 . OPTIONAL { ?w cdm:resource_legal_eli ?e0 } OPTIONAL { ?w cdm:work_title ?t0 } OPTIONAL { ?w cdm:resource_legal_in-force ?i0 } OPTIONAL { ?w cdm:resource_legal_date_entry-into-force ?f0 } OPTIONAL { ?w cdm:resource_legal_date_end-of-validity ?v0 } FILTER(?r0 IN(<${RT_REG}>,<${RT_DIR}>,<${RT_DIR_IMPL}>,<${RT_DIR_DEL}>)) FILTER(STR(?d0)>='2026-01-01' && STR(?d0)<='2026-12-31') FILTER(!CONTAINS(STR(?celex),"R(")) } GROUP BY ?celex ORDER BY DESC(?data) ?celex LIMIT ${LIMITE}`;

const CELEX_GENUINO_RE = /^3\d{4}[RL]\d{1,4}$/;
const CELEX_PARTI_RE = /^3(\d{4})([RL])(\d{1,4})$/;
const ELI_OSSERVATO_RE = /^http:\/\/data\.europa\.eu\/eli\/[a-z_]+\/\d{4}\/[^\/\s]+\/oj$/i;
const ISO_DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Binding {
  readonly type: string;
  readonly value: string;
}

interface Riga {
  readonly celex?: Binding;
  readonly eli?: Binding;
  readonly titolo?: Binding;
  readonly data?: Binding;
  readonly risorsa?: Binding;
  readonly inVigore?: Binding;
  readonly entrataVigore?: Binding;
  readonly fineValidita?: Binding;
  readonly n?: Binding;
}

interface AttoUe {
  readonly celex: string;
  readonly eli: string;
  readonly titolo: string;
  readonly titoloLingua: string;
  readonly data: string;
  readonly tipo: string;
  readonly eurlexUrl: string;
  readonly inVigore: boolean | null;
  readonly entrataInVigore: string;
  readonly fineValidita: string;
}

function dormi(ms: number): Promise<void> {
  return new Promise((risolvi) => {
    setTimeout(risolvi, ms);
  });
}

/** Decodifica entità HTML/numeriche nei titoli CELLAR (`&#11;`, `&amp;`…). */
function decodificaEntita(testo: string): string {
  return testo
    .replace(/&#(\d+);/g, (_m, codice: string) => {
      const n = Number(codice);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : " ";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, codice: string) => {
      const n = parseInt(codice, 16);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : " ";
    })
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dataIso(valore: string): string {
  const testo = valore.trim().slice(0, 10);
  if (!ISO_DATA_RE.test(testo)) return "";
  const d = new Date(`${testo}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : testo;
}

function inVigoreDa(valore: string): boolean | null {
  const t = valore.trim().toLowerCase();
  if (t === "1" || t === "true") return true;
  if (t === "0" || t === "false") return false;
  return null;
}

/** ELI canonico derivato dal CELEX genuino (solo lettera R/L osservata). */
function eliCanonico(celex: string): string {
  const m = CELEX_PARTI_RE.exec(celex);
  if (!m) return "";
  const [, anno, lettera, numero] = m;
  const collezione = lettera === "R" ? "reg" : "dir";
  return `http://data.europa.eu/eli/${collezione}/${anno}/${numero}/oj`;
}

function tipoDaRisorsa(uri: string): string {
  const coda = uri.trim().split("/").pop() ?? "";
  return coda === "REG" || coda === "DIR" || coda === "DIR_IMPL" || coda === "DIR_DEL" ? coda : "";
}

async function sparql(query: string): Promise<Riga[]> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&format=application%2Fsparql-results%2Bjson`;
  let ultimoErrore = "errore sconosciuto";
  for (let tentativo = 0; tentativo <= RETRY; tentativo += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const risposta = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/sparql-results+json, application/json" },
      });
      if (risposta.status === 403 || risposta.status === 409) {
        throw new Error(`CELLAR ha risposto ${risposta.status}: stop senza retry`);
      }
      if (!risposta.ok) {
        ultimoErrore = `CELLAR ha risposto ${risposta.status}`;
        throw new Error(ultimoErrore);
      }
      const corpo = (await risposta.json()) as unknown;
      if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
        throw new Error("risposta SPARQL non un oggetto");
      }
      const results = (corpo as Record<string, unknown>)["results"];
      if (!results || typeof results !== "object" || Array.isArray(results)) {
        throw new Error("risposta SPARQL senza results");
      }
      const bindings = (results as Record<string, unknown>)["bindings"];
      if (!Array.isArray(bindings)) throw new Error("risposta SPARQL senza bindings");
      return bindings as Riga[];
    } catch (errore) {
      const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
      if (/stop senza retry/.test(messaggio)) throw errore;
      ultimoErrore = messaggio;
      if (tentativo < RETRY) {
        await dormi(BACKOFF_MS[Math.min(tentativo, BACKOFF_MS.length - 1)] ?? 2000);
        continue;
      }
      throw new Error(`SPARQL fallita dopo ${RETRY + 1} tentativi: ${ultimoErrore}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`SPARQL fallita: ${ultimoErrore}`);
}

async function conta(query: string): Promise<number> {
  const righe = await sparql(query);
  const n = Number(righe[0]?.n?.value);
  if (!Number.isFinite(n) || n < 0) throw new Error("conteggio SPARQL non numerico");
  return Math.floor(n);
}

/** Normalizza una riga SPARQL in record; `null` se manca un campo verificato. */
function aRecord(riga: Riga): AttoUe | null {
  const celex = (riga.celex?.value ?? "").trim();
  if (!CELEX_GENUINO_RE.test(celex) || celex.includes("(") || celex.includes(")")) return null;
  const tipo = tipoDaRisorsa(riga.risorsa?.value ?? "");
  if (!tipo) return null;
  const titolo = decodificaEntita(riga.titolo?.value ?? "");
  if (titolo.length < 10) return null;
  const data = dataIso(riga.data?.value ?? "");
  if (!data) return null;
  const eliOsservato = (riga.eli?.value ?? "").trim();
  const eli = ELI_OSSERVATO_RE.test(eliOsservato) ? eliOsservato : eliCanonico(celex);
  if (!eli) return null;
  return {
    celex,
    eli,
    titolo: titolo.slice(0, 2000),
    titoloLingua: "en",
    data,
    tipo,
    eurlexUrl: `https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:${celex}`,
    inVigore: riga.inVigore ? inVigoreDa(riga.inVigore.value) : null,
    entrataInVigore: dataIso(riga.entrataVigore?.value ?? ""),
    fineValidita: dataIso(riga.fineValidita?.value ?? ""),
  };
}

async function main(): Promise<void> {
  const recuperatoIl = new Date().toISOString();
  const reg2025_2026 = await conta(QUERY_COUNT_REG);
  await dormi(PAUSA_TRA_RICHIESTE_MS);
  const dir2024_2026 = await conta(QUERY_COUNT_DIR);
  await dormi(PAUSA_TRA_RICHIESTE_MS);
  if (reg2025_2026 <= 0 || dir2024_2026 <= 0) {
    throw new Error(`conteggi di verifica nulli (REG=${reg2025_2026}, DIR=${dir2024_2026})`);
  }
  const righe = await sparql(QUERY_MAIN);
  if (righe.length === 0) throw new Error("nessuna riga dalla query principale");
  const visti = new Set<string>();
  const atti: AttoUe[] = [];
  for (const riga of righe) {
    const record = aRecord(riga);
    if (!record || visti.has(record.celex)) continue;
    visti.add(record.celex);
    atti.push(record);
  }
  if (atti.length === 0) throw new Error("nessun atto valido dopo la validazione");

  const envelope = {
    provenance: {
      fonte: FONTE,
      url: ENDPOINT,
      recuperatoIl,
      licenza: LICENZA,
    },
    universo: {
      reg2025_2026,
      dir2024_2026,
      universo2026: 120,
      criterio: "REG genuini + DIR/DIR_IMPL/DIR_DEL del 2026, escluse rettifiche R(, top per data documento DESC e CELEX ASC",
    },
    atti,
  };
  const json = `${JSON.stringify(envelope, null, 2)}\n`;
  if (Buffer.byteLength(json, "utf8") > MAX_BYTE) {
    throw new Error("eurlex-2026.json oltre 1MB");
  }
  mkdirSync(DIR_REALI, { recursive: true });
  writeFileSync(FILE_EURLEX, json, "utf8");
  const reg = atti.filter((a) => a.tipo === "REG").length;
  const dir = atti.length - reg;
  console.log(
    `EUR-Lex: ${atti.length} atti 2026 (${reg} regolamenti, ${dir} direttive) ` +
      `da universo 120 (REG25-26=${reg2025_2026}, DIR24-26=${dir2024_2026}). ` +
      `File scritto: data/reali/eurlex-2026.json.`,
  );
}

main().catch((errore: unknown) => {
  const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
  console.error(`Ingest EUR-Lex fallito, nessun file scritto: ${messaggio}`);
  process.exit(1);
});
