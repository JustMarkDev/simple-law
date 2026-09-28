/**
 * Semplificatore offline (euristico) di testi normativi.
 * Produce le "5 caselle" mostrate dall'interfaccia, senza alcuna chiamata di rete.
 * Un provider LLM opzionale puo' sostituire questa euristica (vedi ai-provider.ts).
 */

import { calcGulpease, contaBisTer, contaRinvii } from "./readability";
import type { AirStato, AttuativiInput } from "./quality";
import { scoreQuality } from "./quality";

export type StatoLavoroColore = "verde" | "giallo" | "rosso";

export interface SimplifiedLaw {
  in10Secondi: string;
  perTe: Record<string, string>;
  cosaFare: string[];
  statoLavora: { colore: StatoLavoroColore; motivo: string };
  proContro: { pro: string[]; contro: string[] };
  gulpease: number;
}

export interface SimplifyInput {
  titolo: string;
  testo: string;
  eli?: string;
  air?: AirStato;
  attuativi?: AttuativiInput;
}

const ATTUATIVI_VUOTI: AttuativiInput = { daAdottare: 0, adottati: 0, scaduti: 0 };

function normalizza(testo: string): string {
  return (testo ?? "").replace(/\s+/g, " ").trim();
}

function primaFrase(testo: string): string {
  const pulito = normalizza(testo);
  if (!pulito) return "";
  const match = /^(.+?[.!?])(?:\s|$)/.exec(pulito);
  return (match?.[1] ?? pulito).trim();
}

function tronca(testo: string, max: number): string {
  const pulito = normalizza(testo);
  if (pulito.length <= max) return pulito;
  const tagliato = pulito.slice(0, max);
  const ultimoSpazio = tagliato.lastIndexOf(" ");
  return `${tagliato.slice(0, ultimoSpazio > 40 ? ultimoSpazio : max).trim()}...`;
}

function minuscolaIniziale(testo: string): string {
  if (!testo) return testo;
  return testo.charAt(0).toLowerCase() + testo.slice(1);
}

function statoLavoro(
  totale: number,
  attuativi: AttuativiInput,
): { colore: StatoLavoroColore; motivo: string } {
  if (attuativi.scaduti > 0) {
    return {
      colore: "rosso",
      motivo: `Ci sono ${attuativi.scaduti} decreti attuativi scaduti: l'attuazione e' in ritardo.`,
    };
  }
  if (attuativi.daAdottare > 0) {
    return {
      colore: "giallo",
      motivo: `Restano ${attuativi.daAdottare} decreti attuativi da adottare prima che la norma sia pienamente operativa.`,
    };
  }
  if (totale >= 70) {
    return {
      colore: "verde",
      motivo: "L'iter e' completo e non risultano decreti attuativi mancanti.",
    };
  }
  return {
    colore: "giallo",
    motivo: "La norma e' in vigore ma presenta alcuni elementi di criticita' da monitorare.",
  };
}

function costruisciPerTe(titolo: string, sintesi: string): Record<string, string> {
  const oggetto = minuscolaIniziale(titolo || "questa norma");
  const sintesiPulita = tronca(sintesi || titolo, 220);
  return {
    guida: `Se guidi o usi un mezzo, controlla se cambiano costi o regole. Riguarda ${oggetto}. In pratica: ${sintesiPulita}`,
    lavoro: `Se lavori come dipendente, verifica obblighi, tutele e scadenze. In pratica: ${sintesiPulita}`,
    impresa: `Se hai un'attivita', verifica gli obblighi e le opportunita' introdotte dalla norma e le eventuali scadenze. In pratica: ${sintesiPulita}`,
    studio: `Se studi, verifica borse, agevolazioni e servizi. In pratica: ${sintesiPulita}`,
  };
}

function costruisciCosaFare(input: SimplifyInput, attuativi: AttuativiInput): string[] {
  const azioni = [
    "Consulta il testo ufficiale sulla Gazzetta Ufficiale o su Normattiva.",
    "Verifica se rientri tra i destinatari e se la norma ti riguarda direttamente.",
  ];
  if (attuativi.daAdottare > 0 || attuativi.scaduti > 0) {
    azioni.push(
      "Tieni d'occhio i decreti attuativi: senza di essi alcune regole potrebbero non essere ancora operative.",
    );
  }
  if (input.air === "assente") {
    azioni.push("Non risulta una analisi di impatto (AIR): valuta con attenzione costi e adempimenti.");
  }
  azioni.push("Per chiarimenti rivolgiti all'amministrazione competente indicata nel testo.");
  return azioni;
}

