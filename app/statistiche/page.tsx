import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Contatore from '@/components/Contatore'
import GraficoBarre, { type BarraGrafico, type SerieGrafico } from '@/components/GraficoBarre'
import { getStats } from '@/lib/db'
import { ECONOMIA_AGGIORNATO_AL, ECONOMIA_SNAPSHOT } from '@/lib/stats'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Statistiche del corpus — Stato della Repubblica',
  description:
    'Il corpus delle norme in numeri: distribuzione per anno e tipo, leggibilità, decreti attuativi, AIR e qualità. Con un’istantanea dei principali indicatori economici.',
}

const COLORE_INK = 'var(--chart-1)'
const COLORE_VERDE = 'var(--chart-2)'
const COLORE_ROSSO = 'var(--chart-3)'
const COLORE_NEUTRO = 'var(--chart-neutral)'

/** Ultimi anni mostrati nel grafico: resta leggibile anche con 200mila atti. */
const MAX_ANNI_GRAFICO = 20
/** Tipi di atto mostrati: solo i più frequenti. */
const MAX_TIPI_GRAFICO = 10

const AIR_LABEL: Record<string, string> = {
  presente: 'AIR presente',
  semplificata: 'AIR semplificata',
  esente: 'Esente da AIR',
  assente: 'AIR assente',
  nonNoto: 'AIR non rilevata',
}

const TIPI_LABEL: Record<string, string> = {
  'decreto.legge': 'Decreto-legge',
  'decreto.legislativo': 'Decreto legislativo',
  'decreto.presidente.repubblica': 'Decreto del Presidente della Repubblica',
  'decreto.presidente.consiglio': 'DPCM',
  legge: 'Legge',
  'legge.costituzionale': 'Legge costituzionale',
  regolamento: 'Regolamento',
}

/** Etichetta leggibile per il tipo di atto grezzo (es. `decreto.legge` → Decreto-legge). */
function etichettaTipo(tipo: string): string {
  const chiave = tipo.trim().toLowerCase()
  if (TIPI_LABEL[chiave]) return TIPI_LABEL[chiave]
  const parole = chiave.replace(/[._]/g, ' ').trim()
  return parole ? parole.charAt(0).toUpperCase() + parole.slice(1) : 'Norma'
}

function intero(value: number): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0,
  )
}

