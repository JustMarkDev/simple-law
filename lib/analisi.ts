/**
 * Analisi di una legge in quattro risposte:
 *  1. in poche parole (una riga)
 *  2. spiegata semplice (qualche frase)
 *  3. cosa tocca: chi riguarda (parole) e le cifre (numeri)
 *  4. e' una buona legge? giudizio nel merito, separato da come e' scritta
 *
 * Con opencode attivo risponde il modello (vedi ai-provider.ts); se opencode manca o fallisce
 * si usa un'euristica offline onesta: niente voto nel merito, solo cifre
 * davvero presenti nel testo. Non lancia mai.
 */

import { chiediJSON, type ProviderOptions } from "./ai-provider";
import { calcGulpease } from "./readability";

export interface VoceChi {
  chi: string;
  effetto: string;
}

export interface VoceNumero {
  valore: string;
  cosa: string;
  /** `true` quando la cifra e' una stima del modello e non sta nel testo. */
  stima: boolean;
}

export interface Giudizio {
  /** Voto nel merito 1-10, `null` quando manca l'AI. */
  voto: number | null;
  verdetto: string;
  perche: string;
  pro: string[];
  contro: string[];
}

export interface Analisi {
  inPocheParole: string;
  spiegazione: string;
  chiRiguarda: VoceChi[];
  numeri: VoceNumero[];
  giudizio: Giudizio;
  /** Indice Gulpease 0-100: misura solo come e' scritta, non il merito. */
  leggibilita: number;
  conAI: boolean;
}

export interface AnalisiInput {
  titolo: string;
  testo: string;
  /** Fatti noti da passare al modello (tipo, data, vigenza, attuativi, iter). */
  contesto?: string[];
  /** Ripieghi offline gia' disponibili nella scheda. */
  inBreve?: string;
  chi?: string[];
  pro?: string[];
  contro?: string[];
  gulpease?: number;
}

const MAX_TESTO_AI = 24000;

function pulisci(testo: string): string {
  return (testo ?? "").replace(/\s+/g, " ").trim();
}

function tronca(testo: string, max: number): string {
  const t = pulisci(testo);
  if (t.length <= max) return t;
  const taglio = t.slice(0, max);
  const spazio = taglio.lastIndexOf(" ");
  return `${taglio.slice(0, spazio > max / 2 ? spazio : max).trim()}…`;
}

function frasi(testo: string): string[] {
  return pulisci(testo)
    .split(/(?<=[.!?])\s+/)
    .map((f) => f.trim())
    .filter(Boolean);
}

/** Cifre con unita' (euro, %, tempo): gli "articolo 3" restano fuori. */
const NUMERO_RE =
  /(?:€\s?)?\b\d{1,3}(?:\.\d{3})*(?:,\d+)?\s?(?:%|per cento|euro|€|milion[ei](?: di euro)?|miliard[io](?: di euro)?|mila euro|centesimi|giorni|mesi|anni)(?![\p{L}])/giu;

