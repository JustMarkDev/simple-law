import Link from 'next/link'
import DataOdierna from './DataOdierna'
import ToggleTema from './ToggleTema'

const NAV = [
  { href: '/', label: 'Feed' },
  { href: '/leggi', label: 'Leggi' },
  { href: '/semplifica', label: 'Semplifica' },
  { href: '/salvati', label: 'Salvati' },
  { href: '/ministri', label: 'Ministri' },
  { href: '/statistiche', label: 'Statistiche' },
  { href: '/fonti', label: 'Fonti' },
  { href: '/metodologia', label: 'Metodologia' },
]

/** Testata editoriale: filetto tricolore, testata, data e interruttore del tema. */
export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-regola bg-carta/95 backdrop-blur dark:border-notte-deep dark:bg-notte/95">
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:border focus:border-inchiostro focus:bg-inchiostro focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-carta dark:focus:border-nebbia dark:focus:bg-nebbia dark:focus:text-notte"
      >
        Salta al contenuto
      </a>

      <div className="riga-tricolore" aria-hidden="true">
        <span className="bg-tricolore-verde" />
        <span className="bg-tricolore-bianco" />
        <span className="bg-tricolore-rosso" />
      </div>

      <div className="mx-auto flex w-full max-w-editoriale items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="group flex min-w-0 items-baseline gap-3">
          <span className="font-serif text-lg font-bold leading-none tracking-tight text-inchiostro dark:text-nebbia sm:text-2xl">
            Stato della Repubblica
          </span>
          <span className="hidden text-[10px] uppercase tracking-[0.22em] text-inchiostro-faint dark:text-nebbia-faint lg:inline">
            le leggi spiegate semplici
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-3">
          <DataOdierna className="hidden text-xs text-inchiostro-soft dark:text-nebbia-soft md:block" />
          <ToggleTema />
          <details className="group relative md:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-2 border border-regola px-3 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro-soft transition-colors hover:border-inchiostro hover:text-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:text-nebbia-soft dark:hover:border-nebbia dark:hover:text-nebbia dark:focus-visible:outline-nebbia [&::-webkit-details-marker]:hidden">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
              Menu
            </summary>
            <nav
              aria-label="Navigazione principale (mobile)"
              className="absolute right-0 mt-2 w-56 border border-regola bg-carta p-2 shadow-lg dark:border-notte-deep dark:bg-notte-soft"
            >
              <ul className="flex flex-col">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block px-3 py-2.5 text-sm font-medium text-inchiostro-soft transition-colors hover:bg-carta-deep hover:text-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:text-nebbia-soft dark:hover:bg-notte-deep dark:hover:text-nebbia dark:focus-visible:outline-nebbia"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </details>
        </div>
      </div>

      <nav aria-label="Navigazione principale" className="hidden border-t border-regola dark:border-notte-deep md:block">
        <ul className="mx-auto flex w-full max-w-editoriale items-center gap-1 px-4 sm:px-6 lg:px-8">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block border-b-2 border-transparent px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-inchiostro-soft transition-colors hover:border-tricolore-rosso hover:text-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:text-nebbia-soft dark:hover:border-tricolore-rosso dark:hover:text-nebbia dark:focus-visible:outline-nebbia"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
