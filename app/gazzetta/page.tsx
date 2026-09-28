import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { caricaGazzettaUltima } from '@/lib/gazzetta-dati'

export const metadata: Metadata = {
  title: 'Ultima Gazzetta Ufficiale — Stato della Repubblica',
  description:
    'L’ultimo numero uscito della Gazzetta Ufficiale: atti pubblicati con link ai testi ufficiali. Fa fede la Gazzetta a stampa.',
}

function dataIT(iso: string): string {
  try {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  } catch {
    return iso.slice(0, 10)
  }
}

export default async function GazzettaPage() {
  const dati = await caricaGazzettaUltima()

  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <nav aria-label="Percorso" className="text-xs text-inchiostro-soft dark:text-nebbia-soft">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/" className="hover:text-accento dark:hover:text-accento-chiara">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
              Gazzetta Ufficiale
            </li>
          </ol>
        </nav>

        <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Gazzetta Ufficiale
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            {dati ? dati.testata || `Serie Generale n. ${dati.numero}` : 'Ultimo numero uscito'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Gli atti appena pubblicati, con link ai testi ufficiali. Solo metadati: fa fede la
            Gazzetta Ufficiale a stampa.
          </p>
          {dati && (
            <p className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia" role="status">
              {dati.atti.length} {dati.atti.length === 1 ? 'atto pubblicato' : 'atti pubblicati'}
              {dati.data ? ` il ${dataIT(dati.data)}` : ''}
            </p>
          )}
        </header>

        {!dati || dati.atti.length === 0 ? (
          <p className="mt-8 border border-dashed border-regola bg-carta p-6 text-sm text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft" role="status">
            Dati in preparazione: l’ultimo numero indicizzato non è ancora disponibile.
          </p>
        ) : (
          <ol className="mt-6 grid gap-4">
            {dati.atti.map((atto) => (
              <li
                key={atto.url}
                className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
              >
                <h2 className="font-serif text-lg font-bold leading-snug text-inchiostro dark:text-nebbia">
                  <a
                    href={atto.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-4 hover:text-accento hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:hover:text-accento-chiara dark:focus-visible:outline-nebbia"
                  >
                    {atto.titolo}
                  </a>
                </h2>
                <p className="mt-2 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                  Gazzetta Ufficiale · link al testo ufficiale ↗
                </p>
              </li>
            ))}
          </ol>
        )}

        <section
          aria-labelledby="fonti-gu"
          className="mt-10 border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft"
        >
          <h2 id="fonti-gu" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Fonte
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Fonte: {dati?.provenance.fonte ?? 'gazzettaufficiale.it (RSS Serie Generale)'} —{' '}
            {dati?.provenance.licenza ?? 'solo metadati + link ufficiali, nessun mirror'}.
            Fa fede esclusivamente la Gazzetta Ufficiale a stampa.
          </p>
        </section>
      </main>
      <Footer />
    </>
  )
}
