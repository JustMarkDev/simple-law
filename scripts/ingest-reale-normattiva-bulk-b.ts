/**
 * Ingest bulk-B — finestra annuale 2005 lista-only (zero dettagli).
 *
 * Ruolo giudice REALI-9: scrittore bulk-B, seconda sorgente diversa da A.
 * A ha presumibilmente preso Testi Unici (bulk ZIP) o finestra 2015:
 * qui si ingerisce la finestra 2005 via 1 POST lista
 * `POST /api/v1/ricerca/aggiornati` {2005-01-01..2005-12-31}, misurati dal
 * vivo 672 atti / ~592KB risposta. Disgiunta per anno da 2015 (ELI diversi
 * per data) e per tipo da Testi Unici (consolidazioni vs aggiornati).
 * Overlap residuo accettato: dedup ELI/URN vs pre-esistenti + wiring
 * runtime (`unisciCorpus` in lib/sources.ts) dedupera comunque per ELI.
 *
 * Regole bounded (stesse di bulk-A):
 * - 1 POST lista, timeout 15s, retry 2 SOLO su 429/5xx, stop immediato su
 *   403/409/ERR_409, exit 1 senza parziali su errore/cap.
 * - NIENTE dettaglio, niente testo/articolato; titolo SOLO da `titoloAtto`
 *   (MAI rubrica dettaglio); ELI via `eliFromUrn`; stato onesto fisso
 *   "in_vigore" + campo `limite: "stato non rilevabile da lista"`.
 * - Se `numeroAttiTrovati` supera il cap atti: split per mese (mai troncare
 *   silenzioso); se un mese sfora ancora: exit 1 senza parziali.
 * - Dedup ELI/URN lower-trim vs TUTTI i 10 percorsi PERCORSI_ATTI_REALI di
 *   lib/sources.ts (sola lettura) + intra-file; scarta duplicati, logga.
 * - Cap byte 972800 verificato PRIMA di scrivere; file <= 1MB hard.
 *
 * Uso:
 *   npx tsx scripts/ingest-reale-normattiva-bulk-b.ts [--out=...] [--api-base=...] [--help]
 *
 * Scrive SOLO data/reali/normattiva-bulk-b-finestra-2005.json (default).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatNIR, parseNIR } from "../lib/nir";
import { arrayDa, eliFromUrn, isRecord, tipoFromDenominazione, unwrapData } from "../lib/normattiva";

/* ------------------------------------------------------------------ tipi */

export interface AttoBulkB {
  urn: string;
  eli: string;
  titolo: string;
  titoloAtto: string;
  sintesi: string;
  anno: string;
  numero: string;
  codiceRedazionale: string;
  stato: "in_vigore";
  limite: string;
  fonte: "normattiva-bff";
  dettaglio: false;
}

export interface ProvenanceBulkB {
  fonte: string;
  url: string;
  recuperatoIl: string;
  licenza: string;
}

export interface EnvelopeBulkB {
  provenance: ProvenanceBulkB;
  atti: AttoBulkB[];
}

/* -------------------------------------------------------------- costanti */

export const OUT_DEFAULT_BULK_B = path.join(
  "data",
  "reali",
  "normattiva-bulk-b-finestra-2005.json",
);

const FINESTRA_INIZIO = "2005-01-01";
const FINESTRA_FINE = "2005-12-31";

export const CAP_ATTI_BULK_B = 750;
export const CAP_BYTE_BULK_B = 972800;
const MAX_BYTE_HARD = 1024 * 1024;

const TIMEOUT_POST_MS = 15000;
const RETRIES = 2;

const LICENZA_BULK_B =
  "riproduzione consentita con menzione di fonte, carattere non autentico e gratuito " +
  "(Note legali dati.normattiva.it; solo la Gazzetta Ufficiale a stampa e' autentica)";

const LIMITE_ONESTO = "stato non rilevabile da lista";

/** I 10 percorsi PERCORSI_ATTI_REALI di lib/sources.ts:203-214 (sola lettura, mai toccati). */
const PERCORSI_ESISTENTI_BULK_B = [
  "data/reali/normattiva-recenti.json",
  "data/reali/normattiva-leggi.json",
  "data/reali/normattiva-storico-collezioni.json",
  "data/reali/normattiva-storico-1980.json",
  "data/reali/normattiva-storico-1990.json",
  "data/reali/normattiva-storico-2000.json",
  "data/reali/normattiva-storico-2010.json",
  "data/reali/normattiva-storico-1970.json",
  "data/reali/normattiva-storico-2020.json",
  "data/reali/normattiva-storico-1960.json",
] as const;

