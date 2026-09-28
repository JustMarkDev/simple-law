import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import TrafficLight from '@/components/TrafficLight'
import QualityBadges from '@/components/QualityBadges'
import FontiList from '@/components/FontiList'
import LawCard from '@/components/LawCard'
import Disclaimer from '@/components/Disclaimer'
import Comparsa from '@/components/Comparsa'
import CondividiStampa from '@/components/CondividiStamp'
import PulsantePreferito from '@/components/PulsantePreferito'
import {
  attuativiRiepilogo,
  eliPath,
  formatDate,
  formatTipo,
  leggiDelMinistro,
  loadLaws,
  loadLawByEli,
  loadMinisters,
  ministerHref,
  STATO_META,
} from '@/components/seed-fallback'

interface LeggeProps {
  params: Promise<{ eli: string[] }>
}

const AIR_LABEL: Record<string, string> = {
  presente: 'AIR presente',
  semplificata: 'AIR semplificata',
  esente: 'Esente da AIR',
  assente: 'AIR assente',
}

export async function generateStaticParams() {
  const leggi = await loadLaws()
  return leggi.map((law) => ({ eli: eliPath(law) }))
}

export async function generateMetadata({ params }: LeggeProps): Promise<Metadata> {
  const { eli } = await params
  const law = await loadLawByEli(eli.join('/'))
  if (!law) return { title: 'Norma non trovata — Stato della Repubblica' }
  const anno = law.dataEmanazione.slice(0, 4)
  return {
    title: `${formatTipo(law.tipo)} ${law.numero}/${anno} — Stato della Repubblica`,
    description: law.sintesi,
  }
}

