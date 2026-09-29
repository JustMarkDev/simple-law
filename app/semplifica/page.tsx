import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SearchBar from '@/components/SearchBar'
import LawCard from '@/components/LawCard'
import Comparsa from '@/components/Comparsa'
import TimelineAttuativi from '@/components/TimelineAttuativi'
import { AlertCircleIcon, ArrowRight01Icon, CheckmarkCircle01Icon, SparklesIcon } from 'hugeicons-react'
import { simplifyLaw } from '@/lib/simplify'
import {
  STATO_META,
  attuativiRiepilogo,
  formatDate,
  lawHref,
  loadLawByEli,
  loadLaws,
  tipoLabel,
  type Law,
} from '@/components/seed-fallback'

export const metadata: Metadata = {
  title: 'Semplifica una norma - Stato della Repubblica',
  description: 'Incolla il testo di una norma oppure confronta due atti: anteprima offline con le 5 caselle.',
}

interface SemplificaProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function str(sp: Record<string, string | string[] | undefined>, nome: string): string {
  const v = sp[nome]
  return typeof v === 'string' ? v : ''
}

function chiavePresente(sp: Record<string, string | string[] | undefined>, nome: string): boolean {
  return typeof sp[nome] === 'string'
}

/** Chi legge in parole semplici: verde = funziona, giallo = in parte, rosso = non ancora. */
const STATO_PAROLE: Record<string, string> = {
  verde: 'Funziona già',
  giallo: 'Funziona in parte',
  rosso: 'Non ancora attiva',
}

/** Le 4 voci del "cosa cambia per te" in parole semplici. */
const PERSONA_PAROLE: Record<string, string> = {
  guida: 'Chi guida',
  lavoro: 'Chi lavora',
  impresa: "Chi ha un'impresa",
  studio: 'Chi studia',
}

function parolaPersona(chiave: string): string {
  return PERSONA_PAROLE[chiave] ?? chiave.charAt(0).toUpperCase() + chiave.slice(1)
}

const ESEMPIO_URL =
  '/semplifica?titolo=Esempio&testo=Il%20Governo%20adotta%20misure%20urgenti%20per%20ridurre%20i%20costi%20dell%27energia%20e%20semplificare%20gli%20adempimenti%20per%20le%20imprese.'

const SCRIPT_CONTEGGIO = `(function(){var t=document.getElementById('titolo');var x=document.getElementById('testo');var ct=document.getElementById('conta-titolo');var cx=document.getElementById('conta-testo');function agg(){if(t&&ct){ct.textContent=t.value.length+'/500 caratteri';}if(x&&cx){var n=x.value.length;var s=n+'/20000 caratteri, minimo 20';if(n>0&&n<20){s+=', ancora '+(20-n)+' caratteri per l\\'anteprima';}cx.textContent=s;}}if(t){t.addEventListener('input',agg);}if(x){x.addEventListener('input',agg);}agg();})();`

async function trovaLegge(eli: string, corpus: Law[]): Promise<Law | undefined> {
  const pulito = eli.trim()
  if (!pulito) return undefined
  try {
    const daDb = await loadLawByEli(pulito)
    if (daDb) return daDb
  } catch {
    // ricade sul corpus già caricato
  }
  const basso = pulito.toLowerCase()
  const coda = basso.split('/').pop() ?? basso
  return (
    corpus.find((l) => l.eli.toLowerCase() === basso) ??
    corpus.find((l) => l.eli.toLowerCase().endsWith(coda))
  )
}

/**
 * Strumento di semplificazione: anteprima offline (nessuna scrittura, nessun LLM
 * senza chiave). Supporta `?testo=` + `?titolo=` incollati, `?eli=` singolo e
 * `?confronta=eliA,eliB` con tabella di confronto.
 */
