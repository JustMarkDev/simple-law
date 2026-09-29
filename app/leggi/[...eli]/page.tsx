import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft01Icon, ArrowRight01Icon } from 'hugeicons-react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import TrafficLight from '@/components/TrafficLight'
import QualityBadges from '@/components/QualityBadges'
import FontiList from '@/components/FontiList'
import ChecklistFare from '@/components/ChecklistFare'
import LawCard from '@/components/LawCard'
import Disclaimer from '@/components/Disclaimer'
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
import { paroleVigenza } from '@/lib/filtri-leggi'

interface LeggeProps {
  params: Promise<{ eli: string[] }>
}

export const dynamicParams = true

const MAX_STATIC_PARAMS = 100

// Nota: restano prerenderizzate solo le prime 100 schede.
// La discoverability oltre i 100 è via sitemap + ricerca: non alzare a 5000.

const AIR_LABEL: Record<string, string> = {
  presente: 'AIR presente',
  semplificata: 'AIR semplificata',
  esente: 'Esente da AIR',
  assente: 'AIR assente',
}

const PERSONA_LABEL: Record<string, string> = {
  guida: 'Guida',
  lavoro: 'Lavoro',
  impresa: 'Impresa',
  studio: 'Studio',
}

const GLOSSARIO: { termine: string; definizione: string }[] = [
  { termine: 'AIR', definizione: 'Analisi di impatto: documento che stima costi e benefici della norma.' },
  { termine: 'Attuativi', definizione: 'Regole successive senza cui la norma non vale del tutto.' },
  { termine: 'Omnibus', definizione: 'Testo che raccoglie temi diversi in un unico provvedimento.' },
  { termine: 'Fiducia', definizione: 'Voto che lega l’approvazione della norma al Governo in carica.' },
]

const DOMINI_AMMESSI_JSONLD: readonly string[] = [
  'normattiva.it',
  'gazzettaufficiale.it',
  'governo.it',
  'camera.it',
  'senato.it',
]

