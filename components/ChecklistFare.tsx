'use client'

/** Checklist interattiva "Cosa fare": stato solo locale, nessun salvataggio. */
export default function ChecklistFare({ voci }: { voci: string[] }) {
  if (!Array.isArray(voci) || voci.length === 0) {
    return (
      <p role="status" className="rounded-2xl border border-regola bg-carta-soft p-5 text-sm leading-relaxed text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft sm:p-6">
        Per questa norma non ci sono passi pratici da mostrare.
      </p>
    )
  }
  return (
    <form aria-label="Lista di controllo: cosa fare" onSubmit={(e) => e.preventDefault()}>
      <ol className="flex flex-col gap-3">
        {voci.map((azione, index) => {
          const id = `fare-${index}`
          return (
            <li key={`${index}-${azione}`} className="flex items-baseline gap-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              <input
                id={id}
                type="checkbox"
                className="h-5 w-5 shrink-0 translate-y-1 accent-accento dark:accent-accento-chiara"
                aria-label={`Passo ${index + 1}: ${azione}`}
              />
              <label htmlFor={id} className="flex min-h-[48px] flex-1 cursor-pointer items-baseline gap-3">
                <span aria-hidden="true" className="flex h-6 w-6 shrink-0 translate-y-0.5 items-center justify-center rounded-lg bg-inchiostro font-sans text-xs font-bold text-carta dark:bg-nebbia dark:text-notte">
                  {index + 1}
                </span>
                <span className="flex-1">{azione}</span>
              </label>
            </li>
          )
        })}
      </ol>
      <p className="mt-4 text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint">
        Spunta i passi via via che li completi. L’elenco resta solo su questa pagina e non viene salvato.
      </p>
    </form>
  )
}
