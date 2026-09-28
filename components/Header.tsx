'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import DataOdierna from './DataOdierna'
import ToggleTema from './ToggleTema'

/** Navigazione primaria: 5 voci + indice completo. */
const NAV_PRINCIPALE = [
  { href: '/leggi', label: 'Leggi' },
  { href: '/parlamento', label: 'Parlamento' },
  { href: '/gazzetta', label: 'Gazzetta' },
  { href: '/eurlex', label: 'Diritto UE' },
  { href: '/statistiche', label: 'Statistiche' },
]

/** Indice completo, raggruppato per area. Solo route esistenti, nessuna etichetta inventata. */
const INDICE_COMPLETO: { titolo: string; voci: { href: string; label: string }[] }[] = [
  {
    titolo: 'Norme',
    voci: [
      { href: '/leggi', label: 'Leggi' },
      { href: '/gazzetta', label: 'Gazzetta' },
      { href: '/eurlex', label: 'Diritto UE' },
      { href: '/semplifica', label: 'Semplifica' },
    ],
  },
  {
    titolo: 'Istituzioni',
    voci: [
      { href: '/parlamento', label: 'Parlamento' },
      { href: '/ministri', label: 'Ministri' },
      { href: '/quirinale', label: 'Quirinale' },
      { href: '/consulta', label: 'Consulta' },
      { href: '/controllo', label: 'Controllo' },
    ],
  },
  {
    titolo: 'Dati',
    voci: [
      { href: '/statistiche', label: 'Statistiche' },
      { href: '/finanziamenti', label: 'Finanziamenti' },
      { href: '/elezioni', label: 'Elezioni' },
      { href: '/regionali-extra', label: 'Regionali Extra' },
    ],
  },
  {
    titolo: 'Servizio',
    voci: [
      { href: '/', label: 'Home' },
      { href: '/salvati', label: 'Salvati' },
      { href: '/fonti', label: 'Fonti' },
      { href: '/metodologia', label: 'Metodologia' },
    ],
  },
]

const VOCI_INDICE_PIATTE = INDICE_COMPLETO.flatMap((g) => g.voci)

