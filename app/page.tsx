import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SearchBar from '@/components/SearchBar'
import PersonaFilter from '@/components/PersonaFilter'
import LawCard from '@/components/LawCard'
import MinisterCard from '@/components/MinisterCard'
import Comparsa from '@/components/Comparsa'
import Contatore from '@/components/Contatore'
import CorpusBadge from '@/components/CorpusBadge'
import { loadMinisters, normalizeLaw, personaRelevant, STATO_META, type Law } from '@/components/seed-fallback'
import { coloreSemaforoRecord, personaRilevanteRecord } from '@/lib/filtri-leggi'
import { countLaws, queryLaws } from '@/lib/db'
import { getCorpusInfo } from '@/lib/sources'
import type { LawRecordExtra } from '@/lib/db'

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

/** La home non renderizza mai più di 12 schede: 1 in evidenza + 11 recenti. */
const MAX_CARD_HOME = 12
/** Estratto bounded per i conteggi home (semaforo + filtro persona): 5000 record max. */
const ESTRATTO_HOME_MAX = 5000

/** Mirror di `featured` in `normalizeLaw`: DL 133/2026 in evidenza. */
function isFeaturedRecord(record: Pick<LawRecordExtra, 'numero' | 'tipo'>): boolean {
  return record.numero === '133' && (record.tipo ?? '').includes('decreto.legge')
}

function normalizzaSicura(record: LawRecordExtra): Law | null {
  try {
    return normalizeLaw(record)
  } catch {
    return null
  }
}

/** Firma attesa da `getCorpusInfo` esteso (giudice): mai rompere i 3 campi base. */
interface InfoCorpusGiudice {
  base: number
  espansi: number
  totale: number
  reali?: number
  ufficiali?: number
  dimostrative?: number
}

/** Composizione onesta per il badge: solo `getCorpusInfo`, mai throw, null se 0. */
function leggiComposizione(): { totale: number; ufficiali: number; dimostrative: number } | null {
  try {
    const info = getCorpusInfo() as InfoCorpusGiudice
    const totale = typeof info?.totale === 'number' && Number.isFinite(info.totale) ? Math.floor(info.totale) : 0
    if (totale <= 0) return null
    const grezzi = info?.ufficiali ?? info?.reali ?? 0
    const ufficiali =
      typeof grezzi === 'number' && Number.isFinite(grezzi)
        ? Math.min(totale, Math.max(0, Math.floor(grezzi)))
        : 0
    const dimGrezzi = info?.dimostrative ?? 0
    const dimostrative =
      typeof dimGrezzi === 'number' && Number.isFinite(dimGrezzi)
        ? Math.min(totale, Math.max(0, Math.floor(dimGrezzi)))
        : 0
    return { totale, ufficiali, dimostrative }
  } catch {
    return null
  }
}

