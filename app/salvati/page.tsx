import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ListaSalvati from '@/components/ListaSalvati'

export const metadata: Metadata = {
  title: 'I tuoi salvati — Stato della Repubblica',
  description: 'Le norme che hai salvato su questo dispositivo.',
}

export default function SalvatiPage() {
  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <nav aria-label="Percorso" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
          <ol className="flex items-center gap-2">
            <li>
              <Link href="/" className="hover:text-accento dark:hover:text-accento-chiara">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
              Salvati
            </li>
          </ol>
        </nav>
        <h1 className="mt-4 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">I tuoi salvati ★</h1>
        <p className="mt-2 text-sm text-inchiostro-soft dark:text-nebbia-soft">
          Salvati solo su questo dispositivo (localStorage). Nessun account, nessun tracciamento.
        </p>
        <ListaSalvati />
      </main>
      <Footer />
    </>
  )
}
