/**
 * Qualita' della regolazione: punteggio euristico 0-100 su tre assi.
 * - processo:  qualita' dell'iter decisionale (AIR, fiducia, maxi-emendamenti/omnibus)
 * - tecnica:   qualita' redazionale (rinvii eccessivi, troppi "bis/ter")
 * - attuazione: stato dei decreti attuativi collegati
 *
 * I punteggi sono euristiche trasparenti, non valutazioni ufficiali.
 */

import { contaBisTer, contaRinvii } from "./readability";

export interface AttuativiInput {
  daAdottare: number;
  adottati: number;
  scaduti: number;
}

export type AirStato = "presente" | "esente" | "semplificata" | "assente";

export interface QualityInput {
  testo: string;
  attuativi: AttuativiInput;
  air: AirStato;
  fiducia: boolean;
  omnibus: boolean;
}

export interface QualityResult {
  processo: number;
  tecnica: number;
  attuazione: number;
  totale: number;
  giudizio: string;
}

function clamp(value: number, min = 0, max = 100): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function nonNegativo(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function punteggioProcesso(input: QualityInput): number {
  let score = 70;
  switch (input.air) {
    case "presente":
      score += 20;
      break;
    case "semplificata":
      score += 10;
      break;
    case "esente":
      score += 5;
      break;
    case "assente":
      score -= 25;
      break;
  }
  if (input.fiducia) score -= 25;
  if (input.omnibus) score -= 15;
  return Math.round(clamp(score));
}

function punteggioTecnica(input: QualityInput): number {
  let score = 85;
  const rinvii = contaRinvii(input.testo);
  const bisTer = contaBisTer(input.testo);
  score -= Math.min(30, rinvii * 1.5);
  score -= Math.min(30, bisTer * 3);
  // Un testo estremamente lungo e' piu' difficile da applicare.
  if (input.testo.length > 40000) score -= 10;
  return Math.round(clamp(score));
}

function punteggioAttuazione(attuativi: AttuativiInput): number {
  const adottati = nonNegativo(attuativi.adottati);
  const daAdottare = nonNegativo(attuativi.daAdottare);
  const scaduti = nonNegativo(attuativi.scaduti);
  const totale = adottati + daAdottare + scaduti;
  if (totale === 0) return 70; // nessun obbligo di attuazione: neutro
  const quotaAdottati = adottati / totale;
  const quotaScaduti = scaduti / totale;
  const score = 100 * quotaAdottati - 40 * quotaScaduti;
  return Math.round(clamp(score));
}

function giudizioDaTotale(totale: number): string {
  if (totale >= 85) return "ottimo";
  if (totale >= 70) return "buono";
  if (totale >= 55) return "sufficiente";
  if (totale >= 40) return "insufficiente";
  return "scarso";
}

/** Calcola il punteggio di qualita' complessivo di un atto normativo. */
export function scoreQuality(input: QualityInput): QualityResult {
  const processo = punteggioProcesso(input);
  const tecnica = punteggioTecnica(input);
  const attuazione = punteggioAttuazione(input.attuativi);
  const totale = Math.round(clamp(processo * 0.3 + tecnica * 0.35 + attuazione * 0.35));
  return { processo, tecnica, attuazione, totale, giudizio: giudizioDaTotale(totale) };
}
