import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export const revalidate = 3600

export function generateStaticParams(): Array<{ id: string }> {
  return [{ id: 'europee-2024' }]
}

/* Tipi del contratto JSON (data/reali/elezioni-europee-2024.json, unico file v1). */

interface VoceLista {
  n: string
  v: number
  p: number
}

interface Regione {
  r: string
  e: number
  v: number
  b: number
  k: number
  a: number
  liste: VoceLista[]
}

interface Comune {
  c: string
  p: string
  r: string
  e: number
  v: number
  a: number
}

interface DatiEuropee {
  provenance: { fonte: string; url: string; recuperatoIl: string; licenza: string }
  elezione: { tipo: string; data: string; e: number; v: number; b: number; k: number; a: number }
  liste: VoceLista[]
  regioni: Regione[]
  comuni: Comune[]
  metodologia: string
  avvertenze: string
}

const PERCORSO_JSON = path.join(process.cwd(), 'data', 'reali', 'elezioni-europee-2024.json')
/** Cap hard: i file oltre 1 MB non si leggono (mai committati oltre soglia). */
const MAX_BYTE_JSON = 1024 * 1024
const MAX_RIGHE_COMUNI = 100

const LINK_ESTERNI = [
  { label: 'Eligendo — open data DAIT', url: 'https://elezionistorico.interno.gov.it/eligendo/opendata.php' },
  { label: 'CISE', url: 'https://cise.luiss.it/' },
  { label: 'YouTrend', url: 'https://www.youtrend.it/' },
]

/** Lettura never-throw del JSON aggregato: `null` se assente, oltre soglia o malformato. */
async function leggiDati(): Promise<DatiEuropee | null> {
  try {
    const stat = await fs.stat(PERCORSO_JSON)
    if (!stat.isFile() || stat.size > MAX_BYTE_JSON) return null
    const raw = await fs.readFile(PERCORSO_JSON, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const d = parsed as Partial<DatiEuropee>
    if (!d.elezione || !Array.isArray(d.liste) || !Array.isArray(d.regioni) || !Array.isArray(d.comuni)) {
      return null
    }
    return d as DatiEuropee
  } catch {
    return null
  }
}

function normalizza(testo: string): string {
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
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0,
  )
}

function decimaleIT(value: number): string {
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    Number.isFinite(value) ? value : 0,
  )
}

type Ordinamento = 'a_asc' | 'a_desc'

function parseOrd(value: string | undefined): Ordinamento {
  return value === 'a_asc' ? 'a_asc' : 'a_desc'
}

interface Props {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ q?: string; ord?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  let id = ''
  try {
    id = (await params).id
  } catch {
    id = ''
  }
  if (id !== 'europee-2024') {
    return { title: 'Elezione non trovata — Stato della Repubblica' }
  }
  const dati = await leggiDati()
  if (!dati) {
    return {
      title: 'Elezioni europee 2024 — Stato della Repubblica',
      description:
        'Risultati aggregati delle elezioni europee del 9 giugno 2024 (dati ufficiali DAIT–Eligendo): affluenza, liste e regioni. Dati in preparazione.',
    }
  }
  const { e, v, a } = dati.elezione
  return {
    title: 'Elezioni europee 2024 — Stato della Repubblica',
    description: `Risultati aggregati delle europee del 9 giugno 2024 (dati ufficiali DAIT): affluenza ${decimaleIT(a)}% su ${intero(e)} elettori e ${intero(v)} votanti, voti per lista e per regione.`,
  }
}

/**
 * Dettaglio di una consultazione (v1: solo `europee-2024`, resto 404).
 *
 * Legge solo l'aggregato committato `data/reali/elezioni-europee-2024.json`
 * con guardie never-throw (file assente / oltre 1 MB / malformato → stato
 * vuoto, mai numeri inventati). Ricerca comune via form GET (`?q=`, `?ord=`),
 * contiene case-insensitive, massimo 100 righe. Niente per-lista comunale,
 * niente seggi (assenti nel file ministeriale).
 */
