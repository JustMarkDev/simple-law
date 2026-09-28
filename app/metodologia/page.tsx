import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import TrafficLight from '@/components/TrafficLight'
import { STATO_META, type Stato } from '@/components/seed-fallback'

export const metadata: Metadata = {
  title: 'Metodologia — Stato della Repubblica',
  description: 'Come costruiamo le schede: template a 5 riquadri, semaforo di attuazione, leggibilità e limiti.',
}

const RIQUADRI = [
  { titolo: '1. In 10 secondi', testo: 'La norma in una frase. Serve a capire subito se vale la pena leggere il resto.' },
  { titolo: '2. Riguarda te?', testo: 'Quattro punti di vista — Guida, Lavoro, Impresa, Studio — per trovare la tua situazione.' },
  { titolo: '3. Cosa fare', testo: 'I passi concreti: cosa controllare, cosa preparare, entro quando.' },
  { titolo: '4. Funziona già?', testo: 'Il semaforo dice se la norma è attiva o se servono decreti attuativi.' },
  { titolo: '5. Bene o male?', testo: 'Punti a favore e critici, con indicatori di qualità e leggibilità. Fatti, non opinioni.' },
]

const STATI: Stato[] = ['verde', 'giallo', 'rosso']

export default function MetodologiaPage() {
  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <header className="border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Come lavoriamo
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Metodologia
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Regole semplici e dichiarate: poche frasi, fonti verificabili e nessuna valutazione presentata come
            ufficiale. Qui spieghiamo come nasce ogni scheda.
          </p>
        </header>

        <section aria-labelledby="template" className="mt-10">
          <h2 id="template" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Il template a 5 riquadri
          </h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {RIQUADRI.map((riquadro) => (
              <li key={riquadro.titolo} className="border-l-2 border-inchiostro bg-carta-soft p-4 dark:border-nebbia dark:bg-notte-soft">
                <h3 className="text-sm font-bold text-inchiostro dark:text-nebbia">{riquadro.titolo}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                  {riquadro.testo}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="semplificazione" className="mt-10">
          <h2 id="semplificazione" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Semplificazione automatica
          </h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            <p>
              Ogni scheda viene semplificata automaticamente a partire dai dati della norma: sintesi, testo disponibile,
              stato dei decreti attuativi e indicatori di qualità. Non serve incollare testi né configurare chiavi API.
            </p>
            <p>
              Quando il corpus conserva una versione redazionale della semplificazione, la scheda la preferisce; altrimenti
              la deriva sul momento con le stesse regole. In entrambi i casi il risultato è una bozza divulgativa: fa
              sempre fede il testo pubblicato in Gazzetta Ufficiale.
            </p>
          </div>
        </section>

        <section aria-labelledby="semaforo" className="mt-10">
          <h2 id="semaforo" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Il semaforo di attuazione
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Una legge può essere approvata ma non ancora applicabile. Il semaforo riassume lo stato partendo dai decreti
            attuativi previsti.
          </p>
          <ul className="mt-4 space-y-3">
            {STATI.map((stato) => (
              <li key={stato} className={`border p-4 ${STATO_META[stato].bg} ${STATO_META[stato].ring}`}>
                <TrafficLight stato={stato} showLabel={false} />
                <p className={`mt-2 text-sm font-bold ${STATO_META[stato].text}`}>{STATO_META[stato].label}</p>
                <p className="mt-1 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                  {STATO_META[stato].descrizione}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="leggibilita" className="mt-10">
          <h2 id="leggibilita" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Leggibilità e livello B1
          </h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            <p>
              Usiamo l’indice Gulpease, pensato per l’italiano. Il punteggio va da 0 a 100: più è alto, più il testo è
              facile. La formula combina numero di frasi, lettere e parole:
            </p>
            <p className="border border-regola bg-carta-soft p-3 font-mono text-xs text-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia">
              89 + (300 × frasi − 10 × lettere) ÷ parole
            </p>
            <ul className="space-y-1.5">
              <li>≥ 80: molto chiaro, adatto a tutti.</li>
              <li>60–79: chiaro, livello B1–B2.</li>
              <li>40–59: medio, richiede attenzione.</li>
              <li>&lt; 40: difficile, tipico dei testi tecnici.</li>
            </ul>
            <p>
              Nelle schede puntiamo al livello B1: frasi brevi (di norma massimo 15 parole) e lessico comune. È lo stesso
              registro che applichiamo alla semplificazione automatica, visibile in ogni{' '}
              <Link href="/leggi" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
                scheda di legge
              </Link>
              .
            </p>
          </div>
        </section>

        <section aria-labelledby="qualita" className="mt-10">
          <h2 id="qualita" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Qualità della regolazione
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Il punteggio di qualità è un’euristica trasparente su tre assi. Non è una valutazione ufficiale e non
            giudica il merito politico della norma.
          </p>
          <dl className="mt-4 grid gap-px border border-regola bg-regola dark:border-notte-deep dark:bg-notte-deep sm:grid-cols-3">
            <div className="bg-carta p-4 dark:bg-notte">
              <dt className="text-sm font-bold text-inchiostro dark:text-nebbia">Processo</dt>
              <dd className="mt-1 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                Analisi di impatto (AIR), voto di fiducia e testi omnibus.
              </dd>
            </div>
            <div className="bg-carta p-4 dark:bg-notte">
              <dt className="text-sm font-bold text-inchiostro dark:text-nebbia">Tecnica</dt>
              <dd className="mt-1 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                Rinvii interni, articoli “bis/ter” e lunghezza del testo.
              </dd>
            </div>
            <div className="bg-carta p-4 dark:bg-notte">
              <dt className="text-sm font-bold text-inchiostro dark:text-nebbia">Attuazione</dt>
              <dd className="mt-1 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                Decreti attuativi adottati, da adottare o scaduti.
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="limiti" className="mt-10 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft sm:p-6">
          <h2 id="limiti" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Limiti e correzioni
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accento dark:bg-accento-chiara" />
              Le schede sono rielaborazioni divulgative: fa sempre fede il testo pubblicato in Gazzetta Ufficiale.
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accento dark:bg-accento-chiara" />
              Indicatori e punteggi sono euristiche dichiarate, aggiornabili quando emergono errori.
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accento dark:bg-accento-chiara" />
              I contenuti sono rilasciati con licenza{' '}
              <a
                href="https://creativecommons.org/licenses/by/4.0/deed.it"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
              >
                CC BY 4.0
              </a>
              . Cita la fonte quando li riusi.
            </li>
          </ul>
        </section>
      </main>
      <Footer />
    </>
  )
}