/** Estrae fino a `max` cifre dal testo, ciascuna con la frase che la contiene. */
export function estraiNumeri(testo: string, max = 4): VoceNumero[] {
  const out: VoceNumero[] = [];
  const visti = new Set<string>();
  for (const frase of frasi(testo)) {
    for (const match of frase.matchAll(NUMERO_RE)) {
      const valore = match[0].trim();
      const chiave = valore.toLowerCase();
      if (visti.has(chiave)) continue;
      visti.add(chiave);
      out.push({ valore, cosa: tronca(frase, 110), stima: false });
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** Analisi offline: nessun giudizio inventato, solo quello che dicono i dati. */
export function analisiEuristica(input: AnalisiInput): Analisi {
  const testo = pulisci(input.testo);
  const base = pulisci(input.inBreve ?? "") || frasi(testo)[0] || pulisci(input.titolo);
  const chiave = (f: string) => f.toLowerCase().replace(/[.…\s]+$/, "");
  const viste = new Set<string>();
  const inPocheParole = tronca(frasi(base)[0] ?? base, 120);
  const spiegazione = frasi([input.inBreve, testo].filter(Boolean).join(" "))
    .filter((f) => {
      const k = chiave(f);
      if (viste.has(k)) return false;
      viste.add(k);
      return true;
    })
    .slice(0, 4)
    .join(" ")
    .replace(/\.{2,}/g, ".");
  const soloTitolo = chiave(spiegazione) === chiave(inPocheParole);

  return {
    inPocheParole,
    spiegazione:
      soloTitolo || !spiegazione
        ? "Qui abbiamo solo il titolo di questo atto: per i dettagli apri la fonte ufficiale qui sotto."
        : tronca(spiegazione, 700),
    chiRiguarda: (input.chi ?? []).map((chi) => ({ chi, effetto: "" })),
    numeri: estraiNumeri(`${input.inBreve ?? ""} ${testo}`),
    giudizio: {
      voto: null,
      verdetto: "Giudizio nel merito non disponibile",
      perche:
        "Il giudizio nel merito lo scrive l'AI, che ora non ha risposto. Sotto trovi solo i segnali che emergono dai dati della scheda.",
      pro: input.pro ?? [],
      contro: input.contro ?? [],
    },
    leggibilita: input.gulpease ?? calcGulpease(testo || input.titolo).indice,
    conAI: false,
  };
}

const SYSTEM = [
  "Sei un analista indipendente di politiche pubbliche e un divulgatore.",
  "Spieghi le leggi italiane a chi non è giurista e giudichi se sono buone leggi nel merito.",
  "Sei equilibrato e non partigiano: giudichi effetti, costi e sensatezza, non il colore politico.",
  "Rispondi solo con un oggetto JSON valido, in italiano semplice, senza testo fuori dal JSON.",
].join(" ");

export function promptAnalisi(input: AnalisiInput): string {
  return [
    "Analizza questa norma e restituisci ESATTAMENTE questo JSON:",
    "{",
    '  "inPocheParole": string,        // max 15 parole: cosa fa, senza gergo',
    '  "spiegazione": string,          // 3-5 frasi brevi: cosa cambia in pratica, da quando, per quanto',
    '  "chiRiguarda": [{ "chi": string, "effetto": string }],   // 2-5 gruppi concreti e cosa cambia per loro',
    '  "numeri": [{ "valore": string, "cosa": string, "stima": boolean }],  // 2-6 cifre chiave con unità',
    '  "giudizio": {',
    '    "voto": number,               // intero 1-10, nel merito',
    '    "verdetto": string,           // max 6 parole, es. "Buona idea, scritta male"',
    '    "perche": string,             // 2-3 frasi',
    '    "pro": string[],              // 2-4 punti',
    '    "contro": string[]            // 2-4 punti',
    "  }",
    "}",
    "",
    "Regole:",
    "- numeri: usa le cifre del testo (euro, percentuali, durate, persone coinvolte). Se aggiungi una stima tua (es. quante persone tocca) metti stima=true e resta prudente. Mai inventare cifre precise.",
    "- giudizio: valuta il MERITO, non lo stile. Chiediti: risolve un problema reale? i benefici valgono i costi? chi paga? è una misura strutturale o una toppa temporanea? ci sono effetti collaterali? si può applicare davvero (decreti attuativi, risorse)?",
    "- Una legge sensata ma scritta male può avere voto alto; una legge scritta bene ma inutile o dannosa ha voto basso.",
    "- Se il testo non basta per giudicare, dai 5 e spiega cosa manca.",
    "",
    `Titolo: ${pulisci(input.titolo)}`,
    ...(input.contesto ?? []).map((riga) => `- ${riga}`),
    "",
    "Testo:",
    "---",
    tronca(input.testo, MAX_TESTO_AI),
    "---",
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function testo(value: unknown, max: number): string {
  return typeof value === "string" ? tronca(value, max) : "";
}

function testi(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => testo(v, 240))
    .filter(Boolean)
    .slice(0, max);
}

/** Valida la risposta del modello; campi mancanti ricadono sull'euristica. */
export function coerceAnalisi(raw: unknown, base: Analisi): Analisi {
  if (!isRecord(raw)) return base;
  const g = isRecord(raw.giudizio) ? raw.giudizio : {};
  const voto =
    typeof g.voto === "number" && Number.isFinite(g.voto)
      ? Math.min(10, Math.max(1, Math.round(g.voto)))
      : null;

  const chiRiguarda = Array.isArray(raw.chiRiguarda)
    ? raw.chiRiguarda
        .filter(isRecord)
        .map((v) => ({ chi: testo(v.chi, 80), effetto: testo(v.effetto, 200) }))
        .filter((v) => v.chi)
        .slice(0, 5)
    : [];

  const numeri = Array.isArray(raw.numeri)
    ? raw.numeri
        .filter(isRecord)
        .map((v) => ({
          valore: testo(v.valore, 40),
          cosa: testo(v.cosa, 140),
          stima: v.stima === true,
        }))
        .filter((v) => v.valore && v.cosa)
        .slice(0, 6)
    : [];

  return {
    inPocheParole: testo(raw.inPocheParole, 160) || base.inPocheParole,
    spiegazione: testo(raw.spiegazione, 1200) || base.spiegazione,
    chiRiguarda: chiRiguarda.length > 0 ? chiRiguarda : base.chiRiguarda,
    numeri: numeri.length > 0 ? numeri : base.numeri,
    giudizio:
      voto === null
        ? base.giudizio
        : {
            voto,
            verdetto: testo(g.verdetto, 60) || "Giudizio",
            perche: testo(g.perche, 600),
            pro: testi(g.pro, 4),
            contro: testi(g.contro, 4),
          },
    leggibilita: base.leggibilita,
    conAI: true,
  };
}

/** Analisi con AI se configurata, altrimenti euristica. Non lancia mai. */
const testoS = { type: "string" } as const;

/** Schema per l'output strutturato (API v2 di opencode). */
export const SCHEMA_ANALISI: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["inPocheParole", "spiegazione", "chiRiguarda", "numeri", "giudizio"],
  properties: {
    inPocheParole: testoS,
    spiegazione: testoS,
    chiRiguarda: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chi", "effetto"],
        properties: { chi: testoS, effetto: testoS },
      },
    },
    numeri: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["valore", "cosa", "stima"],
        properties: { valore: testoS, cosa: testoS, stima: { type: "boolean" } },
      },
    },
    giudizio: {
      type: "object",
      additionalProperties: false,
      required: ["voto", "verdetto", "perche", "pro", "contro"],
      properties: {
        voto: { type: "integer", minimum: 1, maximum: 10 },
        verdetto: testoS,
        perche: testoS,
        pro: { type: "array", items: testoS },
        contro: { type: "array", items: testoS },
      },
    },
  },
};

export async function analizza(
  input: AnalisiInput,
  options: ProviderOptions = {},
): Promise<Analisi> {
  const base = analisiEuristica(input);
  const raw = await chiediJSON(SYSTEM, promptAnalisi(input), {
    ...options,
    schema: SCHEMA_ANALISI,
  });
  return raw === null ? base : coerceAnalisi(raw, base);
}
