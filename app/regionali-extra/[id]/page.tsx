import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import {
  caricaRegionaleExtra,
  cercaComuneExtra,
  normalizzaExtra,
  normalizzaIdRegionaleExtra,
  paginaExtra,
  type DatiRegionaleExtra,
} from '@/lib/regionali-extra-dati'

export const revalidate = 3600

export function generateStaticParams(): Array<{ id: string }> {
  return [{ id: 'regionali-2024-liguria' }, { id: 'regionali-2025-calabria' }, { id: 'regionali-2024-emilia-romagna' }]
}

const TITOLI: Record<string, { titolo: string; descrizione: string }> = {
  'regionali-2024-emilia-romagna': {
    titolo: 'Elezioni regionali 2024 - Emilia-Romagna (17 novembre 2024)',
    descrizione:
      'Solo aggregati DAIT-Eligendo per l’Emilia-Romagna: affluenza e voti per lista a livello regionale, affluenza per comune. Nessun nominativo, nessuna riga candidata.',
  },
  'regionali-2024-liguria': {
    titolo: 'Elezioni regionali 2024 - Liguria (27 ottobre 2024)',
    descrizione:
      'Solo aggregati DAIT-Eligendo per la Liguria: affluenza e voti per lista a livello regionale, affluenza per comune. Nessun nominativo, nessuna riga candidata; i voti del presidente non sono pubblicati come aggregato nel tracciato.',
  },
  'regionali-2025-calabria': {
    titolo: 'Elezioni regionali 2025 - Calabria (5 ottobre 2025)',
    descrizione:
      'Solo aggregati DAIT-Eligendo per la Calabria: affluenza e voti per lista a livello regionale, affluenza per comune. Nessun nominativo, nessuna riga candidata; i voti del presidente non sono pubblicati come aggregato nel tracciato.',
  },
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  try {
    const { id } = await params
    const voce = TITOLI[id] ?? null
    if (!voce) return { title: 'Consultazione non trovata - Stato della Repubblica' }
    return {
      title: `${voce.titolo} - Stato della Repubblica`,
      description: voce.descrizione,
    }
  } catch {
    return { title: 'Regionali extra - Stato della Repubblica' }
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

function interoQuery(value: string | string[] | undefined, fallback: number, min: number, max: number): number {
  try {
    const raw = Array.isArray(value) ? value[0] : value
    const parsed = Number.parseInt(raw ?? '', 10)
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(max, Math.max(min, Math.floor(parsed)))
  } catch {
    return fallback
  }
}

function stringaQuery(value: string | string[] | undefined, max: number): string {
  try {
    const raw = Array.isArray(value) ? value[0] : value
    if (typeof raw !== 'string') return ''
    return raw.slice(0, max)
  } catch {
    return ''
  }
}

const PER_PAGINA = 20

/**
 * Dettaglio di una regionale-extra: sintesi, per-lista regionale e
 * affluenza comunale con ricerca. Solo aggregati dai file committati,
 * mai numeri inventati. File assente o id ignoto -> notFound().
 */
export default async function RegionaleExtraDettaglioPage(
  { params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  let id = ''
  try {
    id = (await params).id
  } catch {
    notFound()
  }
  const chiave = normalizzaIdRegionaleExtra(id)
  const voce = chiave ? TITOLI[chiave] : null
  if (!chiave || !voce) notFound()

  let query: Record<string, string | string[] | undefined> = {}
  try {
    query = await searchParams
  } catch {
    query = {}
  }
  const q = stringaQuery(query['q'], 100)
  const pagina = interoQuery(query['page'], 1, 1, 10000)

  let dati: DatiRegionaleExtra | null = null
  try {
    dati = await caricaRegionaleExtra(chiave)
  } catch {
    dati = null
  }
  if (!dati) notFound()

  const liste = [...dati.liste].sort((a, b) => b.v - a.v).slice(0, 15)
  let comuniBase = dati.comuni
  try {
    comuniBase = normalizzaExtra(q).length >= 2 ? cercaComuneExtra(dati.comuni, q) : dati.comuni
  } catch {
    comuniBase = dati.comuni
  }
  const totaleComuni = comuniBase.length
  const pagineTotali = Math.max(1, Math.ceil(totaleComuni / PER_PAGINA))
  const paginaCorrente = Math.min(pagina, pagineTotali)
  const comuni = paginaExtra(comuniBase, paginaCorrente, PER_PAGINA)
  const regione = dati.regioni[0] ?? null

  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <nav aria-label="Percorso" className="text-sm">
          <Link
            href="/regionali-extra"
            className="font-medium text-accento underline underline-offset-2 hover:text-inchiostro dark:text-accento-chiara dark:hover:text-nebbia"
          >
            Regionali Liguria e Calabria
          </Link>
        </nav>
        <header className="mt-3 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Dati ufficiali DAIT
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            {voce.titolo}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            {voce.descrizione}
          </p>
        </header>

        <section aria-labelledby="sintesi" className="mt-8">
          <h2 id="sintesi" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Sintesi
          </h2>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm text-inchiostro-soft dark:text-nebbia-soft">
            <div className="flex gap-2">
              <dt className="font-semibold text-inchiostro dark:text-nebbia">Elettori:</dt>
              <dd>{intero(dati.elezione.e)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-inchiostro dark:text-nebbia">Votanti:</dt>
              <dd>{intero(dati.elezione.v)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-inchiostro dark:text-nebbia">Affluenza:</dt>
              <dd>{decimaleIT(dati.elezione.a)}%</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-inchiostro dark:text-nebbia">Schede bianche:</dt>
              <dd>{intero(dati.elezione.b)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-inchiostro dark:text-nebbia">Nulle + contestate:</dt>
              <dd>{intero(dati.elezione.k)}</dd>
            </div>
          </dl>
          {regione ? (
            <p className="mt-2 text-sm text-inchiostro-soft dark:text-nebbia-soft">
              Regione {regione.r}: {intero(regione.v)} votanti su {intero(regione.e)} elettori
              ({decimaleIT(regione.a)}%).
            </p>
          ) : null}
        </section>

        <section aria-labelledby="liste" className="mt-10">
          <h2 id="liste" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Voti per lista (livello regionale)
          </h2>
          <div className="mt-4 overflow-x-auto border border-regola dark:border-notte-deep">
            <table className="w-full min-w-[520px] border-collapse bg-carta text-sm dark:bg-notte-soft">
              <caption className="sr-only">
                Voti e percentuali delle liste a livello regionale, in ordine decrescente di voti
              </caption>
              <thead>
                <tr className="border-b border-regola text-left dark:border-notte-deep">
                  <th scope="col" className="px-3 py-2 font-semibold text-inchiostro dark:text-nebbia">Lista</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">Voti</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">%</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((l) => (
                  <tr key={l.n} className="border-b border-regola last:border-0 dark:border-notte-deep">
                    <td className="px-3 py-2 font-medium text-inchiostro dark:text-nebbia">{l.n}</td>
                    <td className="px-3 py-2 text-right text-inchiostro-soft dark:text-nebbia-soft">{intero(l.v)}</td>
                    <td className="px-3 py-2 text-right text-inchiostro-soft dark:text-nebbia-soft">{decimaleIT(l.p)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="comuni" className="mt-10">
          <h2 id="comuni" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Affluenza per comune ({intero(totaleComuni)} comuni)
          </h2>
          <form method="get" role="search" aria-label="Cerca un comune" className="mt-4 flex max-w-md gap-2">
            <label htmlFor="q-comune" className="sr-only">Cerca un comune (minimo 2 caratteri)</label>
            <input
              id="q-comune"
              name="q"
              type="search"
              defaultValue={q}
              minLength={2}
              maxLength={100}
              placeholder="Cerca un comune…"
              className="min-h-[44px] w-full border border-regola bg-carta px-3 py-2 text-sm text-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia"
            />
            <button
              type="submit"
              className="inline-flex min-h-[44px] shrink-0 items-center bg-accento px-6 font-semibold text-white hover:opacity-90 dark:bg-accento-chiara dark:text-notte"
            >
              Cerca
            </button>
          </form>
          {normalizzaExtra(q).length >= 2 && comuni.length === 0 ? (
            <p className="mt-4 text-sm italic text-inchiostro-soft dark:text-nebbia-soft">
              Nessun comune trovato per «{q}».
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto border border-regola dark:border-notte-deep">
              <table className="w-full min-w-[520px] border-collapse bg-carta text-sm dark:bg-notte-soft">
                <caption className="sr-only">
                  Affluenza per comune: pagina {intero(paginaCorrente)} di {intero(pagineTotali)}
                </caption>
                <thead>
                  <tr className="border-b border-regola text-left dark:border-notte-deep">
                    <th scope="col" className="px-3 py-2 font-semibold text-inchiostro dark:text-nebbia">Comune</th>
                    <th scope="col" className="px-3 py-2 font-semibold text-inchiostro dark:text-nebbia">Circoscrizione</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">Elettori</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">Votanti</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">Affluenza</th>
                  </tr>
                </thead>
                <tbody>
                  {comuni.map((c) => (
                    <tr key={`${c.r}-${c.p}-${c.c}`} className="border-b border-regola last:border-0 dark:border-notte-deep">
                      <td className="px-3 py-2 font-medium text-inchiostro dark:text-nebbia">{c.c}</td>
                      <td className="px-3 py-2 text-inchiostro-soft dark:text-nebbia-soft">{c.p}</td>
                      <td className="px-3 py-2 text-right text-inchiostro-soft dark:text-nebbia-soft">{intero(c.e)}</td>
                      <td className="px-3 py-2 text-right text-inchiostro-soft dark:text-nebbia-soft">{intero(c.v)}</td>
                      <td className="px-3 py-2 text-right text-inchiostro-soft dark:text-nebbia-soft">{decimaleIT(c.a)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pagineTotali > 1 ? (
            <nav aria-label="Pagine dei comuni" className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              {paginaCorrente > 1 ? (
                <Link
                  href={`?${new URLSearchParams({ ...(q ? { q } : {}), page: String(paginaCorrente - 1) }).toString()}`}
                  className="inline-flex min-h-[44px] items-center border border-regola px-4 font-medium text-accento underline-offset-2 hover:text-inchiostro dark:border-notte-deep dark:text-accento-chiara"
                >
                  Pagina precedente
                </Link>
              ) : null}
              <p className="text-inchiostro-soft dark:text-nebbia-soft">
                Pagina {intero(paginaCorrente)} di {intero(pagineTotali)}
              </p>
              {paginaCorrente < pagineTotali ? (
                <Link
                  href={`?${new URLSearchParams({ ...(q ? { q } : {}), page: String(paginaCorrente + 1) }).toString()}`}
                  className="inline-flex min-h-[44px] items-center border border-regola px-4 font-medium text-accento underline-offset-2 hover:text-inchiostro dark:border-notte-deep dark:text-accento-chiara"
                >
                  Pagina successiva
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>

        <section aria-labelledby="note" className="mt-10 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
          <h2 id="note" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Metodologia e licenze
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            {dati.metodologia}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            {dati.avvertenze}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Fonte: {dati.provenance.fonte ?? 'Ministero dell’Interno DAIT'}
            {dati.provenance.url ? (
              <>
                {' '}(
                <a
                  href={dati.provenance.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accento underline underline-offset-2 hover:text-inchiostro dark:text-accento-chiara dark:hover:text-nebbia"
                >
                  ZIP ufficiale
                </a>
                )
              </>
            ) : null}
            {dati.provenance.licenza ? ` - ${dati.provenance.licenza}.` : '.'}
          </p>
        </section>
      </main>
      <Footer />
    </>
  )
}
