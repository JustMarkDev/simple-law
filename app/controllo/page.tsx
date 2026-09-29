import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Comparsa from '@/components/Comparsa'
import {
  ArrowRight01Icon,
  DocumentValidationIcon,
  FileSearchIcon,
  InformationCircleIcon,
  JusticeScale01Icon,
  Shield01Icon,
} from 'hugeicons-react'
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

const badgeBadge =
  'inline-flex items-center gap-1.5 rounded-lg bg-carta px-3 py-1.5 text-xs font-semibold text-inchiostro-soft dark:bg-notte-deep dark:text-nebbia-soft'

const bottonePrimario =
  'inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-accento px-6 py-3 text-sm font-bold text-white transition-all hover:brightness-110 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento motion-reduce:transition-none motion-reduce:active:scale-100 dark:bg-accento-chiara dark:text-notte dark:focus-visible:outline-accento-chiara'

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
        <nav aria-label="Percorso" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
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

        <Comparsa>
          <header className="mt-4 rounded-2xl border border-regola bg-carta-soft p-6 dark:border-notte-deep dark:bg-notte-soft sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
              Controllo pubblico
            </p>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
              <Shield01Icon size={32} aria-hidden="true" className="shrink-0 text-accento dark:text-accento-chiara" />
              Controllo pubblico
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Contratti pubblici e decisioni dei giudici dai dati ufficiali.
              Sono documenti di controllo: <strong>non sono leggi in vigore</strong> e non dicono
              se una norma funziona.
            </p>
            <p className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia" role="status">
              {sintesi.contratti} contratti, {sintesi.provvedimenti} provvedimenti e {sintesi.documentiCnel} documenti CNEL caricati.
            </p>
          </header>
        </Comparsa>

        <Comparsa delay={0.06}>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section
              aria-labelledby="titolo-contratti"
              className="rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft sm:p-6 lg:col-span-2"
            >
              <p className={badgeBadge}>
                <InformationCircleIcon size={16} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                Non è una legge, è un contratto
              </p>
              <h2 id="titolo-contratti" className="mt-3 flex items-center gap-2 text-xl font-bold text-inchiostro dark:text-nebbia">
                <FileSearchIcon size={22} aria-hidden="true" className="shrink-0 text-accento dark:text-accento-chiara" />
                Contratti ANAC 2025
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                {sintesi.contrattiDisponibili
                  ? `${sintesi.contratti} contratti (codice CIG, chi compra, cosa compra, importo visto nei dati) dai dati aperti ANAC e BDNCP.`
                  : 'Dati in preparazione: il file dei contratti non è ancora pronto. Qui non trovi numeri inventati.'}
              </p>
              <p className="mt-2 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                Fonte: {provAnac.fonte ?? 'ANAC e BDNCP'}, licenza {provAnac.licenza ?? 'da confermare nel file'}
                {provAnac.recuperatoIl ? `, aggiornati al ${dataIT(provAnac.recuperatoIl)}` : ''}.
              </p>
              <p className="mt-4">
                <Link href="/controllo/lista?tipo=contratti" className={bottonePrimario}>
                  Sfoglia i contratti
                  <ArrowRight01Icon size={18} strokeWidth={2} aria-hidden="true" />
                </Link>
              </p>
            </section>

            <section
              aria-labelledby="titolo-ga"
              className="rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft sm:p-6"
            >
              <p className={badgeBadge}>
                <InformationCircleIcon size={16} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                Non è una legge, è una decisione dei giudici
              </p>
              <h2 id="titolo-ga" className="mt-3 flex items-center gap-2 text-xl font-bold text-inchiostro dark:text-nebbia">
                <JusticeScale01Icon size={22} aria-hidden="true" className="shrink-0 text-accento dark:text-accento-chiara" />
                Giustizia amministrativa 2026
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                {sintesi.provvedimentiDisponibili
                  ? `${sintesi.provvedimenti} provvedimenti (Consiglio di Stato e TAR) con scheda e file ufficiali. Solo info brevi, non il testo intero.`
                  : 'Dati in preparazione: il file dei provvedimenti non è ancora pronto. Qui non trovi numeri inventati.'}
              </p>
              <p className="mt-2 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                Fonte: {provGa.fonte ?? 'Giustizia Amministrativa'}, licenza {provGa.licenza ?? 'da confermare nel file'}
                {provGa.recuperatoIl ? `, aggiornati al ${dataIT(provGa.recuperatoIl)}` : ''}.
              </p>
              <p className="mt-4">
                <Link href="/controllo/lista?tipo=ga" className={bottonePrimario}>
                  Sfoglia i provvedimenti
                  <ArrowRight01Icon size={18} strokeWidth={2} aria-hidden="true" />
                </Link>
              </p>
            </section>

            <section
              aria-labelledby="titolo-cnel"
              className="rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft sm:p-6"
            >
              <p className={badgeBadge}>
                <InformationCircleIcon size={16} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                Non è una legge, è un parere
              </p>
              <h2 id="titolo-cnel" className="mt-3 flex items-center gap-2 text-xl font-bold text-inchiostro dark:text-nebbia">
                <DocumentValidationIcon size={22} aria-hidden="true" className="shrink-0 text-accento dark:text-accento-chiara" />
                CNEL 2026
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                {sintesi.documentiCnelDisponibili
                  ? `${sintesi.documentiCnel} note e proposte del Consiglio Nazionale dell'Economia e del Lavoro. Solo info brevi con link ufficiali.`
                  : 'Dati in preparazione: il file dei documenti non è ancora pronto. Qui non trovi numeri inventati.'}
              </p>
              <p className="mt-2 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                Fonte: {provCnel.fonte ?? 'CNEL'}, licenza {provCnel.licenza ?? 'da confermare nel file'}
                {provCnel.recuperatoIl ? `, aggiornati al ${dataIT(provCnel.recuperatoIl)}` : ''}.
              </p>
              <p className="mt-4">
                <Link href="/controllo/lista?tipo=cnel" className={bottonePrimario}>
                  Sfoglia i documenti
                  <ArrowRight01Icon size={18} strokeWidth={2} aria-hidden="true" />
                </Link>
              </p>
            </section>
          </div>
        </Comparsa>

        <Comparsa delay={0.08}>
          <section
            aria-labelledby="fonti-licenze"
            className="mt-6 rounded-2xl border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft sm:p-6"
          >
            <h2 id="fonti-licenze" className="text-lg font-bold text-inchiostro dark:text-nebbia">
              Fonti e licenze
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              {DISCLAIMER_CONTROLLO}
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-inchiostro-soft dark:text-nebbia-soft">
              <li>
                Contratti: {provAnac.fonte ?? 'ANAC e BDNCP'}, licenza {provAnac.licenza ?? 'da confermare nel file'}
                {provAnac.url ? (
                  <>
                    {', '}
                    <a href={provAnac.url} target="_blank" rel="noopener" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
                      fonte ufficiale
                    </a>
                  </>
                ) : null}
                .
              </li>
              <li>
                Provvedimenti: {provGa.fonte ?? 'Giustizia Amministrativa'}, licenza {provGa.licenza ?? 'da confermare nel file'}
                {provGa.url ? (
                  <>
                    {', '}
                    <a href={provGa.url} target="_blank" rel="noopener" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
                      fonte ufficiale
                    </a>
                  </>
                ) : null}
                .
              </li>
              <li>
                Documenti CNEL: {provCnel.fonte ?? 'CNEL'}, licenza {provCnel.licenza ?? 'da confermare nel file'}
                {provCnel.url ? (
                  <>
                    {', '}
                    <a href={provCnel.url} target="_blank" rel="noopener" className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
                      fonte ufficiale
                    </a>
                  </>
                ) : null}
                .
              </li>
            </ul>
          </section>
        </Comparsa>
      </main>
      <Footer />
    </>
  )
}
