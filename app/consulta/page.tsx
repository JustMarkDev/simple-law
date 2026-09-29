import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import {
  cercaPronunce,
  contaPerTipologia,
  filtraPerTipologia,
  leggiProvenanceConsulta,
  pagina,
  tuttePronunce,
} from '@/lib/consulta'

export const metadata: Metadata = {
  title: 'Corte Costituzionale - Pronunce 2001 - Stato della Repubblica',
  description:
    'Le prime 50 pronunce del 2001 della Corte Costituzionale dai dati aperti ufficiali (CC BY-SA 3.0): sentenze e ordinanze con ECLI e scheda ufficiale.',
}

interface ConsultaSearch {
  q?: string
  tipologia?: string
  page?: string
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

export default async function ConsultaPage({
  searchParams,
}: {
  searchParams: Promise<ConsultaSearch>
}) {
  const params = await searchParams
  const q = (params.q ?? '').slice(0, 100)
  const tipologia = (params.tipologia ?? '').slice(0, 4).toUpperCase()
  const pageGrezza = Number.parseInt(params.page ?? '1', 10)
  const page = Number.isFinite(pageGrezza) && pageGrezza >= 1 ? Math.floor(pageGrezza) : 1
  const per = 20

  const [tutte, provenance] = await Promise.all([tuttePronunce(), leggiProvenanceConsulta()])
  const base = tipologia ? filtraPerTipologia(tutte, tipologia) : tutte
  const filtrate = cercaPronunce(base, q)
  const totale = filtrate.length
  const items = pagina(filtrate, page, per)
  const conteggi = contaPerTipologia(tutte)
  const pagine = Math.max(1, Math.ceil(totale / per))
  const paginaCorrente = Math.min(page, pagine)

  const linkPagina = (p: number) => {
    const sp = new URLSearchParams()
    if (q) sp.set('q', q)
    if (tipologia) sp.set('tipologia', tipologia)
    if (p > 1) sp.set('page', String(p))
    const s = sp.toString()
    return s ? `/consulta?${s}` : '/consulta'
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
              Corte Costituzionale
            </li>
          </ol>
        </nav>

        <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Giurisprudenza · Anno 2001
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Corte Costituzionale - Pronunce 2001
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Le prime 50 pronunce del 2001 dai dati aperti ufficiali della Corte. Sentenze e ordinanze:
            non sono leggi in vigore, ma decisioni su questioni di legittimità costituzionale.
          </p>
          <p className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia" role="status">
            {totale} pronunce mostrate, {tutte.length} caricate · anno intero: {provenance.totaleAnno ?? 'non indicato'} atti
          </p>
        </header>

        <form method="get" action="/consulta" className="mt-6 flex flex-col gap-3 sm:flex-row" role="search">
          <label htmlFor="cerca-consulta" className="sr-only">
            Cerca per numero, ECLI o nome del giudice
          </label>
          <input
            id="cerca-consulta"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            placeholder="Cerca per numero, ECLI o giudice…"
            className="min-h-[48px] w-full flex-1 border border-regola bg-carta px-4 py-2 text-sm text-inchiostro placeholder:text-inchiostro-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia dark:placeholder:text-nebbia-faint dark:focus-visible:outline-nebbia"
          />
          {tipologia && <input type="hidden" name="tipologia" value={tipologia} />}
          <button
            type="submit"
            className="inline-flex min-h-[48px] items-center justify-center border border-inchiostro px-5 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro transition-colors hover:bg-inchiostro hover:text-carta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte dark:focus-visible:outline-nebbia"
          >
            Cerca
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtra per tipologia">
          <Link
            href={q ? `/consulta?q=${encodeURIComponent(q)}` : '/consulta'}
            aria-current={!tipologia ? 'page' : undefined}
            className={`inline-flex min-h-[48px] items-center border px-4 py-2 text-xs font-semibold uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:focus-visible:outline-nebbia ${
              !tipologia
                ? 'border-inchiostro bg-inchiostro text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte'
                : 'border-regola text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia'
            }`}
          >
            Tutte ({tutte.length})
          </Link>
          {conteggi.map((c) => {
            const attiva = tipologia === c.nome
            const sp = new URLSearchParams()
            if (q) sp.set('q', q)
            sp.set('tipologia', c.nome)
            return (
              <Link
                key={c.nome}
                href={`/consulta?${sp.toString()}`}
                aria-current={attiva ? 'page' : undefined}
                className={`inline-flex min-h-[48px] items-center border px-4 py-2 text-xs font-semibold uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:focus-visible:outline-nebbia ${
                  attiva
                    ? 'border-inchiostro bg-inchiostro text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte'
                    : 'border-regola text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia'
                }`}
              >
                {c.nome === 'S' ? 'Sentenze' : c.nome === 'O' ? 'Ordinanze' : c.nome} ({c.componenti})
              </Link>
            )
          })}
        </div>

        {items.length === 0 ? (
          <p className="mt-8 border border-regola bg-carta-soft p-5 text-sm text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft" role="status">
            Nessuna pronuncia trovata con questi criteri. Prova a togliere il filtro o a cercare un altro
            numero.
          </p>
        ) : (
          <ol className="mt-6 grid gap-4">
            {items.map((p) => (
              <li
                key={`${p.anno}-${p.numero}`}
                className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center border border-inchiostro px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-inchiostro dark:border-nebbia dark:text-nebbia">
                    {p.tipologia === 'S' ? 'S, Sentenza' : p.tipologia === 'O' ? 'O · Ordinanza' : (p.tipologia ?? '-')}
                  </span>
                  <span className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
                    Deposito: {dataIT(p.dataDeposito)}
                  </span>
                </div>
                <h2 className="mt-3 font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
                  <Link
                    href={`/consulta/${p.anno}/${p.numero}`}
                    className="underline-offset-2 hover:text-accento hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:hover:text-accento-chiara dark:focus-visible:outline-nebbia"
                  >
                    {p.tipologia === 'S' ? 'Sentenza' : 'Ordinanza'} n. {p.numero} del {p.anno}
                  </Link>
                </h2>
                <p className="mt-1 text-xs text-inchiostro-soft dark:text-nebbia-soft">
                  {p.presidente ? `Pres. ${p.presidente}` : ''}
                  {p.relatore ? ` · Rel. ${p.relatore}` : ''}
                  {p.ecli ? ` · ${p.ecli}` : ''}
                </p>
                {p.epigrafe && (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                    {p.epigrafe}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}

        {pagine > 1 && (
          <nav aria-label="Pagine" className="mt-6 flex flex-wrap items-center gap-2">
            {paginaCorrente > 1 && (
              <Link
                href={linkPagina(paginaCorrente - 1)}
                className="inline-flex min-h-[48px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia"
              >
                ← Precedente
              </Link>
            )}
            <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status">
              Pagina {paginaCorrente} di {pagine}
            </span>
            {paginaCorrente < pagine && (
              <Link
                href={linkPagina(paginaCorrente + 1)}
                className="inline-flex min-h-[48px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia"
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
            Fonte: dati.cortecostituzionale.it (open data) - licenza {provenance.licenza ?? 'CC BY-SA 3.0'} ·
            anno 2001 · {provenance.totaleAnno ?? '-'} atti nell&apos;anno, qui le prime {tutte.length}
            {provenance.recuperatoIl ? ` · dati aggiornati al ${dataIT(provenance.recuperatoIl.slice(0, 10))}` : ''}.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint">
            Le schede ufficiali complete sono sul sito della Corte. Epigrafe e dispositivo possono essere
            abbreviati per restare sotto il limite di dimensione: in quel caso è indicato.
          </p>
          <p className="mt-3">
            <a
              href="https://dati.cortecostituzionale.it/Scarica_i_dati/Scarica_i_dati"
              target="_blank"
              rel="noopener"
              className="text-sm font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
            >
              Pagina ufficiale dei dati ↗
            </a>
          </p>
        </section>
      </main>
      <Footer />
    </>
  )
}
