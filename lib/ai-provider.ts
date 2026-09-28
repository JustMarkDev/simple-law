/**
 * Provider LLM opzionale (API compatibile OpenAI).
 *
 * Se `LLM_API_KEY` (o un `apiKey` esplicito) non e' presente, si usa sempre
 * l'euristica offline `simplifyLaw`. In nessun caso la funzione lancia errori:
 * in caso di problemi di rete o risposte non valide si ricade sull'euristica.
 */

import { buildLLMPrompt, simplifyLaw } from "./simplify";
import type { SimplifiedLaw, SimplifyInput, StatoLavoroColore } from "./simplify";

export interface ProviderOptions {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  /** Iniettabile nei test per evitare chiamate reali. */
  fetchImpl?: typeof fetch;
}

export interface SimplifyProviderResult {
  usatoLLM: boolean;
  risultato: SimplifiedLaw;
}

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 20000;
const COLORI: readonly StatoLavoroColore[] = ["verde", "giallo", "rosso"];

/** Legge la configurazione LLM dall'ambiente, con default sensati. */
export function getLLMConfig(options: ProviderOptions = {}): LLMConfig {
  const apiKey = (options.apiKey ?? process.env.LLM_API_KEY ?? "").trim();
  const baseUrl = (options.baseUrl ?? process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL).trim();
  const model = (options.model ?? process.env.LLM_MODEL ?? DEFAULT_MODEL).trim();
  return {
    apiKey,
    baseUrl: baseUrl || DEFAULT_BASE_URL,
    model: model || DEFAULT_MODEL,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringhe(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const filtrato = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return filtrato.length > 0 ? filtrato : null;
}

function stringheRecord(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string" && v.trim().length > 0) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Unisce la risposta LLM (parziale) con il risultato euristico, garantendo lo schema. */
function fondiConEuristica(raw: unknown, base: SimplifiedLaw): SimplifiedLaw {
  if (!isRecord(raw)) return base;
  const risultato: SimplifiedLaw = { ...base };

  if (typeof raw.in10Secondi === "string" && raw.in10Secondi.trim()) {
    risultato.in10Secondi = raw.in10Secondi.trim();
  }
  const perTe = stringheRecord(raw.perTe);
  if (perTe) {
    // Un solo schema perTe: si accettano solo le chiavi persona della UI.
    const filtrato: Record<string, string> = {};
    for (const chiave of Object.keys(base.perTe)) {
      if (perTe[chiave]) filtrato[chiave] = perTe[chiave];
    }
    risultato.perTe = { ...base.perTe, ...filtrato };
  }

  const cosaFare = stringhe(raw.cosaFare);
  if (cosaFare) risultato.cosaFare = cosaFare;

  if (isRecord(raw.statoLavora)) {
    const colore = raw.statoLavora.colore;
    const motivo = raw.statoLavora.motivo;
    if (typeof colore === "string" && COLORI.includes(colore as StatoLavoroColore)) {
      risultato.statoLavora = {
        colore: colore as StatoLavoroColore,
        motivo: typeof motivo === "string" && motivo.trim() ? motivo.trim() : base.statoLavora.motivo,
      };
    }
  }

  if (isRecord(raw.proContro)) {
    const pro = stringhe(raw.proContro.pro);
    const contro = stringhe(raw.proContro.contro);
    risultato.proContro = {
      pro: pro ?? base.proContro.pro,
      contro: contro ?? base.proContro.contro,
    };
  }

  if (typeof raw.gulpease === "number" && Number.isFinite(raw.gulpease)) {
    risultato.gulpease = Math.round(Math.min(100, Math.max(0, raw.gulpease)));
  }

  return risultato;
}

interface ChatCompletionChoice {
  message?: { content?: unknown };
}

function estraiContenuto(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const primo = choices[0] as ChatCompletionChoice | undefined;
  const contenuto = primo?.message?.content;
  return typeof contenuto === "string" ? contenuto : null;
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const match = /\{[\s\S]*\}/.exec(content);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as unknown;
    } catch {
      return null;
    }
  }
}

async function chiamaProvider(
  config: LLMConfig,
  input: SimplifyInput,
  options: ProviderOptions,
  conFormatoJson: boolean,
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body: Record<string, unknown> = {
      model: config.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Spieghi le leggi italiane a chi non e' un giurista. Rispondi solo con JSON valido, in italiano.",
        },
        { role: "user", content: buildLLMPrompt(input.testo) },
      ],
    };
    if (conFormatoJson) body.response_format = { type: "json_object" };

    const response = await fetchImpl(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Provider LLM ha risposto ${response.status}`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Semplifica una norma usando il provider LLM se configurato, altrimenti
 * l'euristica offline. Non lancia mai eccezioni.
 */
export async function simplifyWithProvider(
  input: SimplifyInput,
  options: ProviderOptions = {},
): Promise<SimplifyProviderResult> {
  const base = simplifyLaw(input);
  const config = getLLMConfig(options);

  if (!config.apiKey) {
    return { usatoLLM: false, risultato: base };
  }

  try {
    // Budget totale condiviso tra i due tentativi (non oltre il timeout base).
    const budget = Math.max(1000, Math.floor((options.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 2));
    const tentativi: ProviderOptions = { ...options, timeoutMs: budget };
    let payload: unknown;
    try {
      payload = await chiamaProvider(config, input, tentativi, true);
    } catch {
      // Alcuni provider non supportano response_format: un solo retry senza.
      payload = await chiamaProvider(config, input, tentativi, false);
    }

    const contenuto = estraiContenuto(payload);
    if (!contenuto) return { usatoLLM: false, risultato: base };

    const parsed = parseJson(contenuto);
    if (parsed === null) return { usatoLLM: false, risultato: base };

    return { usatoLLM: true, risultato: fondiConEuristica(parsed, base) };
  } catch {
    return { usatoLLM: false, risultato: base };
  }
}