export default async function SemplificaPage({ searchParams }: SemplificaProps) {
  const sp = await searchParams
  const titolo = str(sp, 'titolo').slice(0, 500)
  const testo = str(sp, 'testo').slice(0, 20000)
  const confrontaRaw = str(sp, 'confronta').slice(0, 1000)
  const eliSingolo = str(sp, 'eli').slice(0, 500)
  const testoInviato = chiavePresente(sp, 'testo') || chiavePresente(sp, 'titolo')

  const lunghezzaTitolo = titolo.length
  const lunghezzaTesto = testo.length
  const haTesto = testo.trim().length >= 20
  const erroreTesto =
    testoInviato && testo.trim().length > 0 && testo.trim().length < 20
      ? `Il testo è troppo corto: hai scritto ${testo.trim().length} caratteri, ne servono almeno 20.`
      : null

  const anteprima = haTesto && !erroreTesto
    ? simplifyLaw({ titolo: titolo || 'Testo incollato', testo })
    : null

  let leggeSingola: Law | undefined
  if (!haTesto && eliSingolo.trim()) {
    try {
      leggeSingola = (await loadLawByEli(eliSingolo.trim())) ?? undefined
    } catch {
      leggeSingola = undefined
    }
    if (!leggeSingola) {
      try {
        const tutte = await loadLaws()
        leggeSingola = await trovaLegge(eliSingolo, tutte)
      } catch {
        leggeSingola = undefined
      }
    }
  }

  let confronto: Law[] = []
  let eliRichiesti: string[] = []
  if (!haTesto && !leggeSingola && confrontaRaw.trim()) {
    eliRichiesti = confrontaRaw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 2)
    try {
      const tutte = await loadLaws()
      const trovate: Law[] = []
      for (const eli of eliRichiesti) {
        const legge = await trovaLegge(eli, tutte)
        if (legge && !trovate.some((l) => l.eli === legge.eli)) trovate.push(legge)
      }
      confronto = trovate
    } catch {
      confronto = []
    }
  }

  const mostraConfronto = !haTesto && !leggeSingola && eliRichiesti.length > 0
  const eliNonTrovati = eliRichiesti.filter((eli) => !confronto.some((l) => l.eli.toLowerCase() === eli.toLowerCase() || l.eli.toLowerCase().endsWith((eli.toLowerCase().split('/').pop() ?? ''))))

  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <nav aria-label="Percorso" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
          <ol className="flex items-center gap-2">
            <li>
              <Link href="/" className="hover:text-accento dark:hover:text-accento-chiara">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
              Semplifica
            </li>
          </ol>
        </nav>

        <Comparsa>
          <header className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
              Strumento
            </p>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
              <SparklesIcon size={32} aria-hidden="true" className="shrink-0 text-accento dark:text-accento-chiara" />
              Semplifica una norma
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Incolla un testo e ti mostro le idee principali, con parole semplici.
            </p>
            <p className="mt-4">
              <Link
                href={ESEMPIO_URL}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-accento px-6 font-semibold text-white hover:opacity-90 dark:bg-accento-chiara dark:text-notte"
              >
                Prova con un esempio
                <ArrowRight01Icon size={18} aria-hidden="true" />
              </Link>
            </p>
          </header>
        </Comparsa>

        <Comparsa delay={0.06}>
        <form method="get" action="/semplifica" className="mt-6 grid gap-3 rounded-2xl border border-regola bg-carta-soft p-4 sm:p-5 dark:border-notte-deep dark:bg-notte-soft" aria-describedby="aiuto-modulo">
          <p id="aiuto-modulo" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
            Scrivi qui sotto e premi Semplifica. Niente viene salvato. I conteggi si aggiornano mentre scrivi.
          </p>
          <label htmlFor="titolo" className="text-xs font-semibold uppercase tracking-wide text-inchiostro dark:text-nebbia">
            Titolo (se vuoi, fino a 500 caratteri)
          </label>
          <input
            id="titolo"
            name="titolo"
            defaultValue={titolo}
            maxLength={500}
            placeholder="Es. Regole nuove per l'energia"
            aria-describedby="aiuto-titolo conta-titolo"
            autoComplete="off"
            className="min-h-[48px] rounded-xl border border-regola bg-carta px-3 py-2 text-sm text-inchiostro dark:border-notte-deep dark:bg-notte dark:text-nebbia"
          />
          <p id="aiuto-titolo" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
            Un titolo corto aiuta a capire. Puoi anche lasciarlo vuoto.
          </p>
          <p id="conta-titolo" role="status" aria-live="polite" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
            {lunghezzaTitolo}/500 caratteri
          </p>

          <label htmlFor="testo" className="mt-2 text-xs font-semibold uppercase tracking-wide text-inchiostro dark:text-nebbia">
            Testo da leggere (da 20 a 20.000 caratteri)
          </label>
          <textarea
            id="testo"
            name="testo"
            defaultValue={testo}
            rows={6}
            maxLength={20000}
            placeholder="Incolla qui il testo della norma…"
            aria-describedby={`aiuto-testo conta-testo${erroreTesto ? ' errore-testo' : ''}`}
            aria-invalid={erroreTesto ? true : undefined}
            className="min-h-[48px] rounded-xl border border-regola bg-carta px-3 py-2 text-sm leading-relaxed text-inchiostro dark:border-notte-deep dark:bg-notte dark:text-nebbia"
          />
          <p id="aiuto-testo" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
            Servono almeno 20 caratteri per vedere le 5 caselle.
          </p>
          <p id="conta-testo" role="status" aria-live="polite" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
            {lunghezzaTesto}/20000 caratteri, minimo 20
            {lunghezzaTesto > 0 && lunghezzaTesto < 20 ? ` · ancora ${20 - lunghezzaTesto} caratteri` : ''}
          </p>
          {erroreTesto ? (
            <div id="errore-testo" role="alert" className="flex items-start gap-2 rounded-xl border border-red-600/40 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
              <AlertCircleIcon size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
              <p>
                {erroreTesto}{' '}
                <Link href={ESEMPIO_URL} className="font-semibold underline underline-offset-2">
                  Prova con un esempio
                </Link>
              </p>
            </div>
          ) : null}
          <noscript>
            <p className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
              Senza JavaScript i conteggi sopra si aggiornano a ogni invio.
            </p>
          </noscript>
          <div>
            <button
              type="submit"
              className="inline-flex min-h-[48px] items-center rounded-xl bg-accento px-6 py-2 text-sm font-semibold text-white hover:opacity-90 dark:bg-accento-chiara dark:text-notte"
            >
              Semplifica
            </button>
          </div>
        </form>
        </Comparsa>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_CONTEGGIO }} />

        <details className="mt-6 rounded-2xl border border-regola bg-carta p-4 dark:border-notte-deep dark:bg-notte">
          <summary className="inline-flex min-h-[48px] cursor-pointer items-center text-sm font-semibold text-inchiostro dark:text-nebbia">
            Vuoi confrontare due leggi? Apri qui
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <form method="get" action="/semplifica" className="grid content-start gap-2 rounded-xl border border-regola bg-carta-soft p-4 dark:border-notte-deep dark:bg-notte-soft">
              <label htmlFor="eli" className="text-xs font-semibold uppercase tracking-wide text-inchiostro dark:text-nebbia">
                Mostra una legge dell’archivio
              </label>
              <input
                id="eli"
                name="eli"
                defaultValue={eliSingolo}
                placeholder="Incolla qui il codice che trovi nella scheda"
                autoComplete="off"
                className="min-h-[48px] rounded-xl border border-regola bg-carta px-3 py-2 text-sm dark:border-notte-deep dark:bg-notte"
              />
              <button type="submit" className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide hover:border-accento hover:text-accento dark:border-notte-deep dark:hover:border-accento-chiara dark:hover:text-accento-chiara">
                Mostra scheda
              </button>
            </form>
            <form method="get" action="/semplifica" className="grid content-start gap-2 rounded-xl border border-regola bg-carta-soft p-4 dark:border-notte-deep dark:bg-notte-soft">
              <label htmlFor="confronta" className="text-xs font-semibold uppercase tracking-wide text-inchiostro dark:text-nebbia">
                Confronta due leggi
              </label>
              <input
                id="confronta"
                name="confronta"
                defaultValue={confrontaRaw}
                placeholder="Due codici separati da una virgola"
                autoComplete="off"
                className="min-h-[48px] rounded-xl border border-regola bg-carta px-3 py-2 text-sm dark:border-notte-deep dark:bg-notte"
              />
              <button type="submit" className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide hover:border-accento hover:text-accento dark:border-notte-deep dark:hover:border-accento-chiara dark:hover:text-accento-chiara">
                Confronta
              </button>
            </form>
          </div>
          <div className="mt-4">
            <SearchBar action="/semplifica" query={{}} label="Cerca una legge" placeholder="Scrivi una parola, poi apri la scheda" />
          </div>
        </details>

        {anteprima ? (
          <Comparsa>
          <section aria-live="polite" aria-label="Le idee principali del testo incollato" className="mt-8 rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
            <h2 className="flex items-center gap-2 text-xl font-bold text-inchiostro dark:text-nebbia">
              <CheckmarkCircle01Icon size={24} aria-hidden="true" className="shrink-0 text-accento dark:text-accento-chiara" />
              Ecco le idee principali
            </h2>
            <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">Fatte qui sul momento, solo dal tuo testo.</p>

            <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-inchiostro dark:text-nebbia">1 · In poche parole</h3>
            <p className="mt-2 rounded-xl border-l-4 border-accento bg-carta-soft px-4 py-3 text-sm font-medium dark:bg-notte">{anteprima.in10Secondi}</p>

            <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-inchiostro dark:text-nebbia">2 · Cosa cambia per te</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {Object.entries(anteprima.perTe).map(([k, v]) => (
                <div key={k} className="rounded-xl border border-regola p-3 text-sm dark:border-notte-deep">
                  <p className="text-xs font-semibold uppercase tracking-wide text-inchiostro dark:text-nebbia">{parolaPersona(k)}</p>
                  <p className="mt-1 text-sm leading-relaxed">{v}</p>
                </div>
              ))}
            </div>

            <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-inchiostro dark:text-nebbia">3 · Cosa puoi fare</h3>
            <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed">
              {anteprima.cosaFare.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>

            <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-inchiostro dark:text-nebbia">4 · A che punto è</h3>
            <p className="mt-2 text-sm">
              <strong>{STATO_PAROLE[anteprima.statoLavora.colore] ?? 'Da vedere'}</strong> - {anteprima.statoLavora.motivo} · Parole facili: {anteprima.gulpease} su 100
            </p>

            <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-inchiostro dark:text-nebbia">5 · Lati buoni e lati deboli</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-regola p-3 dark:border-notte-deep">
                <h4 className="text-sm font-semibold">Cosa va bene</h4>
                <ul className="mt-1 list-disc pl-5 text-sm leading-relaxed">
                  {anteprima.proContro.pro.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-regola p-3 dark:border-notte-deep">
                <h4 className="text-sm font-semibold">Cosa non va</h4>
                <ul className="mt-1 list-disc pl-5 text-sm leading-relaxed">
                  {anteprima.proContro.contro.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
          </Comparsa>
        ) : leggeSingola ? (
          <section aria-label="Legge scelta dall’archivio" className="mt-8">
            <h2 className="text-xl font-bold text-inchiostro dark:text-nebbia">La legge che hai scelto</h2>
            <div className="mt-3 max-w-xl">
              <LawCard law={leggeSingola} headingLevel="h3" />
            </div>
            <dl className="mt-4 grid gap-2 rounded-2xl border border-regola bg-carta-soft p-4 text-sm sm:grid-cols-2 dark:border-notte-deep dark:bg-notte-soft">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide">Titolo</dt>
                <dd className="mt-1">{leggeSingola.titolo}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide">Che legge è</dt>
                <dd className="mt-1">{tipoLabel(leggeSingola)} · {formatDate(leggeSingola.dataEmanazione)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide">A che punto è</dt>
                <dd className="mt-1">{STATO_META[leggeSingola.stato].label} - {leggeSingola.semplificata.statoLavora.motivo}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide">Parole e numeri</dt>
                <dd className="mt-1">Facile da leggere: {leggeSingola.gulpease} su 100 · Qualità {leggeSingola.qualita} su 100</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide">Cosa manca ancora</dt>
                <dd className="mt-1">{attuativiRiepilogo(leggeSingola.attuativi)}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <TimelineAttuativi dataEmanazione={leggeSingola.dataEmanazione} attuativi={leggeSingola.attuativi} stato={leggeSingola.stato} />
            </div>
            <p className="mt-3 text-sm">
              <Link href={lawHref(leggeSingola)} className="inline-flex min-h-[48px] items-center underline underline-offset-4">
                Apri la scheda completa
              </Link>
            </p>
          </section>
        ) : mostraConfronto ? (
          <section aria-label="Le due leggi a confronto" className="mt-8">
            <h2 className="text-xl font-bold text-inchiostro dark:text-nebbia">Le differenze ({confronto.length}/2)</h2>
            {confronto.length === 2 ? (
              <>
                <div className="mt-3 overflow-x-auto rounded-2xl border border-regola dark:border-notte-deep">
                  <table className="w-full min-w-[560px] border-collapse bg-carta text-left text-sm dark:bg-notte">
                    <caption className="px-4 py-2 text-left text-xs text-inchiostro-faint dark:text-nebbia-faint">
                      Le differenze principali tra le due leggi scelte.
                    </caption>
                    <thead>
                      <tr className="border-b border-regola dark:border-notte-deep">
                        <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Voce</th>
                        <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Legge A · {tipoLabel(confronto[0])}</th>
                        <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Legge B · {tipoLabel(confronto[1])}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-regola dark:border-notte-deep">
                        <th scope="row" className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-wide">Titolo</th>
                        <td className="px-4 py-3 align-top">{confronto[0].titolo}</td>
                        <td className="px-4 py-3 align-top">{confronto[1].titolo}</td>
                      </tr>
                      <tr className="border-b border-regola dark:border-notte-deep">
                        <th scope="row" className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-wide">A che punto è</th>
                        <td className="px-4 py-3 align-top">{STATO_META[confronto[0].stato].label} - {attuativiRiepilogo(confronto[0].attuativi)}</td>
                        <td className="px-4 py-3 align-top">{STATO_META[confronto[1].stato].label} - {attuativiRiepilogo(confronto[1].attuativi)}</td>
                      </tr>
                      <tr className="border-b border-regola dark:border-notte-deep">
                        <th scope="row" className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-wide">Parole e numeri</th>
                        <td className="px-4 py-3 align-top">Facile da leggere: {confronto[0].gulpease} su 100 · Qualità {confronto[0].qualita} su 100</td>
                        <td className="px-4 py-3 align-top">Facile da leggere: {confronto[1].gulpease} su 100 · Qualità {confronto[1].qualita} su 100</td>
                      </tr>
                      <tr className="border-b border-regola dark:border-notte-deep">
                        <th scope="row" className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-wide">Cosa va bene</th>
                        <td className="px-4 py-3 align-top">
                          <ul className="list-disc pl-5">
                            {confronto[0].semplificata.proContro.pro.map((p) => (<li key={p}>{p}</li>))}
                          </ul>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <ul className="list-disc pl-5">
                            {confronto[1].semplificata.proContro.pro.map((p) => (<li key={p}>{p}</li>))}
                          </ul>
                        </td>
                      </tr>
                      <tr>
                        <th scope="row" className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-wide">Cosa non va</th>
                        <td className="px-4 py-3 align-top">
                          <ul className="list-disc pl-5">
                            {confronto[0].semplificata.proContro.contro.map((c) => (<li key={c}>{c}</li>))}
                          </ul>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <ul className="list-disc pl-5">
                            {confronto[1].semplificata.proContro.contro.map((c) => (<li key={c}>{c}</li>))}
                          </ul>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {confronto.map((law) => (
                    <div key={law.eli}>
                      <h3 className="text-sm font-semibold">{tipoLabel(law)}</h3>
                      <div className="mt-2">
                        <TimelineAttuativi dataEmanazione={law.dataEmanazione} attuativi={law.attuativi} stato={law.stato} />
                      </div>
                      <p className="mt-2 text-sm">
                        <Link href={lawHref(law)} className="inline-flex min-h-[48px] items-center underline underline-offset-4">
                          Apri {tipoLabel(law)}
                        </Link>
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-3 rounded-2xl border border-regola p-4 dark:border-notte-deep">
                <div className="grid gap-4 md:grid-cols-2">
                  {confronto.map((law) => (
                    <LawCard key={law.eli} law={law} headingLevel="h3" />
                  ))}
                </div>
                <p className="mt-3 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300" role="alert">
                  <AlertCircleIcon size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
                  {confronto.length === 0
                    ? 'Non ho trovato queste leggi: controlla i due codici separati da una virgola.'
                    : `Ho trovato una sola legge${eliNonTrovati.length > 0 ? `; non trovo: ${eliNonTrovati.join(', ')}` : '.'}`}
                </p>
                <p className="mt-2 text-sm">
                  <Link href="/leggi" className="inline-flex min-h-[48px] items-center underline underline-offset-4">
                    Cerca tra le leggi per copiare i codici giusti
                  </Link>
                </p>
              </div>
            )}
          </section>
        ) : (
          <div className="mt-6 rounded-2xl border border-regola bg-carta-soft p-4 dark:border-notte-deep dark:bg-notte-soft" role="status">
            <p className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
              Niente da mostrare per ora: incolla un testo qui sopra per cominciare.
            </p>
            <p className="mt-3">
              <Link href="/leggi" className="inline-flex min-h-[48px] items-center rounded-xl border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide hover:border-accento hover:text-accento dark:border-notte-deep dark:hover:border-accento-chiara dark:hover:text-accento-chiara">
                Cerca tra le leggi
              </Link>
            </p>
          </div>
        )}
      </main>
      <Footer />
    </>
  )
}
