import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { leggiProvenanceConsulta, trovaPronuncia, tuttePronunce } from '@/lib/consulta'

interface DettaglioProps {
  params: Promise<{ anno: string; numero: string }>
}

function dataIT(iso?: string): string {
  try {
    if (!iso) return 'non indicata'
    const d = new Date(`${iso}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return (iso ?? '').slice(0, 10)
  }
}

function tipoLungo(t?: string): string {
  if (t === 'S') return 'Sentenza'
  if (t === 'O') return 'Ordinanza'
  return 'Pronuncia'
}

export async function generateStaticParams() {
  try {
    const tutte = await tuttePronunce()
    return tutte.map((p) => ({ anno: p.anno, numero: p.numero }))
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: DettaglioProps): Promise<Metadata> {
  const { anno, numero } = await params
  try {
    const p = await trovaPronuncia(anno, numero)
    if (!p) return { title: 'Pronuncia non trovata - Stato della Repubblica' }
    const tipo = tipoLungo(p.tipologia)
    return {
      title: `${tipo} n. ${p.numero}/${p.anno} - Corte Costituzionale - Stato della Repubblica`,
      description: `${tipo} n. ${p.numero} del ${p.anno} della Corte Costituzionale${p.ecli ? ` (${p.ecli})` : ''}: epigrafe e dispositivo dai dati aperti ufficiali.`,
    }
  } catch {
    return { title: 'Corte Costituzionale - Stato della Repubblica' }
  }
}

export default async function DettaglioPronuncia({ params }: DettaglioProps) {
  const { anno, numero } = await params
  const p = await trovaPronuncia(anno, numero)
  if (!p) notFound()

  const tipo = tipoLungo(p.tipologia)
  let licenza = 'CC BY-SA 3.0'
  let recuperatoIl: string | null = null
  try {
    const prov = await leggiProvenanceConsulta()
    if (prov.licenza) licenza = prov.licenza
    if (prov.recuperatoIl) recuperatoIl = prov.recuperatoIl
  } catch {
    // fallback alla licenza reale nota
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${tipo} n. ${p.numero}/${p.anno} - Corte Costituzionale`,
    ...(p.dataDeposito ? { datePublished: p.dataDeposito } : {}),
    ...(p.ecli ? { identifier: p.ecli } : {}),
    url: p.scheda,
  }

  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <nav aria-label="Percorso" className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/" className="hover:text-accento dark:hover:text-accento-chiara">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/consulta" className="hover:text-accento dark:hover:text-accento-chiara">
                Corte Costituzionale
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
              {tipo} {p.numero}/{p.anno}
            </li>
          </ol>
        </nav>

        <header className="mt-4 border-b-2 border-inchiostro pb-6 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            {tipo} · Corte Costituzionale · {p.anno}
          </p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
            {tipo} n. {p.numero} del {p.anno}
          </h1>
          <p className="mt-2 text-sm text-inchiostro-soft dark:text-nebbia-soft">
            Decisione: {dataIT(p.dataDecisione)} · Deposito: {dataIT(p.dataDeposito)}
            {p.ecli ? ` · ${p.ecli}` : ''}
          </p>
          <p className="mt-2 inline-flex items-center border border-regola px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
            Giurisprudenza - non è una legge in vigore
          </p>
        </header>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <section
            aria-labelledby="sintesi"
            className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft lg:col-span-2"
          >
            <h2 id="sintesi" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              Scheda
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              {p.presidente && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-inchiostro-soft dark:text-nebbia-soft">Presidente</dt>
                  <dd className="text-right font-semibold text-inchiostro dark:text-nebbia">{p.presidente}</dd>
                </div>
              )}
              {p.relatore && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-inchiostro-soft dark:text-nebbia-soft">Relatore</dt>
                  <dd className="text-right font-semibold text-inchiostro dark:text-nebbia">{p.relatore}</dd>
                </div>
              )}
              {p.redattore && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-inchiostro-soft dark:text-nebbia-soft">Redattore</dt>
                  <dd className="text-right font-semibold text-inchiostro dark:text-nebbia">{p.redattore}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-inchiostro-soft dark:text-nebbia-soft">Tipologia (codice dataset)</dt>
                <dd className="text-right font-semibold text-inchiostro dark:text-nebbia">
                  {p.tipologia ?? 'non indicata'}
                </dd>
              </div>
              {p.ecli && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-inchiostro-soft dark:text-nebbia-soft">ECLI</dt>
                  <dd className="text-right font-semibold text-inchiostro dark:text-nebbia">{p.ecli}</dd>
                </div>
              )}
            </dl>
            <p className="mt-4">
              <a
                href={p.scheda}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-[44px] items-center border border-inchiostro px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro transition-colors hover:bg-inchiostro hover:text-carta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte dark:focus-visible:outline-nebbia"
              >
                Scheda ufficiale ↗
              </a>
            </p>
          </section>

          <section
            aria-labelledby="fonte-scheda"
            className="border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft"
          >
            <h2 id="fonte-scheda" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              Fonte
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              dati.cortecostituzionale.it - {licenza}
              {recuperatoIl ? ` · aggiornato al ${dataIT(recuperatoIl.slice(0, 10))}` : ''}.
            </p>
            {p.testo_troncato && (
              <p className="mt-2 text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint">
                Epigrafe o dispositivo abbreviati per restare sotto il limite di dimensione.
              </p>
            )}
          </section>
        </div>

        {p.epigrafe && (
          <section aria-labelledby="epigrafe" className="mt-4 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
            <h2 id="epigrafe" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              Epigrafe
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">{p.epigrafe}</p>
          </section>
        )}

        {p.dispositivo && (
          <section aria-labelledby="dispositivo" className="mt-4 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
            <h2 id="dispositivo" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              Dispositivo
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">{p.dispositivo}</p>
          </section>
        )}

        <p className="mt-10">
          <Link
            href="/consulta"
            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
          >
            Torna alle pronunce
          </Link>
        </p>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </main>
      <Footer />
    </>
  )
}
