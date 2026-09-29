import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import {
  cercaContratti,
  cercaDocumentiCnel,
  cercaProvvedimenti,
  contaPerGiudice,
  DISCLAIMER_CONTROLLO,
  filtraPerEnte,
  filtraPerGiudice,
  leggiProvenanceAnac,
  leggiProvenanceCnel,
  leggiProvenanceGA,
  normalizzaGiudiceGA,
  paginaOversight,
  tuttiContratti,
  tuttiDocumentiCnel,
  tuttiProvvedimentiGA,
} from '@/lib/oversight-dati'

export const metadata: Metadata = {
  title: 'Elenco controllo - Contratti e provvedimenti - Stato della Repubblica',
  description:
    'Elenco ricercabile dei contratti pubblici ANAC 2025 e dei provvedimenti di giustizia amministrativa 2026: documenti di controllo, non sono leggi.',
}

interface RicercaLista {
  tipo?: string
  q?: string
  ente?: string
  giudice?: string
  page?: string
}

function dataIT(iso?: string): string {
  try {
    if (!iso) return 'data non indicata'
    const base = iso.slice(0, 10)
    const d = new Date(`${base}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return base
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return (iso ?? '').slice(0, 10)
  }
}

function importoIT(importo?: number, valuta?: string): string {
  try {
    if (typeof importo !== 'number' || !Number.isFinite(importo)) return 'importo non indicato'
    const testo = importo.toLocaleString('it-IT')
    return `€ ${testo}${valuta && valuta !== 'EUR' ? ` (${valuta})` : ''} (valore osservato, non spesa certa)`
  } catch {
    return 'importo non indicato'
  }
}

export default async function ListaControlloPage({
  searchParams,
}: {
  searchParams: Promise<RicercaLista>
}) {
  const params = await searchParams
  const tipoGrezzo = (params.tipo ?? 'contratti').trim().toLowerCase()
  const tipo = tipoGrezzo === 'ga' ? 'ga' : tipoGrezzo === 'cnel' ? 'cnel' : 'contratti'
  const q = (params.q ?? '').slice(0, 100)
  const ente = (params.ente ?? '').slice(0, 100)
  const giudice = normalizzaGiudiceGA(params.giudice ?? '')
  const pageGrezza = Number.parseInt(params.page ?? '1', 10)
  const page = Number.isFinite(pageGrezza) && pageGrezza >= 1 ? Math.floor(pageGrezza) : 1
  const per = 20

  const linkPagina = (p: number) => {
    const sp = new URLSearchParams()
    sp.set('tipo', tipo)
    if (q) sp.set('q', q)
    if (tipo === 'contratti' && ente) sp.set('ente', ente)
    if (tipo === 'ga' && giudice) sp.set('giudice', giudice)
    if (p > 1) sp.set('page', String(p))
    return `/controllo/lista?${sp.toString()}`
  }

  if (tipo === 'ga') {
    const [tutte, provenance] = await Promise.all([tuttiProvvedimentiGA(), leggiProvenanceGA()])
    const base = filtraPerGiudice(tutte, giudice)
    const filtrati = cercaProvvedimenti(base, q)
    const totale = filtrati.length
    const items = paginaOversight(filtrati, page, per)
    const conteggi = contaPerGiudice(tutte)
    const pagine = Math.max(1, Math.ceil(totale / per))
    const paginaCorrente = Math.min(page, pagine)

    return (
      <>
        <Header />
        <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <nav aria-label="Percorso" className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
            <ol className="flex items-center gap-2">
              <li>
                <Link href="/" className="hover:text-accento dark:hover:text-accento-chiara">Home</Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/controllo" className="hover:text-accento dark:hover:text-accento-chiara">Controllo pubblico</Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">Provvedimenti</li>
            </ol>
          </nav>

          <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
              Controllo · Giustizia amministrativa 2026
            </p>
            <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
              Provvedimenti CdS e TAR
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Decisioni del Consiglio di Stato e dei Tribunali amministrativi regionali: sono atti
              giurisdizionali, <strong>non sono leggi</strong>. Solo metadati con scheda e PDF ufficiali.
            </p>
            <p className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia" role="status">
              {totale} provvedimenti trovati · {tutte.length} caricati
            </p>
          </header>

          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Passa tra contratti, provvedimenti e documenti">
            <Link
              href="/controllo/lista?tipo=contratti"
              className="inline-flex min-h-[44px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia"
            >
              Contratti
            </Link>
            <span
              aria-current="page"
              className="inline-flex min-h-[44px] items-center border border-inchiostro bg-inchiostro px-4 py-2 text-xs font-semibold uppercase tracking-wide text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte"
            >
              Provvedimenti
            </span>
            <Link
              href="/controllo/lista?tipo=cnel"
              className="inline-flex min-h-[44px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia"
            >
              Documenti CNEL
            </Link>
          </div>

          <form method="get" action="/controllo/lista" className="mt-4 flex flex-col gap-3 sm:flex-row" role="search">
            <input type="hidden" name="tipo" value="ga" />
            {giudice && <input type="hidden" name="giudice" value={giudice} />}
            <label htmlFor="cerca-ga" className="sr-only">Cerca per numero, oggetto o sezione</label>
            <input
              id="cerca-ga"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={100}
              placeholder="Cerca per numero, oggetto o sezione…"
              className="min-h-[44px] w-full flex-1 border border-regola bg-carta px-4 py-2 text-sm text-inchiostro placeholder:text-inchiostro-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia dark:placeholder:text-nebbia-faint dark:focus-visible:outline-nebbia"
            />
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center justify-center border border-inchiostro px-5 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro transition-colors hover:bg-inchiostro hover:text-carta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte dark:focus-visible:outline-nebbia"
            >
              Cerca
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtra per giudice">
            <Link
              href={q ? `/controllo/lista?tipo=ga&q=${encodeURIComponent(q)}` : '/controllo/lista?tipo=ga'}
              aria-current={!giudice ? 'page' : undefined}
              className={`inline-flex min-h-[44px] items-center border px-4 py-2 text-xs font-semibold uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:focus-visible:outline-nebbia ${
                !giudice
                  ? 'border-inchiostro bg-inchiostro text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte'
                  : 'border-regola text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia'
              }`}
            >
              Tutti ({tutte.length})
            </Link>
            {conteggi.map((c) => {
              const attiva = giudice === c.nome
              const sp = new URLSearchParams()
              sp.set('tipo', 'ga')
              if (q) sp.set('q', q)
              sp.set('giudice', c.nome)
              return (
                <Link
                  key={c.nome}
                  href={`/controllo/lista?${sp.toString()}`}
                  aria-current={attiva ? 'page' : undefined}
                  className={`inline-flex min-h-[44px] items-center border px-4 py-2 text-xs font-semibold uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:focus-visible:outline-nebbia ${
                    attiva
                      ? 'border-inchiostro bg-inchiostro text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte'
                      : 'border-regola text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia'
                  }`}
                >
                  {c.nome === 'cds' ? 'Consiglio di Stato' : c.nome === 'tar' ? 'TAR' : c.nome === 'cga' ? 'CGA Sicilia' : c.nome} ({c.componenti})
                </Link>
              )
            })}
          </div>

          {items.length === 0 ? (
            <p className="mt-8 border border-regola bg-carta-soft p-5 text-sm text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft" role="status">
              {tutte.length === 0
                ? 'Dati in preparazione: il file dei provvedimenti non è ancora disponibile. Nessun numero stimato qui.'
                : 'Nessun provvedimento trovato con questi criteri. Prova a togliere il filtro o a cercare un altro numero.'}
            </p>
          ) : (
            <ol className="mt-6 grid gap-4">
              {items.map((p) => (
                <li key={p.schedaUrl || `${p.giudice}-${p.numero ?? ''}-${p.anno ?? ''}`} className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center border border-inchiostro px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-inchiostro dark:border-nebbia dark:text-nebbia">
                      {p.giudice === 'cds' ? 'CdS' : p.giudice === 'cga' ? 'CGA' : 'TAR'}{p.sezione ? ` · ${p.sezione}` : ''} - non è una legge
                    </span>
                    <span className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
                      {p.data ? dataIT(p.data) : 'data non indicata'}
                    </span>
                  </div>
                  <h2 className="mt-3 font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
                    {p.numero && p.anno
                      ? `${p.giudice === 'cds' ? 'Consiglio di Stato' : p.giudice === 'cga' ? 'CGA Sicilia' : 'TAR'} n. ${p.numero} del ${p.anno}`
                      : `${p.giudice === 'cds' ? 'Consiglio di Stato' : p.giudice === 'cga' ? 'CGA Sicilia' : 'TAR'}${p.sezione ? ` · ${p.sezione}` : ''}`}
                  </h2>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                    {p.oggetto}
                  </p>
                  <p className="mt-1 text-xs text-inchiostro-soft dark:text-nebbia-soft">
                    {p.ecli ? `${p.ecli} · ` : ''}Solo metadati, testo integrale sul sito ufficiale.
                  </p>
                  <p className="mt-3 flex flex-wrap gap-3 text-sm">
                    <a href={p.schedaUrl} target="_blank" rel="noopener" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
                      Scheda ufficiale ↗
                    </a>
                    {p.pdfUrl && (
                      <a href={p.pdfUrl} target="_blank" rel="noopener" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
                        PDF ufficiale ↗
                      </a>
                    )}
                  </p>
                </li>
              ))}
            </ol>
          )}

          {pagine > 1 && (
            <nav aria-label="Pagine" className="mt-6 flex flex-wrap items-center gap-2">
              {paginaCorrente > 1 && (
                <Link href={linkPagina(paginaCorrente - 1)} className="inline-flex min-h-[44px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia">
                  ← Precedente
                </Link>
              )}
              <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status">
                Pagina {paginaCorrente} di {pagine}
              </span>
              {paginaCorrente < pagine && (
                <Link href={linkPagina(paginaCorrente + 1)} className="inline-flex min-h-[44px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia">
                  Successiva →
                </Link>
              )}
            </nav>
          )}

          <section aria-labelledby="fonti-ga" className="mt-10 border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft">
            <h2 id="fonti-ga" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">Fonte e licenza</h2>
            <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Fonte: {provenance.fonte ?? 'Giustizia Amministrativa'} - licenza {provenance.licenza ?? 'da confermare nel file'}
              {provenance.recuperatoIl ? ` · dati aggiornati al ${dataIT(provenance.recuperatoIl)}` : ''}. {DISCLAIMER_CONTROLLO}
            </p>
          </section>
        </main>
        <Footer />
      </>
    )
  }

  if (tipo === 'cnel') {
    const [tutte, provenance] = await Promise.all([tuttiDocumentiCnel(), leggiProvenanceCnel()])
    const filtrati = cercaDocumentiCnel(tutte, q)
    const totale = filtrati.length
    const items = paginaOversight(filtrati, page, per)
    const pagine = Math.max(1, Math.ceil(totale / per))
    const paginaCorrente = Math.min(page, pagine)

    return (
      <>
        <Header />
        <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <nav aria-label="Percorso" className="text-xs text-inchiostro-soft dark:text-nebbia-soft">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link href="/" className="hover:text-accento dark:hover:text-accento-chiara">Home</Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/controllo" className="hover:text-accento dark:hover:text-accento-chiara">Controllo pubblico</Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">Documenti CNEL</li>
            </ol>
          </nav>

          <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
              Controllo · CNEL
            </p>
            <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
              Documenti CNEL
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Osservazioni e proposte del Consiglio Nazionale dell&apos;Economia e del Lavoro: sono
              atti consultivi, <strong>non sono leggi</strong>. Solo metadati con link ufficiali.
            </p>
            <p className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia" role="status">
              {totale} documenti trovati · {tutte.length} caricati
            </p>
          </header>

          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Passa tra contratti, provvedimenti e documenti">
            <Link
              href="/controllo/lista?tipo=contratti"
              className="inline-flex min-h-[44px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia"
            >
              Contratti
            </Link>
            <Link
              href="/controllo/lista?tipo=ga"
              className="inline-flex min-h-[44px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia"
            >
              Provvedimenti
            </Link>
            <span
              aria-current="page"
              className="inline-flex min-h-[44px] items-center border border-inchiostro bg-inchiostro px-4 py-2 text-xs font-semibold uppercase tracking-wide text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte"
            >
              Documenti CNEL
            </span>
          </div>

          <form method="get" action="/controllo/lista" className="mt-4 flex flex-col gap-3 sm:flex-row" role="search">
            <input type="hidden" name="tipo" value="cnel" />
            <label htmlFor="cerca-cnel" className="sr-only">Cerca tra i documenti CNEL</label>
            <input
              id="cerca-cnel"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={100}
              placeholder="Cerca per titolo o tipo…"
              className="min-h-[44px] w-full flex-1 border border-regola bg-carta px-4 py-2 text-sm text-inchiostro placeholder:text-inchiostro-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia dark:placeholder:text-nebbia-faint dark:focus-visible:outline-nebbia"
            />
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center justify-center border border-inchiostro px-5 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro transition-colors hover:bg-inchiostro hover:text-carta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte dark:focus-visible:outline-nebbia"
            >
              Cerca
            </button>
          </form>

          {items.length === 0 ? (
            <p className="mt-8 border border-dashed border-regola bg-carta-soft p-5 text-sm text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft" role="status">
              {tutte.length === 0
                ? 'Dati in preparazione: il file dei documenti non è ancora disponibile. Nessun numero stimato qui.'
                : 'Nessun documento trovato con questi criteri. Prova a togliere il filtro.'}
            </p>
          ) : (
            <ol className="mt-6 grid gap-4">
              {items.map((d) => (
                <li key={d.id} className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center border border-inchiostro px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-inchiostro dark:border-nebbia dark:text-nebbia">
                      CNEL{d.tipo ? ` · ${d.tipo}` : ''} - non è una legge
                    </span>
                    <span className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
                      {d.data ? dataIT(d.data) : 'data non indicata'}
                    </span>
                  </div>
                  <h2 className="mt-3 font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
                    {d.titolo}
                  </h2>
                  <p className="mt-3">
                    <a href={d.url} target="_blank" rel="noopener" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
                      Scheda ufficiale ↗
                    </a>
                  </p>
                </li>
              ))}
            </ol>
          )}

          {pagine > 1 && (
            <nav aria-label="Pagine" className="mt-6 flex flex-wrap items-center gap-2">
              {paginaCorrente > 1 && (
                <Link href={linkPagina(paginaCorrente - 1)} className="inline-flex min-h-[44px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia">
                  ← Precedente
                </Link>
              )}
              <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status">
                Pagina {paginaCorrente} di {pagine}
              </span>
              {paginaCorrente < pagine && (
                <Link href={linkPagina(paginaCorrente + 1)} className="inline-flex min-h-[44px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia">
                  Successiva →
                </Link>
              )}
            </nav>
          )}

          <section aria-labelledby="fonti-cnel" className="mt-10 border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft">
            <h2 id="fonti-cnel" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">Fonte e licenza</h2>
            <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Fonte: {provenance.fonte ?? 'CNEL'} - licenza {provenance.licenza ?? 'da confermare nel file'}
              {provenance.recuperatoIl ? ` · dati aggiornati al ${dataIT(provenance.recuperatoIl)}` : ''}. {DISCLAIMER_CONTROLLO}
            </p>
          </section>
        </main>
        <Footer />
      </>
    )
  }

  const [tutte, provenance] = await Promise.all([tuttiContratti(), leggiProvenanceAnac()])
  const base = filtraPerEnte(tutte, ente)
  const filtrati = cercaContratti(base, q)
  const totale = filtrati.length
  const items = paginaOversight(filtrati, page, per)
  const pagine = Math.max(1, Math.ceil(totale / per))
  const paginaCorrente = Math.min(page, pagine)

  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <nav aria-label="Percorso" className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
          <ol className="flex items-center gap-2">
            <li>
              <Link href="/" className="hover:text-accento dark:hover:text-accento-chiara">Home</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/controllo" className="hover:text-accento dark:hover:text-accento-chiara">Controllo pubblico</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">Contratti</li>
          </ol>
        </nav>

        <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Controllo · Contratti pubblici 2025
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Contratti ANAC 2025
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Appalti con CIG, stazione appaltante e importo dai dati aperti ANAC/BDNCP. Sono contratti
            pubblici: <strong>non sono leggi</strong> e gli importi sono valori osservati, non spesa certa.
          </p>
          <p className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia" role="status">
            {totale} contratti trovati · {tutte.length} caricati
          </p>
        </header>

        <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Passa tra contratti, provvedimenti e documenti">
          <span
            aria-current="page"
            className="inline-flex min-h-[44px] items-center border border-inchiostro bg-inchiostro px-4 py-2 text-xs font-semibold uppercase tracking-wide text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte"
          >
            Contratti
          </span>
          <Link
            href="/controllo/lista?tipo=ga"
            className="inline-flex min-h-[44px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia"
          >
            Provvedimenti
          </Link>
          <Link
            href="/controllo/lista?tipo=cnel"
            className="inline-flex min-h-[44px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia"
          >
            Documenti CNEL
          </Link>
        </div>

        <form method="get" action="/controllo/lista" className="mt-4 flex flex-col gap-3 sm:flex-row" role="search">
          <input type="hidden" name="tipo" value="contratti" />
          <label htmlFor="cerca-contratti" className="sr-only">Cerca per CIG, oggetto, ente o fornitore</label>
          <input
            id="cerca-contratti"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            placeholder="Cerca per CIG, oggetto, ente o fornitore…"
            className="min-h-[44px] w-full flex-1 border border-regola bg-carta px-4 py-2 text-sm text-inchiostro placeholder:text-inchiostro-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia dark:placeholder:text-nebbia-faint dark:focus-visible:outline-nebbia"
          />
          <label htmlFor="filtro-ente" className="sr-only">Filtra per stazione appaltante</label>
          <input
            id="filtro-ente"
            name="ente"
            type="search"
            defaultValue={ente}
            maxLength={100}
            placeholder="Stazione appaltante…"
            className="min-h-[44px] w-full flex-1 border border-regola bg-carta px-4 py-2 text-sm text-inchiostro placeholder:text-inchiostro-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia dark:placeholder:text-nebbia-faint dark:focus-visible:outline-nebbia"
          />
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center justify-center border border-inchiostro px-5 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro transition-colors hover:bg-inchiostro hover:text-carta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte dark:focus-visible:outline-nebbia"
          >
            Cerca
          </button>
        </form>

        {items.length === 0 ? (
          <p className="mt-8 border border-regola bg-carta-soft p-5 text-sm text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft" role="status">
            {tutte.length === 0
              ? 'Dati in preparazione: il file dei contratti non è ancora disponibile. Nessun numero stimato qui.'
              : 'Nessun contratto trovato con questi criteri. Prova a togliere il filtro o a cercare un altro CIG.'}
          </p>
        ) : (
          <ol className="mt-6 grid gap-4">
              {items.map((c) => (
                <li key={c.ocid || c.cig || c.oggetto} className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center border border-inchiostro px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-inchiostro dark:border-nebbia dark:text-nebbia">
                      Contratto pubblico - non è una legge
                    </span>
                    {c.cig && (
                      <span className="text-xs text-inchiostro-faint dark:text-nebbia-faint">CIG {c.cig}</span>
                    )}
                  </div>
                <h2 className="mt-3 font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
                  {c.stazioneAppaltante.denominazione}
                </h2>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                  {c.oggetto}
                </p>
                <p className="mt-1 text-xs text-inchiostro-soft dark:text-nebbia-soft">
                  {importoIT(c.importo, c.valuta)}
                  {c.dataAward ? ` · award: ${dataIT(c.dataAward)}` : ''}
                  {c.fornitore ? ` · fornitore: ${c.fornitore}` : ''}
                </p>
                {(c.schedaBDNCP || c.risorsaBulk) && (
                  <p className="mt-3 flex flex-wrap gap-3 text-sm">
                    {c.schedaBDNCP && (
                      <a href={c.schedaBDNCP} target="_blank" rel="noopener" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
                        Scheda BDNCP ↗
                      </a>
                    )}
                    {c.risorsaBulk && (
                      <a href={c.risorsaBulk} target="_blank" rel="noopener" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
                        Risorsa bulk ↗
                      </a>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}

        {pagine > 1 && (
          <nav aria-label="Pagine" className="mt-6 flex flex-wrap items-center gap-2">
            {paginaCorrente > 1 && (
              <Link href={linkPagina(paginaCorrente - 1)} className="inline-flex min-h-[44px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia">
                ← Precedente
              </Link>
            )}
            <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status">
              Pagina {paginaCorrente} di {pagine}
            </span>
            {paginaCorrente < pagine && (
              <Link href={linkPagina(paginaCorrente + 1)} className="inline-flex min-h-[44px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia">
                Successiva →
              </Link>
            )}
          </nav>
        )}

        <section aria-labelledby="fonti-contratti" className="mt-10 border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft">
          <h2 id="fonti-contratti" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">Fonte e licenza</h2>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Fonte: {provenance.fonte ?? 'ANAC/BDNCP'} - licenza {provenance.licenza ?? 'da confermare nel file'}
            {provenance.recuperatoIl ? ` · dati aggiornati al ${dataIT(provenance.recuperatoIl)}` : ''}. {DISCLAIMER_CONTROLLO}
          </p>
        </section>
      </main>
      <Footer />
    </>
  )
}
