import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SearchBar from '@/components/SearchBar'
import LawCard from '@/components/LawCard'
import Comparsa from '@/components/Comparsa'
import TimelineAttuativi from '@/components/TimelineAttuativi'
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
  title: 'Semplifica una norma — Stato della Repubblica',
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

const SCRIPT_CONTEGGIO = `(function(){var t=document.getElementById('titolo');var x=document.getElementById('testo');var ct=document.getElementById('conta-titolo');var cx=document.getElementById('conta-testo');function agg(){if(t&&ct){ct.textContent=t.value.length+'/500 caratteri';}if(x&&cx){var n=x.value.length;var s=n+'/20000 caratteri · minimo 20';if(n>0&&n<20){s+=' · ancora '+(20-n)+' caratteri per l\\'anteprima';}cx.textContent=s;}}if(t){t.addEventListener('input',agg);}if(x){x.addEventListener('input',agg);}agg();})();`

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
      ? `Il testo è troppo corto: hai scritto ${testo.trim().length} caratteri, ne servono almeno 20 per l’anteprima.`
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

        <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Strumento
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Semplifica una norma
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Incolla un testo (minimo 20 caratteri, massimo 20.000) per un&apos;anteprima offline con le 5 caselle,
            oppure confronta due atti dell&apos;archivio. Nessun dato viene salvato.
          </p>
        </header>

        <Comparsa>
        <form method="get" action="/semplifica" className="mt-6 grid gap-3 border border-regola bg-carta-soft p-4 dark:border-notte-deep dark:bg-notte-soft" aria-describedby="aiuto-modulo">
          <p id="aiuto-modulo" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
            Il conteggio dei caratteri è mostrato sotto ogni campo e si aggiorna mentre scrivi. Senza JavaScript i conteggi si aggiornano dopo l’invio.
          </p>
          <label htmlFor="titolo" className="text-xs font-semibold uppercase tracking-wide text-inchiostro dark:text-nebbia">
            Titolo (facoltativo, massimo 500 caratteri)
          </label>
          <input
            id="titolo"
            name="titolo"
            defaultValue={titolo}
            maxLength={500}
            placeholder="Es. Disposizioni in materia di energia"
            aria-describedby="aiuto-titolo conta-titolo"
            autoComplete="off"
            className="min-h-[44px] border border-regola bg-carta px-3 py-2 text-sm text-inchiostro dark:border-notte-deep dark:bg-notte dark:text-nebbia"
          />
          <p id="aiuto-titolo" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
            Un titolo breve aiuta l’anteprima. Puoi lasciarlo vuoto.
          </p>
          <p id="conta-titolo" role="status" aria-live="polite" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
            {lunghezzaTitolo}/500 caratteri
          </p>

          <label htmlFor="testo" className="mt-2 text-xs font-semibold uppercase tracking-wide text-inchiostro dark:text-nebbia">
            Testo da semplificare (da 20 a 20.000 caratteri)
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
            className="min-h-[44px] border border-regola bg-carta px-3 py-2 text-sm leading-relaxed text-inchiostro dark:border-notte-deep dark:bg-notte dark:text-nebbia"
          />
          <p id="aiuto-testo" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
            Servono almeno 20 caratteri per generare le 5 caselle di anteprima.
          </p>
          <p id="conta-testo" role="status" aria-live="polite" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
            {lunghezzaTesto}/20000 caratteri · minimo 20
            {lunghezzaTesto > 0 && lunghezzaTesto < 20 ? ` · ancora ${20 - lunghezzaTesto} caratteri per l’anteprima` : ''}
          </p>
          {erroreTesto ? (
            <p id="errore-testo" role="alert" className="border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
              {erroreTesto}
            </p>
          ) : null}
          <noscript>
            <p className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
              JavaScript disattivato: i conteggi sopra mostrano i valori inviati e si aggiornano a ogni invio del modulo.
            </p>
          </noscript>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="min-h-[44px] bg-inchiostro px-4 py-2 text-xs font-semibold uppercase tracking-wide text-carta hover:bg-inchiostro-soft dark:bg-nebbia dark:text-notte"
            >
              Semplifica
            </button>
            <Link href="/leggi" className="inline-flex min-h-[44px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide hover:border-inchiostro dark:border-notte-deep">
              Vai all&apos;archivio
            </Link>
          </div>
        </form>
        </Comparsa>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_CONTEGGIO }} />

        <div className="mt-6 grid gap-4 border border-regola bg-carta p-4 sm:grid-cols-2 dark:border-notte-deep dark:bg-notte">
          <form method="get" action="/semplifica" className="grid content-start gap-2">
            <label htmlFor="eli" className="text-xs font-semibold uppercase tracking-wide text-inchiostro dark:text-nebbia">
              Mostra un atto dall’archivio (ELI)
            </label>
            <input
              id="eli"
              name="eli"
              defaultValue={eliSingolo}
              placeholder="Es. /eli/id/2026/07/27/26G00155/sg"
              autoComplete="off"
              className="min-h-[44px] border border-regola bg-carta-soft px-3 py-2 text-sm dark:border-notte-deep dark:bg-notte-soft"
            />
            <button type="submit" className="min-h-[44px] border border-inchiostro px-4 py-2 text-xs font-semibold uppercase tracking-wide hover:bg-carta-soft dark:border-nebbia">
              Mostra scheda
            </button>
          </form>
          <form method="get" action="/semplifica" className="grid content-start gap-2">
            <label htmlFor="confronta" className="text-xs font-semibold uppercase tracking-wide text-inchiostro dark:text-nebbia">
              Confronta due atti (due ELI separati da virgola)
            </label>
            <input
              id="confronta"
              name="confronta"
              defaultValue={confrontaRaw}
              placeholder="Es. eliA,eliB"
              autoComplete="off"
              className="min-h-[44px] border border-regola bg-carta-soft px-3 py-2 text-sm dark:border-notte-deep dark:bg-notte-soft"
            />
            <button type="submit" className="min-h-[44px] border border-inchiostro px-4 py-2 text-xs font-semibold uppercase tracking-wide hover:bg-carta-soft dark:border-nebbia">
              Confronta
            </button>
          </form>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Oppure cerca un atto</h2>
          <SearchBar action="/semplifica" query={{}} placeholder="Cerca per parola, poi apri la scheda e confronta" />
          <p className="mt-2 text-xs text-inchiostro-faint dark:text-nebbia-faint">
            Suggerimento confronto: <code>?confronta=eliA,eliB</code> con due ELI separati da virgola.
          </p>
        </div>

        {anteprima ? (
          <Comparsa>
          <section aria-live="polite" aria-label="Anteprima semplificata del testo incollato" className="mt-8 border border-inchiostro p-5 dark:border-nebbia">
            <h2 className="font-serif text-xl font-bold">Anteprima (euristica offline)</h2>
            <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">Cinque caselle generate sul tuo testo, senza salvataggi.</p>

            <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide">1 · In 10 secondi</h3>
            <p className="mt-2 border-l-2 border-tricolore-rosso bg-carta px-4 py-3 text-sm font-medium">{anteprima.in10Secondi}</p>

            <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide">2 · Cosa significa per te</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {Object.entries(anteprima.perTe).map(([k, v]) => (
                <div key={k} className="border border-regola p-3 text-sm dark:border-notte-deep">
                  <p className="text-xs font-semibold uppercase tracking-wide">{k}</p>
                  <p className="mt-1 text-sm leading-relaxed">{v}</p>
                </div>
              ))}
            </div>

            <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide">3 · Cosa fare</h3>
            <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed">
              {anteprima.cosaFare.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>

            <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide">4 · A che punto siamo</h3>
            <p className="mt-2 text-sm">
              <strong>Stato:</strong> {anteprima.statoLavora.colore} — {anteprima.statoLavora.motivo} · Gulpease {anteprima.gulpease}
            </p>

            <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide">5 · Pro e contro</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="border border-regola p-3 dark:border-notte-deep">
                <h4 className="text-sm font-semibold">Pro</h4>
                <ul className="mt-1 list-disc pl-5 text-sm leading-relaxed">
                  {anteprima.proContro.pro.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
              <div className="border border-regola p-3 dark:border-notte-deep">
                <h4 className="text-sm font-semibold">Contro</h4>
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
          <section aria-label="Scheda selezionata dall’archivio" className="mt-8">
            <h2 className="font-serif text-xl font-bold">Scheda selezionata</h2>
            <div className="mt-3 max-w-xl">
              <LawCard law={leggeSingola} headingLevel="h3" />
            </div>
            <dl className="mt-4 grid gap-2 border border-regola bg-carta-soft p-4 text-sm sm:grid-cols-2 dark:border-notte-deep dark:bg-notte-soft">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide">Titolo</dt>
                <dd className="mt-1">{leggeSingola.titolo}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide">Riferimento</dt>
                <dd className="mt-1">{tipoLabel(leggeSingola)} · {formatDate(leggeSingola.dataEmanazione)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide">Stato</dt>
                <dd className="mt-1">{STATO_META[leggeSingola.stato].label} — {leggeSingola.semplificata.statoLavora.motivo}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide">Leggibilità e qualità</dt>
                <dd className="mt-1">Gulpease {leggeSingola.gulpease} · Qualità {leggeSingola.qualita}/100</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide">Attuativi</dt>
                <dd className="mt-1">{attuativiRiepilogo(leggeSingola.attuativi)}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <TimelineAttuativi dataEmanazione={leggeSingola.dataEmanazione} attuativi={leggeSingola.attuativi} stato={leggeSingola.stato} />
            </div>
            <p className="mt-3 text-sm">
              <Link href={lawHref(leggeSingola)} className="inline-flex min-h-[44px] items-center underline underline-offset-4">
                Apri la scheda completa
              </Link>
            </p>
          </section>
        ) : mostraConfronto ? (
          <section aria-label="Confronto tra due atti" className="mt-8">
            <h2 className="font-serif text-xl font-bold">Confronto ({confronto.length}/2)</h2>
            {confronto.length === 2 ? (
              <>
                <div className="mt-3 overflow-x-auto border border-regola dark:border-notte-deep">
                  <table className="w-full min-w-[560px] border-collapse bg-carta text-left text-sm dark:bg-notte">
                    <caption className="px-4 py-2 text-left text-xs text-inchiostro-faint dark:text-nebbia-faint">
                      Differenze principali tra i due atti selezionati.
                    </caption>
                    <thead>
                      <tr className="border-b border-regola dark:border-notte-deep">
                        <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Voce</th>
                        <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Atto A · {tipoLabel(confronto[0])}</th>
                        <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Atto B · {tipoLabel(confronto[1])}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-regola dark:border-notte-deep">
                        <th scope="row" className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-wide">Titolo</th>
                        <td className="px-4 py-3 align-top">{confronto[0].titolo}</td>
                        <td className="px-4 py-3 align-top">{confronto[1].titolo}</td>
                      </tr>
                      <tr className="border-b border-regola dark:border-notte-deep">
                        <th scope="row" className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-wide">Stato</th>
                        <td className="px-4 py-3 align-top">{STATO_META[confronto[0].stato].label} — {confronto[0].semplificata.statoLavora.motivo}</td>
                        <td className="px-4 py-3 align-top">{STATO_META[confronto[1].stato].label} — {confronto[1].semplificata.statoLavora.motivo}</td>
                      </tr>
                      <tr className="border-b border-regola dark:border-notte-deep">
                        <th scope="row" className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-wide">Gulpease</th>
                        <td className="px-4 py-3 align-top">{confronto[0].gulpease}</td>
                        <td className="px-4 py-3 align-top">{confronto[1].gulpease}</td>
                      </tr>
                      <tr className="border-b border-regola dark:border-notte-deep">
                        <th scope="row" className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-wide">Qualità</th>
                        <td className="px-4 py-3 align-top">{confronto[0].qualita}/100</td>
                        <td className="px-4 py-3 align-top">{confronto[1].qualita}/100</td>
                      </tr>
                      <tr className="border-b border-regola dark:border-notte-deep">
                        <th scope="row" className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-wide">Attuativi</th>
                        <td className="px-4 py-3 align-top">{attuativiRiepilogo(confronto[0].attuativi)}</td>
                        <td className="px-4 py-3 align-top">{attuativiRiepilogo(confronto[1].attuativi)}</td>
                      </tr>
                      <tr className="border-b border-regola dark:border-notte-deep">
                        <th scope="row" className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-wide">Pro</th>
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
                        <th scope="row" className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-wide">Contro</th>
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
                        <Link href={lawHref(law)} className="inline-flex min-h-[44px] items-center underline underline-offset-4">
                          Apri {tipoLabel(law)}
                        </Link>
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-3 border border-regola p-4 dark:border-notte-deep">
                <div className="grid gap-4 md:grid-cols-2">
                  {confronto.map((law) => (
                    <LawCard key={law.eli} law={law} headingLevel="h3" />
                  ))}
                </div>
                <p className="mt-3 text-sm text-amber-800 dark:text-amber-300" role="alert">
                  {confronto.length === 0
                    ? 'Nessun atto trovato: verifica i due ELI separati da virgola.'
                    : `Trovato solo un atto${eliNonTrovati.length > 0 ? `; non trovato: ${eliNonTrovati.join(', ')}` : ': verifica gli ELI separati da virgola.'}`}
                </p>
                <p className="mt-2 text-sm">
                  <Link href="/leggi" className="inline-flex min-h-[44px] items-center underline underline-offset-4">
                    Sfoglia l’archivio per copiare gli ELI corretti
                  </Link>
                </p>
              </div>
            )}
          </section>
        ) : (
          <div className="mt-6 border border-regola bg-carta-soft p-4 dark:border-notte-deep dark:bg-notte-soft" role="status">
            <p className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
              Nessuna anteprima ancora: incolla un testo oppure usa <code>?eli=…</code> / <code>?confronta=…,…</code>.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2 text-xs">
              <li>
                <Link href="/leggi" className="inline-flex min-h-[44px] items-center border border-regola px-3 py-2 font-semibold uppercase tracking-wide hover:border-inchiostro dark:border-notte-deep">
                  Sfoglia l’archivio
                </Link>
              </li>
              <li>
                <Link href="/semplifica?titolo=Esempio&testo=Il%20Governo%20adotta%20misure%20urgenti%20per%20ridurre%20i%20costi%20dell%27energia%20e%20semplificare%20gli%20adempimenti%20per%20le%20imprese." className="inline-flex min-h-[44px] items-center border border-regola px-3 py-2 font-semibold uppercase tracking-wide hover:border-inchiostro dark:border-notte-deep">
                  Prova un testo di esempio
                </Link>
              </li>
            </ul>
          </div>
        )}
      </main>
      <Footer />
    </>
  )
}