function costruisciProContro(
  input: SimplifyInput,
  gulpease: number,
  rinvii: number,
  bisTer: number,
): { pro: string[]; contro: string[] } {
  const pro: string[] = [];
  const contro: string[] = [];

  if (input.air === "presente" || input.air === "semplificata") {
    pro.push("E' stata svolta una analisi di impatto: costi e benefici sono documentati.");
  }
  if (input.attuativi && input.attuativi.adottati > 0) {
    pro.push("Alcuni decreti attuativi sono gia' stati adottati.");
  }
  if (gulpease >= 60) {
    pro.push("Il testo e' relativamente leggibile.");
  }

  if (input.air === "assente" || input.air === "esente") {
    contro.push("L'impatto della norma non e' stato valutato con una analisi completa (AIR).");
  }
  if (input.attuativi && input.attuativi.scaduti > 0) {
    contro.push("Ci sono decreti attuativi scaduti, quindi parti della norma potrebbero non essere operative.");
  }
  if (rinvii > 4) {
    contro.push(`Il testo contiene molti rinvii ad altre norme (${rinvii}): la lettura richiede collegamenti esterni.`);
  }
  if (bisTer > 2) {
    contro.push(`Sono presenti ${bisTer} articoli o commi aggiunti (bis/ter): il quadro normativo e' frammentato.`);
  }
  if (gulpease < 60) {
    contro.push("Il linguaggio e' complesso per un lettore non specialista.");
  }

  if (pro.length === 0) pro.push("La norma interviene su un tema di interesse pubblico dichiarato.");
  if (contro.length === 0) contro.push("Non sono emerse criticita' rilevanti dalle metriche automatiche.");
  return { pro, contro };
}

/** Euristica per segnalare testi "omnibus" (molti rinvii e molta materia). */
function rinviiIndicatore(testo: string): boolean {
  return contaRinvii(testo) > 8;
}

/** Semplifica un atto normativo con l'euristica offline. */
export function simplifyLaw(input: SimplifyInput): SimplifiedLaw {
  const testo = normalizza(input.testo);
  const titolo = normalizza(input.titolo);
  const attuativi = input.attuativi ?? ATTUATIVI_VUOTI;

  const gulpease = calcGulpease(testo || titolo).indice;
  const qualita = scoreQuality({
    testo,
    attuativi,
    air: input.air ?? "assente",
    fiducia: false,
    omnibus: rinviiIndicatore(testo),
  });

  return {
    in10Secondi: `In breve: ${tronca(primaFrase(testo) || titolo, 180)}`,
    perTe: costruisciPerTe(titolo, primaFrase(testo)),
    cosaFare: costruisciCosaFare(input, attuativi),
    statoLavora: statoLavoro(qualita.totale, attuativi),
    proContro: costruisciProContro(input, gulpease, contaRinvii(testo), contaBisTer(testo)),
    gulpease,
  };
}

/** Prompt per il provider LLM: richiede esattamente la struttura di SimplifiedLaw. */
export function buildLLMPrompt(testo: string): string {
  const schema = [
    "{",
    '  "in10Secondi": string,',
    '  "perTe": { "guida": string, "lavoro": string, "impresa": string, "studio": string },',
    '  "cosaFare": string[],',
    '  "statoLavora": { "colore": "verde" | "giallo" | "rosso", "motivo": string },',
    '  "proContro": { "pro": string[], "contro": string[] },',
    '  "gulpease": number',
    "}",
  ].join("\n");

  return [
    "Sei un assistente che spiega le leggi italiane a chi non e' un giurista.",
    "Rispondi SEMPRE e SOLO con un oggetto JSON valido, in lingua italiana, senza testo fuori dal JSON.",
    "Non usare termini tecnici senza spiegarli. Sii concreto e neutrale.",
    "",
    "Restituisci esattamente questa struttura:",
    schema,
    "",
    "Testo della norma da semplificare:",
    "---",
    normalizza(testo),
    "---",
  ].join("\n");
}
