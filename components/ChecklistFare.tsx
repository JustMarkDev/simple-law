'use client'

/** Checklist interattiva "Cosa fare": stato solo locale, nessun salvataggio. */
export default function ChecklistFare({ voci }: { voci: string[] }) {
  return (
    <form aria-label="Lista di controllo: cosa fare" onSubmit={(e) => e.preventDefault()}>
      <ol className="space-y-3">
        {voci.map((azione, index) => {
          const id = `fare-${index}`
          return (
            <li key={`${index}-${azione}`} className="flex gap-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              <input
                id={id}
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 accent-current"
                aria-label={`Passo ${index + 1}: ${azione}`}
              />
              <label htmlFor={id} className="flex min-h-[48px] flex-1 cursor-pointer gap-3">
                <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center bg-inchiostro font-serif text-xs font-bold text-carta dark:bg-nebbia dark:text-notte">
                  {index + 1}
                </span>
                <span>{azione}</span>
              </label>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-xs text-inchiostro-faint dark:text-nebbia-faint">
        Spunta i passi via via che li completi. L’elenco resta solo su questa pagina e non viene salvato.
      </p>
    </form>
  )
}
