import Link from 'next/link';
import { AlertCircleIcon, InformationCircleIcon } from 'hugeicons-react';

interface DisclaimerProps {
  variant?: 'inline' | 'banner' | 'compact';
  className?: string;
}

const TEXT = 'Solo a scopo informativo, non è un parere legale.';
const REALE =
  'Da sapere: qui trovi solo atti veri dalle fonti ufficiali. Le spiegazioni sono nostre, il testo che conta è quello ufficiale.';
const AMBIENTE_PROVA =
  'In un ambiente di prova per sviluppatori possono comparire esempi a scopo di test.';

const LINK_FOCUS =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:focus-visible:outline-accento-chiara';

/**
 * Avviso in parole semplici, per un sito che mostra solo atti veri.
 * Icone dalla famiglia Hugeicons, angoli arrotondati cozy, nessun glifo disegnato a mano.
 */
export default function Disclaimer({ variant = 'inline', className = '' }: DisclaimerProps) {
  if (variant === 'compact') {
    return (
      <p
        className={`text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint ${className}`}
      >
        <InformationCircleIcon
          size={14}
          aria-hidden="true"
          className="mr-1 inline-block align-[-2px]"
        />
        <span className="font-semibold text-inchiostro-soft dark:text-nebbia-soft">Avviso:</span>{' '}
        {TEXT}
      </p>
    );
  }

  if (variant === 'banner') {
    return (
      <aside
        role="note"
        aria-label="Avviso importante"
        className={`rounded-2xl border border-regola bg-carta-soft p-5 shadow-cozy dark:border-notte-deep dark:bg-notte-soft sm:p-6 ${className}`}
      >
        <div className="flex items-start gap-3">
          <AlertCircleIcon
            size={22}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-inchiostro-soft dark:text-nebbia-soft"
          />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-inchiostro dark:text-nebbia">{TEXT}</p>
            <p className="text-xs leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              {REALE}{' '}
              <Link
                href="/fonti"
                className={`font-semibold underline underline-offset-2 ${LINK_FOCUS}`}
              >
                Fonti
              </Link>
              {' e '}
              <Link
                href="/metodologia"
                className={`font-semibold underline underline-offset-2 ${LINK_FOCUS}`}
              >
                Metodologia
              </Link>
              . {AMBIENTE_PROVA}
            </p>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft sm:p-6 ${className}`}
    >
      <p className="flex items-start gap-2 text-sm font-medium text-inchiostro-soft dark:text-nebbia-soft">
        <InformationCircleIcon size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
        {TEXT}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint">
        {REALE}{' '}
        <Link
          href="/fonti"
          className={`font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara ${LINK_FOCUS}`}
        >
          Fonti
        </Link>
        {' e '}
        <Link
          href="/metodologia"
          className={`font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara ${LINK_FOCUS}`}
        >
          Metodologia
        </Link>
        . {AMBIENTE_PROVA}
      </p>
    </div>
  );
}
