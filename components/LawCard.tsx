'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight01Icon } from 'hugeicons-react'
import TrafficLight from './TrafficLight'
import Evidenzia from './Evidenzia'
import PulsantePreferito from './PulsantePreferito'
import { formatDate, lawHref, STATO_META, tipoLabel, type Law } from './seed-fallback'

interface LawCardProps {
  law: Law & { testoTroncato?: boolean }
  featured?: boolean
  persona?: string
  headingLevel?: 'h2' | 'h3'
  evidenzia?: string
}

function passiMancanti(law: Law): number {
  return law.attuativi.daAdottare + law.attuativi.scaduti
}

/*
 * Liquid-glass approssimato (onesto: nessuna libreria ufficiale).
 * Solo backdrop-blur + tinta calda traslucida + bordo 1px bianco/40 +
 * ombra interna sottile. Fallback tinta piena quando backdrop-filter
 * manca (supports-*) e con prefers-reduced-transparency.
 */
const VETRO_CLASSE =
  'border-white/40 bg-carta-soft/80 supports-[backdrop-filter]:bg-carta-soft/70 supports-[backdrop-filter]:backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_12px_32px_rgba(26,23,20,0.08)] [@media(prefers-reduced-transparency:reduce)]:bg-carta-soft [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-0 [@media(prefers-reduced-transparency:reduce)]:shadow-none dark:border-white/10 dark:bg-notte-soft/85 dark:supports-[backdrop-filter]:bg-notte-soft/75 dark:supports-[backdrop-filter]:backdrop-blur-md dark:[@media(prefers-reduced-transparency:reduce)]:bg-notte-soft'

