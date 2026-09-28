import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Comparsa from '@/components/Comparsa'
import Contatore from '@/components/Contatore'
import GraficoBarre, { type BarraGrafico, type SerieGrafico } from '@/components/GraficoBarre'
import { formatTipo, loadLaws, type Stato } from '@/components/seed-fallback'

export const metadata: Metadata = {
  title: 'Statistiche del corpus — Stato della Repubblica',
  description:
    'Il corpus delle norme in numeri: distribuzione per anno e tipo, leggibilità, decreti attuativi, AIR e qualità. Con un’istantanea dei principali indicatori economici.',
}

const COLORE_INK = 'var(--chart-1)'
const COLORE_VERDE = 'var(--chart-2)'
const COLORE_ROSSO = 'var(--chart-3)'
const COLORE_NEUTRO = 'var(--chart-neutral)'

const AIR_LABEL: Record<string, string> = {
  presente: 'AIR presente',
  semplificata: 'AIR semplificata',
  esente: 'Esente da AIR',
  assente: 'AIR assente',
}

interface Indicatore {
  chiave: string
  etichetta: string
  valore: number
  decimals: number
  prefix?: string
  suffix: string
  periodo: string
  fonte: string
  fonteUrl: string
  nota?: string
}

/**
 * Istantanea curata dei principali indicatori macro. I valori non sono in tempo
 * reale: si riferiscono ai comunicati ufficiali più recenti inclusi in questa
 * edizione. Segui i link istituzionali per i dati aggiornati.
 */
const INDICATORI: Indicatore[] = [
  {
    chiave: 'pil',
    etichetta: 'Crescita del PIL reale',
    valore: 0.5,
    decimals: 1,
    prefix: '+',
    suffix: '%',
    periodo: 'Media annua 2025',
    fonte: 'ISTAT — Conti economici nazionali',
    fonteUrl: 'https://www.istat.it/',
    nota: 'Variazione reale rispetto al 2024.',
  },
  {
    chiave: 'deficit',
    etichetta: 'Indebitamento netto delle PA',
    valore: 3.1,
    decimals: 1,
    suffix: '% del PIL',
    periodo: 'Anno 2025',
    fonte: 'ISTAT — Finanza pubblica',
    fonteUrl: 'https://www.istat.it/',
    nota: 'Soglia europea fissata al 3% del PIL.',
  },
  {
    chiave: 'debito',
    etichetta: 'Debito pubblico',
    valore: 135.3,
    decimals: 1,
    suffix: '% del PIL',
    periodo: 'Anno 2024',
    fonte: 'ISTAT',
    fonteUrl: 'https://www.istat.it/',
    nota: 'Ultima proiezione della Banca d’Italia: 137,4% del PIL nel 2026.',
  },
  {
    chiave: 'inflazione',
    etichetta: 'Inflazione al consumo (IPCA)',
    valore: 1.7,
    decimals: 1,
    suffix: '%',
    periodo: 'Media 2025',
    fonte: 'ISTAT — Prezzi al consumo',
    fonteUrl: 'https://www.istat.it/',
    nota: 'Stima provvisoria diffusa a gennaio 2026.',
  },
]

const RISORSE = [
  { label: 'ISTAT', url: 'https://www.istat.it/' },
  { label: 'MEF — Finanza pubblica', url: 'https://www.mef.gov.it/finanza-pubblica/' },
  { label: 'Banca d’Italia', url: 'https://www.bancaditalia.it/' },
  { label: 'ISTAT Esplora dati', url: 'https://esploradati.istat.it/' },
]

function media(valori: number[]): number {
  const validi = valori.filter((v) => Number.isFinite(v))
  if (validi.length === 0) return 0
  return validi.reduce((acc, v) => acc + v, 0) / validi.length
}

function bucketQualita(qualita: number): number {
  if (qualita >= 85) return 0
  if (qualita >= 70) return 1
  if (qualita >= 55) return 2
  if (qualita >= 40) return 3
  return 4
}

