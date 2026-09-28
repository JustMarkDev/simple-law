import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SearchBar from '@/components/SearchBar'
import PersonaFilter from '@/components/PersonaFilter'
import FiltriLeggi from '@/components/FiltriLeggi'
import PaginazioneLeggi from '@/components/PaginazioneLeggi'
import LawCard from '@/components/LawCard'
import { countLaws, listLaws, type LawSort } from '@/lib/db'
import { normalizeLaw, personaRelevant } from '@/components/seed-fallback'

interface LeggiProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

type Vista = 'griglia' | 'lista'
type SortUI = LawSort | 'rilevanza'

const SORTS_UI: readonly SortUI[] = [
  'rilevanza',
  'data_desc',
  'data_asc',
  'titolo_asc',
  'gulpease_desc',
  'qualita_desc',
]
const PER_OPZIONI: readonly number[] = [12, 24, 48]
const PER_DEFAULT = 12

const ESEMPI_RICERCA = ['carburanti', 'concorrenza', 'sicurezza informatica']

function str(sp: Record<string, string | string[] | undefined>, nome: string): string {
  const v = sp[nome]
  return typeof v === 'string' ? v : ''
}

/** Titolo e descrizione dinamici con totale reale: utili per SEO e condivisione. */
export async function generateMetadata({ searchParams }: LeggiProps): Promise<Metadata> {
  const base: Metadata = {
    title: 'Tutte le leggi — Stato della Repubblica',
    description: 'L’archivio delle norme spiegate semplici: cerca per parola o filtra per persona.',
  }
  try {
    const sp = await searchParams
    const q = str(sp, 'q').slice(0, 200)
    const tipo = str(sp, 'tipo').slice(0, 80)
    const anno = str(sp, 'anno').slice(0, 4)
    const totale = await countLaws({ q, tipo, anno })
    const pezzi: string[] = []
    if (q) pezzi.push(`“${q}”`)
    if (tipo) pezzi.push(tipo)
    if (anno) pezzi.push(anno)
    const dettaglio = pezzi.length > 0 ? ` — ${pezzi.join(' · ')}` : ''
    const titolo = `Tutte le leggi (${totale} ${totale === 1 ? 'norma' : 'norme'})${dettaglio} — Stato della Repubblica`
    return {
      title: titolo,
      description: `Archivio di ${totale} ${totale === 1 ? 'norma spiegata semplice' : 'norme spiegate semplici'}${dettaglio}. Cerca per parola chiave o filtra per la tua situazione.`,
    }
  } catch {
    return base
  }
}

/** Link all'archivio senza il filtro indicato (per le chip rimovibili). */
function hrefSenza(query: Record<string, string>, chiave: string): string {
  const params = new URLSearchParams(query)
  params.delete(chiave)
  params.delete('page')
  const qs = params.toString()
  return qs ? `/leggi?${qs}` : '/leggi'
}