function Riquadro({
  numero,
  titolo,
  children,
  sfondo = 'border-regola bg-carta dark:border-notte-deep dark:bg-notte-soft',
  id,
}: {
  numero: number
  titolo: string
  children: ReactNode
  sfondo?: string
  id?: string
}) {
  const anchor = id ?? `riquadro-${numero}`
  return (
    <section aria-labelledby={anchor} className={`scroll-mt-24 border p-5 sm:p-6 ${sfondo}`}>
      <h2 id={anchor} className="flex items-baseline gap-3">
        <span aria-hidden="true" className="font-serif text-3xl font-bold leading-none text-accento dark:text-accento-chiara">
          {String(numero).padStart(2, '0')}
        </span>
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-inchiostro-soft dark:text-nebbia-soft">
          {titolo}
        </span>
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default async function LeggePage({ params }: LeggeProps) {
  const { eli } = await params
  if (eli.length > 10 || eli.join('/').length > 500) notFound()
  const law = await loadLawByEli(eli.join('/'))
  if (!law) notFound()

  const [tutte, ministri] = await Promise.all([loadLaws(), loadMinisters()])
  const semplificata = law.semplificata
  const meta = STATO_META[law.stato]
  const anno = law.dataEmanazione.slice(0, 4)
  const attuativiMancanti = law.attuativi.daAdottare + law.attuativi.scaduti
  const ministriCollegati = ministri.filter((minister) => leggiDelMinistro(minister, [law]).length > 0)
  const collegate = tutte
    .filter((altra) => altra.eli !== law.eli && altra.persone.some((persona) => law.persone.includes(persona)))
    .slice(0, 3)

  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <nav aria-label="Percorso" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/" className="hover:text-accento dark:hover:text-accento-chiara">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/leggi" className="hover:text-accento dark:hover:text-accento-chiara">
                Leggi
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
              {formatTipo(law.tipo)} {law.numero}/{anno}
            </li>
          </ol>
        </nav>

        <header className="mt-4 border-b-2 border-inchiostro pb-6 dark:border-nebbia">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-inchiostro px-3 py-1 font-semibold uppercase tracking-[0.14em] text-carta dark:bg-nebbia dark:text-notte">
              {formatTipo(law.tipo)} {law.numero}/{anno}
            </span>
            {law.dimostrativo && (
              <span className="border border-amber-400 px-3 py-1 font-semibold text-amber-800 dark:border-amber-500/60 dark:text-amber-300">
                Scheda dimostrativa: dati di esempio, non ufficiali
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 font-semibold ring-1 ${meta.bg} ${meta.text} ${meta.ring}`}>
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          </div>
          <h1 className="mt-5 max-w-4xl font-serif text-2xl font-bold leading-tight text-inchiostro dark:text-nebbia sm:text-3xl lg:text-4xl">
            {law.titolo}
          </h1>
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-inchiostro-soft dark:text-nebbia-soft">
            <div className="flex gap-1.5">
              <dt className="font-semibold">Emanazione:</dt>
              <dd>
                <time dateTime={law.dataEmanazione}>{formatDate(law.dataEmanazione)}</time>
              </dd>
            </div>
            {law.nir && (
              <div className="flex min-w-0 gap-1.5">
                <dt className="font-semibold">NIR:</dt>
                <dd className="break-all font-mono text-[11px]">{law.nir}</dd>
              </div>
            )}
          </dl>
          <div className="mt-5">
            <QualityBadges
              gulpease={law.gulpease}
              qualita={law.qualita}
              attuativiCount={attuativiMancanti}
              fontiCount={Object.values(law.fonti).filter(Boolean).length}
            />
          </div>
          <nav aria-label="Sommario della scheda" className="mt-5 flex flex-wrap gap-2 text-xs print:hidden">
            {[
              ['in-10-secondi', 'In 10 secondi'],
              ['riguarda-te', 'Riguarda te'],
              ['cosa-fare', 'Cosa fare'],
              ['funziona', 'Funziona già'],
              ['pro-contro', 'Bene o male'],
              ['fonti', 'Fonti'],
            ].map(([id, label]) => (
              <a key={id} href={`#${id}`} className="border border-regola px-3 py-1.5 hover:border-inchiostro dark:border-notte-deep dark:hover:border-nebbia">
                {label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <CondividiStampa titolo={law.titolo} />
            <PulsantePreferito eli={law.eli} />
          </div>
          <p className="mt-4 flex items-start gap-2 border-l-2 border-regola pl-3 text-xs leading-relaxed text-inchiostro-faint dark:border-notte-deep dark:text-nebbia-faint">
            <span className="font-semibold uppercase tracking-wide text-inchiostro-soft dark:text-nebbia-soft">
              Semplificazione automatica.
            </span>
            I cinque riquadri sono derivati dai dati della scheda e, quando disponibili, dal testo memorizzato. Nessun
            servizio esterno, nessuna chiave richiesta.
          </p>
          <Disclaimer variant="compact" className="mt-3" />
        </header>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <Riquadro numero={1} titolo="In 10 secondi" id="in-10-secondi">
            <p className="capolettera text-lg font-semibold leading-snug text-inchiostro dark:text-nebbia">
              {semplificata.in10Secondi}
            </p>
            {!law.dimostrativo && (
              <p className="mt-3 text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint">
                Cifre e date dai comunicati del Consiglio dei ministri e dalla Gazzetta Ufficiale (vedi Fonti ufficiali).
              </p>
            )}
          </Riquadro>

          <Riquadro numero={2} titolo="Riguarda te?" id="riguarda-te">
            <dl className="grid gap-3 sm:grid-cols-2">
              {(['guida', 'lavoro', 'impresa', 'studio'] as const)
                .filter((persona) => law.persone.includes(persona))
                .map((persona) => {
                  const etichetta = persona.charAt(0).toUpperCase() + persona.slice(1)
                  return (
                    <div key={persona} className="border-l-2 border-regola bg-carta-soft p-3 dark:border-notte-deep dark:bg-notte">
                      <dt className="text-sm font-semibold text-inchiostro dark:text-nebbia">{etichetta}</dt>
                      <dd className="mt-1 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                        {semplificata.perTe[persona]}
                      </dd>
                    </div>
                  )
                })}
            </dl>
          </Riquadro>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Riquadro numero={3} titolo="Cosa fare" id="cosa-fare">
            <ol className="space-y-3">
              {semplificata.cosaFare.map((azione, index) => (
                <li key={`${index}-${azione}`} className="flex gap-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center bg-inchiostro font-serif text-xs font-bold text-carta dark:bg-nebbia dark:text-notte">
                    {index + 1}
                  </span>
                  <span>{azione}</span>
                </li>
              ))}
            </ol>
          </Riquadro>

          <Riquadro
            numero={4}
            titolo="Funziona già?"
            id="funziona"
            sfondo={`border-transparent ring-1 ${meta.bg} ${meta.ring}`}
          >
            <TrafficLight stato={law.stato} />
            <p className="mt-4 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              {semplificata.statoLavora.motivo}
            </p>
            <p className="mt-3 bg-carta/70 px-3 py-2 text-xs leading-relaxed text-inchiostro-soft dark:bg-notte/60 dark:text-nebbia-soft">
              {attuativiRiepilogo(law.attuativi)}
            </p>
          </Riquadro>
        </div>

        <div className="mt-4">
          <Riquadro numero={5} titolo="Bene o male?" id="pro-contro">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Punti a favore</h3>
                <ul className="mt-2 space-y-2">
                  {semplificata.proContro.pro.map((voce) => (
                    <li key={voce} className="flex gap-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                      <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      {voce}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">Punti critici</h3>
                <ul className="mt-2 space-y-2">
                  {semplificata.proContro.contro.map((voce) => (
                    <li key={voce} className="flex gap-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                      <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                      {voce}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <dl className="mt-6 grid gap-px border border-regola bg-regola pt-0 dark:border-notte-deep dark:bg-notte-deep sm:grid-cols-3">
              <div className="bg-carta p-3 dark:bg-notte">
                <dt className="text-xs font-semibold text-inchiostro-soft dark:text-nebbia-soft">Qualità complessiva</dt>
                <dd className="mt-1 font-serif text-lg font-bold text-inchiostro dark:text-nebbia">{law.qualita}/100</dd>
              </div>
              <div className="bg-carta p-3 dark:bg-notte">
                <dt className="text-xs font-semibold text-inchiostro-soft dark:text-nebbia-soft">Leggibilità Gulpease</dt>
                <dd className="mt-1 font-serif text-lg font-bold text-inchiostro dark:text-nebbia">{law.gulpease}/100</dd>
              </div>
              <div className="bg-carta p-3 dark:bg-notte">
                <dt className="text-xs font-semibold text-inchiostro-soft dark:text-nebbia-soft">Attuativi mancanti</dt>
                <dd className="mt-1 font-serif text-lg font-bold text-inchiostro dark:text-nebbia">{attuativiMancanti}</dd>
              </div>
            </dl>
          </Riquadro>
        </div>

        <section aria-labelledby="fonti" className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft sm:p-6">
            <h2 id="fonti" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              Fonti ufficiali
            </h2>
            <p className="mt-1 text-sm text-inchiostro-soft dark:text-nebbia-soft">
              Apri i testi originali. I link si aprono in una nuova scheda.
            </p>
            <FontiList fonti={law.fonti} modalita="block" className="mt-4" />
          </div>

          <div className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft sm:p-6">
            <h2 className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">Trasparenza dell’iter</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4 border-b border-regola pb-3 dark:border-notte-deep">
                <dt className="text-inchiostro-soft dark:text-nebbia-soft">Analisi di impatto</dt>
                <dd className="font-semibold text-inchiostro dark:text-nebbia">{AIR_LABEL[law.air] ?? law.air}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-regola pb-3 dark:border-notte-deep">
                <dt className="text-inchiostro-soft dark:text-nebbia-soft">Voto di fiducia</dt>
                <dd className="font-semibold text-inchiostro dark:text-nebbia">{law.fiducia ? 'Sì' : 'No'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-regola pb-3 dark:border-notte-deep">
                <dt className="text-inchiostro-soft dark:text-nebbia-soft">Testo omnibus</dt>
                <dd className="font-semibold text-inchiostro dark:text-nebbia">{law.omnibus ? 'Sì' : 'No'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-inchiostro-soft dark:text-nebbia-soft">Punteggio qualità</dt>
                <dd className="font-semibold text-inchiostro dark:text-nebbia">{law.qualita}/100</dd>
              </div>
            </dl>
          </div>
        </section>

        {ministriCollegati.length > 0 && (
          <section aria-labelledby="ministri-collegati" className="mt-8">
            <h2 id="ministri-collegati" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              Ministri collegati
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {ministriCollegati.map((minister) => (
                <li key={minister.slug}>
                  <Link
                    href={ministerHref(minister)}
                    className="inline-flex flex-col border border-regola bg-carta px-4 py-3 transition-colors hover:border-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:hover:border-nebbia dark:focus-visible:outline-nebbia"
                  >
                    <span className="text-sm font-semibold text-inchiostro dark:text-nebbia">{minister.nome}</span>
                    <span className="text-xs text-inchiostro-faint dark:text-nebbia-faint">{minister.dicastero}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {collegate.length > 0 && (
          <section aria-labelledby="collegate" className="mt-10">
            <h2 id="collegate" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              Norme collegate
            </h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {collegate.map((altra, index) => (
                <li key={altra.eli} className="flex">
                  <Comparsa className="flex w-full" delay={Math.min(index * 0.05, 0.2)}>
                    <LawCard law={altra} headingLevel="h3" />
                  </Comparsa>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-10 flex flex-col gap-4 border-t border-regola pt-6 dark:border-notte-deep sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/leggi"
            className="inline-flex items-center gap-2 text-sm font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m6 6-6-6 6-6" />
            </svg>
            Torna all’elenco
          </Link>
          <p className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
            Identificatore ELI: <span className="break-all font-mono">{law.eli}</span>
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}