/** Stesse regole di `FontiList`: solo https verso domini ufficiali. Mai throw. */
function stessiAmmessi(fonti: Record<string, unknown>): string[] {
  try {
    const out: string[] = []
    for (const valore of Object.values(fonti ?? {})) {
      if (typeof valore !== 'string' || !valore || valore.length > 2000) continue
      const testo = valore.trim()
      const minuscolo = testo.toLowerCase()
      if (minuscolo.startsWith('javascript:') || minuscolo.startsWith('data:') || minuscolo.startsWith('vbscript:')) {
        continue
      }
      try {
        const parsed = new URL(testo)
        if (parsed.protocol !== 'https:') continue
        const ok = DOMINI_AMMESSI_JSONLD.some(
          (d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`),
        )
        if (ok) out.push(testo)
      } catch {
        continue
      }
    }
    return out.slice(0, 5)
  } catch {
    return []
  }
}

export async function generateStaticParams() {
  const leggi = await loadLaws()
  return leggi.slice(0, MAX_STATIC_PARAMS).map((law) => ({ eli: eliPath(law) }))
}

export async function generateMetadata({ params }: LeggeProps): Promise<Metadata> {
  const { eli } = await params
  const law = await loadLawByEli(eli.join('/'))
  if (!law) return { title: 'Norma non trovata - Stato della Repubblica' }
  const anno = law.dataEmanazione.slice(0, 4)
  const titolo = `${law.titolo} - ${formatTipo(law.tipo)} ${law.numero}/${anno}`
  return {
    title: titolo,
    description: law.sintesi,
    openGraph: {
      title: titolo,
      description: law.sintesi,
      type: 'article',
    },
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
    <section aria-labelledby={anchor} className={`scroll-mt-24 rounded-2xl border p-5 sm:p-6 ${sfondo}`}>
      <h2 id={anchor} className="flex items-baseline gap-3">
        <span aria-hidden="true" className="text-3xl font-bold leading-none text-accento dark:text-accento-chiara">
          {String(numero).padStart(2, '0')}
        </span>
        <span className="text-xs font-bold text-inchiostro-soft dark:text-nebbia-soft">
          {titolo}
        </span>
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function TabsPersona({ perTe, persone }: { perTe: Record<string, string>; persone: string[] }) {
  const attive = (['guida', 'lavoro', 'impresa', 'studio'] as const).filter((p) => persone.includes(p))
  if (attive.length === 0) {
    return <p className="text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">Nessun profilo coinvolto in modo diretto.</p>
  }
  // Tutte le schede visibili in pila: accessibile senza JS, nessun pannello nascosto
  // che resta inaccessibile da tastiera/screen-reader (fix revisione P0).
  return (
    <div>
      <ul className="space-y-3">
        {attive.map((persona) => (
          <li key={persona} className="rounded-2xl border border-regola bg-carta p-4 dark:border-notte-deep dark:bg-notte-soft">
            <h3 className="text-sm font-semibold text-inchiostro dark:text-nebbia">{PERSONA_LABEL[persona] ?? persona}</h3>
            <p className="mt-1 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">{perTe[persona]}</p>
          </li>
        ))}
      </ul>
    </div>
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
  const motivoVigenza = semplificata.statoLavora.motivo
  const vigenza = paroleVigenza(motivoVigenza)
  const leggeNonVigore = vigenza.parole === 'Non più in vigore'
  const etichettaStato = leggeNonVigore ? vigenza.label : meta.label
  const anno = law.dataEmanazione.slice(0, 4)
  const attuativiMancanti = law.attuativi.daAdottare + law.attuativi.scaduti
  const ministriCollegati = ministri.filter((minister) => leggiDelMinistro(minister, [law]).length > 0)
  const collegate = tutte
    .filter((altra) => altra.eli !== law.eli && altra.persone.some((persona) => law.persone.includes(persona)))
    .slice(0, 3)

  const ordinate = [...tutte].sort((a, b) =>
    a.dataEmanazione === b.dataEmanazione ? a.eli.localeCompare(b.eli) : a.dataEmanazione.localeCompare(b.dataEmanazione),
  )
  const indice = ordinate.findIndex((v) => v.eli === law.eli)
  const precedente = indice > 0 ? ordinate[indice - 1] : null
  const successiva = indice >= 0 && indice < ordinate.length - 1 ? ordinate[indice + 1] : null

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Legislation',
    name: law.titolo,
    legislationIdentifier: law.nir || law.eli,
    datePublished: law.dataEmanazione,
    inForceStatus: etichettaStato,
    abstract: law.sintesi,
    legislationType: formatTipo(law.tipo),
    sameAs: stessiAmmessi(law.fonti as unknown as Record<string, unknown>),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <nav aria-label="Percorso" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/" className="inline-flex min-h-[48px] min-w-[48px] items-center rounded-xl hover:text-accento dark:hover:text-accento-chiara">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/leggi" className="inline-flex min-h-[48px] min-w-[48px] items-center rounded-xl hover:text-accento dark:hover:text-accento-chiara">
                Leggi
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="inline-flex min-h-[48px] items-center font-medium text-inchiostro dark:text-nebbia">
              {formatTipo(law.tipo)} {law.numero}/{anno}
            </li>
          </ol>
        </nav>

        <header className="mt-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-lg bg-inchiostro px-3 py-1 font-semibold text-carta dark:bg-nebbia dark:text-notte">
              {formatTipo(law.tipo)} {law.numero}/{anno}
            </span>
            {law.dimostrativo ? (
              <span className="rounded-lg border border-amber-400 px-3 py-1 font-semibold text-amber-800 dark:border-amber-500/60 dark:text-amber-300">
                Scheda di esempio: dati inventati per provare
              </span>
            ) : (
              <span className="rounded-lg border border-emerald-600 px-3 py-1 font-semibold text-emerald-800 dark:border-emerald-500/60 dark:text-emerald-300">
                Testo vero: dai dati ufficiali (vedi sotto)
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 font-semibold ring-1 ${meta.bg} ${meta.text} ${meta.ring}`}>
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${meta.dot}`} />
              {etichettaStato}
            </span>
          </div>
          <h1 id="titolo-scheda" tabIndex={-1} className="mt-5 max-w-4xl text-2xl font-bold leading-tight text-inchiostro outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-inchiostro dark:text-nebbia dark:focus-visible:outline-nebbia sm:text-3xl lg:text-4xl">
            {law.titolo}
          </h1>
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-inchiostro-soft dark:text-nebbia-soft">
            <div className="flex gap-1.5">
              <dt className="font-semibold">Data:</dt>
              <dd>
                <time dateTime={law.dataEmanazione}>{formatDate(law.dataEmanazione)}</time>
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-semibold">A che punto è:</dt>
              <dd>{etichettaStato}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-semibold">Lettura:</dt>
              <dd className="font-mono tabular-nums">{law.gulpease}/100</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-semibold">Scheda:</dt>
              <dd className="font-mono tabular-nums">{law.qualita}/100</dd>
            </div>
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
              ['in-10-secondi', 'Cosa dice'],
              ['riguarda-te', 'Riguarda te'],
              ['cosa-fare', 'Cosa fare'],
              ['funziona', 'A che punto è'],
              ['pro-contro', 'Cosa va e cosa no'],
              ['fonti', 'Testi veri'],
            ].map(([id, label]) => (
              <a key={id} href={`#${id}`} className="inline-flex min-h-[48px] min-w-[48px] items-center rounded-xl border border-regola px-3 py-2 hover:border-accento focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:hover:border-nebbia dark:focus-visible:outline-nebbia">
                {label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <CondividiStampa titolo={law.titolo} />
            <PulsantePreferito eli={law.eli} />
          </div>
          <p className="mt-4 flex items-start gap-2 rounded-2xl border border-regola bg-carta px-4 py-3 text-xs leading-relaxed text-inchiostro-faint dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-faint">
            <span className="font-semibold text-inchiostro-soft dark:text-nebbia-soft">
              Testo semplificato.
            </span>
            I riquadri sotto nascono dai dati della scheda. Nessun servizio esterno, nessuna chiave richiesta.
          </p>
          <Disclaimer variant="compact" className="mt-3" />
        </header>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <Riquadro numero={1} titolo="Cosa dice" id="in-10-secondi">
            <p className="text-lg font-semibold leading-snug text-inchiostro dark:text-nebbia">
              {semplificata.in10Secondi}
            </p>
            {!law.dimostrativo && (
              <p className="mt-3 text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint">
                Cifre e date dai testi veri elencati sotto.
              </p>
            )}
            <details className="mt-4 rounded-xl border border-regola bg-carta-soft p-3 dark:border-notte-deep dark:bg-notte">
              <summary className="inline-flex min-h-[48px] cursor-pointer items-center rounded-xl text-sm font-semibold text-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:text-nebbia dark:focus-visible:outline-nebbia">
                Parole da conoscere
              </summary>
              <dl className="mt-2 space-y-2">
                {GLOSSARIO.map((voce) => (
                  <div key={voce.termine} className="text-sm leading-relaxed">
                    <dt className="inline font-semibold text-inchiostro dark:text-nebbia">
                      <dfn title={voce.definizione}>{voce.termine}</dfn>:{" "}
                    </dt>
                    <dd className="inline text-inchiostro-soft dark:text-nebbia-soft">{voce.definizione}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </Riquadro>

          <Riquadro numero={2} titolo="Riguarda te?" id="riguarda-te">
            <TabsPersona perTe={semplificata.perTe as Record<string, string>} persone={law.persone} />
          </Riquadro>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Riquadro numero={3} titolo="Cosa fare" id="cosa-fare">
            <ChecklistFare voci={semplificata.cosaFare} />
          </Riquadro>

          <Riquadro
            numero={4}
            titolo="A che punto è"
            id="funziona"
            sfondo={`border-transparent ring-1 ${meta.bg} ${meta.ring}`}
          >
            <TrafficLight stato={law.stato} motivo={semplificata.statoLavora.motivo} />
            <p className="mt-4 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              <dfn title="Regole successive senza cui la norma non vale del tutto">Attuativi</dfn>:{" "}
              {attuativiRiepilogo(law.attuativi)}
            </p>
          </Riquadro>
        </div>

        <div className="mt-4">
          <Riquadro numero={5} titolo="Cosa va e cosa no" id="pro-contro">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Cosa va</h3>
                <ul className="mt-2 space-y-2">
                  {semplificata.proContro.pro.map((voce) => (
                    <li key={voce} className="flex gap-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                      <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-sm bg-emerald-500" />
                      {voce}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">Cosa non va</h3>
                <ul className="mt-2 space-y-2">
                  {semplificata.proContro.contro.map((voce) => (
                    <li key={voce} className="flex gap-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                      <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-sm bg-red-500" />
                      {voce}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <dl className="mt-6 grid gap-px overflow-hidden rounded-xl border border-regola bg-regola pt-0 dark:border-notte-deep dark:bg-notte-deep sm:grid-cols-3">
              <div className="bg-carta p-3 dark:bg-notte">
                <dt className="text-xs font-semibold text-inchiostro-soft dark:text-nebbia-soft">Scheda completa</dt>
                <dd className="mt-1 font-mono text-lg font-bold tabular-nums text-inchiostro dark:text-nebbia">{law.qualita}/100</dd>
              </div>
              <div className="bg-carta p-3 dark:bg-notte">
                <dt className="text-xs font-semibold text-inchiostro-soft dark:text-nebbia-soft">Facile da leggere</dt>
                <dd className="mt-1 font-mono text-lg font-bold tabular-nums text-inchiostro dark:text-nebbia">{law.gulpease}/100</dd>
              </div>
              <div className="bg-carta p-3 dark:bg-notte">
                <dt className="text-xs font-semibold text-inchiostro-soft dark:text-nebbia-soft">Passaggi mancanti</dt>
                <dd className="mt-1 font-mono text-lg font-bold tabular-nums text-inchiostro dark:text-nebbia">{attuativiMancanti}</dd>
              </div>
            </dl>
          </Riquadro>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          <section aria-labelledby="stato-attuativo-titolo" className="scroll-mt-24 rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft sm:p-6">
            <h2 id="stato-attuativo-titolo" className="text-lg font-bold text-inchiostro dark:text-nebbia">
              Vale già?
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              {attuativiRiepilogo(law.attuativi)}
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-regola bg-regola dark:border-notte-deep dark:bg-notte-deep">
              <div className="bg-carta p-3 dark:bg-notte">
                <dt className="text-xs text-inchiostro-soft dark:text-nebbia-soft">Pronti</dt>
                <dd className="mt-1 font-mono text-lg font-bold tabular-nums text-inchiostro dark:text-nebbia">
                  {law.attuativi.adottati}
                </dd>
              </div>
              <div className="bg-carta p-3 dark:bg-notte">
                <dt className="text-xs text-inchiostro-soft dark:text-nebbia-soft">Da fare</dt>
                <dd className="mt-1 font-mono text-lg font-bold tabular-nums text-inchiostro dark:text-nebbia">
                  {law.attuativi.daAdottare}
                </dd>
              </div>
              <div className="bg-carta p-3 dark:bg-notte">
                <dt className="text-xs text-inchiostro-soft dark:text-nebbia-soft">Scaduti</dt>
                <dd className="mt-1 font-mono text-lg font-bold tabular-nums text-inchiostro dark:text-nebbia">
                  {law.attuativi.scaduti}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              {etichettaStato}: {semplificata.statoLavora.motivo}
            </p>
          </section>

          <section aria-labelledby="fonti-ufficiali" className="scroll-mt-24 rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft sm:p-6">
            <h2 id="fonti-ufficiali" className="text-lg font-bold text-inchiostro dark:text-nebbia">
              Fonti ufficiali
            </h2>
            <p className="mt-1 text-sm text-inchiostro-soft dark:text-nebbia-soft">
              Apri i testi veri. Si aprono in una nuova pagina.
            </p>
            <FontiList fonti={law.fonti} modalita="block" className="mt-4" />
          </section>

          <section aria-labelledby="trasparenza-iter" className="scroll-mt-24 rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft sm:p-6">
            <h2 id="trasparenza-iter" className="text-lg font-bold text-inchiostro dark:text-nebbia">Come è nata</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4 border-b border-regola pb-3 dark:border-notte-deep">
                <dt className="text-inchiostro-soft dark:text-nebbia-soft">Studio prima della legge</dt>
                <dd className="font-semibold text-inchiostro dark:text-nebbia">{AIR_LABEL[law.air] ?? law.air}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-regola pb-3 dark:border-notte-deep">
                <dt className="text-inchiostro-soft dark:text-nebbia-soft">Voto di fiducia</dt>
                <dd className="font-semibold text-inchiostro dark:text-nebbia">{law.fiducia ? 'Sì' : 'No'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-regola pb-3 dark:border-notte-deep">
                <dt className="text-inchiostro-soft dark:text-nebbia-soft">Testo con molti temi</dt>
                <dd className="font-semibold text-inchiostro dark:text-nebbia">{law.omnibus ? 'Sì' : 'No'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-inchiostro-soft dark:text-nebbia-soft">Scheda completa</dt>
                <dd className="font-mono font-semibold tabular-nums text-inchiostro dark:text-nebbia">{law.qualita}/100</dd>
              </div>
            </dl>
          </section>
        </div>

        {ministriCollegati.length > 0 && (
          <section aria-labelledby="ministri-collegati" className="mt-8 scroll-mt-24">
            <h2 id="ministri-collegati" className="text-lg font-bold text-inchiostro dark:text-nebbia">
              Ministri collegati
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {ministriCollegati.map((minister) => (
                <li key={minister.slug}>
                  <Link
                    href={ministerHref(minister)}
                    className="inline-flex min-h-[48px] flex-col justify-center rounded-xl border border-regola bg-carta px-4 py-2 transition-colors hover:border-accento focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:hover:border-nebbia dark:focus-visible:outline-nebbia"
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
          <section aria-labelledby="collegate" className="mt-10 scroll-mt-24">
            <h2 id="collegate" className="text-lg font-bold text-inchiostro dark:text-nebbia">
              Norme vicine
            </h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {collegate.map((altra) => (
                <li key={altra.eli} className="flex overflow-hidden rounded-2xl" style={{ contentVisibility: 'auto' }}>
                  <LawCard law={altra} headingLevel="h3" />
                </li>
              ))}
            </ul>
          </section>
        )}

        <nav aria-label="Norma precedente e successiva" className="mt-10 grid gap-3 border-t border-regola pt-6 dark:border-notte-deep sm:grid-cols-2">
          {precedente ? (
            <Link
              href={`/leggi/${precedente.eli}`}
              rel="prev"
              className="inline-flex min-h-[48px] flex-col justify-center rounded-xl border border-regola px-4 py-3 hover:border-accento focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:hover:border-nebbia dark:focus-visible:outline-nebbia"
            >
              <span className="inline-flex items-center gap-1.5 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                <ArrowLeft01Icon size={14} aria-hidden="true" />
                Prima di questa
              </span>
              <span className="mt-1 text-sm font-semibold text-inchiostro dark:text-nebbia">
                {formatTipo(precedente.tipo)} {precedente.numero}/{precedente.dataEmanazione.slice(0, 4)}
              </span>
            </Link>
          ) : (
            <span className="inline-flex min-h-[48px] items-center rounded-xl px-4 py-3 text-xs text-inchiostro-faint dark:text-nebbia-faint">
              È la norma meno recente dell’elenco.
            </span>
          )}
          {successiva ? (
            <Link
              href={`/leggi/${successiva.eli}`}
              rel="next"
              className="inline-flex min-h-[48px] flex-col justify-center rounded-xl border border-regola px-4 py-3 text-right hover:border-accento focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:hover:border-nebbia dark:focus-visible:outline-nebbia"
            >
              <span className="inline-flex items-center justify-end gap-1.5 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                Dopo questa
                <ArrowRight01Icon size={14} aria-hidden="true" />
              </span>
              <span className="mt-1 text-sm font-semibold text-inchiostro dark:text-nebbia">
                {formatTipo(successiva.tipo)} {successiva.numero}/{successiva.dataEmanazione.slice(0, 4)}
              </span>
            </Link>
          ) : (
            <span className="inline-flex min-h-[48px] items-center justify-end rounded-xl px-4 py-3 text-xs text-inchiostro-faint dark:text-nebbia-faint">
              È la norma più recente dell’elenco.
            </span>
          )}
        </nav>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/leggi"
            className="inline-flex min-h-[48px] min-w-[48px] items-center gap-2 rounded-xl text-sm font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
          >
            <ArrowLeft01Icon size={16} aria-hidden="true" />
            Torna all’elenco
          </Link>
        </div>
      </main>
      <Footer />
    </>
  )
}
