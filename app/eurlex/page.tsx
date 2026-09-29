import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import {
  cercaAttiUe,
  contaPerTipoUe,
  etichettaTipo,
  filtraPerTipoUe,
  leggiProvenanceEurlex,
  notaApplicabilita,
  paginaUe,
  tuttiAttiUe,
  type AttoUe,
} from '@/lib/eurlex-dati'

export const metadata: Metadata = {
  title: 'Diritto UE 2026 - Regolamenti e direttive - Stato della Repubblica',
  description:
    'I 50 atti UE più recenti del 2026 da EUR-Lex CELLAR (dati ufficiali, riuso con attribuzione): regolamenti direttamente applicabili in Italia e direttive da recepire, con link alla scheda EUR-Lex.',
}

interface EurlexSearch {
  q?: string
  tipo?: string
  page?: string
  per?: string
}

const PER_AMMESSI = [10, 20, 50] as const

function dataIT(iso: string): string {
  try {
    const d = new Date(`${iso}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

function vigenza(it: AttoUe): string {
  if (it.inVigore === true) return 'In vigore secondo CELLAR'
  if (it.inVigore === false) return 'Non in vigore secondo CELLAR'
  return 'Vigenza non indicata'
}

function SchedaAtto({ atto }: { atto: AttoUe }) {
  return (
    <article className="group relative flex h-full flex-col gap-3 border border-regola bg-carta p-5 transition-colors hover:border-inchiostro focus-within:border-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:hover:border-nebbia dark:focus-within:border-nebbia">
      <p className="flex flex-wrap gap-2">
        <span className="inline-flex items-center border border-inchiostro px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-inchiostro dark:border-nebbia dark:text-nebbia">
          {etichettaTipo(atto.tipo)}
        </span>
        <span className="inline-flex items-center border border-regola px-2 py-1 text-[11px] uppercase tracking-wide text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
          {notaApplicabilita(atto.tipo)}
        </span>
      </p>
      <h3 className="font-serif text-base font-bold leading-snug text-inchiostro dark:text-nebbia">
        <Link
          href={`/eurlex/${atto.celex}`}
          className="underline-offset-2 hover:text-accento hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:hover:text-accento-chiara dark:focus-visible:outline-nebbia"
        >
          {atto.titolo}
        </Link>
      </h3>
      <dl className="grid gap-1 text-xs text-inchiostro-soft dark:text-nebbia-soft">
        <div className="flex gap-2">
          <dt className="font-semibold">CELEX:</dt>
          <dd>{atto.celex}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold">Data documento:</dt>
          <dd>{dataIT(atto.data)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold">Stato:</dt>
          <dd>{vigenza(atto)}</dd>
        </div>
      </dl>
      <p className="mt-auto flex flex-wrap gap-4 pt-1 text-xs">
        <a
          href={atto.eurlexUrl}
          target="_blank"
          rel="noopener"
          className="relative z-10 inline-flex min-h-[44px] items-center font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
        >
          Testo su EUR-Lex ↗
        </a>
        <a
          href={atto.eli}
          target="_blank"
          rel="noopener"
          className="relative z-10 inline-flex min-h-[44px] items-center text-inchiostro-soft underline underline-offset-2 dark:text-nebbia-soft"
        >
          ELI ↗
        </a>
      </p>
    </article>
  )
}

export default async function EuropaPage({
  searchParams,
}: {
  searchParams: Promise<EurlexSearch>
}) {
  const params = await searchParams
  const q = (params.q ?? '').slice(0, 100)
  const tipoGrezzo = (params.tipo ?? '').slice(0, 10).toUpperCase()
  const tipo = tipoGrezzo === 'REG' || tipoGrezzo === 'DIR_TUTTE' ? tipoGrezzo : ''
  const perGrezzo = Number.parseInt(params.per ?? '20', 10)
  const per = (PER_AMMESSI as readonly number[]).includes(perGrezzo) ? (perGrezzo as 10 | 20 | 50) : 20
  const pageGrezza = Number.parseInt(params.page ?? '1', 10)
  const pageRichiesta = Number.isFinite(pageGrezza) && pageGrezza >= 1 ? Math.floor(pageGrezza) : 1

  const [tutte, provenance] = await Promise.all([tuttiAttiUe(), leggiProvenanceEurlex()])
  const base = filtraPerTipoUe(tutte, tipo)
  const filtrati = cercaAttiUe(base, q)
  const totale = filtrati.length
  const pagine = Math.max(1, Math.ceil(totale / per))
  const page = Math.min(pageRichiesta, pagine)
  const items = paginaUe(filtrati, page, per)
  const conteggi = contaPerTipoUe(tutte)

  const linkPagina = (p: number) => {
    const sp = new URLSearchParams()
    if (q) sp.set('q', q)
    if (tipo) sp.set('tipo', tipo)
    if (per !== 20) sp.set('per', String(per))
    if (p > 1) sp.set('page', String(p))
    const s = sp.toString()
    return s ? `/eurlex?${s}` : '/eurlex'
  }

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
              Diritto UE
            </li>
          </ol>
        </nav>

        <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Unione europea · Anno 2026
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Diritto UE rilevante per l&apos;Italia - 2026
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            I 50 atti UE più recenti del 2026 dai dati ufficiali CELLAR: i regolamenti sono
            direttamente applicabili in Italia, le direttive richiedono recepimento nazionale.
            Non sono leggi italiane.
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            I titoli sono in inglese così come pubblicati (fase-1); il testo ufficiale in italiano
            è su EUR-Lex. Cerchi le leggi italiane? Vedi l&apos;archivio delle{' '}
            <Link href="/leggi" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
              leggi
            </Link>
            .
          </p>
          <p className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia" role="status">
            {totale} atti mostrati · {tutte.length} caricati · universo 2026: {provenance.universo2026 ?? 'non indicato'} atti
          </p>
        </header>

        <form method="get" action="/eurlex" className="mt-6 flex flex-col gap-3 sm:flex-row" role="search">
          <label htmlFor="cerca-eurlex" className="sr-only">
            Cerca per titolo o numero CELEX
          </label>
          <input
            id="cerca-eurlex"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            placeholder="Cerca per titolo o CELEX (es. 32026R2108)…"
            className="min-h-[44px] w-full flex-1 border border-regola bg-carta px-4 py-2 text-sm text-inchiostro placeholder:text-inchiostro-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia dark:placeholder:text-nebbia-faint dark:focus-visible:outline-nebbia"
          />
          {tipo && <input type="hidden" name="tipo" value={tipo} />}
          {per !== 20 && <input type="hidden" name="per" value={String(per)} />}
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center justify-center border border-inchiostro px-5 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro transition-colors hover:bg-inchiostro hover:text-carta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte dark:focus-visible:outline-nebbia"
          >
            Cerca
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtra per tipo di atto">
          <Link
            href={q ? `/eurlex?q=${encodeURIComponent(q)}` : '/eurlex'}
            aria-current={!tipo ? 'page' : undefined}
            className={`inline-flex min-h-[44px] items-center border px-4 py-2 text-xs font-semibold uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:focus-visible:outline-nebbia ${
              !tipo
                ? 'border-inchiostro bg-inchiostro text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte'
                : 'border-regola text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia'
            }`}
          >
            Tutti ({tutte.length})
          </Link>
          <Link
            href={`/eurlex?${new URLSearchParams({ ...(q ? { q } : {}), tipo: 'REG' }).toString()}`}
            aria-current={tipo === 'REG' ? 'page' : undefined}
            className={`inline-flex min-h-[44px] items-center border px-4 py-2 text-xs font-semibold uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:focus-visible:outline-nebbia ${
              tipo === 'REG'
                ? 'border-inchiostro bg-inchiostro text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte'
                : 'border-regola text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia'
            }`}
          >
            Regolamenti ({conteggi.find((c) => c.nome === 'REG')?.componenti ?? 0})
          </Link>
          <Link
            href={`/eurlex?${new URLSearchParams({ ...(q ? { q } : {}), tipo: 'DIR_TUTTE' }).toString()}`}
            aria-current={tipo === 'DIR_TUTTE' ? 'page' : undefined}
            className={`inline-flex min-h-[44px] items-center border px-4 py-2 text-xs font-semibold uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:focus-visible:outline-nebbia ${
              tipo === 'DIR_TUTTE'
                ? 'border-inchiostro bg-inchiostro text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte'
                : 'border-regola text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia'
            }`}
          >
            Direttive ({conteggi.filter((c) => c.nome !== 'REG').reduce((s, c) => s + c.componenti, 0)})
          </Link>
        </div>

        {items.length === 0 ? (
          <p className="mt-8 border border-regola bg-carta-soft p-5 text-sm text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft" role="status">
            Nessun atto trovato con questi criteri. Prova a togliere il filtro o a cercare un altro
            numero CELEX.
          </p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {items.map((a) => (
              <li key={a.celex} className="flex">
                <SchedaAtto atto={a} />
              </li>
            ))}
          </ul>
        )}

        {pagine > 1 && (
          <nav aria-label="Pagine" className="mt-6 flex flex-wrap items-center gap-2">
            {page > 1 && (
              <Link
                href={linkPagina(page - 1)}
                className="inline-flex min-h-[44px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia"
              >
                ← Precedente
              </Link>
            )}
            <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status">
              Pagina {page} di {pagine}
            </span>
            {page < pagine && (
              <Link
                href={linkPagina(page + 1)}
                className="inline-flex min-h-[44px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia"
              >
                Successiva →
              </Link>
            )}
          </nav>
        )}

        <section
          aria-labelledby="fonti-licenze"
          className="mt-10 border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft"
        >
          <h2 id="fonti-licenze" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Fonte e licenza
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Fonte: {provenance.fonte ?? 'EUR-Lex CELLAR SPARQL'} - licenza{' '}
            {provenance.licenza ?? 'riuso con attribuzione Dec.2011/833/UE'} · universo 2026:{' '}
            {provenance.universo2026 ?? '-'} atti (REG 2025-2026: {provenance.reg2025_2026 ?? '-'} ·
            famiglia direttive 2024-2026: {provenance.dir2024_2026 ?? '-'}), qui i primi {tutte.length}
            {provenance.recuperatoIl ? ` · dati aggiornati al ${dataIT(provenance.recuperatoIl.slice(0, 10))}` : ''}.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint">
            Metadati fase-1 senza testo integrale: titoli in inglese così come pubblicati, stato di
            vigenza secondo CELLAR. Fa fede il testo ufficiale su EUR-Lex.
          </p>
          <p className="mt-3">
            <a
              href="https://eur-lex.europa.eu"
              target="_blank"
              rel="noopener"
              className="text-sm font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
            >
              Portale ufficiale EUR-Lex ↗
            </a>
          </p>
        </section>
      </main>
      <Footer />
    </>
  )
}
