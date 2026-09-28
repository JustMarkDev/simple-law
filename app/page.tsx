import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SearchBar from '@/components/SearchBar'
import PersonaFilter from '@/components/PersonaFilter'
import LawCard from '@/components/LawCard'
import MinisterCard from '@/components/MinisterCard'
import Comparsa from '@/components/Comparsa'
import Contatore from '@/components/Contatore'
import { loadLaws, loadMinisters, personaRelevant, searchLaws, STATO_META } from '@/components/seed-fallback'

export const metadata: Metadata = {
  title: 'Stato della Repubblica — le leggi spiegate semplici',
  description:
    'Il feed civico delle norme italiane: cosa cambia, per chi e se funziona già. Frasi brevi, fonti ufficiali e un semaforo di attuazione.',
}

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const PASSI = [
  {
    titolo: 'Leggi in 10 secondi',
    testo: 'Ogni norma ha una sintesi in una frase. Capisci subito di cosa si tratta, anche da mobile.',
  },
  {
    titolo: 'Scopri se ti riguarda',
    testo: 'Scegli la tua situazione — Guida, Lavoro, Impresa o Studio — e leggi solo le parti per te.',
  },
  {
    titolo: 'Controlla se funziona',
    testo: 'Il semaforo ti dice se la legge è già attiva o se mancano ancora i decreti attuativi.',
  },
]

