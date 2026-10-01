/**
 * Metriche di leggibilita' per testi normativi italiani.
 *
 * - Indice Gulpease (Lucisano-Piemontese, 1988):
 *     `89 + (300 * frasi - 10 * lettere) / parole`  (clamp 0..100)
 * - Flesch-Vacca (Vacca-Franchina, 1972), adattamento italiano:
 *     `206 - 0.65 * sillabePerParola - parolePerFrase`
 *   Il numero di sillabe e' stimato dai gruppi vocalici.
 */

export interface GulpeaseResult {
  indice: number;
  parole: number;
  frasi: number;
  lettere: number;
}

export type LivelloLettura = "facile" | "medio" | "difficile";

const PAROLA_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const LETTERA_RE = /\p{L}/u;
const FRASE_RE = /[.!?]+(?:\s|$)/g;
const VOCALI = "aeiouàèéìíîòóùú";

/** Divide il testo in parole (lettere/numeri, apostrofi interni inclusi). */
export function contaParole(testo: string): number {
  if (!testo) return 0;
  return (testo.match(PAROLA_RE) ?? []).length;
}

/** Conta le lettere (esclusi numeri, spazi e punteggiatura). */
export function contaLettere(testo: string): number {
  if (!testo) return 0;
  let total = 0;
  for (const ch of testo) {
    if (LETTERA_RE.test(ch)) total += 1;
  }
  return total;
}

/** Conta le frasi in base ai segni di fine periodo. Minimo 1 se c'e' testo. */
export function contaFrasi(testo: string): number {
  if (!testo || !testo.trim()) return 0;
  const matches = testo.match(FRASE_RE);
  if (matches && matches.length > 0) return matches.length;
  return contaParole(testo) > 0 ? 1 : 0;
}

/** Stima il numero di sillabe di una parola contando i gruppi vocalici. */
export function stimaSillabe(parola: string): number {
  let count = 0;
  let precedenteVocale = false;
  for (const ch of parola.toLowerCase()) {
    const isVocale = VOCALI.includes(ch);
    if (isVocale && !precedenteVocale) count += 1;
    precedenteVocale = isVocale;
  }
  return Math.max(1, count);
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Calcola l'indice Gulpease con i conteggi usati nella formula. */
export function calcGulpease(testo: string): GulpeaseResult {
  const parole = contaParole(testo);
  const frasi = contaFrasi(testo);
  const lettere = contaLettere(testo);

  if (parole === 0) {
    return { indice: 0, parole, frasi, lettere };
  }

  const grezzo = 89 + (300 * frasi - 10 * lettere) / parole;
  return { indice: Math.round(clamp(grezzo, 0, 100)), parole, frasi, lettere };
}

/** Calcola l'indice di Flesch-Vacca (adattamento italiano, 1972). */
export function calcFleschVacca(testo: string): number {
  const parole = contaParole(testo);
  const frasi = contaFrasi(testo);
  if (parole === 0 || frasi === 0) return 0;

  const paroleArr = testo.match(PAROLA_RE) ?? [];
  const sillabe = paroleArr.reduce((acc, p) => acc + stimaSillabe(p), 0);
  const sillabePerParola = sillabe / parole;
  const parolePerFrase = parole / frasi;

  const grezzo = 206 - 0.65 * sillabePerParola - parolePerFrase;
  return Math.round(clamp(grezzo, 0, 100));
}

const RINVIO_RE =
  /\b(?:artt?\.|articol[oi])\s*\d+|\b(?:costituzione|legge|decret[oi](?:[-\s]legge|[-\s]legislativ[oi])?|d\.?\s?lgs\.?|d\.?\s?l\.?|d\.?\s?p\.?\s?r\.?|d\.?\s?p\.?\s?c\.?\s?m\.?|regolamento|direttiva)\s+(?:n\.\s*)?\d+/gi;

/** Conta i rinvii ad altri atti o articoli (es. "art. 5", "legge n. 3"). */
export function contaRinvii(testo: string): number {
  if (!testo) return 0;
  return (testo.match(RINVIO_RE) ?? []).length;
}

const BIS_TER_RE =
  /\b\d+[-\s]?(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)\b/gi;

/** Conta gli articoli/commi aggiuntivi (es. "1-bis", "2 ter", "3-quater"). */
export function contaBisTer(testo: string): number {
  if (!testo) return 0;
  return (testo.match(BIS_TER_RE) ?? []).length;
}

/**
 * Classifica la leggibilita' a partire dall'indice Gulpease.
 * Soglie ispirate ai livelli scolastici GULP: >=80 facile, >=60 medio, <60 difficile.
 */
export function livelloSemplice(gulpease: number): LivelloLettura {
  if (gulpease >= 80) return "facile";
  if (gulpease >= 60) return "medio";
  return "difficile";
}

/** Etichetta in parole per l'indice Gulpease (scala per titolo di studio). */
export function paroleLeggibilita(gulpease: number): string {
  if (gulpease >= 80) return "Facile per quasi tutti";
  if (gulpease >= 60) return "Facile con la licenza media";
  if (gulpease >= 40) return "Serve almeno il diploma";
  return "Difficile anche con il diploma";
}