export default async function StatistichePage() {
  const leggi = await loadLaws()

  const conteggioStato: Record<Stato, number> = { verde: 0, giallo: 0, rosso: 0 }
  const perAnno = new Map<string, number>()
  const perTipo = new Map<string, number>()
  const airCount: Record<string, number> = { presente: 0, semplificata: 0, esente: 0, assente: 0 }
  const qualitaBuckets = [0, 0, 0, 0, 0]
  let attuativiAdottati = 0
  let attuativiDaAdottare = 0
  let attuativiScaduti = 0

  for (const law of leggi) {
    conteggioStato[law.stato] += 1
    const anno = law.dataEmanazione.slice(0, 4) || 'n.d.'
    perAnno.set(anno, (perAnno.get(anno) ?? 0) + 1)
    const tipo = formatTipo(law.tipo)
    perTipo.set(tipo, (perTipo.get(tipo) ?? 0) + 1)
    if (law.air in airCount) airCount[law.air] += 1
    qualitaBuckets[bucketQualita(law.qualita)] += 1
    attuativiAdottati += law.attuativi.adottati
    attuativiDaAdottare += law.attuativi.daAdottare
    attuativiScaduti += law.attuativi.scaduti
  }

  const gulpeaseValori = leggi
    .filter((law) => law.gulpease > 0)
    .sort((a, b) => a.dataEmanazione.localeCompare(b.dataEmanazione))
    .map((law) => ({
      etichetta: `${law.numero}/${law.dataEmanazione.slice(0, 4)}`,
      valori: { gulpease: law.gulpease },
      colore: law.gulpease >= 60 ? COLORE_VERDE : COLORE_ROSSO,
      nota: formatTipo(law.tipo).slice(0, 9),
    }))

  const gulpeaseMedio = media(leggi.map((law) => law.gulpease))
  const qualitaMedia = media(leggi.map((law) => law.qualita))
  const attuativiMancanti = attuativiDaAdottare + attuativiScaduti
  const airRobuste = airCount.presente + airCount.semplificata

  const serieInk: SerieGrafico[] = [{ chiave: 'valore', etichetta: 'Norme', colore: COLORE_INK }]
  const serieAttuativi: SerieGrafico[] = [
    { chiave: 'adottati', etichetta: 'Adottati', colore: COLORE_VERDE },
    { chiave: 'daAdottare', etichetta: 'Da adottare', colore: COLORE_NEUTRO },
    { chiave: 'scaduti', etichetta: 'Scaduti', colore: COLORE_ROSSO },
  ]

  const barreAnno: BarraGrafico[] = [...perAnno.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([anno, valore]) => ({ etichetta: anno, valori: { valore } }))

  const barreTipo: BarraGrafico[] = [...perTipo.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([tipo, valore]) => ({ etichetta: tipo, valori: { valore } }))

  const coloriAir: Record<string, string> = {
    presente: COLORE_VERDE,
    semplificata: COLORE_INK,
    esente: COLORE_NEUTRO,
    assente: COLORE_ROSSO,
  }
  const barreAir: BarraGrafico[] = ['presente', 'semplificata', 'esente', 'assente'].map((chiave) => ({
    etichetta: AIR_LABEL[chiave] ?? chiave,
    valori: { valore: airCount[chiave] ?? 0 },
    colore: coloriAir[chiave],
  }))

  const etichetteQualita = ['85–100', '70–84', '55–69', '40–54', '0–39']
  const coloriQualita = [COLORE_VERDE, COLORE_VERDE, COLORE_INK, COLORE_NEUTRO, COLORE_ROSSO]
  const barreQualita: BarraGrafico[] = etichetteQualita.map((etichetta, index) => ({
    etichetta,
    valori: { valore: qualitaBuckets[index] ?? 0 },
    colore: coloriQualita[index],
  }))

  const barreAttuativi: BarraGrafico[] = leggi
    .slice()
    .sort((a, b) => a.dataEmanazione.localeCompare(b.dataEmanazione))
    .map((law) => ({
      etichetta: `${law.numero}/${law.dataEmanazione.slice(0, 4)}`,
      valori: {
        adottati: law.attuativi.adottati,
        daAdottare: law.attuativi.daAdottare,
        scaduti: law.attuativi.scaduti,
      },
    }))

  const schede = [
    { etichetta: 'Norme nel corpus', valore: leggi.length, decimals: 0, suffix: '' },
    { etichetta: 'Già applicabili', valore: conteggioStato.verde, decimals: 0, suffix: '' },
    { etichetta: 'In attesa di attuativi', valore: conteggioStato.giallo, decimals: 0, suffix: '' },
    { etichetta: 'Non ancora attive', valore: conteggioStato.rosso, decimals: 0, suffix: '' },
    { etichetta: 'Gulpease medio', valore: gulpeaseMedio, decimals: 0, suffix: '/100' },
    { etichetta: 'Qualità media', valore: qualitaMedia, decimals: 0, suffix: '/100' },
    { etichetta: 'Attuativi mancanti', valore: attuativiMancanti, decimals: 0, suffix: '' },
    { etichetta: 'Con AIR presente o semplificata', valore: airRobuste, decimals: 0, suffix: '' },
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
            decreti attuativi e come si collocano sugli indicatori di qualità. Tutti i grafici sono calcolati sui dati
            della piattaforma.
          </p>
        </header>

        <section aria-labelledby="numeri-chiave" className="mt-8">
          <h2 id="numeri-chiave" className="sr-only">
            Numeri chiave
          </h2>
          <dl className="grid grid-cols-2 gap-px border border-regola bg-regola dark:border-notte-deep dark:bg-notte-deep sm:grid-cols-4">
            {schede.map((scheda) => (
              <div key={scheda.etichetta} className="bg-carta p-4 dark:bg-notte">
                <dt className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">{scheda.etichetta}</dt>
                <dd className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
                  <Contatore value={scheda.valore} decimals={scheda.decimals} suffix={scheda.suffix} />
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <Comparsa>
            <section aria-labelledby="chart-anno" className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
              <h2 id="chart-anno" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
                Norme per anno di emanazione
              </h2>
              <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">Numero di schede per annualità.</p>
              <GraficoBarre
                className="mt-4"
                barre={barreAnno}
                serie={serieInk}
                ariaLabel="Numero di norme per anno di emanazione"
                unita=""
              />
            </section>
          </Comparsa>

          <Comparsa delay={0.05}>
            <section aria-labelledby="chart-tipo" className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
              <h2 id="chart-tipo" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
                Norme per tipo di atto
              </h2>
              <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                Decreti-legge, decreti legislativi, leggi e regolamenti nel corpus.
              </p>
              <GraficoBarre
                className="mt-4"
                barre={barreTipo}
                serie={serieInk}
                orientamento="orizzontale"
                ariaLabel="Numero di norme per tipo di atto"
              />
            </section>
          </Comparsa>

          <Comparsa>
            <section aria-labelledby="chart-gulpease" className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
              <h2 id="chart-gulpease" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
                Leggibilità per norma
              </h2>
              <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                Indice Gulpease (0–100). La linea tratteggiata segna la soglia B1: 60.
              </p>
              <GraficoBarre
                className="mt-4"
                barre={gulpeaseValori}
                serie={[{ chiave: 'gulpease', etichetta: 'Gulpease', colore: COLORE_VERDE }]}
                riferimento={{ valore: 60, etichetta: 'soglia B1' }}
                ariaLabel="Indice Gulpease per ogni norma"
              />
            </section>
          </Comparsa>

          <Comparsa delay={0.05}>
            <section aria-labelledby="chart-attuativi" className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
              <h2 id="chart-attuativi" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
                Decreti attuativi per norma
              </h2>
              <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                Adottati, da adottare e scaduti. {attuativiAdottati} adottati in totale.
              </p>
              <GraficoBarre
                className="mt-4"
                barre={barreAttuativi}
                serie={serieAttuativi}
                ariaLabel="Decreti attuativi per norma, distinti in adottati, da adottare e scaduti"
              />
            </section>
          </Comparsa>

          <Comparsa>
            <section aria-labelledby="chart-air" className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
              <h2 id="chart-air" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
                Analisi di impatto (AIR)
              </h2>
              <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                Distribuzione delle schede per stato dell’analisi di impatto.
              </p>
              <GraficoBarre
                className="mt-4"
                barre={barreAir}
                serie={serieInk}
                orientamento="orizzontale"
                ariaLabel="Distribuzione delle norme per stato della analisi di impatto"
              />
            </section>
          </Comparsa>

          <Comparsa delay={0.05}>
            <section aria-labelledby="chart-qualita" className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
              <h2 id="chart-qualita" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
                Distribuzione della qualità
              </h2>
              <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                Punteggio euristico 0–100, raggruppato in cinque fasce.
              </p>
              <GraficoBarre
                className="mt-4"
                barre={barreQualita}
                serie={serieInk}
                ariaLabel="Distribuzione delle norme per fascia di qualità"
              />
            </section>
          </Comparsa>
        </div>

        <section aria-labelledby="quadro-economico" className="mt-14">
          <div className="border-b-2 border-inchiostro pb-4 dark:border-nebbia">
            <h2 id="quadro-economico" className="font-serif text-2xl font-bold text-inchiostro dark:text-nebbia">
              Quadro economico — istantanea
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Valori ufficiali di riferimento inclusi in questa edizione, con il periodo a cui si riferiscono. Non sono
              aggiornati in tempo reale: per i comunicati più recenti segui i collegamenti istituzionali in fondo.
            </p>
          </div>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {INDICATORI.map((indicatore, index) => (
              <li key={indicatore.chiave} className="flex">
                <Comparsa className="flex w-full" delay={Math.min(index * 0.05, 0.2)}>
                  <article className="flex w-full flex-col border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-inchiostro-faint dark:text-nebbia-faint">
                      {indicatore.periodo}
                    </p>
                    <h3 className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia">{indicatore.etichetta}</h3>
                    <p className="mt-3 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
                      <Contatore
                        value={indicatore.valore}
                        decimals={indicatore.decimals}
                        prefix={indicatore.prefix}
                        suffix={indicatore.suffix}
                      />
                    </p>
                    {indicatore.nota && (
                      <p className="mt-2 text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint">
                        {indicatore.nota}
                      </p>
                    )}
                    <p className="mt-auto pt-4 text-xs text-inchiostro-soft dark:text-nebbia-soft">
                      Fonte:{' '}
                      <a
                        href={indicatore.fonteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
                      >
                        {indicatore.fonte}
                      </a>
                    </p>
                  </article>
                </Comparsa>
              </li>
            ))}
          </ul>

          <div className="mt-6 border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-inchiostro dark:text-nebbia">
              Collegamenti istituzionali
            </h3>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {RISORSE.map((risorsa) => (
                <li key={risorsa.url}>
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

        <p className="mt-10 text-sm text-inchiostro-soft dark:text-nebbia-soft">
          Come calcoliamo questi indicatori? Leggi la{' '}
          <Link href="/metodologia" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
            metodologia
          </Link>
          .
        </p>
      </main>
      <Footer />
    </>
  )
}