export default async function ElezionePage({ params, searchParams }: Props) {
  let id = ''
  try {
    id = (await params).id
  } catch {
    notFound()
  }
  if (id !== 'europee-2024') notFound()

  let q = ''
  let ordRaw: string | undefined
  try {
    const sp = (await searchParams) ?? {}
    q = typeof sp.q === 'string' ? sp.q : ''
    ordRaw = typeof sp.ord === 'string' ? sp.ord : undefined
  } catch {
    q = ''
    ordRaw = undefined
  }
  const ord = parseOrd(ordRaw)
  const query = q.trim().slice(0, 100)
  const ricercaAttiva = query.length >= 2
  const queryNorm = normalizza(query)

  const dati = await leggiDati()

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
            <span aria-current="page">Europee 2024</span>
          </nav>
          <header className="mt-3 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
              Dati ufficiali
            </p>
            <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
              Elezioni europee — 9 giugno 2024
            </h1>
          </header>
          <section aria-labelledby="dati-assenti" className="mt-8 border border-dashed border-regola bg-carta p-8 text-center dark:border-notte-deep dark:bg-notte-soft">
            <h2 id="dati-assenti" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              Dati in preparazione
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              L’aggregato ufficiale non è ancora disponibile in questa edizione
              (file <code>data/reali/elezioni-europee-2024.json</code> assente o non valido).
              Nessun valore è mostrato finché l’ingest ministeriale non lo genera: non pubblichiamo stime.
            </p>
            <p className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/elezioni"
                className="inline-flex min-h-[44px] items-center bg-accento px-6 font-semibold text-white hover:opacity-90 dark:bg-accento-chiara dark:text-notte"
              >
                Torna alle elezioni
              </Link>
              <a
                href="https://elezionistorico.interno.gov.it/eligendo/opendata.php"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center border border-regola px-6 font-semibold text-inchiostro hover:border-accento hover:text-accento dark:border-notte-deep dark:text-nebbia dark:hover:border-accento-chiara dark:hover:text-accento-chiara"
              >
                Open data Eligendo
              </a>
            </p>
          </section>
        </main>
        <Footer />
      </>
    )
  }

  const { elezione, liste, regioni, comuni, provenance, metodologia, avvertenze } = dati

  const listeOrdinate = [...liste].sort((x, y) => y.v - x.v)
  const regioniOrdinate = [...regioni].sort((x, y) => x.r.localeCompare(y.r, 'it'))

  const comuniFiltrati = ricercaAttiva
    ? comuni.filter((c) => normalizza(`${c.c} ${c.p} ${c.r}`).includes(queryNorm))
    : [...comuni]
  comuniFiltrati.sort((x, y) => (ord === 'a_asc' ? x.a - y.a : y.a - x.a))
  const totaleFiltrati = comuniFiltrati.length
  const comuniMostrati = comuniFiltrati.slice(0, MAX_RIGHE_COMUNI)

  const azioneForm = `/elezioni/${encodeURIComponent(id)}`

  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <nav aria-label="Percorso" className="text-xs text-inchiostro-soft dark:text-nebbia-soft">
          <Link href="/elezioni" className="underline underline-offset-2 hover:text-accento dark:hover:text-accento-chiara">
            Elezioni
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">Europee 2024</span>
        </nav>

        <header className="mt-3 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="inline-flex items-center border border-regola px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
            Dati ufficiali DAIT
          </p>
          <h1 className="mt-3 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Elezioni europee — 9 giugno 2024
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Solo aggregati da open data del Ministero dell’Interno (DAIT–Eligendo):
            affluenza e voti per lista a livello nazionale e regionale, affluenza per comune.
            I seggi non sono disponibili nel file ministeriale e non vengono mostrati.
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
              <dt className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">Bianche / contestate</dt>
              <dd className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
                {intero(elezione.b + elezione.k)}
              </dd>
              <dd className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                {intero(elezione.b)} bianche · {intero(elezione.k)} contestate
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="liste" className="mt-10">
          <h2 id="liste" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Liste — voti e percentuali nazionali
          </h2>
          <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
            {listeOrdinate.length} liste a livello nazionale. Alcune liste sono presenti solo in
            parte dei comuni e sono segnalate come locali.
          </p>
          {listeOrdinate.length === 0 ? (
            <p className="mt-4 border border-dashed border-regola p-5 text-sm text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
              Nessuna lista disponibile nell’aggregato.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto border border-regola dark:border-notte-deep">
              <table className="w-full min-w-[480px] border-collapse bg-carta text-sm dark:bg-notte">
                <caption className="sr-only">Voti e percentuali delle liste a livello nazionale</caption>
                <thead>
                  <tr className="border-b border-regola text-left dark:border-notte-deep">
                    <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-inchiostro-faint dark:text-nebbia-faint">
                      Lista
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-inchiostro-faint dark:text-nebbia-faint">
                      Voti
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-inchiostro-faint dark:text-nebbia-faint">
                      Percentuale
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {listeOrdinate.map((lista) => (
                    <tr key={lista.n} className="border-b border-regola last:border-0 dark:border-notte-deep">
                      <th scope="row" className="px-4 py-2.5 text-left font-medium text-inchiostro dark:text-nebbia">
                        {lista.n}
                      </th>
                      <td className="px-4 py-2.5 text-right tabular-nums text-inchiostro-soft dark:text-nebbia-soft">
                        {intero(lista.v)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-inchiostro-soft dark:text-nebbia-soft">
                        {decimaleIT(lista.p)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="regioni" className="mt-10">
          <h2 id="regioni" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Regioni — affluenza e prima lista
          </h2>
          <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
            {regioniOrdinate.length} regioni. Il dettaglio per lista di ogni regione è nell’aggregato;
            qui si mostra la prima lista per orientarsi.
          </p>
          {regioniOrdinate.length === 0 ? (
            <p className="mt-4 border border-dashed border-regola p-5 text-sm text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
              Nessuna regione disponibile nell’aggregato.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto border border-regola dark:border-notte-deep">
              <table className="w-full min-w-[640px] border-collapse bg-carta text-sm dark:bg-notte">
                <caption className="sr-only">Affluenza per regione con prima lista</caption>
                <thead>
                  <tr className="border-b border-regola text-left dark:border-notte-deep">
                    <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-inchiostro-faint dark:text-nebbia-faint">
                      Regione
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-inchiostro-faint dark:text-nebbia-faint">
                      Elettori
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-inchiostro-faint dark:text-nebbia-faint">
                      Votanti
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-inchiostro-faint dark:text-nebbia-faint">
                      Affluenza
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-inchiostro-faint dark:text-nebbia-faint">
                      Prima lista
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {regioniOrdinate.map((regione) => {
                    const prima = [...regione.liste].sort((x, y) => y.v - x.v)[0]
                    return (
                      <tr key={regione.r} className="border-b border-regola last:border-0 dark:border-notte-deep">
                        <th scope="row" className="px-4 py-2.5 text-left font-medium text-inchiostro dark:text-nebbia">
                          {regione.r}
                        </th>
                        <td className="px-4 py-2.5 text-right tabular-nums text-inchiostro-soft dark:text-nebbia-soft">
                          {intero(regione.e)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-inchiostro-soft dark:text-nebbia-soft">
                          {intero(regione.v)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-inchiostro-soft dark:text-nebbia-soft">
                          {decimaleIT(regione.a)}%
                        </td>
                        <td className="px-4 py-2.5 text-left text-inchiostro-soft dark:text-nebbia-soft">
                          {prima ? `${prima.n} (${decimaleIT(prima.p)}%)` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="comuni" className="mt-10">
          <h2 id="comuni" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Comuni — affluenza
          </h2>
          <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
            {intero(comuni.length)} comuni nell’aggregato. Solo affluenza, senza dettaglio per lista.
            La ricerca mostra al massimo {MAX_RIGHE_COMUNI} righe.
          </p>
          <form action={azioneForm} method="get" role="search" aria-label="Cerca un comune" className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-52 flex-1">
              <label htmlFor="q-comune" className="block text-xs font-semibold uppercase tracking-[0.16em] text-inchiostro-faint dark:text-nebbia-faint">
                Cerca comune, provincia o regione
              </label>
              <input
                id="q-comune"
                name="q"
                type="search"
                defaultValue={query}
                minLength={2}
                autoComplete="off"
                placeholder="Es. Acqui Terme (minimo 2 caratteri)"
                className="mt-2 min-h-[44px] w-full border border-regola bg-carta px-3 py-2 text-sm text-inchiostro placeholder:text-inchiostro-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte dark:text-nebbia dark:placeholder:text-nebbia-faint dark:focus-visible:outline-nebbia"
              />
            </div>
            <div>
              <label htmlFor="ord-comune" className="block text-xs font-semibold uppercase tracking-[0.16em] text-inchiostro-faint dark:text-nebbia-faint">
                Ordina per affluenza
              </label>
              <select
                id="ord-comune"
                name="ord"
                defaultValue={ord}
                className="mt-2 min-h-[44px] border border-regola bg-carta px-3 py-2 text-sm text-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte dark:text-nebbia dark:focus-visible:outline-nebbia"
              >
                <option value="a_desc">Dalla più alta</option>
                <option value="a_asc">Dalla più bassa</option>
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center bg-accento px-6 font-semibold text-white hover:opacity-90 dark:bg-accento-chiara dark:text-notte"
            >
              Cerca
            </button>
            {query.length > 0 && (
              <Link
                href={azioneForm}
                className="inline-flex min-h-[44px] items-center border border-regola px-6 font-semibold text-inchiostro hover:border-accento hover:text-accento dark:border-notte-deep dark:text-nebbia dark:hover:border-accento-chiara dark:hover:text-accento-chiara"
              >
                Mostra tutti
              </Link>
            )}
          </form>

          <p className="mt-3 text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status" aria-live="polite">
            {ricercaAttiva
              ? totaleFiltrati === 0
                ? `Nessun comune trovato per «${query}».`
                : `${intero(totaleFiltrati)} ${totaleFiltrati === 1 ? 'comune trovato' : 'comuni trovati'} per «${query}» — ${totaleFiltrati > MAX_RIGHE_COMUNI ? `prime ${MAX_RIGHE_COMUNI} righe mostrate` : 'tutte le righe mostrate'}.`
              : query.length > 0
                ? `Scrivi almeno 2 caratteri per filtrare — prime ${MAX_RIGHE_COMUNI} righe su ${intero(comuni.length)} comuni.`
                : `Prime ${MAX_RIGHE_COMUNI} righe su ${intero(comuni.length)} comuni. Usa la ricerca per filtrare.`}
          </p>

          {comuniMostrati.length === 0 ? (
            <p className="mt-4 border border-dashed border-regola p-5 text-sm text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
              Nessun comune corrisponde alla ricerca. Prova con il nome del comune, della provincia o della regione.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto border border-regola dark:border-notte-deep">
              <table className="w-full min-w-[720px] border-collapse bg-carta text-sm dark:bg-notte">
                <caption className="sr-only">Affluenza per comune, massimo cento righe</caption>
                <thead>
                  <tr className="border-b border-regola text-left dark:border-notte-deep">
                    <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-inchiostro-faint dark:text-nebbia-faint">
                      Comune
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-inchiostro-faint dark:text-nebbia-faint">
                      Provincia
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-inchiostro-faint dark:text-nebbia-faint">
                      Regione
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-inchiostro-faint dark:text-nebbia-faint">
                      Elettori
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-inchiostro-faint dark:text-nebbia-faint">
                      Votanti
                    </th>
                    <th scope="col" aria-sort={ord === 'a_asc' ? 'ascending' : 'descending'} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-inchiostro-faint dark:text-nebbia-faint">
                      <Link
                        href={`${azioneForm}?q=${encodeURIComponent(query)}&ord=${ord === 'a_asc' ? 'a_desc' : 'a_asc'}`}
                        className="underline underline-offset-2 hover:text-accento dark:hover:text-accento-chiara"
                        aria-label={ord === 'a_asc' ? 'Ordina per affluenza decrescente' : 'Ordina per affluenza crescente'}
                      >
                        Affluenza {ord === 'a_asc' ? '↑' : '↓'}
                      </Link>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comuniMostrati.map((comune) => (
                    <tr key={`${comune.r}|${comune.p}|${comune.c}`} className="border-b border-regola last:border-0 dark:border-notte-deep">
                      <th scope="row" className="px-4 py-2.5 text-left font-medium text-inchiostro dark:text-nebbia">
                        {comune.c}
                      </th>
                      <td className="px-4 py-2.5 text-inchiostro-soft dark:text-nebbia-soft">{comune.p}</td>
                      <td className="px-4 py-2.5 text-inchiostro-soft dark:text-nebbia-soft">{comune.r}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-inchiostro-soft dark:text-nebbia-soft">
                        {intero(comune.e)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-inchiostro-soft dark:text-nebbia-soft">
                        {intero(comune.v)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-inchiostro-soft dark:text-nebbia-soft">
                        {decimaleIT(comune.a)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-inchiostro-faint dark:text-nebbia-faint">
            Nota: i seggi non sono disponibili nel file ministeriale. Il dettaglio per lista è
            pubblicato solo a livello nazionale e regionale.
          </p>
        </section>

        <section aria-labelledby="fonte-metodo" className="mt-10 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
          <h2 id="fonte-metodo" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Fonte, metodologia e avvertenze
          </h2>
          <dl className="mt-3 space-y-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-inchiostro dark:text-nebbia">Fonte:</dt>
              <dd>{provenance.fonte} — recuperato il {provenance.recuperatoIl}.</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-inchiostro dark:text-nebbia">Licenza:</dt>
              <dd>{provenance.licenza}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-inchiostro dark:text-nebbia">Metodologia:</dt>
              <dd>{metodologia}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-inchiostro dark:text-nebbia">Avvertenze:</dt>
              <dd>{avvertenze}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            File originale:{' '}
            <a
              href={provenance.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accento underline underline-offset-2 hover:text-inchiostro dark:text-accento-chiara dark:hover:text-nebbia"
            >
              CSV ministeriale a livello comunale
            </a>
            . Fanno fede i verbali dei seggi e le proclamazioni ufficiali.
          </p>
          <nav aria-label="Collegamenti esterni elettorali" className="mt-4">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {LINK_ESTERNI.map((link) => (
                <li key={link.url} className="flex min-h-[44px] items-center">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-accento underline underline-offset-2 hover:text-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:text-accento-chiara dark:hover:text-nebbia dark:focus-visible:outline-nebbia"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </section>
      </main>
      <Footer />
    </>
  )
}
