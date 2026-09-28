/**
 * Ingest reale Normattiva -> data/reali/normattiva-recenti.json.
 *
 * Legge atti VERI dalle API Open Data di Normattiva (bff-opendata v1) e li
 * salva con envelope di provenance. Nessun dato dimostrativo: ogni campo del
 * record deriva dalla risposta HTTP (lista + dettaglio) oppure il record
 * viene scartato. Mai inventati: codici redazionali, numeri, URL, date.
 *
 * Catena endpoint (se uno fallisce si prova il successivo):
 *   1. POST /api/v1/ricerca/listaAtti {pagina, dimensionePagina}
 *   2. POST /api/v1/ricerca/aggiornati {dataInizioAggiornamento, dataFineAggiornamento}
 *   3. POST /api/v1/ricerca/avanzata (walk paginato, una pagina)
 * Dettaglio per ogni URN: POST /api/v1/atto/dettaglio-atto-urn {urn},
 * a batch di 5 con pausa di 400 ms. Timeout 15000 ms, retry solo su 429/5xx
 * (gestiti da lib/normattiva.ts); stop su 403/409/ERR_409.
 *
 * Uso:
 *   npx tsx scripts/ingest-reale-normattiva.ts [--limite=50] [--dal=2026-07-01]
 *     [--al=2026-09-28] [--testo-max=8000] [--dimensione-pagina=20]
 *     [--out=data/reali/normattiva-recenti.json] [--api-base=...] [--help]
 *
 * Esce con codice 1 (SENZA scrivere file parziali) se tutti gli endpoint
 * falliscono, se nessun atto reale viene recuperato o se il JSON supera 1 MB.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Effect } from "effect";
import { buildFonti } from "../lib/fonti";
import { formatNIR, parseNIR } from "../lib/nir";
import {
  Normattiva,
  NormattivaError,
  arrayDa,
  defaultNormattivaConfig,
  eliFromUrn,
  isRecord,
  normalizzaData,
  parseAttoDto,
  runNormattiva,
  stripHtml,
  tipoFromDenominazione,
  unwrapData,
  walkRicercaAvanzata,
} from "../lib/normattiva";
import type { AttoDto, NormattivaConfig } from "../lib/normattiva";
import { attoToLawRecord } from "../lib/sync";

/* ------------------------------------------------------------------ tipi */

interface LawRecord {
  chiave: string;
  titolo: string;
  tipo: string;
  numero: string;
  dataEmanazione: string;
  nir: string;
  eli: string;
  dataGU?: string;
  numeroGU?: string;
  codiceRedazionale?: string;
  stato: "in_vigore" | "abrogato";
  sintesi: string;
  testo?: string;
  testoTroncato?: boolean;
  fonti: { normattiva?: string; gazzetta?: string; governo?: string };
}

interface Provenance {
  fonte: string;
  url: string;
  recuperatoIl: string;
  licenza: string;
}

interface Envelope {
  provenance: Provenance;
  atti: LawRecord[];
}

/* -------------------------------------------------------------- costanti */

const DIM_MB = 1024 * 1024;
const PAUSA_BATCH_MS = 400;
const DETTAGLI_PER_BATCH = 5;
const TIMEOUT_MS = 15000;
const RETRIES = 2;

const LICENZA =
  "riproduzione consentita con menzione di fonte, carattere non autentico e gratuito " +
  "(Note legali dati.normattiva.it; solo la Gazzetta Ufficiale a stampa e' autentica)";

const DENOMINAZIONI_FALLBACK: readonly string[] = [
  "DECRETO-LEGGE",
  "LEGGE",
  "DECRETO LEGISLATIVO",
];

/* ------------------------------------------------------- utility interne */

function oggiIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizza(testo: string): string {
  return (testo ?? "").replace(/\s+/g, " ").trim();
}

function stringa(voce: unknown): string {
  if (typeof voce === "string") return voce.trim();
  if (typeof voce === "number" && Number.isFinite(voce)) return String(voce);
  return "";
}

