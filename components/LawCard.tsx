'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight01Icon } from 'hugeicons-react'
import Evidenzia from './Evidenzia'
import PulsantePreferito from './PulsantePreferito'
import { formatDate, lawHref, STATO_META, tipoLabel, type Law } from './seed-fallback'
import { paroleVigenza } from '@/lib/filtri-leggi'

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

function normalizzaTesto(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Distanza di modifica tra due testi, con tetto a 24 per il gate In breve. */
function distanzaTesti(a: string, b: string, tetto = 24): number {
  const x = normalizzaTesto(a)
  const y = normalizzaTesto(b)
  if (x === y) return 0
  if (!x || !y) return tetto
  if (Math.abs(x.length - y.length) >= tetto) return tetto
  if (x.includes(y) || y.includes(x)) return Math.abs(x.length - y.length)
  const n = Math.min(x.length, 200)
  const m = Math.min(y.length, 200)
  const prev = new Array<number>(m + 1)
  const curr = new Array<number>(m + 1)
  for (let j = 0; j <= m; j++) prev[j] = j
  for (let i = 1; i <= n; i++) {
    curr[0] = i
    let rigaMin = curr[0]
    for (let j = 1; j <= m; j++) {
      const costo = x[i - 1] === y[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + costo)
      if (curr[j] < rigaMin) rigaMin = curr[j]
    }
    for (let j = 0; j <= m; j++) prev[j] = curr[j]
    if (rigaMin >= tetto && i > tetto) return tetto
  }
  return prev[m] ?? tetto
}

/** Mostra In breve solo se diversa dalla sintesi per almeno 24 caratteri. */
function mostraInBreve(inBreve: string, sintesi: string): boolean {
  const a = (inBreve ?? '').trim()
  if (a.length < 2) return false
  const b = (sintesi ?? '').trim()
  if (!b) return true
  return distanzaTesti(a, b, 24) >= 24
}

/*
 * Liquid-glass approssimato (onesto: nessuna libreria ufficiale).
 * Solo backdrop-blur piu tinta calda traslucida piu bordo 1px bianco/40 piu
 * ombra interna sottile. Fallback tinta piena quando backdrop-filter
 * manca (supports-*) e con prefers-reduced-transparency.
 */
const VETRO_CLASSE =
  'border-white/40 bg-carta-soft/80 supports-[backdrop-filter]:bg-carta-soft/70 supports-[backdrop-filter]:backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_12px_32px_rgba(26,23,20,0.08)] [@media(prefers-reduced-transparency:reduce)]:bg-carta-soft [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-0 [@media(prefers-reduced-transparency:reduce)]:shadow-none dark:border-white/10 dark:bg-notte-soft/85 dark:supports-[backdrop-filter]:bg-notte-soft/75 dark:supports-[backdrop-filter]:backdrop-blur-md dark:[@media(prefers-reduced-transparency:reduce)]:bg-notte-soft'

const FUOCO =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:focus-visible:outline-accento-chiara'

/** Card di una legge. Solo il titolo e cliccabile piu una CTA esplicita. */
export default function LawCard({ law, featured = false, persona, headingLevel = 'h3', evidenzia = '' }: LawCardProps) {
  const Heading = headingLevel
  const href = lawHref(law)
  const meta = STATO_META[law.stato]
  const motivoVigenza = law.semplificata.statoLavora.motivo
  const vigenza = paroleVigenza(motivoVigenza)
  const leggeNonVigore = vigenza.parole === 'Non più in vigore'
  const etichettaStato = leggeNonVigore ? vigenza.label : meta.label
  const descrizioneStato = leggeNonVigore ? vigenza.descrizione : meta.descrizione
  const ridotto = useReducedMotion()
  const personaTesto = persona && persona !== 'tutti' ? law.semplificata.perTe[persona] : undefined
  const titoloId = `titolo-${law.eli.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'norma'}`
  const mancanti = passiMancanti(law)
  const troncato = law.testoTroncato === true
  const inBreve = (law.semplificata.in10Secondi ?? '').trim()
  const mostraBreve = mostraInBreve(inBreve, law.sintesi ?? '')

  if (featured) {
    const corpo = (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge bg-carta-soft/70 text-inchiostro-soft dark:bg-notte-deep/70 dark:text-nebbia-soft">
            {tipoLabel(law)}
          </span>
          {law.dimostrativo && (
            <span className="badge border border-regola text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
              Scheda di prova
            </span>
          )}
        </div>

        <Heading
          id={titoloId}
          className="mt-4 max-w-3xl text-2xl font-extrabold leading-tight text-inchiostro dark:text-nebbia sm:text-3xl"
        >
          <Link
            href={href}
            className={`underline-offset-4 transition-colors hover:text-accento hover:underline dark:hover:text-accento-chiara ${FUOCO}`}
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

        {mostraBreve && (
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-inchiostro dark:text-nebbia">
            <span className="font-bold">In breve, </span>
            {inBreve}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-carta-soft/70 px-3 py-2 text-sm font-bold text-inchiostro ring-1 ring-regola dark:bg-notte-deep/70 dark:text-nebbia dark:ring-notte-deep">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${meta.dot}`} />
            A che punto è: {etichettaStato}
          </span>
          <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
            <span className="sr-only">Data: </span>
            <time dateTime={law.dataEmanazione}>{formatDate(law.dataEmanazione)}</time>
          </span>
        </div>

        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
          {law.semplificata.statoLavora.motivo}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          {ridotto ? (
            <Link href={href} className="btn-primario">
              Leggi la scheda
              <ArrowRight01Icon size={18} strokeWidth={2} aria-hidden="true" />
            </Link>
          ) : (
            <motion.span whileTap={{ scale: 0.97 }} transition={{ duration: 0.15, ease: 'easeOut' }} className="inline-flex">
              <Link href={href} className="btn-primario">
                Leggi la scheda
                <ArrowRight01Icon size={18} strokeWidth={2} aria-hidden="true" />
              </Link>
            </motion.span>
          )}
          <Link
            href="/leggi"
            className={`inline-flex min-h-[48px] items-center text-sm font-bold text-inchiostro-soft underline underline-offset-4 transition-colors hover:text-accento dark:text-nebbia-soft dark:hover:text-accento-chiara ${FUOCO}`}
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
          <span className="badge bg-inchiostro/5 text-inchiostro-soft dark:bg-notte-deep dark:text-nebbia-soft">
            {tipoLabel(law)}
          </span>
          {law.dimostrativo && (
            <span className="badge border border-regola text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
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
          className={`underline-offset-4 transition-colors hover:text-accento hover:underline dark:hover:text-accento-chiara ${FUOCO}`}
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

      {mostraBreve && (
        <p className="line-clamp-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
          <span className="font-bold text-inchiostro dark:text-nebbia">In breve, </span>
          {inBreve}
        </p>
      )}

      {personaTesto && (
        <p className="line-clamp-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
          <span className="font-bold text-inchiostro dark:text-nebbia">Per te, </span>
          {personaTesto}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-carta-soft/70 px-2 py-1.5 text-xs font-bold text-inchiostro ring-1 ring-regola dark:bg-notte-deep/70 dark:text-nebbia dark:ring-notte-deep">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${meta.dot}`} />
          {etichettaStato}
        </span>
        <span className="sr-only">
          {etichettaStato}: {descrizioneStato}
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
          className={`inline-flex min-h-[48px] items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-accento transition-colors hover:bg-accento/10 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:text-accento-chiara dark:hover:bg-accento-chiara/10 dark:focus-visible:outline-accento-chiara`}
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
        className="relative flex h-full scroll-mt-24 flex-col gap-4 rounded-2xl border border-regola bg-carta p-5 transition-all hover:-translate-y-0.5 hover:border-accento hover:shadow-cozy-lg focus-within:border-accento dark:border-notte-deep dark:bg-notte-soft dark:hover:border-accento-chiara dark:focus-within:border-accento-chiara motion-reduce:transition-colors motion-reduce:hover:translate-y-0 sm:p-6"
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
      className="relative flex h-full scroll-mt-24 flex-col gap-4 rounded-2xl border border-regola bg-carta p-5 transition-all hover:-translate-y-0.5 hover:border-accento hover:shadow-cozy-lg focus-within:border-accento dark:border-notte-deep dark:bg-notte-soft dark:hover:border-accento-chiara dark:focus-within:border-accento-chiara motion-reduce:transition-colors motion-reduce:hover:translate-y-0 sm:p-6"
    >
      {corpo}
    </motion.article>
  )
}