/** Card di una legge. Solo il titolo è cliccabile più una CTA esplicita. */
export default function LawCard({ law, featured = false, persona, headingLevel = 'h3', evidenzia = '' }: LawCardProps) {
  const Heading = headingLevel
  const href = lawHref(law)
  const meta = STATO_META[law.stato]
  const ridotto = useReducedMotion()
  const personaTesto = persona && persona !== 'tutti' ? law.semplificata.perTe[persona] : undefined
  const titoloId = `titolo-${law.eli.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'norma'}`
  const mancanti = passiMancanti(law)
  const troncato = law.testoTroncato === true

  if (featured) {
    const corpo = (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-white/60 px-3 py-1.5 text-xs font-bold text-inchiostro-soft dark:bg-black/30 dark:text-nebbia-soft">
            {tipoLabel(law)}
          </span>
          {law.dimostrativo && (
            <span className="rounded-lg border border-regola px-3 py-1.5 text-xs font-semibold text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
              Scheda di prova
            </span>
          )}
        </div>

        <Heading
          id={titoloId}
          className="mt-4 text-2xl font-extrabold leading-tight text-inchiostro dark:text-nebbia sm:text-3xl"
        >
          <Link
            href={href}
            className="underline-offset-4 hover:text-accento hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accento dark:hover:text-accento-chiara dark:focus-visible:outline-accento-chiara"
          >
            {law.titolo}
          </Link>
        </Heading>

        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft sm:text-base">
          {law.sintesi}
        </p>

        {troncato && (
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Qui vedi solo un pezzo di testo. Leggi tutto nella fonte ufficiale.
          </p>
        )}

        <p className="mt-4 rounded-xl border-l-4 border-accento bg-carta px-4 py-3 text-sm font-medium leading-relaxed text-inchiostro dark:bg-notte dark:text-nebbia">
          <span className="mr-1 font-bold">In 10 secondi:</span>
          {law.semplificata.in10Secondi}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="inline-flex items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-regola dark:bg-black dark:ring-notte-deep">
            <TrafficLight stato={law.stato} showLabel={false} />
            <span className="inline-flex items-center gap-1.5 pr-1 text-sm font-bold text-inchiostro dark:text-nebbia">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${meta.dot}`} />
              A che punto è: {meta.label}
            </span>
          </span>
          <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
            <span className="sr-only">Data: </span>
            <time dateTime={law.dataEmanazione}>{formatDate(law.dataEmanazione)}</time>
          </span>
        </div>

        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
          {law.semplificata.statoLavora.motivo}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          {ridotto ? (
            <Link
              href={href}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-accento px-6 py-3 text-sm font-bold text-white transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento dark:bg-accento-chiara dark:text-notte dark:focus-visible:outline-accento-chiara"
            >
              Leggi la scheda
              <ArrowRight01Icon size={18} strokeWidth={2} aria-hidden="true" />
            </Link>
          ) : (
            <motion.span whileTap={{ scale: 0.97 }} transition={{ duration: 0.15, ease: 'easeOut' }} className="inline-flex">
              <Link
                href={href}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-accento px-6 py-3 text-sm font-bold text-white transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento dark:bg-accento-chiara dark:text-notte dark:focus-visible:outline-accento-chiara"
              >
                Leggi la scheda
                <ArrowRight01Icon size={18} strokeWidth={2} aria-hidden="true" />
              </Link>
            </motion.span>
          )}
          <Link
            href="/leggi"
            className="inline-flex min-h-[48px] items-center text-sm font-bold text-inchiostro-soft underline underline-offset-4 transition-colors hover:text-accento dark:text-nebbia-soft dark:hover:text-accento-chiara"
          >
            Vedi tutte le norme
          </Link>
        </div>
      </>
    )

    if (ridotto) {
      return (
        <article
          aria-labelledby={titoloId}
          className={`relative scroll-mt-24 overflow-hidden rounded-2xl border p-6 sm:p-8 ${VETRO_CLASSE}`}
        >
          {corpo}
        </article>
      )
    }

    return (
      <motion.article
        aria-labelledby={titoloId}
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={`relative scroll-mt-24 overflow-hidden rounded-2xl border p-6 sm:p-8 ${VETRO_CLASSE}`}
      >
        {corpo}
      </motion.article>
    )
  }

  const corpo = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-inchiostro/5 px-2.5 py-1.5 text-xs font-bold text-inchiostro-soft dark:bg-notte-deep dark:text-nebbia-soft">
            {tipoLabel(law)}
          </span>
          {law.dimostrativo && (
            <span className="rounded-lg border border-regola px-2.5 py-1.5 text-xs font-semibold text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
              Di prova
            </span>
          )}
        </span>
        <span className="text-xs text-inchiostro-soft dark:text-nebbia-soft">
          <span className="sr-only">Data: </span>
          <time dateTime={law.dataEmanazione}>{formatDate(law.dataEmanazione)}</time>
        </span>
      </div>

      <Heading className="line-clamp-3 text-base font-extrabold leading-snug text-inchiostro dark:text-nebbia sm:text-lg">
        <Link
          href={href}
          className="underline-offset-4 hover:text-accento hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento dark:hover:text-accento-chiara dark:focus-visible:outline-accento-chiara"
        >
          <Evidenzia testo={law.titolo} q={evidenzia} />
        </Link>
      </Heading>

      <p className="line-clamp-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
        <Evidenzia testo={law.sintesi} q={evidenzia} />
      </p>

      {troncato && (
        <p className="text-xs leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
          Qui vedi solo un pezzo di testo. Leggi tutto nella fonte ufficiale.
        </p>
      )}

      {personaTesto && (
        <p className="line-clamp-3 rounded-xl border-l-4 border-accento bg-carta-soft px-3 py-2 text-sm leading-relaxed text-inchiostro-soft dark:bg-notte dark:text-nebbia-soft">
          <span className="font-bold">Per te:</span> {personaTesto}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        <span className="inline-flex items-center gap-2 rounded-xl bg-white px-2 py-1.5 ring-1 ring-regola dark:bg-black dark:ring-notte-deep">
          <TrafficLight stato={law.stato} size="sm" showLabel={false} />
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-inchiostro dark:text-nebbia">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        </span>
        <span className="sr-only">
          {meta.label}: {meta.descrizione}
        </span>
      </div>

      {mancanti > 0 && (
        <p className="text-xs leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
          Mancano {mancanti} {mancanti === 1 ? 'passo' : 'passi'} prima che valga del tutto.
        </p>
      )}

      <div className="flex min-h-[48px] items-center justify-between gap-2">
        <Link
          href={href}
          aria-label={`Leggi la scheda: ${law.titolo}`}
          className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-accento transition-colors hover:bg-accento/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento dark:text-accento-chiara dark:hover:bg-accento-chiara/10 dark:focus-visible:outline-accento-chiara"
        >
          Leggi la scheda
          <ArrowRight01Icon size={18} strokeWidth={2} aria-hidden="true" />
        </Link>
        <span className="inline-flex min-h-[48px] items-center" title={`Salva "${law.titolo}" tra i salvati`}>
          <PulsantePreferito eli={law.eli} />
        </span>
      </div>
    </>
  )

  if (ridotto) {
    return (
      <article
        style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}
        className="relative flex h-full scroll-mt-24 flex-col gap-3 rounded-2xl border border-regola bg-carta p-5 transition-colors hover:border-inchiostro/40 focus-within:border-inchiostro/40 dark:border-notte-deep dark:bg-notte-soft dark:hover:border-nebbia/40 dark:focus-within:border-nebbia/40"
      >
        {corpo}
      </article>
    )
  }

  return (
    <motion.article
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex h-full scroll-mt-24 flex-col gap-3 rounded-2xl border border-regola bg-carta p-5 transition-colors hover:border-inchiostro/40 focus-within:border-inchiostro/40 dark:border-notte-deep dark:bg-notte-soft dark:hover:border-nebbia/40 dark:focus-within:border-nebbia/40"
    >
      {corpo}
    </motion.article>
  )
}