function isIsoDate(testo: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testo)) return false;
  const parsed = new Date(`${testo}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === testo;
}

function isoDaParti(anno: unknown, mese: unknown, giorno: unknown): string {
  const a = stringa(anno).padStart(4, "0");
  const m = stringa(mese).padStart(2, "0");
  const g = stringa(giorno).padStart(2, "0");
  const iso = `${a}-${m}-${g}`;
  return isIsoDate(iso) ? iso : "";
}

function pausa(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function erroreDefinitivo(cause: unknown): boolean {
  if (cause instanceof NormattivaError) {
    if (cause.status === 403 || cause.status === 409) return true;
    return /ERR_409|1003|bloccata/i.test(cause.message);
  }
  return /ERR_409/i.test(String(cause));
}

function messaggioDi(cause: unknown): string {
  if (cause instanceof NormattivaError) {
    return `${cause.message} (url=${cause.url}${cause.status ? ` status=${cause.status}` : ""})`;
  }
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Costruisce un URN NIR reale dai campi di una voce di lista (listaAtti o
 * aggiornati). Restituisce "" se i campi non bastano: mai inventare.
 */
function urnDaVoceLista(voce: unknown): string {
  if (!isRecord(voce)) return "";
  const denominazione = stringa(voce["denominazioneAtto"] ?? voce["tipoProvvedimentoDescrizione"]);
  const tipo = tipoFromDenominazione(denominazione);
  const numero = stringa(
    voce["numeroProvvedimento"] ?? voce["numero"] ?? voce["numeroAttoAlfanumerico"],
  );
  const iso = isoDaParti(voce["annoProvvedimento"], voce["meseProvvedimento"], voce["giornoProvvedimento"]);
  if (!tipo || !numero || !iso) return "";
  const urn = formatNIR({ tipo, data: iso, numero });
  return parseNIR(urn) ? urn : "";
}

/** Estrae la parte `atto` da una risposta di dettaglio (se presente). */
function attoInterno(raw: unknown): Record<string, unknown> | null {
  const involucro = unwrapData(raw);
  if (isRecord(involucro)) {
    const interno = involucro["atto"];
    if (isRecord(interno)) return interno;
    return involucro;
  }
  return null;
}

/**
 * Converte un dettaglio reale in LawRecord usando SOLO campi osservati.
 * Restituisce null se mancano titolo o identificativo.
 */
function dettaglioToRecord(
  urn: string,
  codiceLista: string,
  dataGULista: string,
  numeroGULista: string,
  raw: unknown,
  testoMax: number,
): LawRecord | null {
  const interno = attoInterno(raw);
  if (!interno) return null;
  const dto: AttoDto | null = parseAttoDto(interno);

  const titolo =
    normalizza(dto?.titolo ?? "") ||
    normalizza(stringa(interno["titolo"])) ||
    normalizza(stringa(interno["descrizioneAtto"]));
  if (!titolo) return null;

  const tipo =
    dto?.tipo ||
    tipoFromDenominazione(
      stringa(interno["tipoProvvedimentoDescrizione"]) || stringa(interno["denominazioneAtto"]),
    ) ||
    "atto";

  const numero =
    dto?.numero ||
    stringa(interno["numeroProvvedimento"]) ||
    (parseNIR(urn)?.numero ?? "");
  if (!numero) return null;

  const dataEmanazione =
    dto?.dataEmanazione ||
    isoDaParti(interno["annoProvvedimento"], interno["meseProvvedimento"], interno["giornoProvvedimento"]) ||
    normalizzaData(interno["dataEmanazione"]) ||
    (parseNIR(urn)?.data ?? "");
  if (!dataEmanazione) return null;

  const codice = dto?.codiceRedazionale || stringa(interno["codiceRedazionale"]) || codiceLista;

  const html = dto?.articoloHtml || stringa(interno["articoloHtml"]);
  const testoIntegrale = dto?.testo || stripHtml(html);
  const sottoTitolo = dto?.sottoTitolo || normalizza(stringa(interno["sottoTitolo"]));
  // Vigenza onesta: SOLO la data di fine vigenza del dettaglio fa fede
  // (formato `YYYYMMDD`, `99999999` = ancora in vigore). MAI inferire lo
  // stato dal contenuto del testo: quasi ogni legge cita un'abrogazione.
  const fineVigenza = stringa(interno["articoloDataFineVigenza"]);
  const fineValida = /^(\d{4})(\d{2})(\d{2})$/.exec(fineVigenza);
  const oggi = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const stato: "in_vigore" | "abrogato" =
    fineValida && fineValida[0] !== "99999999" && fineValida[0] < oggi ? "abrogato" : "in_vigore";

  const eliReale = dto?.eli && dto.eli.startsWith("/") ? dto.eli : "";
  const eli = eliReale || (codice ? eliFromUrn(urn, codice) : "");
  const chiave = eli || urn;
  if (!chiave) return null;

  const law = attoToLawRecord({
    urn,
    eli,
    titolo,
    sottoTitolo,
    articoloHtml: html,
    testo: testoIntegrale,
    tipo,
    numero,
    dataEmanazione,
    codiceRedazionale: codice,
    stato,
    raw: interno,
  });
  if (!law) return null;

  const dataGU =
    isoDaParti(interno["annoGU"], interno["meseGU"], interno["giornoGU"]) ||
    (isIsoDate(dataGULista) ? dataGULista : "");
  const numeroGU = stringa(interno["numeroGU"]) || (/^\d+$/.test(numeroGULista) ? numeroGULista : "");

  const fonti = buildFonti({
    tipo,
    numero,
    dataEmanazione,
    codiceRedazionale: codice || undefined,
    dataGU: dataGU || undefined,
    numeroGU: numeroGU || undefined,
  });

  const sintesi = normalizza(law.sintesi || sottoTitolo || testoIntegrale || titolo).slice(0, 600);
  if (!sintesi) return null;

  const testoPieno = (law.testo ?? "").trim();
  const troncato = testoPieno.length > testoMax;
  const record: LawRecord = {
    chiave,
    titolo: law.titolo,
    tipo: law.tipo,
    numero: law.numero,
    dataEmanazione: law.dataEmanazione,
    nir: urn,
    eli,
    stato,
    sintesi,
    fonti: {
      ...(fonti.normattiva ? { normattiva: fonti.normattiva } : {}),
      ...(fonti.gazzetta ? { gazzetta: fonti.gazzetta } : {}),
      ...(fonti.governo ? { governo: fonti.governo } : {}),
    },
  };
  if (dataGU) record.dataGU = dataGU;
  if (numeroGU) record.numeroGU = numeroGU;
  if (codice) record.codiceRedazionale = codice;
  if (testoPieno) record.testo = troncato ? `${testoPieno.slice(0, testoMax)} [...]` : testoPieno;
  if (troncato) record.testoTroncato = true;
  return record;
}

/* ---------------------------------------------------------- lettura args */

function aiuto(): string {
  return [
    "Ingest reale Normattiva (dati ufficiali, mai dimostrativi).",
    "",
    "Uso:",
    "  npx tsx scripts/ingest-reale-normattiva.ts [opzioni]",
    "",
    "Opzioni:",
    "  --limite=N            atti da salvare (default 50, MAI oltre 200)",
    "  --dal=YYYY-MM-DD      inizio finestra aggiornati (default 2026-07-01)",
    "  --al=YYYY-MM-DD       fine finestra aggiornati (default: oggi UTC)",
    "  --testo-max=N         caratteri max per testo (default 8000, max 61440)",
    "  --dimensione-pagina=N atti per pagina listaAtti (default 20)",
    "  --out=PERCORSO        file JSON (default data/reali/normattiva-recenti.json)",
    "  --api-base=URL        override base API Normattiva",
    "  --help                mostra questo aiuto",
  ].join("\n");
}

function argomento(nome: string): string | undefined {
  const prefisso = `--${nome}=`;
  const trovato = process.argv.find((arg) => arg.startsWith(prefisso));
  return trovato ? trovato.slice(prefisso.length).trim() || undefined : undefined;
}

function intero(nome: string, fallback: number, min: number, max: number): number {
  const grezzo = argomento(nome);
  if (!grezzo) return fallback;
  const parsed = Number.parseInt(grezzo, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/* -------------------------------------------------------- fasi di lista */

interface VoceLista {
  urn: string;
  codice: string;
  dataGU: string;
  numeroGU: string;
}

/**
 * POST JSON grezza tramite il servizio Normattiva di lib (timeout 15s,
 * retry solo su 429/5xx). Restituisce il corpo parsato.
 */
async function postJson(
  overrides: Partial<NormattivaConfig>,
  path: string,
  body: unknown,
): Promise<unknown> {
  return runNormattiva(
    Effect.gen(function* () {
      const http = yield* Normattiva;
      return yield* http.request("POST", path, body);
    }),
    overrides,
  );
}

function vociDaListaAtti(raw: unknown): VoceLista[] {
  const voci = arrayDa(unwrapData(raw), ["listaAtti", "atti", "risultati", "hits"]);
  const risultato: VoceLista[] = [];
  const visti = new Set<string>();
  for (const voce of voci) {
    const urn = urnDaVoceLista(voce);
    if (!urn || visti.has(urn)) continue;
    visti.add(urn);
    if (!isRecord(voce)) continue;
    const dataGUCandidata = stringa(voce["dataGU"]);
    risultato.push({
      urn,
      codice: stringa(voce["codiceRedazionale"]),
      dataGU: isIsoDate(dataGUCandidata) ? dataGUCandidata : "",
      numeroGU: stringa(voce["numeroGU"]),
    });
  }
  return risultato;
}

/** Tentativo 1: POST /api/v1/ricerca/listaAtti (dal verdetto del giudice). */
async function listaAtti(
  overrides: Partial<NormattivaConfig>,
  dimensionePagina: number,
): Promise<VoceLista[]> {
  const raw = await postJson(overrides, "/api/v1/ricerca/listaAtti", {
    pagina: 1,
    dimensionePagina,
  });
  return vociDaListaAtti(raw);
}

/** Tentativo 2: POST /api/v1/ricerca/aggiornati su finestra di date reali. */
async function listaAggiornati(
  overrides: Partial<NormattivaConfig>,
  dal: string,
  al: string,
): Promise<VoceLista[]> {
  const raw = await postJson(overrides, "/api/v1/ricerca/aggiornati", {
    dataInizioAggiornamento: dal,
    dataFineAggiornamento: al,
  });
  return vociDaListaAtti(raw);
}

/** Tentativo 3: walk di ricerca avanzata (una pagina per denominazione). */
async function listaAvanzata(
  overrides: Partial<NormattivaConfig>,
  dimensionePagina: number,
): Promise<VoceLista[]> {
  const risultato: VoceLista[] = [];
  const visti = new Set<string>();
  for (const denominazione of DENOMINAZIONI_FALLBACK) {
    const walk = await runNormattiva(
      walkRicercaAvanzata(
        { denominazioneAtto: denominazione, annoProvvedimento: 2026 },
        { pageSize: dimensionePagina, maxPages: 1 },
      ),
      overrides,
    );
    for (const atto of walk.items) {
      const urn = atto.urn && parseNIR(atto.urn)
        ? atto.urn
        : (() => {
          const tipo = atto.tipo || tipoFromDenominazione(denominazione);
          const iso = isIsoDate(atto.dataEmanazione) ? atto.dataEmanazione : "";
          if (!tipo || !iso || !atto.numero) return "";
          const candidato = formatNIR({ tipo, data: iso, numero: atto.numero });
          return parseNIR(candidato) ? candidato : "";
        })();
      if (!urn || visti.has(urn)) continue;
      visti.add(urn);
      risultato.push({ urn, codice: atto.codiceRedazionale, dataGU: "", numeroGU: "" });
    }
    if (risultato.length > 0) break;
  }
  return risultato;
}

/* --------------------------------------------------------------- main */

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(aiuto());
    return;
  }

  const limite = intero("limite", 50, 1, 200);
  const testoMax = intero("testo-max", 8000, 1000, 61440);
  const dimensionePagina = intero("dimensione-pagina", 20, 5, 50);
  const dal = argomento("dal") ?? "2026-07-01";
  const al = argomento("al") ?? oggiIso();
  const out = argomento("out") ?? path.join("data", "reali", "normattiva-recenti.json");
  const apiBase = argomento("api-base");

  if (!isIsoDate(dal) || !isIsoDate(al) || dal > al) {
    console.error(`Intervallo date non valido: dal=${dal} al=${al} (formato YYYY-MM-DD).`);
    process.exitCode = 1;
    return;
  }

  const overrides: Partial<NormattivaConfig> = {
    timeoutMs: TIMEOUT_MS,
    retries: RETRIES,
    ...(apiBase ? { baseUrl: apiBase } : {}),
  };
  const baseUrl = defaultNormattivaConfig(overrides).baseUrl;

  console.log(`Ingest reale Normattiva: limite=${limite}, finestra ${dal}..${al}.`);

  let voci: VoceLista[] = [];
  let endpointUsato = "";
  const tentativi: Array<{ nome: string; path: string; fn: () => Promise<VoceLista[]> }> = [
    { nome: "listaAtti", path: "/api/v1/ricerca/listaAtti", fn: () => listaAtti(overrides, dimensionePagina) },
    { nome: "aggiornati", path: "/api/v1/ricerca/aggiornati", fn: () => listaAggiornati(overrides, dal, al) },
    { nome: "avanzata", path: "/api/v1/ricerca/avanzata", fn: () => listaAvanzata(overrides, dimensionePagina) },
  ];

  for (const tentativo of tentativi) {
    try {
      const trovate = await tentativo.fn();
      console.log(`Endpoint ${tentativo.nome}: ${trovate.length} URN reali.`);
      if (trovate.length > 0) {
        voci = trovate;
        endpointUsato = `${baseUrl}${tentativo.path}`;
        break;
      }
      console.log(`Endpoint ${tentativo.nome}: nessun atto, provo il successivo.`);
    } catch (cause) {
      console.log(`Endpoint ${tentativo.nome} fallito (${messaggioDi(cause)}), provo il successivo.`);
      if (erroreDefinitivo(cause)) {
        console.log("Errore definitivo (403/409/ERR_409): interrompo gli altri tentativi POST.");
        break;
      }
    }
  }

  if (voci.length === 0) {
    console.error("Tutti gli endpoint hanno fallito o restituito zero atti: nessun file scritto.");
    process.exitCode = 1;
    return;
  }

  const daDettagliare = voci.slice(0, limite);
  console.log(`Recupero dettagli per ${daDettagliare.length} atti (batch da ${DETTAGLI_PER_BATCH}).`);

  const atti: LawRecord[] = [];
  const visti = new Set<string>();
  const errori: string[] = [];
  let interrotto = false;

  for (let i = 0; i < daDettagliare.length && !interrotto; i += DETTAGLI_PER_BATCH) {
    const batch = daDettagliare.slice(i, i + DETTAGLI_PER_BATCH);
    for (const voce of batch) {
      if (atti.length >= limite) break;
      try {
        // Dettaglio grezzo via servizio lib: il parsing dell'involucro
        // {data:{atto:{...}}} avviene in dettaglioToRecord (solo campi reali).
        const raw = await postJson(overrides, "/api/v1/atto/dettaglio-atto-urn", {
          urn: voce.urn,
        });
        const record = dettaglioToRecord(
          voce.urn,
          voce.codice,
          voce.dataGU,
          voce.numeroGU,
          raw,
          testoMax,
        );
        if (record && !visti.has(record.chiave)) {
          visti.add(record.chiave);
          atti.push(record);
        } else if (!record) {
          errori.push(`dettaglio senza titolo/chiave: ${voce.urn}`);
        }
      } catch (cause) {
        errori.push(`dettaglio ${voce.urn}: ${messaggioDi(cause)}`);
        if (erroreDefinitivo(cause)) {
          console.log("Stop su errore definitivo (403/409/ERR_409) durante i dettagli.");
          interrotto = true;
          break;
        }
      }
    }
    if (i + DETTAGLI_PER_BATCH < daDettagliare.length && !interrotto && atti.length < limite) {
      await pausa(PAUSA_BATCH_MS);
    }
  }

  console.log(`Dettagli OK: ${atti.length}; scarti/errori: ${errori.length}.`);
  if (atti.length === 0) {
    console.error("Nessun atto reale recuperato: nessun file scritto.");
    for (const e of errori.slice(0, 10)) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  const envelope: Envelope = {
    provenance: {
      fonte: "normattiva",
      url: endpointUsato,
      recuperatoIl: new Date().toISOString(),
      licenza: LICENZA,
    },
    atti,
  };
  const json = JSON.stringify(envelope, null, 2);
  if (Buffer.byteLength(json, "utf8") > DIM_MB) {
    console.error(
      `File ${(Buffer.byteLength(json, "utf8") / DIM_MB).toFixed(2)} MB oltre il limite di 1 MB: ` +
        "nessun file scritto. Riprova con --limite piu' basso o --testo-max ridotto.",
    );
    process.exitCode = 1;
    return;
  }

  const destinazione = path.resolve(out);
  await mkdir(path.dirname(destinazione), { recursive: true });
  await writeFile(destinazione, json, "utf8");
  console.log(`Scritti ${atti.length} atti reali in ${destinazione} (${(Buffer.byteLength(json, "utf8") / 1024).toFixed(1)} KB).`);
  if (errori.length > 0) {
    console.log(`Note (${errori.length}):`);
    for (const e of errori.slice(0, 10)) console.log(`  - ${e}`);
  }
}

main().catch((cause: unknown) => {
  console.error(`Ingest fallito: ${messaggioDi(cause)}`);
  process.exitCode = 1;
});
