import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Elezioni — Stato della Repubblica',
  description:
    'Consultazioni elettorali con dati ufficiali aggregati del Ministero dell’Interno (DAIT–Eligendo): affluenza e risultati per lista e territorio, senza dati personali.',
}

const LINK_ESTERNI = [
  { label: 'Eligendo — Ministero dell’Interno', url: 'https://elezionistorico.interno.gov.it/eligendo/opendata.php' },
  { label: 'CISE — Centro Italiano Studi Elettorali', url: 'https://cise.luiss.it/' },
  { label: 'YouTrend — analisi elettorali', url: 'https://www.youtrend.it/' },
]

/**
 * Hub delle consultazioni elettorali.
 *
 * Pagina statica: non legge il JSON aggregato e non inventa numeri. La card
 * di Europee 2024 rimanda al dettaglio, che mostra i totali solo se il file
 * `data/reali/elezioni-europee-2024.json` esiste ed è valido.
 */
export default function ElezioniPage() {
  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <header className="border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Dati ufficiali
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Elezioni
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Risultati elettorali da open data del Ministero dell’Interno (DAIT–Eligendo).
            Pubblichiamo <strong>solo aggregati</strong>: affluenza e voti per lista a livello
            nazionale, regionale e comunale. Nessun nominativo, nessuna riga candidata.
          </p>
        </header>

        <section aria-labelledby="consultazioni" className="mt-8">
          <h2 id="consultazioni" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Consultazioni disponibili
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            <li className="flex">
              <article className="flex w-full flex-col border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
                <p className="inline-flex w-fit items-center border border-regola px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
                  Dati ufficiali DAIT
                </p>
                <h3 className="mt-3 font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
                  Elezioni europee — 9 giugno 2024
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                  Affluenza nazionale, voti e percentuali delle liste, dettaglio per regione
                  e affluenza per comune. I seggi non sono disponibili nel file ministeriale.
                </p>
                <p className="mt-4">
                  <Link
                    href="/elezioni/europee-2024"
                    className="inline-flex min-h-[44px] items-center bg-accento px-6 font-semibold text-white hover:opacity-90 dark:bg-accento-chiara dark:text-notte"
                  >
                    Vedi i risultati
                  </Link>
                </p>
              </article>
            </li>
            <li className="flex">
              <article className="flex w-full flex-col justify-center border border-dashed border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft">
                <h3 className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
                  Prossime consultazioni
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                  Non ci sono altre consultazioni pubblicate in questa sezione. Nuovi file
                  aggregati (≤1 MB) compariranno qui dopo l’ingest ministeriale.
                </p>
              </article>
            </li>
          </ul>
        </section>

        <section aria-labelledby="metodologia" className="mt-10 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
          <h2 id="metodologia" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Metodologia
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            <li>
              Fonte: Ministero dell’Interno, Dipartimento per gli Affari Interni e Territoriali
              (DAIT) — Archivio Eligendo, open data a livello comunale.
            </li>
            <li>
              Solo aggregati: elettori, votanti, schede bianche e contestate una volta per
              comune; voti sommati per lista a livello nazionale e regionale. Mai righe
              candidato né nominativi.
            </li>
            <li>
              Affluenze e percentuali arrotondate a un decimale; le somme delle percentuali
              possono discostarsi di ±0,1 per arrotondamento.
            </li>
            <li>
              I seggi non sono presenti nel file ministeriale e non vengono mai mostrati né stimati.
            </li>
          </ul>
        </section>

        <section aria-labelledby="licenze" className="mt-6 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
          <h2 id="licenze" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Licenze e riuso
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Dati di fonte ministeriale (DAIT–Eligendo), riuso open-data da confermare sul
            catalogo ufficiale: la pagina «info open data» non riporta una stringa di licenza
            machine-readable (es. CC-BY). Fanno fede i verbali dei seggi e le proclamazioni
            ufficiali. I testi di questo sito restano rilasciati con licenza{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/deed.it"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
            >
              CC BY 4.0
            </a>
            .
          </p>
          <nav aria-label="Collegamenti esterni elettorali" className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-inchiostro-faint dark:text-nebbia-faint">
              Fonti e analisi esterne
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {LINK_ESTERNI.map((link) => (
                <li key={link.url} className="flex min-h-[44px] items-center">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-accento underline underline-offset-2 hover:text-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:text-accento-chiara dark:hover:text-nebbia dark:focus-visible:outline-nebbia"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </section>
      </main>
      <Footer />
    </>
  )
}
