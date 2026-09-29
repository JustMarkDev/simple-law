'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ArrowDown01Icon, Cancel01Icon, Menu01Icon, Search01Icon } from 'hugeicons-react'
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

const FUOCO_LINK =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:focus-visible:outline-accento-chiara'

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
        aria-label="Indice completo del sito"
        onClick={() => setAperto((v) => !v)}
        className={`flex min-h-[48px] items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-3 text-sm font-semibold transition-colors lg:px-3 ${FUOCO_LINK} ${
          aperto || attivo
            ? 'bg-accento/10 text-accento dark:bg-notte-deep dark:text-accento-chiara'
            : 'text-inchiostro-soft hover:bg-carta-deep/70 hover:text-inchiostro dark:text-nebbia-soft dark:hover:bg-notte-deep/70 dark:hover:text-nebbia'
        }`}
      >
        Tutto
        <ArrowDown01Icon
          size={16}
          aria-hidden="true"
          className={`h-4 w-4 transition-transform ${aperto ? 'rotate-180' : ''}`}
        />
      </button>
      {aperto && (
        <div
          ref={rifPannello}
          id={ID_INDICE_DESKTOP}
          className="absolute right-0 z-50 mt-2 w-[36rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-regola bg-carta shadow-[0_16px_40px_-20px_rgba(26,23,20,0.35)] dark:border-notte-deep dark:bg-notte-soft"
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-4">
            {INDICE_COMPLETO.map((gruppo) => (
              <div key={gruppo.titolo}>
                <p className="text-xs font-semibold tracking-wide text-inchiostro-faint dark:text-nebbia-faint">
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
                          className={`block min-h-[48px] rounded-xl px-3 py-3 text-sm transition-colors ${FUOCO_LINK} ${
                            attiva
                              ? 'bg-accento/10 font-semibold text-accento dark:bg-notte-deep dark:text-accento-chiara'
                              : 'text-inchiostro-soft hover:bg-carta-deep/70 hover:text-accento dark:text-nebbia-soft dark:hover:bg-notte-deep/70 dark:hover:text-accento-chiara'
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
        className={`flex min-h-[48px] cursor-pointer items-center gap-2 rounded-xl border border-regola bg-carta px-4 py-3 text-sm font-semibold text-inchiostro-soft transition-colors hover:border-accento hover:text-accento dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft dark:hover:border-accento-chiara dark:hover:text-accento-chiara ${FUOCO_LINK}`}
      >
        {aperto ? (
          <Cancel01Icon size={20} aria-hidden="true" className="h-5 w-5" />
        ) : (
          <Menu01Icon size={20} aria-hidden="true" className="h-5 w-5" />
        )}
        Menu
      </button>
      {aperto && (
        <div
          ref={riferimentoPannello}
          role="dialog"
          aria-modal="false"
          aria-label="Navigazione principale"
          id={ID_MENU_MOBILE}
          className="absolute right-0 z-50 mt-2 max-h-[70vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-regola bg-carta p-2 shadow-[0_16px_40px_-20px_rgba(26,23,20,0.35)] dark:border-notte-deep dark:bg-notte-soft"
        >
          <ul className="flex flex-col gap-0.5">
            {NAV_PRINCIPALE.map((voce, indice) => {
              const attiva = isAttiva(pathname, voce.href)
              return (
                <li key={voce.href}>
                  <Link
                    ref={indice === 0 ? riferimentoPrimoCollegamento : undefined}
                    href={voce.href}
                    aria-current={attiva ? 'page' : undefined}
                    onClick={() => setAperto(false)}
                    className={`block min-h-[48px] rounded-xl px-4 py-3 text-sm font-medium transition-colors ${FUOCO_LINK} ${
                      attiva
                        ? 'bg-accento/10 font-semibold text-accento dark:bg-notte-deep dark:text-accento-chiara'
                        : 'text-inchiostro-soft hover:bg-carta-deep/70 hover:text-inchiostro dark:text-nebbia-soft dark:hover:bg-notte-deep/70 dark:hover:text-nebbia'
                    }`}
                  >
                    {voce.label}
                  </Link>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 border-t border-regola px-4 pb-1 pt-3 text-xs font-semibold tracking-wide text-inchiostro-faint dark:border-notte-deep dark:text-nebbia-faint">
            Indice completo
          </p>
          <ul className="flex flex-col gap-0.5 pb-1">
            {VOCI_INDICE_PIATTE.filter((v) => !NAV_PRINCIPALE.some((p) => p.href === v.href)).map((voce) => {
              const attiva = isAttiva(pathname, voce.href)
              return (
                <li key={voce.href}>
                  <Link
                    href={voce.href}
                    aria-current={attiva ? 'page' : undefined}
                    onClick={() => setAperto(false)}
                    className={`block min-h-[48px] rounded-xl px-4 py-3 text-sm transition-colors ${FUOCO_LINK} ${
                      attiva
                        ? 'bg-accento/10 font-semibold text-accento dark:bg-notte-deep dark:text-accento-chiara'
                        : 'text-inchiostro-soft hover:bg-carta-deep/70 hover:text-inchiostro dark:text-nebbia-soft dark:hover:bg-notte-deep/70 dark:hover:text-nebbia'
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

/**
 * Testata a riga singola: header fisso in vetro caldo (.vetro da
 * app/globals.css, onesto: backdrop-blur piu tinta calda traslucida piu
 * bordo chiaro piu ombra interna sottile, con tinta piena sotto
 * prefers-reduced-transparency e se backdrop-filter manca).
 * Brand piu nav a 6 voci piu azioni su 68px, tutto a 48px di tocco.
 */
export default function Header() {
  const pathname = usePathname()

  return (
    <header className="vetro sticky top-0 z-40 border-b border-regola/70 dark:border-notte-deep/70">
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:min-h-[48px] focus:items-center focus:rounded-xl focus:border focus:border-inchiostro focus:bg-inchiostro focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-carta dark:focus:border-nebbia dark:focus:bg-nebbia dark:focus:text-notte"
      >
        Salta al contenuto
      </a>

      <div className="riga-tricolore" aria-hidden="true">
        <span className="bg-tricolore-verde" />
        <span className="bg-tricolore-bianco" />
        <span className="bg-tricolore-rosso" />
      </div>

      <div className="mx-auto flex h-[68px] w-full max-w-editoriale flex-nowrap items-center gap-2 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-current={pathname === '/' ? 'page' : undefined}
          className={`group flex min-h-[48px] min-w-0 shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-2 py-2 ${FUOCO_LINK}`}
        >
          <span className="text-lg font-bold leading-none tracking-tight text-inchiostro dark:text-nebbia sm:text-xl">
            Simple Law
          </span>
          <span className="hidden text-xs text-inchiostro-faint dark:text-nebbia-faint xl:inline">
            le leggi spiegate semplici
          </span>
        </Link>

        <nav aria-label="Navigazione principale" className="hidden min-w-0 flex-1 md:block">
          <ul className="flex flex-nowrap items-center gap-0.5 whitespace-nowrap lg:gap-1">
            {NAV_PRINCIPALE.map((item) => {
              const attiva = isAttiva(pathname, item.href)
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={attiva ? 'page' : undefined}
                    className={`flex min-h-[48px] items-center whitespace-nowrap rounded-xl px-2.5 py-3 text-sm font-semibold transition-colors lg:px-3 ${FUOCO_LINK} ${
                      attiva
                        ? 'bg-accento/10 text-accento dark:bg-notte-deep dark:text-accento-chiara'
                        : 'text-inchiostro-soft hover:bg-carta-deep/70 hover:text-inchiostro dark:text-nebbia-soft dark:hover:bg-notte-deep/70 dark:hover:text-nebbia'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
            <li className="shrink-0">
              <IndiceCompletoDesktop pathname={pathname} />
            </li>
          </ul>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <Link
            href="/leggi"
            aria-label="Cerca nelle leggi"
            title="Cerca nelle leggi"
            className={`inline-flex h-12 min-h-[48px] w-12 min-w-[48px] items-center justify-center rounded-xl border border-transparent text-inchiostro-soft transition-colors hover:bg-carta-deep/70 hover:text-inchiostro dark:text-nebbia-soft dark:hover:bg-notte-deep/70 dark:hover:text-nebbia ${FUOCO_LINK}`}
          >
            <Search01Icon size={20} aria-hidden="true" className="h-5 w-5" />
          </Link>
          <ToggleTema />
          <MenuMobile pathname={pathname} />
        </div>
      </div>
    </header>
  )
}