function isAttiva(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function isIndiceAttivo(pathname: string): boolean {
  return VOCI_INDICE_PIATTE.some(
    (v) => !NAV_PRINCIPALE.some((p) => p.href === v.href) && isAttiva(pathname, v.href),
  )
}

const ID_MENU_MOBILE = 'menu-mobile-pannello'
const ID_INDICE_DESKTOP = 'indice-completo-pannello'

/** Pannello "Tutto": indice completo ad alta densità, chiudibile con ESC e click fuori. */
function IndiceCompletoDesktop({ pathname }: { pathname: string }) {
  const [aperto, setAperto] = useState(false)
  const rifBottone = useRef<HTMLButtonElement | null>(null)
  const rifPannello = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setAperto(false)
  }, [pathname])

  useEffect(() => {
    if (!aperto) return
    function tastiera(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setAperto(false)
        rifBottone.current?.focus()
      }
    }
    function fuori(e: MouseEvent | TouchEvent) {
      const t = e.target as Node | null
      if (!t) return
      if (rifPannello.current?.contains(t)) return
      if (rifBottone.current?.contains(t)) return
      setAperto(false)
    }
    document.addEventListener('keydown', tastiera)
    document.addEventListener('mousedown', fuori)
    document.addEventListener('touchstart', fuori)
    return () => {
      document.removeEventListener('keydown', tastiera)
      document.removeEventListener('mousedown', fuori)
      document.removeEventListener('touchstart', fuori)
    }
  }, [aperto])

  const attivo = isIndiceAttivo(pathname)

  return (
    <div className="relative">
      <button
        ref={rifBottone}
        type="button"
        aria-expanded={aperto}
        aria-controls={ID_INDICE_DESKTOP}
        onClick={() => setAperto((v) => !v)}
        className={`flex min-h-[44px] items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:focus-visible:outline-accento-chiara ${
          aperto || attivo
            ? 'border-accento text-inchiostro dark:border-accento-chiara dark:text-nebbia'
            : 'border-transparent text-inchiostro-soft hover:text-inchiostro dark:text-nebbia-soft dark:hover:text-nebbia'
        }`}
      >
        Tutto
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={`h-3 w-3 transition-transform ${aperto ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m4 6 4 4 4-4" />
        </svg>
      </button>
      {aperto && (
        <div
          ref={rifPannello}
          id={ID_INDICE_DESKTOP}
          className="absolute right-0 z-50 mt-1 w-[36rem] max-w-[calc(100vw-2rem)] border border-regola bg-carta shadow-lg dark:border-notte-deep dark:bg-notte-soft"
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-4">
            {INDICE_COMPLETO.map((gruppo) => (
              <div key={gruppo.titolo}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-inchiostro-faint dark:text-nebbia-faint">
                  {gruppo.titolo}
                </p>
                <ul className="mt-2 space-y-0.5">
                  {gruppo.voci.map((voce) => {
                    const attiva = isAttiva(pathname, voce.href)
                    return (
                      <li key={voce.href}>
                        <Link
                          href={voce.href}
                          aria-current={attiva ? 'page' : undefined}
                          onClick={() => setAperto(false)}
                          className={`block rounded-sm py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:focus-visible:outline-accento-chiara ${
                            attiva
                              ? 'font-semibold text-accento dark:text-accento-chiara'
                              : 'text-inchiostro-soft hover:text-accento dark:text-nebbia-soft dark:hover:text-accento-chiara'
                          }`}
                        >
                          {voce.label}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Menu mobile accessibile: bottone + dialogo con focus-trap, ESC, click fuori e ritorno del focus. */
function MenuMobile({ pathname }: { pathname: string }) {
  const [aperto, setAperto] = useState(false)
  const riferimentoBottone = useRef<HTMLButtonElement | null>(null)
  const riferimentoPannello = useRef<HTMLDivElement | null>(null)
  const riferimentoPrimoCollegamento = useRef<HTMLAnchorElement | null>(null)
  const eraAperto = useRef(false)

  // Chiudi il menu a ogni cambio di pagina.
  useEffect(() => {
    setAperto(false)
  }, [pathname])

  // Porta il focus sul primo collegamento all'apertura e restituiscilo al bottone alla chiusura.
  useEffect(() => {
    if (aperto) {
      eraAperto.current = true
      const primo = riferimentoPrimoCollegamento.current
        ?? riferimentoPannello.current?.querySelector('a')
      if (primo instanceof HTMLElement) {
        primo.focus()
      }
    } else if (eraAperto.current) {
      eraAperto.current = false
      riferimentoBottone.current?.focus()
    }
  }, [aperto])

  // ESC per chiudere, trap circolare del TAB, click fuori per chiudere.
  useEffect(() => {
    if (!aperto) return

    function gestisciTastiera(evento: KeyboardEvent) {
      if (evento.key === 'Escape') {
        evento.preventDefault()
        setAperto(false)
        return
      }
      if (evento.key !== 'Tab') return
      const pannello = riferimentoPannello.current
      if (!pannello) return
      const elementi = Array.from(
        pannello.querySelectorAll('a[href], button:not([disabled])'),
      ).filter((elemento) => elemento instanceof HTMLElement) as HTMLElement[]
      if (elementi.length === 0) {
        evento.preventDefault()
        return
      }
      const primo = elementi[0]
      const ultimo = elementi[elementi.length - 1]
      if (evento.shiftKey && document.activeElement === primo) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault()
        primo.focus()
      }
    }

    function gestisciClickFuori(evento: MouseEvent | TouchEvent) {
      const bersaglio = evento.target as Node | null
      if (!bersaglio) return
      if (riferimentoPannello.current?.contains(bersaglio)) return
      if (riferimentoBottone.current?.contains(bersaglio)) return
      setAperto(false)
    }

    document.addEventListener('keydown', gestisciTastiera)
    document.addEventListener('mousedown', gestisciClickFuori)
    document.addEventListener('touchstart', gestisciClickFuori)
    return () => {
      document.removeEventListener('keydown', gestisciTastiera)
      document.removeEventListener('mousedown', gestisciClickFuori)
      document.removeEventListener('touchstart', gestisciClickFuori)
    }
  }, [aperto])

  return (
    <div className="relative md:hidden">
      <button
        ref={riferimentoBottone}
        type="button"
        aria-expanded={aperto}
        aria-controls={ID_MENU_MOBILE}
        aria-haspopup="dialog"
        aria-label={aperto ? 'Chiudi il menu' : 'Apri il menu'}
        onClick={() => setAperto((valore) => !valore)}
        className="flex min-h-[44px] cursor-pointer items-center gap-2 border border-regola px-3 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro-soft transition-colors hover:border-inchiostro hover:text-inchiostro focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:border-notte-deep dark:text-nebbia-soft dark:hover:border-nebbia dark:hover:text-nebbia dark:focus-visible:outline-accento-chiara"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        Menu
      </button>
      {aperto && (
        <div
          ref={riferimentoPannello}
          role="dialog"
          aria-modal="false"
          aria-label="Navigazione principale"
          id={ID_MENU_MOBILE}
          className="absolute right-0 z-50 mt-2 max-h-[70vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto border border-regola bg-carta p-2 shadow-lg dark:border-notte-deep dark:bg-notte-soft"
        >
          <ul className="flex flex-col">
            {NAV_PRINCIPALE.map((voce, indice) => {
              const attiva = isAttiva(pathname, voce.href)
              return (
                <li key={voce.href}>
                  <Link
                    ref={indice === 0 ? riferimentoPrimoCollegamento : undefined}
                    href={voce.href}
                    aria-current={attiva ? 'page' : undefined}
                    onClick={() => setAperto(false)}
                    className={`block min-h-[44px] px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:focus-visible:outline-accento-chiara ${
                      attiva
                        ? 'bg-carta-deep font-semibold text-inchiostro dark:bg-notte-deep dark:text-nebbia'
                        : 'text-inchiostro-soft hover:bg-carta-deep hover:text-inchiostro dark:text-nebbia-soft dark:hover:bg-notte-deep dark:hover:text-nebbia'
                    }`}
                  >
                    {voce.label}
                  </Link>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 border-t border-regola px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-inchiostro-faint dark:border-notte-deep dark:text-nebbia-faint">
            Indice completo
          </p>
          <ul className="flex flex-col pb-1">
            {VOCI_INDICE_PIATTE.filter((v) => !NAV_PRINCIPALE.some((p) => p.href === v.href)).map((voce) => {
              const attiva = isAttiva(pathname, voce.href)
              return (
                <li key={voce.href}>
                  <Link
                    href={voce.href}
                    aria-current={attiva ? 'page' : undefined}
                    onClick={() => setAperto(false)}
                    className={`block min-h-[44px] px-3 py-2.5 text-sm transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:focus-visible:outline-accento-chiara ${
                      attiva
                        ? 'font-semibold text-accento dark:text-accento-chiara'
                        : 'text-inchiostro-soft hover:bg-carta-deep hover:text-inchiostro dark:text-nebbia-soft dark:hover:bg-notte-deep dark:hover:text-nebbia'
                    }`}
                  >
                    {voce.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Testata editoriale-istituzionale: filetto tricolore, testata densa, icona di ricerca, 5 voci + indice. */
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

      <div className="mx-auto flex w-full max-w-editoriale items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-current={pathname === '/' ? 'page' : undefined}
          className="group flex min-w-0 items-baseline gap-3 rounded-sm focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:focus-visible:outline-accento-chiara"
        >
          <span className="font-serif text-lg font-bold leading-none tracking-tight text-inchiostro dark:text-nebbia sm:text-xl">
            Stato della Repubblica
          </span>
          <span className="hidden text-[10px] uppercase tracking-[0.22em] text-inchiostro-faint dark:text-nebbia-faint lg:inline">
            le leggi spiegate semplici
          </span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <DataOdierna className="mr-1 hidden text-xs text-inchiostro-soft dark:text-nebbia-soft xl:block" />
          <Link
            href="/leggi"
            aria-label="Cerca nelle leggi"
            title="Cerca nelle leggi"
            className="inline-flex h-11 min-h-tocco w-11 min-w-tocco items-center justify-center rounded border border-transparent text-inchiostro-soft transition-colors hover:border-regola hover:text-inchiostro focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:text-nebbia-soft dark:hover:border-notte-deep dark:hover:text-nebbia dark:focus-visible:outline-accento-chiara"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="m20 20-3.5-3.5" />
            </svg>
          </Link>
          <ToggleTema />
          <MenuMobile pathname={pathname} />
        </div>
      </div>

      <nav aria-label="Navigazione principale" className="hidden border-t border-regola dark:border-notte-deep md:block">
        <ul className="mx-auto flex w-full max-w-editoriale flex-wrap items-center gap-1 px-4 sm:px-6 lg:px-8">
          {NAV_PRINCIPALE.map((item) => {
            const attiva = isAttiva(pathname, item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={attiva ? 'page' : undefined}
                  className={`block min-h-[44px] border-b-2 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:focus-visible:outline-accento-chiara ${
                    attiva
                      ? 'border-accento text-inchiostro dark:border-accento-chiara dark:text-nebbia'
                      : 'border-transparent text-inchiostro-soft hover:text-inchiostro dark:text-nebbia-soft dark:hover:text-nebbia'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
          <li className="ml-auto">
            <IndiceCompletoDesktop pathname={pathname} />
          </li>
        </ul>
      </nav>
    </header>
  )
}
