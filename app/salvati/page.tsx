import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ListaSalvati from '@/components/ListaSalvati'

export const metadata: Metadata = {
  title: 'I tuoi salvati — Stato della Repubblica',
  description: 'Le norme che hai salvato su questo dispositivo. Fino a 200, solo in locale.',
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
        <h1 className="mt-4 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
          I tuoi salvati <span aria-hidden="true">★</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
          Salvati solo su questo dispositivo (localStorage, chiave{' '}
          <code className="rounded bg-inchiostro/5 px-1 py-0.5 text-xs dark:bg-notte-deep">
            simple-law:preferiti:v1
          </code>
          ), fino a 200 norme. Nessun account, nessun tracciamento. Le modifiche si
          sincronizzano tra le schede aperte. Raggruppate per stato, ordinate per data.
        </p>
        <ListaSalvati />
      </main>
      <Footer />
    </>
  )
}