export default async function HomePage({ searchParams }: HomeProps) {
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q : ''
  const persona = typeof sp.persona === 'string' ? sp.persona : 'tutti'

  const [tutte, ministri] = await Promise.all([loadLaws(), loadMinisters()])
  const base = q ? await searchLaws(q, tutte) : tutte
  const filtrate = base.filter((law) => personaRelevant(law, persona))
  const featured = tutte.find((law) => law.featured) ?? tutte[0]
  const resto = featured ? filtrate.filter((law) => law.eli !== featured.eli) : filtrate

  const conteggio = {
    verde: tutte.filter((law) => law.stato === 'verde').length,
    giallo: tutte.filter((law) => law.stato === 'giallo').length,
    rosso: tutte.filter((law) => law.stato === 'rosso').length,
  }

  return (
    <>
      <Header />
      <main id="contenuto">
        <section className="border-b border-regola bg-carta-soft dark:border-notte-deep dark:bg-notte-soft">
          <div className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
              Feed civico
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-3xl font-bold leading-[1.08] text-inchiostro dark:text-nebbia sm:text-5xl lg:text-6xl">
              Le leggi italiane, spiegate senza gergo.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-inchiostro-soft dark:text-nebbia-soft sm:text-lg">
              Cosa cambia, per chi e se funziona già. Ogni scheda parte dalle fonti ufficiali e dice chiaramente quando
              una norma è ancora in attesa dei decreti attuativi.
            </p>

            <div className="mt-7 max-w-2xl">
              <SearchBar defaultValue={q} action="/leggi" />
            </div>

            <dl className="mt-9 grid max-w-2xl grid-cols-2 gap-px border border-regola bg-regola dark:border-notte-deep dark:bg-notte-deep sm:grid-cols-4">
              <div className="bg-carta p-4 dark:bg-notte">
                <dt className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">Norme in feed</dt>
                <dd className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
                  <Contatore value={tutte.length} />
                </dd>
              </div>
              {(['verde', 'giallo', 'rosso'] as const).map((stato) => (
                <div key={stato} className="bg-carta p-4 dark:bg-notte">
                  <dt className={`flex items-center gap-1.5 text-xs font-medium ${STATO_META[stato].text}`}>
                    <span aria-hidden="true" className={`h-2 w-2 rounded-full ${STATO_META[stato].dot}`} />
                    {STATO_META[stato].parole}
                  </dt>
                  <dd className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
                    <Contatore value={conteggio[stato]} />
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/ministri"
                className="border border-inchiostro px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro transition-colors hover:bg-inchiostro hover:text-carta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte dark:focus-visible:outline-nebbia"
              >
                Chi decide: i ministri
              </Link>
              <Link
                href="/statistiche"
                className="border border-transparent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro-soft underline decoration-regola underline-offset-4 transition-colors hover:text-accento dark:text-nebbia-soft dark:decoration-notte-deep dark:hover:text-accento-chiara"
              >
                I numeri del corpus
              </Link>
            </div>
          </div>
        </section>

        <div className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          {featured && (
            <section aria-labelledby="in-evidenza">
              <h2 id="in-evidenza" className="sr-only">
                Norma in evidenza
              </h2>
              <Comparsa>
                <LawCard law={featured} featured headingLevel="h2" />
              </Comparsa>
            </section>
          )}

          <section aria-labelledby="feed" className="mt-14">
            <div className="flex flex-col gap-4 border-b-2 border-inchiostro pb-4 dark:border-nebbia sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="feed" className="font-serif text-2xl font-bold text-inchiostro dark:text-nebbia sm:text-3xl">
                  {q ? `Risultati per “${q}”` : 'Ultime leggi'}
                </h2>
                <p className="mt-1 text-sm text-inchiostro-soft dark:text-nebbia-soft">
                  {filtrate.length} {filtrate.length === 1 ? 'norma' : 'norme'}
                  {persona !== 'tutti' ? ` per ${persona}` : ''}.
                </p>
              </div>
              <PersonaFilter active={persona} basePath="/" query={q ? { q } : {}} />
            </div>

            {resto.length > 0 ? (
              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {resto.map((law, index) => (
                  <li key={law.eli} className="flex">
                    <Comparsa className="flex w-full" delay={Math.min(index * 0.05, 0.4)}>
                      <LawCard law={law} persona={persona} />
                    </Comparsa>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 border border-dashed border-regola bg-carta p-6 text-sm text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft">
                Nessuna norma corrisponde a questa ricerca. Prova con un&apos;altra parola o togli il filtro.
              </p>
            )}
          </section>

          <section aria-labelledby="come-funziona" className="mt-16">
            <h2 id="come-funziona" className="font-serif text-2xl font-bold text-inchiostro dark:text-nebbia sm:text-3xl">
              Come funziona
            </h2>
            <ol className="mt-6 grid gap-px border border-regola bg-regola dark:border-notte-deep dark:bg-notte-deep sm:grid-cols-3">
              {PASSI.map((passo, index) => (
                <li key={passo.titolo} className="bg-carta p-5 dark:bg-notte">
                  <span className="font-serif text-3xl font-bold text-accento dark:text-accento-chiara">
                    {index + 1}
                  </span>
                  <h3 className="mt-2 text-sm font-bold uppercase tracking-wide text-inchiostro dark:text-nebbia">
                    {passo.titolo}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">{passo.testo}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-inchiostro-soft dark:text-nebbia-soft">
              Vuoi sapere come scegliamo le fonti e calcoliamo la leggibilità?{' '}
              <Link
                href="/metodologia"
                className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
              >
                Leggi la metodologia
              </Link>
              .
            </p>
          </section>

          {ministri.length > 0 && (
            <section aria-labelledby="ministri" className="mt-16">
              <div className="flex items-end justify-between gap-4 border-b border-regola pb-3 dark:border-notte-deep">
                <h2 id="ministri" className="font-serif text-2xl font-bold text-inchiostro dark:text-nebbia sm:text-3xl">
                  Ministri
                </h2>
                <Link
                  href="/ministri"
                  className="text-xs font-semibold uppercase tracking-wide text-accento underline underline-offset-2 dark:text-accento-chiara"
                >
                  Vedi tutti
                </Link>
              </div>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {ministri.slice(0, 4).map((minister, index) => (
                  <li key={minister.slug} className="flex">
                    <Comparsa className="flex w-full" delay={Math.min(index * 0.05, 0.3)}>
                      <MinisterCard minister={minister} />
                    </Comparsa>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
