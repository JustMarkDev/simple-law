/**
 * AI via opencode (https://opencode.ai), con il modello della sottoscrizione
 * opencode-go. Supporta entrambe le API del server opencode:
 *  - v2: output strutturato con JSON Schema (`format: json_schema`);
 *  - v1: risposta testuale da cui si estrae il JSON.
 * Con `SL_OPENCODE_API=auto` (default) prova v2 e ricade su v1. Se il modello
 * non regge l'output strutturato, la v2 ripiega sul testo.
 *
 * Senza `SL_OPENCODE_URL` avvia da solo un `opencode serve` locale (serve il
 * comando `opencode` nel PATH, gia' autenticato). Non lancia mai: in caso di
 * problemi restituisce `null` e chi chiama usa l'euristica offline.
 */

import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createOpencodeClient as clientV1 } from "@opencode-ai/sdk";
import { createOpencodeClient as clientV2, createOpencodeServer } from "@opencode-ai/sdk/v2";

export type OpencodeApi = "v1" | "v2" | "auto";

export interface ProviderOptions {
  /** Server opencode gia' avviato (es. `http://127.0.0.1:4096`). */
  url?: string;
  /** Formato `provider/modello`. */
  model?: string;
  api?: OpencodeApi;
  timeoutMs?: number;
  /** `true` spegne l'AI (test, ambienti senza opencode). */
  disattivata?: boolean;
  /** Iniettabile nei test per evitare chiamate reali. */
  fetchImpl?: typeof fetch;
}

export interface OpencodeConfig {
  url: string | null;
  providerID: string;
  modelID: string;
  api: OpencodeApi;
  timeoutMs: number;
  attiva: boolean;
}

const MODELLO_DEFAULT = "opencode-go/muse-spark-1.3-contributor";
const TIMEOUT_DEFAULT = 120_000;
const AGENTE = "simple-law";

/** Modelli che hanno gia' rifiutato l'output strutturato in questo processo. */
const senzaStrutturato = new Set<string>();

/** Nessuno strumento: il modello deve solo leggere e rispondere. */
const NIENTE_STRUMENTI: Record<string, boolean> = {
  "*": false,
  bash: false,
  edit: false,
  write: false,
  read: false,
  glob: false,
  grep: false,
  list: false,
  patch: false,
  task: false,
  todowrite: false,
  todoread: false,
  webfetch: false,
  websearch: false,
};

export function getOpencodeConfig(options: ProviderOptions = {}): OpencodeConfig {
  const env = process.env;
  const [providerID, ...resto] = (options.model ?? env.SL_OPENCODE_MODEL ?? MODELLO_DEFAULT)
    .trim()
    .split("/");
  const apiGrezza = (options.api ?? env.SL_OPENCODE_API ?? "auto").trim().toLowerCase();
  const api: OpencodeApi = apiGrezza === "v1" || apiGrezza === "v2" ? apiGrezza : "auto";
  const timeout = Number(env.SL_OPENCODE_TIMEOUT_MS);
  const spenta =
    options.disattivata ??
    ["off", "0", "false"].includes((env.SL_OPENCODE ?? "").trim().toLowerCase());
  return {
    url: (options.url ?? env.SL_OPENCODE_URL ?? "").trim() || null,
    providerID: providerID || "opencode-go",
    modelID: resto.join("/") || "muse-spark-1.3-contributor",
    api,
    timeoutMs:
      options.timeoutMs ?? (Number.isFinite(timeout) && timeout > 0 ? timeout : TIMEOUT_DEFAULT),
    attiva: !spenta,
  };
}

/** `true` se l'AI e' configurata (non garantisce che opencode risponda). */
export function aiAttiva(): boolean {
  return getOpencodeConfig().attiva;
}

/* ---------------------------------------------------------------------------
 * Server locale: uno solo per processo (anche con l'HMR di `next dev`).
 * ------------------------------------------------------------------------- */

interface StatoServer {
  url?: Promise<string>;
  fallitoAlle?: number;
}

const globale = globalThis as typeof globalThis & { __slOpencode?: StatoServer };
const stato: StatoServer = (globale.__slOpencode ??= {});