export default async function LeggiPage({ searchParams }: LeggiProps) {
  const sp = await searchParams
  const q = str(sp, 'q').slice(0, 200)
  const persona = str(sp, 'persona') || 'tutti'
  const tipo = str(sp, 'tipo').slice(0, 80)
  const anno = str(sp, 'anno').slice(0, 4)
  const sortRaw = str(sp, 'sort')
  const sortDefault: SortUI = q ? 'rilevanza' : 'data_desc'
  const sort: SortUI = (SORTS_UI as readonly string[]).includes(sortRaw) ? (sortRaw as SortUI) : sortDefault
  // `rilevanza` usa il ranking titolo > sintesi > numero in lib/db (con fallback
  // ILIKE); in attesa dell'indice tsvector, la paginazione resta server-side.
  const sortDb: LawSort = sort === 'rilevanza' ? 'data_desc' : sort
  const perRaw = Math.floor(Number(str(sp, 'per'))) || PER_DEFAULT
  const per = PER_OPZIONI.includes(perRaw) ? perRaw : PER_DEFAULT
  const vista: Vista = str(sp, 'vista') === 'lista' ? 'lista' : 'griglia'
  const paginaMax = Math.max(1, Math.floor(10000 / per))
  const page = Math.min(paginaMax, Math.max(1, Math.floor(Number(str(sp, 'page'))) || 1))

  // Paginazione sempre server-side: nessun fetch allargato + slice client, così
  // la pagina resta veloce anche con un corpus da 100 GB.
  const paginata = await listLaws({ q, tipo, anno, sort: sortDb, page, per })
  const base = paginata.items.map(normalizeLaw)
  // Il filtro persona è applicato alle schede della pagina corrente in attesa
  // del filtro server-side (extra->persone / LawPersona) in lib/db.
  const risultati =
    persona === 'tutti' ? base : base.filter((law) => personaRelevant(law, persona))
  const totale = paginata.total
  const paginaCorrente = paginata.page

  const queryBase: Record<string, string> = {}
  if (q) queryBase.q = q
  if (tipo) queryBase.tipo = tipo
  if (anno) queryBase.anno = anno
  if (sort !== sortDefault) queryBase.sort = sort
  if (persona !== 'tutti') queryBase.persona = persona
  if (per !== PER_DEFAULT) queryBase.per = String(per)
  if (vista !== 'griglia') queryBase.vista = vista

  const queryRicerca: Record<string, string> = { ...queryBase }
  delete queryRicerca.q

  const exportBase: Record<string, string> = {}
  if (q) exportBase.q = q
  if (tipo) exportBase.tipo = tipo
  if (anno) exportBase.anno = anno
  if (sort !== 'data_desc' && sort !== 'rilevanza') exportBase.sort = sort
  if (persona !== 'tutti') exportBase.persona = persona
  const exportQs = new URLSearchParams({ ...exportBase })
  const exportQsStr = exportQs.toString()
  const csvHref = exportQsStr ? `/api/export?formato=csv&${exportQsStr}` : '/api/export?formato=csv'
  const jsonHref = exportQsStr ? `/api/export?formato=json&${exportQsStr}` : '/api/export?formato=json'

  const filtriAttivi: { chiave: string; etichetta: string }[] = []
  if (q) filtriAttivi.push({ chiave: 'q', etichetta: `Ricerca: ${q}` })
  if (tipo) filtriAttivi.push({ chiave: 'tipo', etichetta: `Tipo: ${tipo}` })
  if (anno) filtriAttivi.push({ chiave: 'anno', etichetta: `Anno: ${anno}` })
  if (persona !== 'tutti') filtriAttivi.push({ chiave: 'persona', etichetta: `Persona: ${persona}` })
  if (sort !== sortDefault)
    filtriAttivi.push({ chiave: 'sort', etichetta: `Ordine: ${sort === 'rilevanza' ? 'rilevanza' : sort}` })

  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <nav aria-label="Percorso" className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
          <ol className="flex items-center gap-2">
            <li>
              <Link href="/" className="hover:text-accento dark:hover:text-accento-chiara">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
              Leggi
            </li>
          </ol>
        </nav>

        <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Archivio
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Tutte le leggi
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Cerca per parola chiave oppure filtra per la tua situazione. Ogni scheda ha il template a 5 riquadri e il
            semaforo di attuazione.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <a href={csvHref} className="underline underline-offset-4 hover:text-accento">
              Scarica CSV
            </a>
            <a href={jsonHref} className="underline underline-offset-4 hover:text-accento">
              Scarica JSON
            </a>
            <a href="/api/feed" className="underline underline-offset-4 hover:text-accento">
              Feed RSS
            </a>
            <Link href="/salvati" className="underline underline-offset-4 hover:text-accento">
              I tuoi salvati ★
            </Link>
          </div>
        </header>

        <div className="sticky top-0 z-20 -mx-4 border-b border-regola bg-carta/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 dark:border-notte-deep dark:bg-notte/95">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <SearchBar
              id="ricerca-legge-archivio"
              defaultValue={q}
              action="/leggi"
              query={queryRicerca}
            />
            <PersonaFilter active={persona} basePath="/leggi" query={queryBase} />
          </div>
          <div className="mt-3">
            <FiltriLeggi tipo={tipo} anno={anno} sort={sort} per={per} vista={vista} query={queryBase} />
          </div>
        </div>

        <section aria-label="Risultati dell’archivio" className="scroll-mt-24">
          <p className="mt-6 text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status" aria-live="polite">
            {totale} {totale === 1 ? 'norma trovata' : 'norme trovate'}
            {q ? ` per “${q}”` : ''}
            {tipo ? ` · tipo: ${tipo}` : ''}
            {anno ? ` · anno: ${anno}` : ''}
            {persona !== 'tutti' ? ` — filtro: ${persona}` : ''}.
          </p>
          {persona !== 'tutti' && (
            <p className="mt-1 text-sm text-inchiostro-faint dark:text-nebbia-faint">
              Il filtro persona rifinisce le schede di questa pagina.
            </p>
          )}

          {risultati.length > 0 ? (
            <ul
              className={
                vista === 'lista'
                  ? 'mt-4 grid grid-cols-1 gap-4'
                  : 'mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
              }
            >
              {risultati.map((law) => (
                <li
                  key={law.eli}
                  className="flex"
                  style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 300px' }}
                >
                  <LawCard law={law} persona={persona} headingLevel="h3" evidenzia={q} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 border border-dashed border-regola bg-carta p-8 text-center dark:border-notte-deep dark:bg-notte-soft">
              <p className="text-sm font-medium text-inchiostro dark:text-nebbia">
                Nessuna norma trovata con questi filtri.
              </p>
              {filtriAttivi.length > 0 && (
                <ul aria-label="Filtri attivi" className="mt-4 flex flex-wrap justify-center gap-2">
                  {filtriAttivi.map((f) => (
                    <li key={f.chiave}>
                      <a
                        href={hrefSenza(queryBase, f.chiave)}
                        aria-label={`Rimuovi il filtro ${f.etichetta}`}
                        className="inline-flex min-h-[44px] items-center gap-1 border border-regola px-3 py-2 text-xs font-medium text-inchiostro-soft hover:border-inchiostro hover:text-inchiostro dark:border-notte-deep dark:text-nebbia-soft dark:hover:border-nebbia dark:hover:text-nebbia"
                      >
                        {f.etichetta} <span aria-hidden="true">×</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <p className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
                  Prova con una di queste ricerche:
                </p>
                <ul className="mt-2 flex flex-wrap justify-center gap-2">
                  {ESEMPI_RICERCA.map((esempio) => (
                    <li key={esempio}>
                      <Link
                        href={`/leggi?q=${encodeURIComponent(esempio)}`}
                        className="inline-flex min-h-[44px] items-center border border-regola px-3 py-2 text-xs font-medium text-inchiostro-soft hover:border-inchiostro hover:text-inchiostro dark:border-notte-deep dark:text-nebbia-soft dark:hover:border-nebbia dark:hover:text-nebbia"
                      >
                        {esempio}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="mt-6">
                <Link
                  href="/leggi"
                  className="inline-flex min-h-[44px] items-center bg-inchiostro px-5 py-2 text-xs font-semibold uppercase tracking-wide text-carta hover:bg-inchiostro-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:bg-nebbia dark:text-notte dark:hover:bg-nebbia-soft dark:focus-visible:outline-nebbia"
                >
                  Rimuovi filtri
                </Link>
              </p>
            </div>
          )}

          <PaginazioneLeggi page={paginaCorrente} per={per} total={totale} query={queryBase} />
        </section>
      </main>
      <Footer />
    </>
  )
}