function percentuale(parte: number, totale: number): string {
  if (!Number.isFinite(parte) || !Number.isFinite(totale) || totale <= 0) return '0%'
  return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format((parte / totale) * 100)}%`
}

function decimale(value: number): string {
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
}

const RISORSE = [
  { label: 'ISTAT', url: 'https://www.istat.it/' },
  { label: 'MEF — Finanza pubblica', url: 'https://www.mef.gov.it/finanza-pubblica/' },
  { label: 'Banca d’Italia', url: 'https://www.bancaditalia.it/' },
  { label: 'ISTAT Esplora dati', url: 'https://esploradati.istat.it/' },
]

const ESEMPI_RICERCA = [
  { etichetta: 'Energia', href: '/leggi?q=energia' },
  { etichetta: 'Concorrenza', href: '/leggi?q=concorrenza' },
  { etichetta: 'Leggi del 2026', href: '/leggi?anno=2026' },
]

/**
 * Dashboard delle statistiche del corpus.
 *
 * Legge solo aggregati (`getStats`: conteggi e medie dal database, mai testi
 * integrali né elenchi completi), così resta veloce anche con un corpus molto
 * grande. I grafici mostrano al massimo gli ultimi 20 anni e i 10 tipi più
 * frequenti; ogni barra rimanda all’archivio filtrato. Non lancia mai: in caso
 * di errore mostra uno stato vuoto azionabile.
 */
export default async function StatistichePage() {
  let stats: Awaited<ReturnType<typeof getStats>> | null = null
  try {
    stats = await getStats()
  } catch {
    stats = null
  }

  if (!stats || stats.totale <= 0) {
    return (
      <>
        <Header />
        <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <header className="border-b-2 border-inchiostro pb-5 dark:border-nebbia">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
              Dati aperti
            </p>
            <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
              Statistiche del corpus
            </h1>
          </header>
          <section aria-labelledby="stato-vuoto" className="mt-8 border border-dashed border-regola bg-carta p-8 text-center dark:border-notte-deep dark:bg-notte-soft">
            <h2 id="stato-vuoto" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              Nessuna statistica disponibile
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Il corpus è vuoto o le statistiche non sono calcolabili al momento. Prova con una ricerca
              nell’archivio oppure leggi come calcoliamo gli indicatori.
            </p>
            <ul className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Ricerche di esempio">
              {ESEMPI_RICERCA.map((esempio) => (
                <li key={esempio.href}>
                  <Link
                    href={esempio.href}
                    className="inline-flex min-h-[44px] items-center rounded-full border border-regola px-4 text-sm font-medium text-inchiostro hover:border-accento hover:text-accento dark:border-notte-deep dark:text-nebbia dark:hover:border-accento-chiara dark:hover:text-accento-chiara"
                  >
                    {esempio.etichetta}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/leggi"
                className="inline-flex min-h-[44px] items-center bg-accento px-6 font-semibold text-white hover:opacity-90 dark:bg-accento-chiara dark:text-notte"
              >
                Vai all’archivio delle leggi
              </Link>
              <Link
                href="/metodologia"
                className="inline-flex min-h-[44px] items-center border border-regola px-6 font-semibold text-inchiostro hover:border-accento hover:text-accento dark:border-notte-deep dark:text-nebbia dark:hover:border-accento-chiara dark:hover:text-accento-chiara"
              >
                Leggi la metodologia
              </Link>
            </p>
          </section>
        </main>
        <Footer />
      </>
    )
  }

  const totale = stats.totale
  const attuativi = stats.attuativiTotali
  const attuativiMancanti = attuativi.daAdottare + attuativi.scaduti
  const airPresente = (stats.airDistribuzione.presente ?? 0) + (stats.airDistribuzione.semplificata ?? 0)

  const vociAnno = Object.entries(stats.perAnno)
    .filter(([anno]) => /^\d{4}$/.test(anno))
    .sort(([a], [b]) => a.localeCompare(b))
  const senzaAnno = stats.perAnno['n.d.'] ?? 0
  const ultimiAnni = vociAnno.slice(-MAX_ANNI_GRAFICO)

  const vociTipo = Object.entries(stats.perTipo).sort(([, a], [, b]) => b - a)
  const topTipi = vociTipo.slice(0, MAX_TIPI_GRAFICO)
  const altriTipi = vociTipo.length - topTipi.length

  const serieNorme: SerieGrafico[] = [{ chiave: 'valore', etichetta: 'Norme', colore: COLORE_INK }]
  const serieAttuativi: SerieGrafico[] = [
    { chiave: 'adottati', etichetta: 'Adottati', colore: COLORE_VERDE },
    { chiave: 'daAdottare', etichetta: 'Da adottare', colore: COLORE_NEUTRO },
    { chiave: 'scaduti', etichetta: 'Scaduti', colore: COLORE_ROSSO },
  ]

  const barreAnno: BarraGrafico[] = ultimiAnni.map(([anno, valore]) => ({
    etichetta: anno,
    valori: { valore },
  }))

  const barreTipo: BarraGrafico[] = topTipi.map(([tipo, valore]) => ({
    etichetta: etichettaTipo(tipo),
    valori: { valore },
  }))

  const ordineAir = ['presente', 'semplificata', 'esente', 'assente', 'nonNoto']
  const coloriAir: Record<string, string> = {
    presente: COLORE_VERDE,
    semplificata: COLORE_INK,
    esente: COLORE_NEUTRO,
    assente: COLORE_ROSSO,
    nonNoto: COLORE_NEUTRO,
  }
  const barreAir: BarraGrafico[] = ordineAir.map((chiave) => ({
    etichetta: AIR_LABEL[chiave] ?? chiave,
    valori: { valore: stats.airDistribuzione[chiave] ?? 0 },
    colore: coloriAir[chiave],
  }))

  const barreAttuativi: BarraGrafico[] = [
    {
      etichetta: 'Decreti attuativi',
      valori: {
        adottati: attuativi.adottati,
        daAdottare: attuativi.daAdottare,
        scaduti: attuativi.scaduti,
      },
    },
  ]

  const schede = [
    { etichetta: 'Norme nel corpus', valore: totale, nota: null as string | null, decimals: 0, suffix: '' },
    { etichetta: 'Decreti adottati', valore: attuativi.adottati, nota: 'Semaforo verde', decimals: 0, suffix: '' },
    { etichetta: 'Decreti da adottare', valore: attuativi.daAdottare, nota: 'Semaforo giallo', decimals: 0, suffix: '' },
    { etichetta: 'Decreti scaduti', valore: attuativi.scaduti, nota: 'Semaforo rosso', decimals: 0, suffix: '' },
    {
      etichetta: 'Attuativi mancanti',
      valore: attuativiMancanti,
      nota: `${percentuale(attuativiMancanti, attuativi.totale)} dei decreti previsti`,
      decimals: 0,
      suffix: '',
    },
    {
      etichetta: 'Con AIR presente o semplificata',
      valore: airPresente,
      nota: `${percentuale(airPresente, totale)} del corpus`,
      decimals: 0,
      suffix: '',
    },
  ]

  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <header className="border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Dati aperti
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Statistiche del corpus
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Come si distribuiscono le norme in archivio: per anno e per tipo, quanto sono leggibili, quante aspettano i
            decreti attuativi e come si collocano sugli indicatori di qualità. I valori sono aggregati dal database e
            aggiornati ogni ora.
          </p>
        </header>

        <section aria-labelledby="numeri-chiave" className="mt-8 scroll-mt-24">
          <h2 id="numeri-chiave" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Numeri chiave
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-px border border-regola bg-regola dark:border-notte-deep dark:bg-notte-deep sm:grid-cols-4">
            {schede.map((scheda) => (
              <div key={scheda.etichetta} className="bg-carta p-4 dark:bg-notte">
                <dt className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">
                  {scheda.etichetta}
                </dt>
                <dd className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
                  <Contatore value={scheda.valore} decimals={scheda.decimals} suffix={scheda.suffix} />
                </dd>
                {scheda.nota && (
                  <dd className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">{scheda.nota}</dd>
                )}
              </div>
            ))}
            <div className="bg-carta p-4 dark:bg-notte">
              <dt className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">Gulpease medio</dt>
              <dd className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
                {stats.gulpeaseMedio === null ? (
                  <span className="text-lg font-normal">Non disponibile</span>
                ) : (
                  <Contatore value={stats.gulpeaseMedio} decimals={0} suffix="/100" />
                )}
              </dd>
              <dd className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                {stats.gulpeaseMedio === null
                  ? 'Nessun testo valutato'
                  : stats.gulpeaseMedio >= 60
                    ? 'Leggibilità facile'
                    : stats.gulpeaseMedio >= 40
                      ? 'Leggibilità media'
                      : 'Leggibilità difficile'}
              </dd>
            </div>
            <div className="bg-carta p-4 dark:bg-notte">
              <dt className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">Qualità media</dt>
              <dd className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
                {stats.qualitaMedia === null ? (
                  <span className="text-lg font-normal">Non disponibile</span>
                ) : (
                  <Contatore value={stats.qualitaMedia} decimals={0} suffix="/100" />
                )}
              </dd>
              <dd className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                Punteggio euristico di processo, tecnica e attuazione
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-inchiostro-soft dark:text-nebbia-soft">
            <Link href="/leggi?scaduti=1" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
              Vedi le norme con attuativi scaduti
            </Link>
            {' · '}
            {intero(totale)} {totale === 1 ? 'norma nel corpus' : 'norme nel corpus'}
            {senzaAnno > 0 && ` · ${intero(senzaAnno)} senza anno di emanazione`}.
          </p>
        </section>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <section
            aria-labelledby="chart-anno"
            className="scroll-mt-24 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
            style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 420px' }}
          >
            <h2 id="chart-anno" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              Norme per anno di emanazione
            </h2>
            <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
              Ultimi {ultimiAnni.length} anni su {intero(vociAnno.length)} annualità presenti nel corpus.
            </p>
            <GraficoBarre
              className="mt-4"
              barre={barreAnno}
              serie={serieNorme}
              ariaLabel="Numero di norme per anno di emanazione, ultimi anni"
              unita=""
            />
            <nav aria-label="Filtra l’archivio per anno" className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-inchiostro-faint dark:text-nebbia-faint">
                Apri l’archivio per anno
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {ultimiAnni.map(([anno, valore]) => (
                  <li key={anno}>
                    <Link
                      href={`/leggi?anno=${encodeURIComponent(anno)}`}
                      aria-label={`Vedi le ${intero(valore)} norme del ${anno} nell’archivio`}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 border border-regola px-3 text-sm font-medium text-inchiostro hover:border-accento hover:text-accento dark:border-notte-deep dark:text-nebbia dark:hover:border-accento-chiara dark:hover:text-accento-chiara"
                    >
                      {anno}
                      <span className="text-xs font-normal opacity-70">({intero(valore)})</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </section>

          <section
            aria-labelledby="chart-tipo"
            className="scroll-mt-24 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
            style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 420px' }}
          >
            <h2 id="chart-tipo" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              Norme per tipo di atto
            </h2>
            <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
              I {topTipi.length} tipi più frequenti
              {altriTipi > 0 && `; altri ${intero(altriTipi)} tipi raggruppati nell’archivio`}.
            </p>
            <GraficoBarre
              className="mt-4"
              barre={barreTipo}
              serie={serieNorme}
              orientamento="orizzontale"
              ariaLabel="Numero di norme per tipo di atto, tipi più frequenti"
            />
            <nav aria-label="Filtra l’archivio per tipo di atto" className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-inchiostro-faint dark:text-nebbia-faint">
                Apri l’archivio per tipo
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {topTipi.map(([tipo, valore]) => (
                  <li key={tipo}>
                    <Link
                      href={`/leggi?tipo=${encodeURIComponent(tipo)}`}
                      aria-label={`Vedi le ${intero(valore)} norme di tipo ${etichettaTipo(tipo)} nell’archivio`}
                      className="inline-flex min-h-[44px] items-center border border-regola px-3 text-sm font-medium text-inchiostro hover:border-accento hover:text-accento dark:border-notte-deep dark:text-nebbia dark:hover:border-accento-chiara dark:hover:text-accento-chiara"
                    >
                      {etichettaTipo(tipo)}
                      <span className="text-xs font-normal opacity-70">({intero(valore)})</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </section>

          <section
            aria-labelledby="chart-attuativi"
            className="scroll-mt-24 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
            style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 420px' }}
          >
            <h2 id="chart-attuativi" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              Decreti attuativi: stato di avanzamento
            </h2>
            <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
              {intero(attuativi.adottati)} adottati, {intero(attuativi.daAdottare)} da adottare,{' '}
              {intero(attuativi.scaduti)} scaduti su {intero(attuativi.totale)} decreti previsti.
            </p>
            <GraficoBarre
              className="mt-4"
              barre={barreAttuativi}
              serie={serieAttuativi}
              ariaLabel="Decreti attuativi distinti in adottati, da adottare e scaduti"
            />
            <p className="mt-4 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Mancano all’appello {intero(attuativiMancanti)} decreti (
              {percentuale(attuativiMancanti, attuativi.totale)} di quelli previsti).{' '}
              <Link href="/leggi?scaduti=1" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
                Vedi le norme con attuativi scaduti
              </Link>
              .
            </p>
          </section>

          <section
            aria-labelledby="chart-air"
            className="scroll-mt-24 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
            style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 420px' }}
          >
            <h2 id="chart-air" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              Analisi di impatto (AIR)
            </h2>
            <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
              Copertura AIR: {intero(airPresente)} norme su {intero(totale)} (
              {percentuale(airPresente, totale)} con analisi presente o semplificata).
            </p>
            <GraficoBarre
              className="mt-4"
              barre={barreAir}
              serie={serieNorme}
              orientamento="orizzontale"
              ariaLabel="Distribuzione delle norme per stato della analisi di impatto"
            />
          </section>
        </div>

        <section aria-labelledby="esporta" className="mt-10 scroll-mt-24 border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft">
          <h2 id="esporta" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Esporta i dati
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Scarica l’intero corpus in formato aperto. I file includono solo le colonne essenziali (niente testi
            integrali) e sono limitati per dimensione.
          </p>
          <p className="mt-4 flex flex-wrap gap-3">
            <a
              href="/api/export?formato=csv"
              className="inline-flex min-h-[44px] items-center bg-accento px-6 font-semibold text-white hover:opacity-90 dark:bg-accento-chiara dark:text-notte"
            >
              Scarica CSV
            </a>
            <a
              href="/api/export?formato=json"
              className="inline-flex min-h-[44px] items-center border border-regola bg-carta px-6 font-semibold text-inchiostro hover:border-accento hover:text-accento dark:border-notte-deep dark:bg-notte dark:text-nebbia dark:hover:border-accento-chiara dark:hover:text-accento-chiara"
            >
              Scarica JSON
            </a>
          </p>
        </section>

        <section aria-labelledby="quadro-economico" className="mt-14 scroll-mt-24">
          <div className="border-b-2 border-inchiostro pb-4 dark:border-nebbia">
            <h2 id="quadro-economico" className="font-serif text-2xl font-bold text-inchiostro dark:text-nebbia">
              Quadro economico — istantanea
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Valori ufficiali di riferimento inclusi in questa edizione, con il periodo a cui si riferiscono. Non sono
              aggiornati in tempo reale: per i comunicati più recenti segui i collegamenti istituzionali in fondo.
              Aggiornato al {ECONOMIA_AGGIORNATO_AL}.
            </p>
          </div>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ECONOMIA_SNAPSHOT.map((indicatore) => (
              <li key={indicatore.indicatore} className="flex">
                <article className="flex w-full flex-col border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-inchiostro-faint dark:text-nebbia-faint">
                    {indicatore.periodo}
                  </p>
                  <h3 className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia">
                    {indicatore.indicatore}
                  </h3>
                  <p className="mt-3 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
                    <Contatore value={indicatore.valore} decimals={1} />
                    <span className="ml-1 text-base font-normal">
                      {indicatore.unita === 'percentuale' ? '%' : indicatore.unita}
                    </span>
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint">
                    {indicatore.nota}
                  </p>
                  <p className="mt-auto pt-4 text-xs text-inchiostro-soft dark:text-nebbia-soft">
                    Fonte: {indicatore.fonte}
                  </p>
                </article>
              </li>
            ))}
          </ul>

          <div className="mt-6 border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-inchiostro dark:text-nebbia">
              Collegamenti istituzionali
            </h3>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {RISORSE.map((risorsa) => (
                <li key={risorsa.url} className="flex min-h-[44px] items-center">
                  <a
                    href={risorsa.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-accento underline underline-offset-2 hover:text-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:text-accento-chiara dark:hover:text-nebbia dark:focus-visible:outline-nebbia"
                  >
                    {risorsa.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="metodo-limiti" className="mt-10 scroll-mt-24 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
          <h2 id="metodo-limiti" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Metodologia e limiti
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            <li>
              I conteggi e le medie sono calcolati sul database con query aggregate e aggiornati ogni ora: questa pagina
              non scarica mai l’intero corpus.
            </li>
            <li>
              I grafici mostrano gli ultimi {MAX_ANNI_GRAFICO} anni e i {MAX_TIPI_GRAFICO} tipi di atto più frequenti;
              l’archivio resta sfogliabile per intero con i filtri per anno e tipo.
            </li>
            <li>
              La leggibilità è l’indice Gulpease medio sui testi valutati
              {stats.gulpeaseMedio !== null && ` (attuale: ${decimale(stats.gulpeaseMedio)}/100)`}: sopra 60 il testo è
              facile, tra 40 e 60 medio, sotto 40 difficile.
            </li>
            <li>
              Corpus dimostrativo: le schede possono includere atti di esempio a scopo illustrativo; i valori economici
              sono un’istantanea curata, non dati ufficiali in tempo reale.
            </li>
          </ul>
          <p className="mt-4 text-sm text-inchiostro-soft dark:text-nebbia-soft">
            Come calcoliamo questi indicatori? Leggi la{' '}
            <Link href="/metodologia" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
              metodologia
            </Link>
            .
          </p>
        </section>
      </main>
      <Footer />
    </>
  )
}
