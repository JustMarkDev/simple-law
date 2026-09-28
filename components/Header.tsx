'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import DataOdierna from './DataOdierna'
import ToggleTema from './ToggleTema'
import SearchBar from './SearchBar'

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/leggi', label: 'Leggi' },
  { href: '/ministri', label: 'Ministri' },
  { href: '/statistiche', label: 'Statistiche' },
  { href: '/semplifica', label: 'Semplifica' },
  { href: '/salvati', label: 'Salvati' },
  { href: '/fonti', label: 'Fonti' },
  { href: '/metodologia', label: 'Metodologia' },
]

function isAttiva(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Testata editoriale: filetto tricolore, testata, ricerca globale, navigazione con voce attiva e interruttore del tema. */
export default function Header() {
  const pathname = usePathname()

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

      <div className="mx-auto flex w-full max-w-editoriale flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-current={pathname === '/' ? 'page' : undefined}
          className="group flex min-w-0 items-baseline gap-3 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:focus-visible:outline-nebbia"
        >
          <span className="font-serif text-lg font-bold leading-none tracking-tight text-inchiostro dark:text-nebbia sm:text-2xl">
            Stato della Repubblica
          </span>
          <span className="hidden text-[10px] uppercase tracking-[0.22em] text-inchiostro-soft dark:text-nebbia-soft lg:inline">
            le leggi spiegate semplici
          </span>
        </Link>

        <div className="order-3 w-full md:order-2 md:w-auto md:min-w-64 md:flex-1 md:max-w-md md:justify-self-center">
          <SearchBar
            id="ricerca-globale"
            label="Cerca una legge"
            action="/leggi"
            placeholder="Cerca una legge, un tema o una parola"
            className="[&_button]:min-h-[44px] [&_input]:min-h-[44px]"
          />
        </div>

        <div className="order-2 ml-auto flex shrink-0 items-center gap-3 md:order-3 md:ml-0">
          <DataOdierna className="hidden text-xs text-inchiostro-soft dark:text-nebbia-soft xl:block" />
          <ToggleTema />
          <details className="group relative md:hidden">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 border border-regola px-3 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro-soft transition-colors hover:border-inchiostro hover:text-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:text-nebbia-soft dark:hover:border-nebbia dark:hover:text-nebbia dark:focus-visible:outline-nebbia [&::-webkit-details-marker]:hidden">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
              Menu
            </summary>
            <nav
              aria-label="Navigazione principale (mobile)"
              className="absolute right-0 z-50 mt-2 w-56 border border-regola bg-carta p-2 shadow-lg dark:border-notte-deep dark:bg-notte-soft"
            >
              <ul className="flex flex-col">
                {NAV.map((item) => {
                  const attiva = isAttiva(pathname, item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={attiva ? 'page' : undefined}
                        className={`block min-h-[44px] px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:focus-visible:outline-nebbia ${
                          attiva
                            ? 'bg-carta-deep font-semibold text-inchiostro dark:bg-notte-deep dark:text-nebbia'
                            : 'text-inchiostro-soft hover:bg-carta-deep hover:text-inchiostro dark:text-nebbia-soft dark:hover:bg-notte-deep dark:hover:text-nebbia'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </details>
        </div>
      </div>

      <nav aria-label="Navigazione principale" className="hidden border-t border-regola dark:border-notte-deep md:block">
        <ul className="mx-auto flex w-full max-w-editoriale flex-wrap items-center gap-1 px-4 sm:px-6 lg:px-8">
          {NAV.map((item) => {
            const attiva = isAttiva(pathname, item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={attiva ? 'page' : undefined}
                  className={`block min-h-[44px] border-b-2 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:focus-visible:outline-nebbia ${
                    attiva
                      ? 'border-tricolore-rosso text-inchiostro dark:text-nebbia'
                      : 'border-transparent text-inchiostro-soft hover:border-tricolore-rosso hover:text-inchiostro dark:text-nebbia-soft dark:hover:border-tricolore-rosso dark:hover:text-nebbia'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </header>
  )
}
