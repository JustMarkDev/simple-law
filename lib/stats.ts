/**
 * Statistiche di corpus e snapshot economico.
 *
 * Le funzioni di aggregazione sono pure e deterministiche: ricevono una lista
 * di record normativi (strutturalmente compatibili con `LawRecord`) e
 * restituiscono conteggi e medie. Non lanciano mai eccezioni e ignorano i
 * valori mancanti o non numerici.
 */

import { scoreQuality } from "./quality";
import type { AirStato, AttuativiInput } from "./quality";

/** Vista minima di una norma necessaria alle statistiche. */
export interface StatLaw {
  readonly tipo?: string;
  readonly dataEmanazione?: string;
  readonly titolo?: string;
  readonly sintesi?: string;
  readonly testo?: string;
  readonly gulpease?: number | null;
  readonly air?: AirStato;
  readonly attuativi?: AttuativiInput;
  readonly fiducia?: boolean;
  readonly omnibus?: boolean;
  /** Punteggio di qualita' gia' calcolato (es. in `extra.qualita`). */
  readonly qualita?: number;
}

export interface AttuativiTotali {
  daAdottare: number;
  adottati: number;
  scaduti: number;
  totale: number;
}

export interface CorpusStats {
  totale: number;
  perAnno: Record<string, number>;
  perTipo: Record<string, number>;
  gulpeaseMedio: number | null;
  attuativiTotali: AttuativiTotali;
  airDistribuzione: Record<string, number>;
  qualitaMedia: number | null;
}

function annoDi(law: StatLaw): string {
  const data = law.dataEmanazione ?? "";
  const anno = data.slice(0, 4);
  return /^\d{4}$/.test(anno) ? anno : "n.d.";
}

function ordinaChiavi(record: Record<string, number>): Record<string, number> {
  const ordinato: Record<string, number> = {};
  for (const chiave of Object.keys(record).sort((a, b) => a.localeCompare(b))) {
    ordinato[chiave] = record[chiave] ?? 0;
  }
  return ordinato;
}

/** Conteggio delle norme per anno di emanazione. */
export function contaPerAnno(laws: readonly StatLaw[]): Record<string, number> {
  const conteggio: Record<string, number> = {};
  for (const law of laws) {
    const anno = annoDi(law);
    conteggio[anno] = (conteggio[anno] ?? 0) + 1;
  }
  return ordinaChiavi(conteggio);
}

/** Conteggio delle norme per tipo (`decreto.legge`, `legge`, ...). */
export function contaPerTipo(laws: readonly StatLaw[]): Record<string, number> {
  const conteggio: Record<string, number> = {};
  for (const law of laws) {
    const tipo = (law.tipo ?? "").trim() || "non classificato";
    conteggio[tipo] = (conteggio[tipo] ?? 0) + 1;
  }
  return ordinaChiavi(conteggio);
}

function media(valori: readonly number[]): number | null {
  const validi = valori.filter((v) => Number.isFinite(v));
  if (validi.length === 0) return null;
  const somma = validi.reduce((acc, v) => acc + v, 0);
  return Math.round((somma / validi.length) * 10) / 10;
}

/** Media dell'indice Gulpease; `null` se nessun valore disponibile. */
export function gulpeaseMedio(laws: readonly StatLaw[]): number | null {
  return media(laws.map((law) => law.gulpease).filter((v): v is number => typeof v === "number"));
}

/** Somma dei decreti attuativi su tutto il corpus. */
export function attuativiTotali(laws: readonly StatLaw[]): AttuativiTotali {
  const totale: AttuativiTotali = { daAdottare: 0, adottati: 0, scaduti: 0, totale: 0 };
  for (const law of laws) {
    const att = law.attuativi;
    if (!att) continue;
    const daAdottare = Number.isFinite(att.daAdottare) ? att.daAdottare : 0;
    const adottati = Number.isFinite(att.adottati) ? att.adottati : 0;
    const scaduti = Number.isFinite(att.scaduti) ? att.scaduti : 0;
    totale.daAdottare += daAdottare;
    totale.adottati += adottati;
    totale.scaduti += scaduti;
  }
  totale.totale = totale.daAdottare + totale.adottati + totale.scaduti;
  return totale;
}

