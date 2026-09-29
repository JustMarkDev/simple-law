import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import {
  caricaReferendum2025,
  cercaComuneReferendum,
  type ComuneReferendum,
} from '@/lib/elezioni-dati'

export const metadata: Metadata = {
  title: 'Referendum 8-9 giugno 2025 - Stato della Repubblica',
  description:
    'I 5 quesiti referendari dell’8-9 giugno 2025: SI e NO a livello nazionale, regionale e comunale, dai dati ufficiali del Ministero dell’Interno (DAIT). Solo aggregati.',
}

const MAX_RIGHE_COMUNI = 100

function normalizzaLocal(testo: string): string {
  try {
    return testo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
  } catch {
    return ''
  }
}

function intero(value: number): string {
  try {
    return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(
      Number.isFinite(value) ? value : 0,
    )
  } catch {
    return '0'
  }
}

function decimaleIT(value: number): string {
  try {
    return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
      Number.isFinite(value) ? value : 0,
    )
  } catch {
    return '0,0'
  }
}

function dataIT(iso: string): string {
  try {
    const d = new Date(`${iso}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  } catch {
    return iso
  }
}

interface PaginaProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function str(sp: Record<string, string | string[] | undefined>, nome: string): string {
  const v = sp[nome]
  return typeof v === 'string' ? v : ''
}

export default async function Referendum2025Page({ searchParams }: PaginaProps) {
  const dati = await caricaReferendum2025()
  if (!dati) {
    return (
      <>
        <Header />
        <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <nav aria-label="Percorso" className="text-xs text-inchiostro-soft dark:text-nebbia-soft">
            <Link href="/elezioni" className="underline underline-offset-2 hover:text-accento dark:hover:text-accento-chiara">
              Elezioni
            </Link>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">Referendum 2025</span>
          </nav>
          <p className="mt-6 border border-dashed border-regola bg-carta p-6 text-sm text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft" role="status">
            Dati in preparazione: l’aggregato ufficiale non è ancora pubblicato.
          </p>
        </main>
        <Footer />
      </>
    )
  }

  const sp = await searchParams
  const qGrezza = str(sp, 'q').slice(0, 100)
  const ordRaw = str(sp, 'ord')
  const ord = ordRaw === 'a_asc' ? 'a_asc' : 'a_desc'
  const queryNorm = normalizzaLocal(qGrezza)
  const ricercaAttiva = queryNorm.length >= 2

  const { elezione, quesiti, regioni, comuni, provenance, metodologia, avvertenze } = dati
  const quesitiOrdinati = [...quesiti].sort((a, b) => a.q - b.q)
  const regioniOrdinate = [...regioni].sort((a, b) => a.r.localeCompare(b.r, 'it'))

  let comuniFiltrati: ComuneReferendum[] = ricercaAttiva
    ? cercaComuneReferendum(comuni, qGrezza)
    : [...comuni]
  comuniFiltrati = [...comuniFiltrati].sort((a, b) =>
    ord === 'a_asc' ? a.a - b.a || a.c.localeCompare(b.c, 'it') : b.a - a.a || a.c.localeCompare(b.c, 'it'),
  )
  const totaleFiltrati = comuniFiltrati.length
  const comuniMostrati = comuniFiltrati.slice(0, MAX_RIGHE_COMUNI)

  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <nav aria-label="Percorso" className="text-xs text-inchiostro-soft dark:text-nebbia-soft">
          <Link href="/elezioni" className="underline underline-offset-2 hover:text-accento dark:hover:text-accento-chiara">
            Elezioni
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">Referendum 8-9 giugno 2025</span>
        </nav>

        <header className="mt-3 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="inline-flex items-center border border-regola px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
            Dati ufficiali DAIT
          </p>
          <h1 className="mt-3 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Referendum 8-9 giugno 2025
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            5 quesiti referendari: SI e NO a livello nazionale, regionale e affluenza per comune,
            dai dati ufficiali del Ministero dell’Interno. Solo aggregati, nessun nominativo.
          </p>
        </header>

        <section aria-labelledby="affluenza" className="mt-8">
          <h2 id="affluenza" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Affluenza nazionale
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-px border border-regola bg-regola dark:border-notte-deep dark:bg-notte-deep sm:grid-cols-4">
            <div className="bg-carta p-4 dark:bg-notte">
              <dt className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">Affluenza</dt>
              <dd className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
                {decimaleIT(elezione.a)}%
              </dd>
            </div>
            <div className="bg-carta p-4 dark:bg-notte">
              <dt className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">Elettori</dt>
              <dd className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
                {intero(elezione.e)}
              </dd>
            </div>
            <div className="bg-carta p-4 dark:bg-notte">
              <dt className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">Votanti</dt>
              <dd className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
                {intero(elezione.v)}
              </dd>
            </div>
            <div className="bg-carta p-4 dark:bg-notte">
              <dt className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">Data</dt>
              <dd className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
                {dataIT(elezione.data)}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="quesiti" className="mt-10">
          <h2 id="quesiti" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            I 5 quesiti
          </h2>
          <ul className="mt-4 grid gap-4 lg:grid-cols-2">
            {quesitiOrdinati.map((quesito) => {
              return (
                <li
                  key={quesito.q}
                  className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
                >
                  <h3 className="font-serif text-base font-bold leading-snug text-inchiostro dark:text-nebbia">
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center bg-inchiostro text-xs text-carta dark:bg-nebbia dark:text-notte">
                      {quesito.q}
                    </span>
                    {quesito.titolo}
                  </h3>
                  <div
                    className="mt-4 flex h-3 w-full overflow-hidden bg-regola dark:bg-notte-deep"
                    role="img"
                    aria-label={`SI ${decimaleIT(quesito.p_si)}%, NO ${decimaleIT(100 - quesito.p_si)}%`}
                  >
                    <span className="h-full bg-emerald-600" style={{ width: `${quesito.p_si}%` }} />
                    <span className="h-full bg-tricolore-rosso" style={{ width: `${100 - quesito.p_si}%` }} />
                  </div>
                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <div className="flex gap-2">
                      <dt className="font-semibold text-emerald-700 dark:text-emerald-300">SI:</dt>
                      <dd className="text-inchiostro-soft dark:text-nebbia-soft">
                        {intero(quesito.si)} ({decimaleIT(quesito.p_si)}%)
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-semibold text-red-700 dark:text-red-300">NO:</dt>
                      <dd className="text-inchiostro-soft dark:text-nebbia-soft">
                        {intero(quesito.no)} ({decimaleIT(100 - quesito.p_si)}%)
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-semibold text-inchiostro-soft dark:text-nebbia-soft">Bianche:</dt>
                      <dd className="text-inchiostro-faint dark:text-nebbia-faint">{intero(quesito.bianche)}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                    {elezione.a < 50
                      ? 'Quorum del 50%+1 non raggiunto a livello nazionale: il quesito non è valido.'
                      : 'Verifica il raggiungimento del quorum del 50%+1 sui dati ufficiali.'}
                  </p>
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="regioni" className="mt-10">
          <h2 id="regioni" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Regioni
          </h2>
          <div className="mt-4 overflow-x-auto border border-regola dark:border-notte-deep">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="sr-only">
                Affluenza per regione e percentuale SI al primo quesito
              </caption>
              <thead>
                <tr className="bg-carta-soft text-left dark:bg-notte-soft">
                  <th scope="col" className="px-4 py-2 font-semibold text-inchiostro dark:text-nebbia">Regione</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">Affluenza</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">Votanti</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">SI Q1</th>
                </tr>
              </thead>
              <tbody>
                {regioniOrdinate.map((regione) => {
                  const q1 = regione.quesiti.find((q) => q.q === 1)
                  const totQ1 = q1 ? q1.si + q1.no : 0
                  return (
                    <tr key={regione.r} className="border-t border-regola dark:border-notte-deep">
                      <th scope="row" className="px-4 py-2 text-left font-medium text-inchiostro dark:text-nebbia">
                        {regione.r}
                      </th>
                      <td className="px-4 py-2 text-right tabular-nums text-inchiostro-soft dark:text-nebbia-soft">
                        {decimaleIT(regione.a)}%
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-inchiostro-soft dark:text-nebbia-soft">
                        {intero(regione.v)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-inchiostro-soft dark:text-nebbia-soft">
                        {totQ1 > 0 ? `${decimaleIT((q1!.si / totQ1) * 100)}%` : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="comuni" className="mt-10">
          <h2 id="comuni" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Comuni
          </h2>
          <form method="get" action="/elezioni/referendum-2025" className="mt-4 flex max-w-xl gap-2" role="search">
            <label htmlFor="q-comune-ref" className="sr-only">
              Cerca un comune
            </label>
            <input
              id="q-comune-ref"
              name="q"
              type="search"
              defaultValue={qGrezza}
              placeholder="Cerca un comune (min. 2 caratteri)"
              autoComplete="off"
              className="min-h-[44px] w-full border border-regola bg-carta px-3 py-2 text-sm text-inchiostro placeholder:text-inchiostro-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte dark:text-nebbia dark:placeholder:text-nebbia-faint dark:focus-visible:outline-nebbia"
            />
            <button
              type="submit"
              className="min-h-[44px] shrink-0 bg-inchiostro px-5 text-sm font-semibold text-carta hover:bg-inchiostro-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:bg-nebbia dark:text-notte dark:hover:bg-nebbia-soft dark:focus-visible:outline-nebbia"
            >
              Cerca
            </button>
          </form>
          <p className="mt-3 text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status" aria-live="polite">
            {ricercaAttiva
              ? `${totaleFiltrati} ${totaleFiltrati === 1 ? 'comune trovato' : 'comuni trovati'} per “${qGrezza}” (primi ${comuniMostrati.length} mostrati).`
              : `${intero(comuni.length)} comuni totali (primi ${comuniMostrati.length} per affluenza). Affluenza referendaria per comune, senza dettaglio per quesito.`}
          </p>
          {comuniMostrati.length > 0 && (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {comuniMostrati.map((comune) => (
                <li
                  key={`${comune.r}/${comune.p}/${comune.c}`}
                  className="border border-regola bg-carta p-4 dark:border-notte-deep dark:bg-notte-soft"
                >
                  <p className="font-serif text-base font-bold text-inchiostro dark:text-nebbia">{comune.c}</p>
                  <p className="mt-0.5 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                    {comune.p} · {comune.r}
                  </p>
                  <p className="mt-2 text-sm text-inchiostro-soft dark:text-nebbia-soft">
                    Affluenza: <strong className="text-inchiostro dark:text-nebbia">{decimaleIT(comune.a)}%</strong>{' '}
                    <span className="text-inchiostro-faint dark:text-nebbia-faint">
                      ({intero(comune.v)} votanti)
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="metodologia" className="mt-10 border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft">
          <h2 id="metodologia" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Metodologia e fonti
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">{metodologia}</p>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">{avvertenze}</p>
          <p className="mt-2 text-xs text-inchiostro-faint dark:text-nebbia-faint">
            Fonte: {provenance.fonte || 'Ministero dell’Interno (DAIT)'}
            {provenance.recuperatoIl ? ` · aggiornati al ${dataIT(provenance.recuperatoIl.slice(0, 10))}` : ''} ·
            Licenza: {provenance.licenza || 'open data ministeriale'}.
          </p>
        </section>
      </main>
      <Footer />
    </>
  )
}