/** Cartella vuota: opencode non legge il repo ne' i suoi AGENTS.md. */
function cartellaIsolata(): string {
  const dir = path.join(tmpdir(), "simple-law-opencode");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function serverLocale(): Promise<string> {
  // Dopo un avvio fallito aspetta un minuto prima di riprovare.
  if (stato.fallitoAlle && Date.now() - stato.fallitoAlle < 60_000) {
    return Promise.reject(new Error("opencode non disponibile"));
  }
  stato.url ??= createOpencodeServer({
    port: 0,
    timeout: 30_000,
    config: {
      permission: "deny",
      tools: NIENTE_STRUMENTI,
      agent: {
        [AGENTE]: {
          mode: "primary",
          description: "Analisi di leggi italiane, solo testo, nessuno strumento.",
          prompt: "Rispondi solo con quello che ti viene chiesto, senza usare strumenti.",
          tools: NIENTE_STRUMENTI,
          permission: "deny",
        },
      },
    },
  }).then(
    (server) => {
      process.once("exit", () => server.close());
      return server.url;
    },
    (errore: unknown) => {
      stato.url = undefined;
      stato.fallitoAlle = Date.now();
      throw errore;
    },
  );
  return stato.url;
}

/* ---------------------------------------------------------------------------
 * Chiamate v1 / v2.
 * ------------------------------------------------------------------------- */

interface Richiesta {
  baseUrl: string;
  config: OpencodeConfig;
  system: string;
  user: string;
  schema?: Record<string, unknown>;
  /** Solo sul server avviato da noi esiste l'agente dedicato. */
  agente?: string;
  fetchImpl?: typeof fetch;
}

interface RispostaPrompt {
  info?: { error?: unknown; structured?: unknown };
  parts?: { type?: string; text?: string }[];
}

function testoDelleParti(parti: RispostaPrompt["parts"]): string {
  return (parti ?? [])
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

function leggiRisposta(data: RispostaPrompt | undefined, strutturata: boolean): unknown {
  if (!data || data.info?.error) return null;
  if (strutturata && data.info?.structured !== undefined) return data.info.structured;
  return parseJson(testoDelleParti(data.parts));
}

async function viaV2(r: Richiesta): Promise<unknown> {
  const directory = cartellaIsolata();
  const client = clientV2({ baseUrl: r.baseUrl, directory, fetch: r.fetchImpl });
  const segnale = AbortSignal.timeout(r.config.timeoutMs);
  const sessione = await client.session.create(
    {
      title: "simple-law",
      permission: [{ permission: "*", pattern: "*", action: "deny" }],
    },
    { throwOnError: true, signal: segnale },
  );
  try {
    const risposta = await client.session.prompt(
      {
        sessionID: sessione.data.id,
        model: { providerID: r.config.providerID, modelID: r.config.modelID },
        agent: r.agente,
        system: r.system,
        tools: NIENTE_STRUMENTI,
        format: r.schema ? { type: "json_schema", schema: r.schema, retryCount: 1 } : undefined,
        parts: [{ type: "text", text: r.user }],
      },
      { throwOnError: true, signal: segnale },
    );
    return leggiRisposta(risposta.data as RispostaPrompt, Boolean(r.schema));
  } finally {
    void client.session.delete({ sessionID: sessione.data.id }).catch(() => undefined);
  }
}

async function viaV1(r: Richiesta): Promise<unknown> {
  const directory = cartellaIsolata();
  const client = clientV1({ baseUrl: r.baseUrl, directory, fetch: r.fetchImpl });
  const segnale = AbortSignal.timeout(r.config.timeoutMs);
  const sessione = await client.session.create({
    body: { title: "simple-law" },
    throwOnError: true,
    signal: segnale,
  });
  try {
    const risposta = await client.session.prompt({
      path: { id: sessione.data.id },
      body: {
        model: { providerID: r.config.providerID, modelID: r.config.modelID },
        agent: r.agente,
        system: r.system,
        tools: NIENTE_STRUMENTI,
        parts: [{ type: "text", text: r.user }],
      },
      throwOnError: true,
      signal: segnale,
    });
    return leggiRisposta(risposta.data as RispostaPrompt, false);
  } finally {
    void client.session.delete({ path: { id: sessione.data.id } }).catch(() => undefined);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(content: string): unknown {
  const pulito = content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(pulito) as unknown;
  } catch {
    const match = /\{[\s\S]*\}/.exec(pulito);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as unknown;
    } catch {
      return null;
    }
  }
}

/**
 * Chiede a opencode una risposta JSON. `schema` (JSON Schema) attiva l'output
 * strutturato sulla v2; sulla v1 il JSON si estrae dal testo. Restituisce
 * l'oggetto letto, oppure `null` se l'AI e' spenta o qualcosa va storto.
 */
export async function chiediJSON(
  system: string,
  user: string,
  options: ProviderOptions & { schema?: Record<string, unknown> } = {},
): Promise<Record<string, unknown> | null> {
  const config = getOpencodeConfig(options);
  if (!config.attiva) return null;

  let baseUrl: string;
  try {
    baseUrl = config.url ?? (await serverLocale());
  } catch {
    return null;
  }

  const richiesta: Richiesta = {
    baseUrl,
    config,
    system,
    user,
    schema: options.schema,
    agente: config.url ? undefined : AGENTE,
    fetchImpl: options.fetchImpl,
  };
  // Alcuni modelli (es. muse-spark) accettano solo `tool_choice: "auto"` e
  // rifiutano l'output strutturato della v2: si ripiega su v2 testuale e ci si
  // ricorda del modello per non sprecare la chiamata le volte successive.
  const modello = `${config.providerID}/${config.modelID}`;
  const strutturato = Boolean(richiesta.schema) && !senzaStrutturato.has(modello);
  const tentativi: { api: "v1" | "v2"; schema: boolean }[] = [];
  if (config.api !== "v1") {
    if (strutturato) tentativi.push({ api: "v2", schema: true });
    tentativi.push({ api: "v2", schema: false });
  }
  if (config.api !== "v2") tentativi.push({ api: "v1", schema: false });

  for (const { api, schema } of tentativi) {
    try {
      const r = { ...richiesta, schema: schema ? richiesta.schema : undefined };
      const risultato = api === "v2" ? await viaV2(r) : await viaV1(r);
      if (isRecord(risultato)) return risultato;
    } catch {
      // prova il tentativo successivo
    }
    if (schema) senzaStrutturato.add(modello);
  }
  return null;
}