const AIR_KEYS: readonly (AirStato | "nonNoto")[] = [
  "presente",
  "esente",
  "semplificata",
  "assente",
  "nonNoto",
];

/** Distribuzione dei valori AIR sul corpus (include la voce `nonNoto`). */
export function airDistribuzione(laws: readonly StatLaw[]): Record<string, number> {
  const conteggio: Record<string, number> = {};
  for (const chiave of AIR_KEYS) conteggio[chiave] = 0;
  for (const law of laws) {
    const air = law.air;
    if (air && AIR_KEYS.includes(air)) conteggio[air] += 1;
    else conteggio.nonNoto += 1;
  }
  return conteggio;
}

/** Punteggio di qualita' di una norma: usa quello memorizzato o lo ricalcola. */
export function qualitaDi(law: StatLaw): number | null {
  if (typeof law.qualita === "number" && Number.isFinite(law.qualita)) {
    return Math.round(law.qualita);
  }
  const testo = law.testo ?? law.sintesi ?? law.titolo ?? "";
  if (!testo) return null;
  const attuativi = law.attuativi ?? { daAdottare: 0, adottati: 0, scaduti: 0 };
  return scoreQuality({
    testo,
    attuativi,
    air: law.air ?? "assente",
    fiducia: law.fiducia ?? false,
    omnibus: law.omnibus ?? false,
  }).totale;
}

/** Media del punteggio di qualita'; `null` se non calcolabile. */
export function qualitaMedia(laws: readonly StatLaw[]): number | null {
  return media(laws.map((law) => qualitaDi(law)).filter((v): v is number => typeof v === "number"));
}

/** Aggregato completo del corpus. */
export function buildStats(laws: readonly StatLaw[]): CorpusStats {
  return {
    totale: laws.length,
    perAnno: contaPerAnno(laws),
    perTipo: contaPerTipo(laws),
    gulpeaseMedio: gulpeaseMedio(laws),
    attuativiTotali: attuativiTotali(laws),
    airDistribuzione: airDistribuzione(laws),
    qualitaMedia: qualitaMedia(laws),
  };
}

/* ---------------------------------------------------------------------------
 * Snapshot economico curato.
 *
 * Valori illustrativi, non aggiornati automaticamente: ogni voce dichiara
 * fonte e periodo di riferimento. Servono da contesto per le statistiche
 * normative, non come dato ufficiale.
 * ------------------------------------------------------------------------- */

export interface IndicatoreEconomico {
  readonly indicatore: string;
  readonly valore: number;
  readonly unita: string;
  readonly fonte: string;
  readonly periodo: string;
  readonly nota: string;
}

export const ECONOMIA_SNAPSHOT: readonly IndicatoreEconomico[] = [
  {
    indicatore: "PIL (variazione annua)",
    valore: 0.9,
    unita: "percentuale",
    fonte: "ISTAT, conti nazionali",
    periodo: "2025",
    nota: "Snapshot curato a scopo dimostrativo.",
  },
  {
    indicatore: "Debito pubblico / PIL",
    valore: 137.3,
    unita: "percentuale",
    fonte: "MEF, Documento di economia e finanza",
    periodo: "2025",
    nota: "Snapshot curato a scopo dimostrativo.",
  },
  {
    indicatore: "Inflazione NIC (variazione annua)",
    valore: 1.7,
    unita: "percentuale",
    fonte: "ISTAT, indice dei prezzi al consumo",
    periodo: "2025",
    nota: "Snapshot curato a scopo dimostrativo.",
  },
  {
    indicatore: "Tasso di occupazione (15-64 anni)",
    valore: 62.8,
    unita: "percentuale",
    fonte: "ISTAT, Rilevazione sulle forze di lavoro",
    periodo: "2025",
    nota: "Snapshot curato a scopo dimostrativo.",
  },
  {
    indicatore: "Spesa pensionistica / PIL",
    valore: 15.4,
    unita: "percentuale",
    fonte: "Ragioneria generale dello Stato",
    periodo: "2025",
    nota: "Snapshot curato a scopo dimostrativo.",
  },
] as const;

/** Etichetta di aggiornamento dello snapshot economico. */
export const ECONOMIA_AGGIORNATO_AL = "2025-12-31";
