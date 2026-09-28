import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SearchBar from '@/components/SearchBar'
import PersonaFilter from '@/components/PersonaFilter'
import FiltriLeggi from '@/components/FiltriLeggi'
import PaginazioneLeggi from '@/components/PaginazioneLeggi'
import LawCard from '@/components/LawCard'
import Comparsa from '@/components/Comparsa'
import { listLaws, queryLaws, type LawSort } from '@/lib/db'
import { normalizeLaw, personaRelevant } from '@/components/seed-fallback'

export const metadata: Metadata = {
  title: 'Tutte le leggi — Stato della Repubblica',
  description: 'L’archivio delle norme spiegate semplici: cerca per parola o filtra per persona.',
}

interface LeggiProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const SORTS: readonly LawSort[] = ['data_desc', 'data_asc', 'titolo_asc', 'gulpease_desc', 'qualita_desc']

function str(sp: Record<string, string | string[] | undefined>, nome: string): string {
  const v = sp[nome]
  return typeof v === 'string' ? v : ''
}

export default async function LeggiPage({ searchParams }: LeggiProps) {
  const sp = await searchParams
  const q = str(sp, 'q').slice(0, 200)
  const persona = str(sp, 'persona') || 'tutti'
  const tipo = str(sp, 'tipo').slice(0, 80)
  const anno = str(sp, 'anno').slice(0, 4)
  const sortRaw = str(sp, 'sort')
  const sort: LawSort = (SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as LawSort) : 'data_desc'
  const page = Math.min(10000, Math.max(1, Math.floor(Number(str(sp, 'page'))) || 1))
  const per = 12

  const paginata = await listLaws({ q, tipo, anno, sort, page, per })
  // Il filtro persona vive solo nella UI: quando attivo, totale e pagina sono
  // calcolati su un estratto filtrato (max 2000, data_desc) per evitare pagine mezze vuote.
  const base = paginata.items.map(normalizeLaw)
  let risultati = base.filter((law) => personaRelevant(law, persona))
  let totale = paginata.total
  const paginaCorrente = paginata.page
  if (persona !== 'tutti') {
    const estratto = await queryLaws({ q, tipo, anno }, 2000)
    const filtrate = estratto.map(normalizeLaw).filter((law) => personaRelevant(law, persona))
    totale = filtrate.length
    const inizio = (paginata.page - 1) * per
    risultati = filtrate.slice(inizio, inizio + per)
  }

  const queryBase: Record<string, string> = {}
  if (q) queryBase.q = q
  if (tipo) queryBase.tipo = tipo
  if (anno) queryBase.anno = anno
  if (sort !== 'data_desc') queryBase.sort = sort
  if (persona !== 'tutti') queryBase.persona = persona

  const exportQs = new URLSearchParams({ ...queryBase })
  const exportQsStr = exportQs.toString()
  const csvHref = exportQsStr ? `/api/export?formato=csv&${exportQsStr}` : '/api/export?formato=csv'
  const jsonHref = exportQsStr ? `/api/export?formato=json&${exportQsStr}` : '/api/export?formato=json'

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
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
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

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <SearchBar defaultValue={q} action="/leggi" query={{ tipo, anno, sort: sort !== 'data_desc' ? sort : '', persona: persona !== 'tutti' ? persona : '' }} />
          <PersonaFilter active={persona} basePath="/leggi" query={queryBase} />
        </div>
        <div className="mt-3">
          <FiltriLeggi tipo={tipo} anno={anno} sort={sort} query={queryBase} />
        </div>

        <p className="mt-6 text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status" aria-live="polite">
          {totale} {totale === 1 ? 'norma trovata' : 'norme trovate'}
          {q ? ` per “${q}”` : ''}
          {tipo ? ` · tipo: ${tipo}` : ''}
          {anno ? ` · anno: ${anno}` : ''}
          {persona !== 'tutti' ? ` — filtro: ${persona}` : ''}.
        </p>

        {risultati.length > 0 ? (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {risultati.map((law, index) => (
              <li key={law.eli} className="flex">
                <Comparsa className="flex w-full" delay={Math.min(index * 0.05, 0.4)}>
                  <LawCard law={law} persona={persona} headingLevel="h2" evidenzia={q} />
                </Comparsa>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 border border-dashed border-regola bg-carta p-8 text-center dark:border-notte-deep dark:bg-notte-soft">
            <p className="text-sm font-medium text-inchiostro dark:text-nebbia">Nessuna norma trovata.</p>
            <p className="mt-1 text-sm text-inchiostro-faint dark:text-nebbia-faint">
              Prova con un’altra parola o rimuovi i filtri.
            </p>
            <p className="mt-4 flex flex-wrap justify-center gap-3 text-xs">
              <Link href="/leggi" className="underline underline-offset-4 hover:text-accento">
                Rimuovi tutti i filtri
              </Link>
              <a href={csvHref} className="underline underline-offset-4 hover:text-accento">
                Scarica CSV dei filtri correnti
              </a>
              <a href="/api/feed" className="underline underline-offset-4 hover:text-accento">
                Apri il feed RSS
              </a>
            </p>
          </div>
        )}

        <PaginazioneLeggi page={paginaCorrente} per={per} total={totale} query={queryBase} />
      </main>
      <Footer />
    </>
  )
}
