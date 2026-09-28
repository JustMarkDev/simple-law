interface DisclaimerProps {
  variant?: 'inline' | 'banner' | 'compact'
  className?: string
}

const TEXT = 'Solo a scopo informativo, non è consulenza legale.'
const ATTRIBUTION = 'Testi rielaborati e rilasciati con licenza CC BY 4.0. Alcune schede riportano dati dimostrativi.'

/**
 * Avviso legale e attribuzione. Presente in ogni pagina con contenuti sulle norme.
 */
export default function Disclaimer({ variant = 'inline', className = '' }: DisclaimerProps) {
  if (variant === 'compact') {
    return (
      <p className={`text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint ${className}`}>
        <span className="font-semibold text-inchiostro-soft dark:text-nebbia-soft">Avviso:</span> {TEXT}
      </p>
    )
  }

  if (variant === 'banner') {
    return (
      <aside
        role="note"
        aria-label="Avviso legale"
        className={`border-l-4 border-amber-500 bg-amber-50 p-4 dark:border-amber-400 dark:bg-amber-950/40 sm:p-5 ${className}`}
      >
        <div className="flex items-start gap-3">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{TEXT}</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300/90">
              Le schede sono semplificazioni divulgative. Per decisioni personali consulta un professionista e i testi
              ufficiali. {ATTRIBUTION}
            </p>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <div className={`border border-regola bg-carta-soft p-4 dark:border-notte-deep dark:bg-notte-soft ${className}`}>
      <p className="text-sm font-medium text-inchiostro-soft dark:text-nebbia-soft">{TEXT}</p>
      <p className="mt-1 text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint">{ATTRIBUTION}</p>
    </div>
  )
}
