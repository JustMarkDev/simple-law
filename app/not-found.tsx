import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Pagina non trovata - Stato della Repubblica',
  description: 'La pagina cercata non esiste o è stata spostata.',
}

const COLLEGAMENTI = [
  { href: '/', label: 'Feed delle leggi' },
  { href: '/leggi', label: 'Tutte le leggi' },
  { href: '/ministri', label: 'Ministri' },
  { href: '/statistiche', label: 'Statistiche del corpus' },
]

export default function NotFound() {
  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto flex w-full max-w-3xl flex-col items-start px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <p className="text-sm font-semibold text-accento dark:text-accento-chiara">Errore 404</p>
        <h1 className="mt-3 text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
          Pagina non trovata
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
          La pagina che cerchi non esiste o è stata spostata. Puoi tornare al feed oppure usare i collegamenti qui sotto.
        </p>

        <nav aria-label="Collegamenti utili" className="mt-8 w-full">
          <ul className="grid gap-3 sm:grid-cols-2">
            {COLLEGAMENTI.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex min-h-[48px] items-center justify-between gap-3 rounded-2xl border border-regola bg-carta px-4 py-3 text-sm font-semibold text-inchiostro transition-colors hover:border-accento hover:text-accento focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia dark:hover:border-accento-chiara dark:hover:text-accento-chiara dark:focus-visible:outline-nebbia"
                >
                  {link.label}
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
      <Footer />
    </>
  )
}
