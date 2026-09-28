import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export const revalidate = 3600

export async function generateStaticParams(): Promise<Array<{ id: string; comune: string }>> {
  return []
}

const REGISTRO: Array<{ id: string; titoloBreve: string; titolo: string; file: string }> = [
  { id: 'europee-2024', titoloBreve: 'Europee 2024', titolo: 'Elezioni europee — 9 giugno 2024', file: path.join('data', 'reali', 'elezioni-europee-2024.json') },
  { id: 'politiche-2022-camera', titoloBreve: 'Politiche 2022 — Camera', titolo: 'Elezioni politiche 2022 — Camera dei deputati', file: path.join('data', 'reali', 'elezioni-politiche-2022-camera.json') },
  { id: 'politiche-2022-senato', titoloBreve: 'Politiche 2022 — Senato', titolo: 'Elezioni politiche 2022 — Senato della Repubblica', file: path.join('data', 'reali', 'elezioni-politiche-2022-senato.json') },
]

const MAX_BYTE_JSON = 1024 * 1024

interface Comune {
  c: string
  p: string
  r: string
  e: number
  v: number
  a: number
}

/** Slug stabile per URL: minuscole, senza diacritici, spazi→trattini. Mai lancia. */
export function slugComune(nome: string, provincia?: string): string {
  try {
    const base = `${nome}${provincia ? `-${provincia}` : ''}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120)
    return base || 'comune'
  } catch {
    return 'comune'
  }
}

function normalizza(testo: string): string {
  try {
    return testo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ')
  } catch {
    return ''
  }
}

async function leggiComuni(id: string): Promise<Comune[] | null> {
  try {
    const voce = REGISTRO.find((v) => v.id === id)
    if (!voce) return null
    const ass = path.join(process.cwd(), voce.file)
    const stat = await fs.stat(ass)
    if (!stat.isFile() || stat.size > MAX_BYTE_JSON) return null
    const raw = await fs.readFile(ass, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const o = parsed as Record<string, unknown>
    if (!Array.isArray(o['comuni'])) return null
    const out: Comune[] = []
    for (const voceComune of o['comuni'] as unknown[]) {
      try {
        if (typeof voceComune !== 'object' || voceComune === null) continue
        const c = voceComune as Record<string, unknown>
        if (typeof c['c'] !== 'string' || typeof c['p'] !== 'string' || typeof c['r'] !== 'string') continue
        if (typeof c['e'] !== 'number' || typeof c['v'] !== 'number' || typeof c['a'] !== 'number') continue
        if (!Number.isFinite(c['e']) || !Number.isFinite(c['v']) || !Number.isFinite(c['a'])) continue
        out.push({ c: c['c'], p: c['p'], r: c['r'], e: Math.floor(c['e']), v: Math.floor(c['v']), a: c['a'] })
      } catch {
        continue
      }
    }
    return out
  } catch {
    return null
  }
}

function intero(value: number): string {
  try {
    return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0)
  } catch {
    return '0'
  }
}

function decimaleIT(value: number): string {
  try {
    return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number.isFinite(value) ? value : 0)
  } catch {
    return '0,0'
  }
}

interface Props {
  params: Promise<{ id: string; comune: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id, comune } = await params
    const voce = REGISTRO.find((v) => v.id === id)
    if (!voce) return { title: 'Elezione non trovata — Stato della Repubblica' }
    const slug = decodeURIComponent(comune ?? '').slice(0, 120)
    return {
      title: `${slug} — ${voce.titoloBreve} — Stato della Repubblica`,
      description: `Affluenza aggregata DAIT–Eligendo per il comune «${slug}» (${voce.titoloBreve}). Solo aggregati, nessun nominativo.`,
    }
  } catch {
    return { title: 'Comune — Elezioni — Stato della Repubblica' }
  }
}

/**
 * Scheda comunale generica per ogni consultazione del registro.
 * Solo affluenza aggregata (elettori, votanti, percentuale dal file),
 * mai dettaglio per lista né seggi. Id ignoto o comune assente → 404.
 * Omonimie: se lo slug corrisponde a più comuni mostra la disambiguazione.
 */
export default async function ComunePage({ params }: Props) {
  let id = ''
  let slug = ''
  try {
    const p = await params
    id = p.id
    slug = decodeURIComponent(p.comune ?? '').slice(0, 120)
  } catch {
    notFound()
  }
  const voce = REGISTRO.find((v) => v.id === id)
  if (!voce || !slug) notFound()

  const comuni = await leggiComuni(voce!.id)
  if (!comuni) {
    return (
      <>
        <Header />
        <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <nav aria-label="Percorso" className="text-xs text-inchiostro-soft dark:text-nebbia-soft">
            <Link href="/elezioni" className="underline underline-offset-2 hover:text-accento dark:hover:text-accento-chiara">Elezioni</Link>
            <span aria-hidden="true"> / </span>
            <Link href={`/elezioni/${voce!.id}`} className="underline underline-offset-2 hover:text-accento dark:hover:text-accento-chiara">{voce!.titoloBreve}</Link>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{slug}</span>
          </nav>
          <section aria-labelledby="dati-assenti" className="mt-8 border border-dashed border-regola bg-carta p-8 text-center dark:border-notte-deep dark:bg-notte-soft">
            <h2 id="dati-assenti" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">Dati in preparazione</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-inchiostro-soft dark:text-nebbia-soft">
              L’aggregato ufficiale non è ancora disponibile. Nessun valore è mostrato: non pubblichiamo stime.
            </p>
            <p className="mt-6">
              <Link href={`/elezioni/${voce!.id}`} className="inline-flex min-h-[44px] items-center bg-accento px-6 font-semibold text-white hover:opacity-90 dark:bg-accento-chiara dark:text-notte">
                Torna alla consultazione
              </Link>
            </p>
          </section>
        </main>
        <Footer />
      </>
    )
  }

  const slugNorm = normalizza(slug.replace(/-/g, ' '))
  const candidati = comuni.filter((c) => {
    try {
      if (slugComune(c.c, c.p) === slug) return true
      if (slugComune(c.c) === slug) return true
      return normalizza(`${c.c} ${c.p}`).includes(slugNorm) || normalizza(c.c).includes(slugNorm)
    } catch {
      return false
    }
  })
  // Disambiguazione solo su match multipli esatti di slug; i contains parziali
  // con molti risultati rimandano alla ricerca della pagina [id].
  const esatti = candidati.filter((c) => slugComune(c.c, c.p) === slug || slugComune(c.c) === slug)
  const rilevanti = esatti.length > 0 ? esatti : candidati.slice(0, 20)

  if (rilevanti.length === 0) notFound()

  if (rilevanti.length > 1) {
    return (
      <>
        <Header />
        <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <nav aria-label="Percorso" className="text-xs text-inchiostro-soft dark:text-nebbia-soft">
            <Link href="/elezioni" className="underline underline-offset-2 hover:text-accento dark:hover:text-accento-chiara">Elezioni</Link>
            <span aria-hidden="true"> / </span>
            <Link href={`/elezioni/${voce!.id}`} className="underline underline-offset-2 hover:text-accento dark:hover:text-accento-chiara">{voce!.titoloBreve}</Link>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{slug}</span>
          </nav>
          <header className="mt-3 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
            <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
              Più comuni corrispondono a «{slug}»
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-inchiostro-soft dark:text-nebbia-soft">
              {rilevanti.length} comuni trovati in {voce!.titoloBreve}. Scegli il comune per vedere la sola affluenza aggregata.
            </p>
          </header>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {rilevanti.map((c) => (
              <li key={`${c.r}|${c.p}|${c.c}`} className="border border-regola bg-carta p-4 dark:border-notte-deep dark:bg-notte-soft">
                <Link
                  href={`/elezioni/${voce!.id}/${slugComune(c.c, c.p)}`}
                  className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
                >
                  {c.c} ({c.p}, {c.r})
                </Link>
                <p className="mt-1 text-sm text-inchiostro-soft dark:text-nebbia-soft">
                  Affluenza {decimaleIT(c.a)}% · {intero(c.v)} votanti su {intero(c.e)} elettori.
                </p>
              </li>
            ))}
          </ul>
        </main>
        <Footer />
      </>
    )
  }

  const comune = rilevanti[0]
  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <nav aria-label="Percorso" className="text-xs text-inchiostro-soft dark:text-nebbia-soft">
          <Link href="/elezioni" className="underline underline-offset-2 hover:text-accento dark:hover:text-accento-chiara">Elezioni</Link>
          <span aria-hidden="true"> / </span>
          <Link href={`/elezioni/${voce!.id}`} className="underline underline-offset-2 hover:text-accento dark:hover:text-accento-chiara">{voce!.titoloBreve}</Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{comune.c}</span>
        </nav>
        <header className="mt-3 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="inline-flex items-center border border-regola px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
            Dati ufficiali DAIT · {voce!.titoloBreve}
          </p>
          <h1 className="mt-3 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            {comune.c} — {comune.p} ({comune.r})
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-inchiostro-soft dark:text-nebbia-soft">
            Solo affluenza aggregata da open data DAIT–Eligendo. Nessun dettaglio per lista a livello comunale, nessun nominativo, nessun seggio.
          </p>
        </header>
        <section aria-labelledby="affluenza-comune" className="mt-8">
          <h2 id="affluenza-comune" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Affluenza nel comune
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-px border border-regola bg-regola dark:border-notte-deep dark:bg-notte-deep sm:grid-cols-3">
            <div className="bg-carta p-4 dark:bg-notte">
              <dt className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">Affluenza</dt>
              <dd className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">{decimaleIT(comune.a)}%</dd>
            </div>
            <div className="bg-carta p-4 dark:bg-notte">
              <dt className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">Elettori</dt>
              <dd className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">{intero(comune.e)}</dd>
            </div>
            <div className="bg-carta p-4 dark:bg-notte">
              <dt className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">Votanti</dt>
              <dd className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">{intero(comune.v)}</dd>
            </div>
          </dl>
          <p className="mt-4">
            <Link href={`/elezioni/${voce!.id}`} className="inline-flex min-h-[44px] items-center border border-regola px-6 font-semibold text-inchiostro hover:border-accento hover:text-accento dark:border-notte-deep dark:text-nebbia dark:hover:border-accento-chiara dark:hover:text-accento-chiara">
              Torna a {voce!.titoloBreve}
            </Link>
          </p>
        </section>
      </main>
      <Footer />
    </>
  )
}
