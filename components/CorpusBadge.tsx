import Link from 'next/link';
import { BookOpen01Icon } from 'hugeicons-react';

export interface CorpusBadgeProps {
  /** Numero totale di norme nel corpus. */
  totale: number;
  /** Quante schede sono a scopo dimostrativo. */
  dimostrative?: number;
  /** Quanti atti provengono da `data/reali/` (naming §3). */
  ufficiali?: number;
  /** Alias futuro da `getCorpusInfo` esteso (`{base,espansi,reali,totale}`). */
  reali?: number;
}

function numeroSano(valore: unknown): number {
  return typeof valore === 'number' && Number.isFinite(valore) && valore > 0
    ? Math.floor(valore)
    : 0;
}

function formattaNumero(valore: number): string {
  try {
    return new Intl.NumberFormat('it-IT').format(valore);
  } catch {
    return String(valore);
  }
}

/**
 * Riepilogo accogliente del corpus, in parole semplici.
 * Componente puro (solo props, nessun accesso dati). Non lancia mai:
 * se `totale` non è valido restituisce `null` (nascosto).
 */
export default function CorpusBadge({ totale, dimostrative, ufficiali, reali }: CorpusBadgeProps) {
  try {
    const totaleSano = numeroSano(totale);
    if (totaleSano <= 0) return null;
    const ufficialiGrezzi = ufficiali ?? reali ?? 0;
    const ufficialiSani = Math.min(numeroSano(ufficialiGrezzi), totaleSano);
    const dimostrativeSane = Math.min(numeroSano(dimostrative), totaleSano);
    const haUfficiali = ufficialiSani > 0;
    const haDimostrative = dimostrativeSane > 0;

    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-regola bg-carta px-4 py-3 dark:border-notte-deep dark:bg-notte-soft">
        <span
          aria-hidden="true"
          className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg bg-carta-soft text-accento dark:bg-notte-deep dark:text-accento-chiara"
        >
          <BookOpen01Icon size={22} strokeWidth={2} />
        </span>
        <p className="text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
          <strong className="font-bold text-inchiostro dark:text-nebbia">
            {formattaNumero(totaleSano)} {totaleSano === 1 ? 'norma in tutto' : 'norme in tutto'}
          </strong>
          {haUfficiali && (
            <span>
              {' '}
              {formattaNumero(ufficialiSani)} dalle fonti ufficiali
              {haDimostrative && `, ${formattaNumero(dimostrativeSane)} di prova`}
            </span>
          )}
          {!haUfficiali && haDimostrative && (
            <span> {formattaNumero(dimostrativeSane)} di prova</span>
          )}
        </p>
        <Link
          href="/leggi"
          className="inline-flex min-h-[48px] items-center text-sm font-bold text-accento underline underline-offset-4 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento dark:text-accento-chiara dark:focus-visible:outline-accento-chiara"
        >
          Vedi tutte le norme
        </Link>
      </div>
    );
  } catch {
    return null;
  }
}
