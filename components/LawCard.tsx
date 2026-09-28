import Link from 'next/link'
import TrafficLight from './TrafficLight'
import QualityBadges from './QualityBadges'
import Evidenzia from './Evidenzia'
import PulsantePreferito from './PulsantePreferito'
import { formatDate, lawHref, STATO_META, tipoLabel, type Law } from './seed-fallback'

interface LawCardProps {
  law: Law
  featured?: boolean
  persona?: string
  headingLevel?: 'h2' | 'h3'
  evidenzia?: string
}

function attuativiMancanti(law: Law): number {
  return law.attuativi.daAdottare + law.attuativi.scaduti
}

/** Card di una legge. Solo il titolo è cliccabile (mai stretched-link). Lista con `contentVisibility: auto`. */
export default function LawCard({ law, featured = false, persona, headingLevel = 'h3', evidenzia = '' }: LawCardProps) {
  const Heading = headingLevel
  const href = lawHref(law)
  const meta = STATO_META[law.stato]
  const personaTesto = persona && persona !== 'tutti' ? law.semplificata.perTe[persona] : undefined
  const titoloId = `titolo-${law.eli.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'norma'}`

  if (featured) {
    return (
      <article
        aria-labelledby={titoloId}
        className="relative scroll-mt-24 overflow-hidden border border-inchiostro bg-carta-soft p-6 pl-8 dark:border-notte-deep dark:bg-notte-soft sm:p-8 sm:pl-10"
      >
        <span aria-hidden="true" className="absolute inset-y-0 left-0 flex w-2 flex-col">
          <span className="flex-1 bg-tricolore-verde" />
          <span className="flex-1 bg-tricolore-bianco" />
          <span className="flex-1 bg-tricolore-rosso" />
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <span className="bg-inchiostro px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-carta dark:bg-nebbia dark:text-notte">
            In evidenza
          </span>
          <span className="border border-regola px-3 py-1.5 text-xs font-medium text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
            {tipoLabel(law)}
          </span>
          {law.dimostrativo && (
            <span className="border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:border-amber-500/60 dark:bg-amber-950/40 dark:text-amber-300">
              Scheda dimostrativa
            </span>
          )}
        </div>

        <Heading
          id={titoloId}
          className="mt-4 font-serif text-2xl font-bold leading-tight text-inchiostro dark:text-nebbia sm:text-3xl"
        >
          <Link
            href={href}
            className="underline-offset-4 hover:text-accento hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-inchiostro dark:hover:text-accento-chiara dark:focus-visible:outline-nebbia"
          >
            {law.titolo}
          </Link>
        </Heading>

        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft sm:text-base">
          {law.sintesi}
        </p>

        <p className="mt-4 border-l-2 border-tricolore-rosso bg-carta px-4 py-3 text-sm font-medium leading-relaxed text-inchiostro dark:bg-notte dark:text-nebbia">
          <span className="mr-1 font-bold">In 10 secondi:</span>
          {law.semplificata.in10Secondi}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="inline-flex items-center gap-2 rounded bg-white p-1.5 ring-1 ring-regola dark:bg-black dark:ring-notte-deep">
            <TrafficLight stato={law.stato} showLabel={false} />
            <span className="inline-flex items-center gap-1.5 pr-1 text-sm font-semibold text-inchiostro dark:text-nebbia">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          </span>
          <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
            <span className="sr-only">Data di emanazione: </span>
            <time dateTime={law.dataEmanazione}>{formatDate(law.dataEmanazione)}</time>
          </span>
        </div>

        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
          {law.semplificata.statoLavora.motivo}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={href}
            className="inline-flex min-h-[44px] items-center gap-2 bg-inchiostro px-5 py-3 text-sm font-semibold text-carta transition-colors hover:bg-inchiostro-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:bg-nebbia dark:text-notte dark:hover:bg-nebbia-soft dark:focus-visible:outline-nebbia"
          >
            Leggi la scheda
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
          </Link>
          <Link
            href="/leggi"
            className="inline-flex min-h-[44px] items-center border border-inchiostro px-5 py-3 text-sm font-semibold text-inchiostro transition-colors hover:bg-inchiostro hover:text-carta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte dark:focus-visible:outline-nebbia"
          >
            Vedi tutte le leggi
          </Link>
        </div>
      </article>
    )
  }

  return (
    <article
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}
      className="group relative flex h-full scroll-mt-24 flex-col gap-3 border border-regola bg-carta p-5 transition-all hover:-translate-y-0.5 hover:border-inchiostro hover:shadow-md focus-within:border-inchiostro focus-within:shadow-md motion-reduce:transform-none motion-reduce:transition-none dark:border-notte-deep dark:bg-notte-soft dark:hover:border-nebbia dark:focus-within:border-nebbia"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="bg-inchiostro/5 px-2.5 py-1.5 text-xs font-semibold text-inchiostro-soft dark:bg-notte-deep dark:text-nebbia-soft">
            {tipoLabel(law)}
          </span>
          {law.dimostrativo && (
            <span className="border border-amber-400 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 dark:border-amber-500/60 dark:bg-amber-950/40 dark:text-amber-300">
              Scheda dimostrativa
            </span>
          )}
        </span>
        <span className="text-xs text-inchiostro-soft dark:text-nebbia-soft">
          <span className="sr-only">Data di emanazione: </span>
          <time dateTime={law.dataEmanazione}>{formatDate(law.dataEmanazione)}</time>
        </span>
      </div>

      <Heading className="line-clamp-3 font-serif text-base font-bold leading-snug text-inchiostro dark:text-nebbia sm:text-lg">
        <Link
          href={href}
          className="underline-offset-4 hover:text-accento hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:hover:text-accento-chiara dark:focus-visible:outline-nebbia"
        >
          <Evidenzia testo={law.titolo} q={evidenzia} />
        </Link>
      </Heading>

      <p className="line-clamp-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
        <Evidenzia testo={law.sintesi} q={evidenzia} />
      </p>

      {personaTesto && (
        <p className="line-clamp-3 border-l-2 border-inchiostro bg-carta-soft px-3 py-2 text-sm leading-relaxed text-inchiostro-soft dark:border-nebbia dark:bg-notte dark:text-nebbia-soft">
          <span className="font-semibold">Per te:</span> {personaTesto}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
        <span className="inline-flex rounded bg-white p-1 ring-1 ring-regola dark:bg-black dark:ring-notte-deep">
          <TrafficLight stato={law.stato} size="sm" showLabel={false} />
          <span className="sr-only">{meta.label}: {meta.descrizione}</span>
        </span>
        <span className="flex min-h-[44px] items-center gap-2">
          <span
            className="inline-flex min-h-[44px] items-center"
            title={`Salva "${law.titolo}" tra i preferiti`}
          >
            <PulsantePreferito eli={law.eli} />
          </span>
          <QualityBadges
            gulpease={law.gulpease}
            qualita={law.qualita}
            attuativiCount={attuativiMancanti(law)}
          />
        </span>
      </div>
    </article>
  )
}
