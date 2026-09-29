import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import {
  DISCLAIMER_CONTROLLO,
  leggiProvenanceAnac,
  leggiProvenanceCnel,
  leggiProvenanceGA,
  sintesiControllo,
} from '@/lib/oversight-dati'

export const metadata: Metadata = {
  title: 'Controllo pubblico - Contratti, giustizia amministrativa e CNEL - Stato della Repubblica',
  description:
    'Contratti pubblici ANAC 2025, provvedimenti del Consiglio di Stato, dei TAR e CGA Sicilia 2026 e documenti CNEL dai dati ufficiali: documenti di controllo, non sono leggi in vigore.',
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

export default async function ControlloPage() {
  const [sintesi, provAnac, provGa, provCnel] = await Promise.all([
    sintesiControllo(),
    leggiProvenanceAnac(),
    leggiProvenanceGA(),
    leggiProvenanceCnel(),
  ])

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
              Controllo pubblico
            </li>
          </ol>
        </nav>

        <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Controllo · ANAC e giustizia amministrativa
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Controllo pubblico
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Contratti pubblici e provvedimenti dei giudici amministrativi dai dati ufficiali.
            Sono documenti di controllo: <strong>non sono leggi in vigore</strong> e non dicono
            se una norma funziona.
          </p>
          <p className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia" role="status">
            {sintesi.contratti} contratti caricati · {sintesi.provvedimenti} provvedimenti caricati · {sintesi.documentiCnel} documenti CNEL
          </p>
        </header>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <section
            aria-labelledby="titolo-contratti"
            className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
          >
            <p className="inline-flex items-center border border-inchiostro px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-inchiostro dark:border-nebbia dark:text-nebbia">
              Contratto pubblico - non è una legge
            </p>
            <h2 id="titolo-contratti" className="mt-3 font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
              Contratti ANAC 2025
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              {sintesi.contrattiDisponibili
                ? `${sintesi.contratti} contratti (CIG, stazione appaltante, oggetto, importo osservato) dai dati aperti ANAC/BDNCP.`
                : 'Dati in preparazione: il file dei contratti non è ancora disponibile. Nessun numero stimato qui.'}
            </p>
            <p className="mt-2 text-xs text-inchiostro-faint dark:text-nebbia-faint">
              Fonte: {provAnac.fonte ?? 'ANAC/BDNCP'} · licenza {provAnac.licenza ?? 'da confermare nel file'}
              {provAnac.recuperatoIl ? ` · aggiornati al ${dataIT(provAnac.recuperatoIl)}` : ''}.
            </p>
            <p className="mt-4">
              <Link
                href="/controllo/lista?tipo=contratti"
                className="inline-flex min-h-[44px] items-center border border-inchiostro px-5 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro transition-colors hover:bg-inchiostro hover:text-carta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte dark:focus-visible:outline-nebbia"
              >
                Sfoglia i contratti →
              </Link>
            </p>
          </section>

          <section
            aria-labelledby="titolo-ga"
            className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
          >
            <p className="inline-flex items-center border border-inchiostro px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-inchiostro dark:border-nebbia dark:text-nebbia">
              Provvedimento GA - non è una legge
            </p>
            <h2 id="titolo-ga" className="mt-3 font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
              Giustizia amministrativa 2026
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              {sintesi.provvedimentiDisponibili
                ? `${sintesi.provvedimenti} provvedimenti (Consiglio di Stato e TAR) con scheda e PDF ufficiali. Solo metadati, nessun testo integrale.`
                : 'Dati in preparazione: il file dei provvedimenti non è ancora disponibile. Nessun numero stimato qui.'}
            </p>
            <p className="mt-2 text-xs text-inchiostro-faint dark:text-nebbia-faint">
              Fonte: {provGa.fonte ?? 'Giustizia Amministrativa'} · licenza {provGa.licenza ?? 'da confermare nel file'}
              {provGa.recuperatoIl ? ` · aggiornati al ${dataIT(provGa.recuperatoIl)}` : ''}.
            </p>
            <p className="mt-4">
              <Link
                href="/controllo/lista?tipo=ga"
                className="inline-flex min-h-[44px] items-center border border-inchiostro px-5 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro transition-colors hover:bg-inchiostro hover:text-carta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte dark:focus-visible:outline-nebbia"
              >
                Sfoglia i provvedimenti →
              </Link>
            </p>
          </section>

          <section
            aria-labelledby="titolo-cnel"
            className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
          >
            <p className="inline-flex items-center border border-inchiostro px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-inchiostro dark:border-nebbia dark:text-nebbia">
              Documento CNEL - non è una legge
            </p>
            <h2 id="titolo-cnel" className="mt-3 font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
              CNEL 2026
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              {sintesi.documentiCnelDisponibili
                ? `${sintesi.documentiCnel} osservazioni e proposte del Consiglio Nazionale dell'Economia e del Lavoro. Solo metadati con link ufficiali.`
                : 'Dati in preparazione: il file dei documenti non è ancora disponibile. Nessun numero stimato qui.'}
            </p>
            <p className="mt-2 text-xs text-inchiostro-faint dark:text-nebbia-faint">
              Fonte: {provCnel.fonte ?? 'CNEL'} · licenza {provCnel.licenza ?? 'da confermare nel file'}
              {provCnel.recuperatoIl ? ` · aggiornati al ${dataIT(provCnel.recuperatoIl)}` : ''}.
            </p>
            <p className="mt-4">
              <Link
                href="/controllo/lista?tipo=cnel"
                className="inline-flex min-h-[44px] items-center border border-inchiostro px-5 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro transition-colors hover:bg-inchiostro hover:text-carta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte dark:focus-visible:outline-nebbia"
              >
                Sfoglia i documenti →
              </Link>
            </p>
          </section>
        </div>

        <section
          aria-labelledby="fonti-licenze"
          className="mt-10 border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft"
        >
          <h2 id="fonti-licenze" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Fonti e licenze
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            {DISCLAIMER_CONTROLLO}
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-inchiostro-soft dark:text-nebbia-soft">
            <li>
              Contratti: {provAnac.fonte ?? 'ANAC/BDNCP'} - licenza {provAnac.licenza ?? 'da confermare nel file'}
              {provAnac.url ? (
                <>
                  {' · '}
                  <a href={provAnac.url} target="_blank" rel="noopener" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
                    fonte ufficiale ↗
                  </a>
                </>
              ) : null}
              .
            </li>
            <li>
              Provvedimenti: {provGa.fonte ?? 'Giustizia Amministrativa'} - licenza {provGa.licenza ?? 'da confermare nel file'}
              {provGa.url ? (
                <>
                  {' · '}
                  <a href={provGa.url} target="_blank" rel="noopener" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
                    fonte ufficiale ↗
                  </a>
                </>
              ) : null}
              .
            </li>
            <li>
              Documenti CNEL: {provCnel.fonte ?? 'CNEL'} - licenza {provCnel.licenza ?? 'da confermare nel file'}
              {provCnel.url ? (
                <>
                  {' · '}
                  <a href={provCnel.url} target="_blank" rel="noopener" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
                    fonte ufficiale ↗
                  </a>
                </>
              ) : null}
              .
            </li>
          </ul>
        </section>
      </main>
      <Footer />
    </>
  )
}