export default async function HomePage({ searchParams }: HomeProps) {
  const sp = await searchParams
  const qGrezza = typeof sp.q === 'string' ? sp.q : ''
  const q = qGrezza.slice(0, 200).trim()
  const persona = typeof sp.persona === 'string' && sp.persona ? sp.persona : 'tutti'

  // La ricerca testuale vive in archivio (`/leggi`), dove è paginata lato
  // server: la home con `?q` rimanda lì invece di scansionare il corpus.
  if (q) {
    const params = new URLSearchParams({ q })
    if (persona !== 'tutti') params.set('persona', persona)
    redirect(`/leggi?${params.toString()}`)
  }

  // Totale reale via conteggio DB (mai scansioni triple in memoria) +
  // estratto bounded data_desc per conteggi semaforo/persona e vetrina 12.
  const [totaleConteggiato, estratto, ministri] = await Promise.all([
    countLaws().catch(() => 0),
    queryLaws({}, ESTRATTO_HOME_MAX).catch(() => [] as LawRecordExtra[]),
    loadMinisters().catch(() => []),
  ])
  const totaleReale = totaleConteggiato > 0 ? totaleConteggiato : estratto.length
  const troncato = totaleReale > estratto.length

  // Un'unica passata sull'estratto: conteggi semaforo, totale filtrati per
  // persona e candidati per la vetrina (mai più di 12 schede renderizzate).
  let verde = 0
  let giallo = 0
  let rosso = 0
  let totaleFiltrati = 0
  let featuredRaw: LawRecordExtra | null = null
  const recentiRaw: LawRecordExtra[] = []
  const personaRaw: LawRecordExtra[] = []
  for (const record of estratto) {
    const colore = coloreSemaforoRecord(record)
    if (colore === 'verde') verde += 1
    else if (colore === 'giallo') giallo += 1
    else rosso += 1
    if (personaRilevanteRecord(record, persona)) {
      totaleFiltrati += 1
      if (persona !== 'tutti' && personaRaw.length < MAX_CARD_HOME) personaRaw.push(record)
    }
    if (!featuredRaw && isFeaturedRecord(record)) {
      featuredRaw = record
      continue
    }
    if (persona === 'tutti' && recentiRaw.length < MAX_CARD_HOME) recentiRaw.push(record)
  }

  const conteggio = { verde, giallo, rosso }
  const composizione = leggiComposizione()

  const mostraFeatured = !q && persona === 'tutti'
  const featured = mostraFeatured && featuredRaw ? normalizzaSicura(featuredRaw) : null
  const vetrinaRaw =
    persona === 'tutti'
      ? (featuredRaw ? [featuredRaw, ...recentiRaw.filter((r) => r.eli !== featuredRaw?.eli)] : recentiRaw).slice(
          0,
          MAX_CARD_HOME,
        )
      : personaRaw.slice(0, MAX_CARD_HOME)
  const vetrina = vetrinaRaw
    .map(normalizzaSicura)
    .filter((law): law is Law => law !== null)
    .filter((law) => personaRelevant(law, persona))
  const resto = featured ? vetrina.filter((law) => law.eli !== featured.eli).slice(0, MAX_CARD_HOME - 1) : vetrina
  const mostrate = (featured ? 1 : 0) + resto.length
  const totaleVista = persona === 'tutti' ? totaleReale : totaleFiltrati
  const rimanenti = Math.max(0, totaleVista - mostrate)
  const archivioHref =
    persona === 'tutti' ? '/leggi' : `/leggi?persona=${encodeURIComponent(persona)}`

  return (
    <>
      <Header />
      <main id="contenuto" className="scroll-mt-24">
        <section className="border-b border-regola bg-carta-soft dark:border-notte-deep dark:bg-notte-soft">
          <div className="mx-auto w-full max-w-editoriale px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
              Feed civico
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-3xl font-bold leading-[1.1] text-inchiostro dark:text-nebbia sm:text-4xl lg:text-5xl">
              Le leggi italiane, spiegate senza gergo.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Cosa cambia, per chi e se funziona già. Ogni scheda parte dalle fonti ufficiali e dice chiaramente quando
              una norma è ancora in attesa dei decreti attuativi.
            </p>

            <div className="mt-6 max-w-2xl">
              <SearchBar
                id="ricerca-home"
                label="Cerca una legge"
                defaultValue={q}
                action="/leggi"
                placeholder="Cerca una legge, un tema o una parola"
                className="[&_button]:min-h-[44px] [&_input]:min-h-[44px]"
              />
              <p className="mt-2 text-xs text-inchiostro-soft dark:text-nebbia-soft">
                Esempi: lavoro, scuola, ambiente. Minimo 2 caratteri.
              </p>
            </div>

            {totaleReale <= 0 && (
              <p
                role="alert"
                className="mt-4 max-w-2xl border border-regola bg-carta px-4 py-3 text-sm text-inchiostro dark:border-notte-deep dark:bg-notte dark:text-nebbia"
              >
                Dati non disponibili al momento. Riprova più tardi o sfoglia l’archivio.
              </p>
            )}

            <dl className="mt-6 grid max-w-2xl grid-cols-2 gap-px border border-regola bg-regola dark:border-notte-deep dark:bg-notte-deep sm:grid-cols-4">
              <div className="bg-carta p-0 dark:bg-notte">
                <Link
                  href="/leggi"
                  aria-label={`Vedi tutte le norme in feed: ${totaleReale}`}
                  className="block min-h-[44px] p-4 transition-colors hover:bg-carta-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-inchiostro dark:hover:bg-notte-deep dark:focus-visible:outline-nebbia"
                >
                  <dt className="text-xs font-medium text-inchiostro-soft dark:text-nebbia-soft">Norme in feed</dt>
                  <dd className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
                    <Contatore value={totaleReale} />
                  </dd>
                </Link>
              </div>
              {(['verde', 'giallo', 'rosso'] as const).map((stato) => (
                <div key={stato} className="bg-carta p-0 dark:bg-notte">
                  <Link
                    href={`/leggi?stato=${stato}`}
                    aria-label={`Vedi le norme con stato ${STATO_META[stato].label}: ${conteggio[stato]}`}
                    className="block min-h-[44px] p-4 transition-colors hover:bg-carta-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-inchiostro dark:hover:bg-notte-deep dark:focus-visible:outline-nebbia"
                  >
                    <dt className={`flex items-center gap-1.5 text-xs font-medium ${STATO_META[stato].text}`}>
                      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${STATO_META[stato].dot}`} />
                      {STATO_META[stato].parole}
                    </dt>
                    <dd className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
                      <Contatore value={conteggio[stato]} />
                    </dd>
                  </Link>
                </div>
              ))}
            </dl>
            {troncato && (
              <p className="mt-2 max-w-2xl text-xs text-inchiostro-soft dark:text-nebbia-soft">
                Conteggi calcolati sulle {estratto.length} norme più recenti di {totaleReale} totali.
              </p>
            )}
            {composizione && (
              <div className="mt-4 max-w-2xl">
                <CorpusBadge
                  totale={composizione.totale}
                  dimostrative={composizione.dimostrative}
                  ufficiali={composizione.ufficiali}
                />
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/ministri"
                className="inline-flex min-h-[44px] items-center bg-inchiostro px-4 py-2 text-xs font-semibold uppercase tracking-wide text-carta transition-colors hover:bg-inchiostro-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:bg-nebbia dark:text-notte dark:hover:bg-nebbia-soft dark:focus-visible:outline-nebbia"
              >
                Chi decide: i ministri
              </Link>
              <Link
                href="/statistiche"
                className="inline-flex min-h-[44px] items-center px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro-soft underline decoration-regola underline-offset-4 transition-colors hover:text-accento dark:text-nebbia-soft dark:decoration-notte-deep dark:hover:text-accento-chiara"
              >
                I numeri del corpus
              </Link>
            </div>
          </div>
        </section>

        <div className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          {mostraFeatured && featured && (
            <section aria-labelledby="norma-in-evidenza" className="scroll-mt-24">
              <h2 id="norma-in-evidenza" className="sr-only">
                Norma in evidenza
              </h2>
              <Comparsa>
                <LawCard law={featured} featured headingLevel="h2" />
              </Comparsa>
            </section>
          )}

          <section aria-labelledby="feed" className="mt-12 scroll-mt-24">
            <div className="flex flex-col gap-4 border-b-2 border-inchiostro pb-4 dark:border-nebbia sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="feed" className="scroll-mt-24 font-serif text-2xl font-bold text-inchiostro dark:text-nebbia sm:text-3xl">
                  Ultime leggi
                </h2>
                <p className="mt-1 text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status" aria-live="polite">
                  {persona === 'tutti'
                    ? `${totaleReale} ${totaleReale === 1 ? 'norma in archivio' : 'norme in archivio'} · qui le ${mostrate} più recenti.`
                    : `${totaleFiltrati} ${totaleFiltrati === 1 ? 'norma' : 'norme'} per ${persona} · mostrate ${mostrate}${rimanenti > 0 ? ` (+${rimanenti} ${rimanenti === 1 ? 'altra' : 'altre'})` : ''}.`}
                </p>
                {persona !== 'tutti' && (
                  <p className="mt-1 text-sm text-inchiostro-soft dark:text-nebbia-soft">
                    <Link
                      href={archivioHref}
                      className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
                    >
                      Vedi tutte le norme per {persona} in archivio
                    </Link>
                    .
                  </p>
                )}
              </div>
              <PersonaFilter active={persona} basePath="/" query={q ? { q } : {}} />
            </div>

            {resto.length > 0 ? (
              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {resto.map((law) => (
                  <li key={law.eli} className="flex">
                    <LawCard law={law} persona={persona} headingLevel="h3" />
                  </li>
                ))}
              </ul>
            ) : totaleReale <= 0 ? (
              <p
                role="alert"
                className="mt-6 border border-regola bg-carta p-6 text-sm leading-relaxed text-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia"
              >
                Dati non disponibili al momento. Riprova più tardi o sfoglia l’archivio.
              </p>
            ) : (
              <div className="mt-6 border border-dashed border-regola bg-carta p-6 dark:border-notte-deep dark:bg-notte-soft">
                <h3 className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
                  Nessuna norma trovata
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                  Nessuna norma corrisponde a questa ricerca
                  {persona !== 'tutti' ? ` con il filtro “${persona}”` : ''}. Prova con un&apos;altra parola o
                  rimuovi i filtri.
                </p>
                <p className="mt-5">
                  <Link
                    href="/"
                    className="inline-flex min-h-[44px] items-center bg-inchiostro px-5 py-3 text-sm font-semibold text-carta transition-colors hover:bg-inchiostro-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:bg-nebbia dark:text-notte dark:hover:bg-nebbia-soft dark:focus-visible:outline-nebbia"
                  >
                    Rimuovi filtri
                  </Link>
                </p>
              </div>
            )}
            {totaleVista > 0 && (
              <p className="mt-6">
                <Link
                  href={archivioHref}
                  className="inline-flex min-h-[44px] items-center border border-inchiostro px-5 py-3 text-sm font-semibold text-inchiostro transition-colors hover:bg-inchiostro hover:text-carta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte dark:focus-visible:outline-nebbia"
                >
                  {persona === 'tutti'
                    ? `Sfoglia tutte le ${totaleReale} norme`
                    : `Sfoglia tutte le ${totaleFiltrati} norme per ${persona}`}
                </Link>
              </p>
            )}
          </section>

          <section aria-labelledby="come-funziona" className="mt-16 scroll-mt-24">
            <h2 id="come-funziona" className="scroll-mt-24 font-serif text-2xl font-bold text-inchiostro dark:text-nebbia sm:text-3xl">
              Come funziona
            </h2>
            <ol className="mt-6 grid gap-px border border-regola bg-regola dark:border-notte-deep dark:bg-notte-deep sm:grid-cols-3">
              {PASSI.map((passo, index) => (
                <li key={passo.titolo} className="bg-carta p-5 dark:bg-notte">
                  <span aria-hidden="true" className="font-serif text-3xl font-bold text-accento dark:text-accento-chiara">
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
            <section aria-labelledby="ministri" className="mt-16 scroll-mt-24">
              <div className="flex items-end justify-between gap-4 border-b border-regola pb-3 dark:border-notte-deep">
                <h2 id="ministri" className="scroll-mt-24 font-serif text-2xl font-bold text-inchiostro dark:text-nebbia sm:text-3xl">
                  Ministri
                </h2>
                <Link
                  href="/ministri"
                  className="inline-flex min-h-[44px] items-center text-xs font-semibold uppercase tracking-wide text-accento underline underline-offset-2 dark:text-accento-chiara"
                >
                  Vedi tutti
                </Link>
              </div>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {ministri.slice(0, 4).map((minister) => (
                  <li key={minister.slug} className="flex">
                    <MinisterCard minister={minister} />
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