const USER_AGENT_BULK_B =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SimpleLaw/1.0";

/* ------------------------------------------------------- utility pure (never-throw) */

/** Chiave dedup: trim + lowercase. Mai lancia. */
export function chiaveEliBulkB(eli: unknown): string {
  try {
    return String(eli ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function stringaBulkB(voce: unknown): string {
  try {
    if (typeof voce === "string") return voce.trim();
    if (typeof voce === "number" && Number.isFinite(voce)) return String(voce);
    return "";
  } catch {
    return "";
  }
}

/**
 * Costruisce un URN NIR reale dai campi di una voce lista aggiornati.
 * "" se insufficienti: mai inventare. Mai lancia.
 */
export function urnDaVoceBulkB(voce: unknown): string {
  try {
    if (!isRecord(voce)) return "";
    const denominazione = stringaBulkB(voce["denominazioneAtto"]);
    const tipo = tipoFromDenominazione(denominazione);
    const numero = stringaBulkB(
      voce["numeroProvvedimento"] ?? voce["numero"] ?? voce["numeroAttoAlfanumerico"],
    );
    const anno = stringaBulkB(voce["annoProvvedimento"]).padStart(4, "0");
    const mese = stringaBulkB(voce["meseProvvedimento"]).padStart(2, "0");
    const giorno = stringaBulkB(voce["giornoProvvedimento"]).padStart(2, "0");
    const iso = `${anno}-${mese}-${giorno}`;
    if (!tipo || !numero) return "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    if (Number.isNaN(Date.parse(`${iso}T00:00:00Z`))) return "";
    const urn = formatNIR({ tipo, data: iso, numero });
    return parseNIR(urn) ? urn : "";
  } catch {
    return "";
  }
}

/**
 * Converte una voce lista in AttoBulkB usando SOLO campi osservati.
 * Titolo SOLO da `titoloAtto`; null se manca titolo/URN/codice/ELI.
 * Stato onesto fisso in_vigore + limite. Mai lancia.
 */
export function voceToAttoBulkB(voce: unknown): AttoBulkB | null {
  try {
    if (!isRecord(voce)) return null;
    const titoloAtto = stringaBulkB(voce["titoloAtto"]).replace(/\s+/g, " ").trim();
    if (!titoloAtto) return null;
    const urn = urnDaVoceBulkB(voce);
    if (!urn) return null;
    const codice = stringaBulkB(voce["codiceRedazionale"]);
    if (!codice) return null;
    const eli = eliFromUrn(urn, codice);
    if (!eli || !eli.startsWith("/")) return null;
    const numero =
      stringaBulkB(voce["numeroProvvedimento"]) ||
      stringaBulkB(voce["numero"]) ||
      (parseNIR(urn)?.numero ?? "");
    if (!numero) return null;
    const anno = stringaBulkB(voce["annoProvvedimento"]);
    if (!/^\d{4}$/.test(anno)) return null;
    return {
      urn,
      eli,
      titolo: titoloAtto,
      titoloAtto,
      sintesi: titoloAtto,
      anno,
      numero,
      codiceRedazionale: codice,
      stato: "in_vigore",
      limite: LIMITE_ONESTO,
      fonte: "normattiva-bff",
      dettaglio: false,
    };
  } catch {
    return null;
  }
}

/** Estrae voci lista da risposta aggiornati (dedup URN interna). Mai lancia. */
export function vociDaAggiornatiBulkB(raw: unknown): AttoBulkB[] {
  try {
    const lista = arrayDa(unwrapData(raw), ["listaAtti", "atti", "risultati", "hits"]);
    const risultato: AttoBulkB[] = [];
    const visti = new Set<string>();
    for (const voce of lista) {
      const atto = voceToAttoBulkB(voce);
      if (!atto) continue;
      const chiave = chiaveEliBulkB(atto.urn);
      if (!chiave || visti.has(chiave)) continue;
      visti.add(chiave);
      risultato.push(atto);
    }
    return risultato;
  } catch {
    return [];
  }
}

/** Legge numeroAttiTrovati dal vivo (mai pre-riempito). Mai lancia. */
export function numeroAttiTrovatiBulkB(raw: unknown): number | null {
  try {
    const involucro = unwrapData(raw);
    if (!isRecord(involucro)) return null;
    for (const k of ["numeroAttiTrovati", "numeroAtti", "totale", "total", "count"]) {
      const v = involucro[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number.parseInt(v.trim(), 10);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Carica chiavi ELI/URN/nir/chiave dai file pre-esistenti (lower+trim).
 * Mai lancia: file assenti/invalidi saltati.
 */
export async function caricaChiaviEsistentiBulkB(
  percorsi: readonly string[],
): Promise<Set<string>> {
  const chiavi = new Set<string>();
  for (const percorso of percorsi) {
    try {
      const raw = await readFile(path.resolve(percorso), "utf8");
      if (!raw || raw.length > 2_000_000) continue;
      const parsed = JSON.parse(raw) as unknown;
      const involucro = isRecord(parsed) ? parsed : null;
      const lista = arrayDa(
        involucro ? (involucro["atti"] ?? involucro["leggi"] ?? involucro["dati"] ?? []) : parsed,
        [],
      );
      for (const item of Array.isArray(lista) ? lista : []) {
        if (!isRecord(item)) continue;
        for (const campo of ["eli", "nir", "urn", "chiave"] as const) {
          const chiave = chiaveEliBulkB(item[campo]);
          if (chiave) chiavi.add(chiave);
        }
      }
    } catch {
      continue;
    }
  }
  return chiavi;
}

/** Filtra duplicati vs conosciuti + intra-lista. Mai lancia. */
export function dedupAttiBulkB(atti: AttoBulkB[], conosciuti: Set<string>): { unici: AttoBulkB[]; duplicati: number } {
  try {
    const unici: AttoBulkB[] = [];
    const visti = new Set<string>();
    let duplicati = 0;
    for (const atto of atti) {
      const impronte = [chiaveEliBulkB(atto.eli), chiaveEliBulkB(atto.urn)].filter(Boolean);
      if (impronte.some((i) => visti.has(i) || conosciuti.has(i))) {
        duplicati += 1;
        continue;
      }
      for (const i of impronte) visti.add(i);
      unici.push(atto);
    }
    return { unici, duplicati };
  } catch {
    return { unici: [], duplicati: 0 };
  }
}

/* --------------------------------------------------------------- rete bounded */

function messaggioDiBulkB(cause: unknown): string {
  try {
    if (cause && typeof cause === "object" && "message" in cause) {
      const c = cause as { message?: unknown; status?: unknown; url?: unknown };
      const base = typeof c.message === "string" ? c.message : String(c.message ?? cause);
      const extra =
        (c.status ? ` status=${String(c.status)}` : "") + (c.url ? ` url=${String(c.url)}` : "");
      return `${base}${extra}`;
    }
    return cause instanceof Error ? cause.message : String(cause);
  } catch {
    return "errore sconosciuto";
  }
}

function erroreDefinitivoBulkB(status: number | null, testo: string): boolean {
  if (status === 403 || status === 409) return true;
  return /ERR_409|1003|bloccata/i.test(testo ?? "");
}

function erroreRitentabileBulkB(status: number | null): boolean {
  if (status === null) return true;
  return status === 429 || (status >= 500 && status <= 599);
}

function mesiFinestraBulkB(inizio: string, fine: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const [a, m] = inizio.split("-").map(Number);
  const [a2, m2] = fine.split("-").map(Number);
  let anno = a;
  let mese = m;
  while (anno < a2 || (anno === a2 && mese <= m2)) {
    const ultimo = new Date(Date.UTC(anno, mese, 0)).toISOString().slice(0, 10);
    const primo = `${String(anno).padStart(4, "0")}-${String(mese).padStart(2, "0")}-01`;
    out.push([primo, ultimo < fine ? ultimo : fine]);
    mese += 1;
    if (mese > 12) {
      mese = 1;
      anno += 1;
    }
  }
  return out;
}

async function postAggiornatiBulkB(
  baseUrl: string,
  inizio: string,
  fine: string,
): Promise<{ raw: unknown; url: string }> {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/v1/ricerca/aggiornati`;
  const corpo = JSON.stringify({ dataInizioAggiornamento: inizio, dataFineAggiornamento: fine });
  let ultimoErrore = "";
  for (let tentativo = 0; tentativo <= RETRIES; tentativo += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_POST_MS);
    try {
      const risposta = await fetch(url, {
        method: "POST",
        headers: {
          accept: "application/json, text/plain, */*",
          "content-type": "application/json",
          "user-agent": USER_AGENT_BULK_B,
          referer: "https://www.normattiva.it/",
        },
        body: corpo,
        signal: controller.signal,
        redirect: "follow",
      });
      const testo = await risposta.text();
      if (!risposta.ok) {
        ultimoErrore = testo.slice(0, 300) || `HTTP ${risposta.status}`;
        if (erroreDefinitivoBulkB(risposta.status, ultimoErrore)) {
          throw Object.assign(new Error(`definitivo: ${ultimoErrore}`), {
            status: risposta.status,
            url,
          });
        }
        if (tentativo < RETRIES && erroreRitentabileBulkB(risposta.status)) {
          await new Promise((r) => setTimeout(r, 500 * (tentativo + 1)));
          continue;
        }
        throw Object.assign(new Error(ultimoErrore || `HTTP ${risposta.status}`), {
          status: risposta.status,
          url,
        });
      }
      if (!testo.trim()) throw Object.assign(new Error("risposta vuota"), { url });
      return { raw: JSON.parse(testo) as unknown, url };
    } catch (cause) {
      const msg = messaggioDiBulkB(cause);
      if (/definitivo:|403|409|ERR_409|1003|bloccata/i.test(msg)) throw cause;
      ultimoErrore = msg;
      if (tentativo < RETRIES && /abort|timeout|fetch|network|429|5\d\d/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 500 * (tentativo + 1)));
        continue;
      }
      throw cause;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(ultimoErrore || "POST aggiornati fallita");
}

/* ---------------------------------------------------------- lettura args */

function aiutoBulkB(): string {
  return [
    "Ingest bulk-B Normattiva — finestra 2005 lista-only (dati ufficiali, mai dimostrativi).",
    "",
    "Uso:",
    "  npx tsx scripts/ingest-reale-normattiva-bulk-b.ts [opzioni]",
    "",
    "Opzioni:",
    "  --out=PERCORSO   file JSON (default data/reali/normattiva-bulk-b-finestra-2005.json)",
    "  --api-base=URL   override base API Normattiva",
    "  --help           mostra questo aiuto",
    "",
    "Seconda sorgente rispetto a bulk-A (finestra 2005 vs Testi Unici/2015).",
    "Overlap residuo accettato: dedup ELI a runtime nel wiring.",
  ].join("\n");
}

function argomentoBulkB(nome: string): string | undefined {
  const prefisso = `--${nome}=`;
  const trovato = process.argv.find((arg) => arg.startsWith(prefisso));
  return trovato ? trovato.slice(prefisso.length).trim() || undefined : undefined;
}

/* --------------------------------------------------------------- main */

async function mainBulkB(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(aiutoBulkB());
    return;
  }
  const out = argomentoBulkB("out") ?? OUT_DEFAULT_BULK_B;
  const apiBase =
    (argomentoBulkB("api-base") ?? process.env.NORMATTIVA_API_BASE ?? "").trim() ||
    "https://api.normattiva.it/t/normattiva.api/bff-opendata/v1";

  console.log(`Ingest bulk-B: finestra ${FINESTRA_INIZIO}..${FINESTRA_FINE} lista-only (zero dettagli).`);

  const conosciuti = await caricaChiaviEsistentiBulkB(PERCORSI_ESISTENTI_BULK_B);
  console.log(
    `Dedup: ${conosciuti.size} chiavi ELI/URN gia' presenti nei file pre-esistenti (${PERCORSI_ESISTENTI_BULK_B.length} percorsi).`,
  );

  // 1 POST lista annuale.
  let rawAnno: unknown;
  let urlAnno = "";
  try {
    const ris = await postAggiornatiBulkB(apiBase, FINESTRA_INIZIO, FINESTRA_FINE);
    rawAnno = ris.raw;
    urlAnno = ris.url;
  } catch (cause) {
    console.error(`Finestra 2005 fallita (${messaggioDiBulkB(cause)}): nessun file scritto.`);
    process.exitCode = 1;
    return;
  }

  const trovati = numeroAttiTrovatiBulkB(rawAnno);
  console.log(`Finestra 2005: numeroAttiTrovati=${trovati ?? "n/d"} (letto dal vivo).`);

  let attiGrezzi = vociDaAggiornatiBulkB(rawAnno);
  console.log(`Finestra 2005: ${attiGrezzi.length} voci lista reali (titolo da titoloAtto).`);

  // Split onesto per mese se oltre cap (mai troncare silenzioso).
  if ((trovati !== null && trovati > CAP_ATTI_BULK_B) || attiGrezzi.length > CAP_ATTI_BULK_B) {
    console.log(`Oltre cap ${CAP_ATTI_BULK_B}: split per mese (stessa API, stessi parametri).`);
    const mesi = mesiFinestraBulkB(FINESTRA_INIZIO, FINESTRA_FINE);
    const raccolti: AttoBulkB[] = [];
    const vistiMesi = new Set<string>();
    for (const [ini, fin] of mesi) {
      try {
        const ris = await postAggiornatiBulkB(apiBase, ini, fin);
        const mensili = vociDaAggiornatiBulkB(ris.raw);
        const trovatiMese = numeroAttiTrovatiBulkB(ris.raw);
        if ((trovatiMese !== null && trovatiMese > CAP_ATTI_BULK_B) || mensili.length > CAP_ATTI_BULK_B) {
          console.error(`Mese ${ini}..${fin} oltre cap: nessun file scritto (mai tagliare).`);
          process.exitCode = 1;
          return;
        }
        for (const atto of mensili) {
          const k = chiaveEliBulkB(atto.urn);
          if (!k || vistiMesi.has(k)) continue;
          vistiMesi.add(k);
          raccolti.push(atto);
        }
      } catch (cause) {
        console.error(`Mese ${ini}..${fin} fallito (${messaggioDiBulkB(cause)}): nessun file scritto.`);
        process.exitCode = 1;
        return;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    attiGrezzi = raccolti;
    console.log(`Split mesi: ${attiGrezzi.length} voci totali.`);
  }

  if (attiGrezzi.length === 0) {
    console.error("Zero voci reali: nessun file scritto.");
    process.exitCode = 1;
    return;
  }
  if (attiGrezzi.length > CAP_ATTI_BULK_B) {
    console.error(`Lista oltre cap ${CAP_ATTI_BULK_B} (${attiGrezzi.length}): nessun file scritto.`);
    process.exitCode = 1;
    return;
  }

  const { unici, duplicati } = dedupAttiBulkB(attiGrezzi, conosciuti);
  console.log(`Dedup: ${attiGrezzi.length} voci, ${duplicati} duplicate escluse, ${unici.length} uniche.`);

  if (unici.length === 0) {
    console.error("Tutte le voci duplicate di atti pre-esistenti: nessun file scritto.");
    process.exitCode = 1;
    return;
  }

  const recuperatoIl = new Date().toISOString();
  const envelope: EnvelopeBulkB = {
    provenance: {
      fonte: "normattiva-bff aggiornati 2005",
      url: urlAnno,
      recuperatoIl,
      licenza: LICENZA_BULK_B,
    },
    atti: unici,
  };
  const json = JSON.stringify(envelope, null, 2);
  const byte = Buffer.byteLength(json, "utf8");
  if (byte > CAP_BYTE_BULK_B || byte > MAX_BYTE_HARD) {
    console.error(`File ${byte} byte oltre cap ${CAP_BYTE_BULK_B}: nessun file scritto.`);
    process.exitCode = 1;
    return;
  }

  const dest = path.resolve(out);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, json, "utf8");
  console.log(
    `Scritti ${unici.length} atti bulk-B finestra 2005 in ${dest} (${(byte / 1024).toFixed(1)} KB).`,
  );
}

const eseguitoComeScriptBulkB =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv.length > 1 &&
  (process.argv[1] ?? "").endsWith("ingest-reale-normattiva-bulk-b.ts");

if (eseguitoComeScriptBulkB) {
  mainBulkB().catch((cause: unknown) => {
    console.error(`Ingest bulk-B fallito: ${messaggioDiBulkB(cause)}`);
    process.exitCode = 1;
  });
}
