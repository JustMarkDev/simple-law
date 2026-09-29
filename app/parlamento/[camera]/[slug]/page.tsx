import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { tuttiDeputati, tuttiSenatori, leggiProvenance } from '@/lib/parlamento-dati'

interface DettaglioProps {
  params: Promise<{ camera: string; slug: string }>
}

const CAMERE_VALIDE = ['deputati', 'senatori'] as const
type CameraParam = (typeof CAMERE_VALIDE)[number]

function dataIT(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

function iniziali(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

function isCameraParam(v: string): v is CameraParam {
  return (CAMERE_VALIDE as readonly string[]).includes(v)
}

export async function generateStaticParams() {
  try {
    const [deputati, senatori] = await Promise.all([tuttiDeputati(), tuttiSenatori()])
    return [
      ...deputati.map((d) => ({ camera: 'deputati', slug: d.slug })),
      ...senatori.map((s) => ({ camera: 'senatori', slug: s.slug })),
    ]
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: DettaglioProps): Promise<Metadata> {
  const { camera, slug } = await params
  if (!isCameraParam(camera)) return { title: 'Pagina non trovata - Stato della Repubblica' }
  try {
    const membri = camera === 'deputati' ? await tuttiDeputati() : await tuttiSenatori()
    const membro = membri.find((m) => m.slug === slug)
    if (!membro) return { title: 'Parlamentare non trovato - Stato della Repubblica' }
    const etichetta = camera === 'deputati' ? 'Deputato' : 'Senatore'
    return {
      title: `${membro.nome} - ${etichetta} - Stato della Repubblica`,
      description: `${membro.nome}${membro.gruppo ? `, ${membro.gruppo}` : ''}: scheda della legislatura 19.`,
    }
  } catch {
    return { title: 'Parlamento - Stato della Repubblica' }
  }
}

export default async function DettaglioParlamentare({ params }: DettaglioProps) {
  const { camera, slug } = await params
  if (!isCameraParam(camera)) notFound()

  const membri = camera === 'deputati' ? await tuttiDeputati() : await tuttiSenatori()
  const membro = membri.find((m) => m.slug === slug)
  if (!membro) notFound()

  const etichettaCamera = camera === 'deputati' ? 'Deputati' : 'Senatori'
  const etichettaSingolo = camera === 'deputati' ? 'Deputato' : 'Senatore'

  let licenza = camera === 'deputati' ? 'CC BY-SA 4.0' : 'CC BY 3.0 IT'
  let fonte = camera === 'deputati' ? 'dati.camera.it' : 'dati.senato.it'
  let recuperatoIl: string | null = null
  try {
    const prov = await leggiProvenance()
    const p = camera === 'deputati' ? prov.camera : prov.senato
    if (p?.licenza) licenza = p.licenza
    if (p?.fonte) fonte = p.fonte
    if (p?.recuperatoIl) recuperatoIl = p.recuperatoIl
  } catch {
    // fallback alle licenze reali note
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: membro.nome,
    ...(membro.gruppo ? { memberOf: { '@type': 'Organization', name: membro.gruppo } } : {}),
    ...(membro.urlScheda ? { url: membro.urlScheda } : {}),
    ...(membro.foto ? { image: membro.foto } : {}),
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
              <Link href="/parlamento" className="hover:text-accento dark:hover:text-accento-chiara">
                Parlamento
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={camera === 'deputati' ? '/parlamento/deputati' : '/parlamento/senatori'}
                className="hover:text-accento dark:hover:text-accento-chiara"
              >
                {etichettaCamera}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
              {membro.nome}
            </li>
          </ol>
        </nav>

        <header className="mt-4 flex flex-col gap-5 border-b-2 border-inchiostro pb-6 dark:border-nebbia sm:flex-row sm:items-center">
          {membro.foto ? (
            // Foto ufficiale remota (senato.it): <img> intenzionale, niente
            // ottimizzazione remota in build per non dipendere dalla rete.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={membro.foto}
              alt={`Foto di ${membro.nome}`}
              width={64}
              height={64}
              className="h-16 w-16 shrink-0 border border-regola object-cover dark:border-notte-deep"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-16 w-16 shrink-0 items-center justify-center border border-inchiostro bg-inchiostro font-serif text-lg font-bold text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte"
            >
              {iniziali(membro.nome)}
            </span>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
              {etichettaSingolo} · Legislatura 19
            </p>
            <h1 className="mt-1 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">
              {membro.nome}
            </h1>
            {membro.gruppo ? (
              <p className="mt-1 text-sm font-medium text-inchiostro-soft dark:text-nebbia-soft">
                {membro.gruppo}
              </p>
            ) : (
              <p className="mt-1 text-sm text-inchiostro-faint dark:text-nebbia-faint">
                Gruppo non indicato
              </p>
            )}
            {membro.collegio && (
              <p className="mt-1 text-xs text-inchiostro-soft dark:text-nebbia-soft">
                Collegio: {membro.collegio}
              </p>
            )}
          </div>
        </header>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <section
            aria-labelledby="scheda"
            className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft lg:col-span-2"
          >
            <h2 id="scheda" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              Scheda
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-inchiostro-soft dark:text-nebbia-soft">Camera</dt>
                <dd className="text-right font-semibold text-inchiostro dark:text-nebbia">
                  {camera === 'deputati' ? 'Camera dei deputati' : 'Senato della Repubblica'}
                </dd>
              </div>
              {membro.gruppo && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-inchiostro-soft dark:text-nebbia-soft">Gruppo</dt>
                  <dd className="text-right font-semibold text-inchiostro dark:text-nebbia">
                    <Link
                      href={
                        camera === 'deputati'
                          ? `/parlamento/deputati?gruppo=${encodeURIComponent(membro.gruppo)}`
                          : `/parlamento/senatori?gruppo=${encodeURIComponent(membro.gruppo)}`
                      }
                      className="underline underline-offset-2 hover:text-accento dark:hover:text-accento-chiara"
                    >
                      {membro.gruppo}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
            {membro.urlScheda && (
              <p className="mt-4">
                <a
                  href={membro.urlScheda}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex min-h-[48px] items-center border border-inchiostro px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro transition-colors hover:bg-inchiostro hover:text-carta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte dark:focus-visible:outline-nebbia"
                >
                  Scheda ufficiale ↗
                </a>
              </p>
            )}
          </section>

          <section
            aria-labelledby="fonte-scheda"
            className="border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft"
          >
            <h2 id="fonte-scheda" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              Fonte
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              {fonte} - {licenza} · legislatura 19
              {recuperatoIl ? ` · aggiornato al ${dataIT(recuperatoIl)}` : ''}.
            </p>
          </section>
        </div>

        <p className="mt-10">
          <Link
            href={camera === 'deputati' ? '/parlamento/deputati' : '/parlamento/senatori'}
            className="inline-flex min-h-[48px] items-center gap-2 text-sm font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
          >
            Torna ai {etichettaCamera.toLowerCase()}
          </Link>
        </p>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </main>
      <Footer />
    </>
  )
}
