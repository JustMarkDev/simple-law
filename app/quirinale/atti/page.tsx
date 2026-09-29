import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import {
  cercaQuirinale,
  leggiProvenanceQuirinale,
  tuttiAttiQuirinale,
} from '@/lib/quirinale-dati'

export const metadata: Metadata = {
  title: 'Quirinale - Atti firmati - Stato della Repubblica',
  description:
    'Gli atti recenti firmati dal Presidente della Repubblica da quirinale.it: decreti, disegni di legge autorizzati, nomine. Schede sintetiche, non testi di legge.',
}

function dataIT(iso?: string): string {
  try {
    if (!iso) return 'data non indicata'
    const d = new Date(`${iso}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return (iso ?? '').slice(0, 10)
  }
}

export default async function QuirinaleAttiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const params = await searchParams
  const q = (params.q ?? '').slice(0, 100)
  const [tutte, provenance] = await Promise.all([
    tuttiAttiQuirinale(),
    leggiProvenanceQuirinale(),
  ])
  const filtrati = cercaQuirinale(tutte, q)

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
            <li>
              <Link href="/quirinale" className="hover:text-accento dark:hover:text-accento-chiara">
                Quirinale
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
              Atti
            </li>
          </ol>
        </nav>

        <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Presidenza della Repubblica
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Quirinale - Atti recenti
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Gli atti recenti del Presidente (emanazione di decreti, autorizzazioni a disegni di
            legge, nomine) come elencati su quirinale.it. Sono schede sintetiche di una riga -
            spesso «in attesa di pubblicazione» - non testi normativi completi.
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-inchiostro dark:text-nebbia" role="status">
            <span>{filtrati.length} atti mostrati · {tutte.length} caricati dalla pagina 1</span>
            <span className="inline-flex items-center border border-inchiostro px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-inchiostro dark:border-nebbia dark:text-nebbia">
              non-legge
            </span>
          </p>
        </header>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Sezioni del Quirinale">
          <Link
            href="/quirinale"
            className="inline-flex min-h-[44px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia"
          >
            ← Comunicati
          </Link>
          <span aria-current="page" className="inline-flex min-h-[44px] items-center border border-inchiostro bg-inchiostro px-4 py-2 text-xs font-semibold uppercase tracking-wide text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte">
            Atti ({tutte.length})
          </span>
        </div>

        <form method="get" action="/quirinale/atti" className="mt-6 flex flex-col gap-3 sm:flex-row" role="search">
          <label htmlFor="cerca-atti" className="sr-only">
            Cerca negli atti
          </label>
          <input
            id="cerca-atti"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            placeholder="Cerca per tipo o argomento…"
            className="min-h-[44px] w-full flex-1 border border-regola bg-carta px-4 py-2 text-sm text-inchiostro placeholder:text-inchiostro-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia dark:placeholder:text-nebbia-faint dark:focus-visible:outline-nebbia"
          />
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center justify-center border border-inchiostro px-5 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro transition-colors hover:bg-inchiostro hover:text-carta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte dark:focus-visible:outline-nebbia"
          >
            Cerca
          </button>
        </form>

        {filtrati.length === 0 ? (
          <p className="mt-8 border border-regola bg-carta-soft p-5 text-sm text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft" role="status">
            Nessun atto trovato con questi criteri. Prova a cercare un altro argomento.
          </p>
        ) : (
          <ol className="mt-6 grid gap-4">
            {filtrati.map((a) => (
              <li
                key={a.id}
                className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center border border-inchiostro px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-inchiostro dark:border-nebbia dark:text-nebbia">
                    non-legge · atto
                  </span>
                  <span className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
                    {dataIT(a.data)}
                  </span>
                </div>
                <h2 className="mt-3 font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
                  {a.titolo}
                </h2>
                {a.sottotipo && (
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-inchiostro-soft dark:text-nebbia-soft">
                    {a.sottotipo}
                  </p>
                )}
                {a.descrizione && (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                    {a.descrizione}
                  </p>
                )}
                <p className="mt-3">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener"
                    className="text-sm font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
                  >
                    Scheda originale su quirinale.it ↗
                  </a>
                </p>
              </li>
            ))}
          </ol>
        )}

        <section
          aria-labelledby="fonti-licenze"
          className="mt-10 border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft"
        >
          <h2 id="fonti-licenze" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Fonte e licenza
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Fonte: {provenance.fonte ?? 'quirinale.it'} - {provenance.licenza ?? 'uso non commerciale con attribuzione, fa fede la Gazzetta Ufficiale'}
            {provenance.recuperatoIl ? ` · dati aggiornati al ${dataIT(provenance.recuperatoIl.slice(0, 10))}` : ''}.
            Pagina 1 dell&apos;archivio atti (schede di una riga, senza numero né stato: per i testi autentici fa fede la Gazzetta Ufficiale).
          </p>
          <p className="mt-3">
            <a
              href="https://www.quirinale.it/ricerca/atti"
              target="_blank"
              rel="noopener"
              className="text-sm font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
            >
              Archivio ufficiale degli atti ↗
            </a>
          </p>
        </section>
      </main>
      <Footer />
    </>
  )
}
