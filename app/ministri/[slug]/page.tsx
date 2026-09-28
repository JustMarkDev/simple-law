import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import LawCard from '@/components/LawCard'
import Comparsa from '@/components/Comparsa'
import {
  leggiDelMinistro,
  loadLaws,
  loadMinisterBySlug,
  loadMinisters,
} from '@/components/seed-fallback'

interface MinistroProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const ministri = await loadMinisters()
  return ministri.map((minister) => ({ slug: minister.slug }))
}

export async function generateMetadata({ params }: MinistroProps): Promise<Metadata> {
  const { slug } = await params
  const minister = await loadMinisterBySlug(slug)
  if (!minister) return { title: 'Ministro non trovato — Stato della Repubblica' }
  return {
    title: `${minister.nome} — Stato della Repubblica`,
    description: `${minister.dicastero}: competenze e provvedimenti collegati.`,
  }
}

export default async function MinistroPage({ params }: MinistroProps) {
  const { slug } = await params
  const minister = await loadMinisterBySlug(slug)
  if (!minister) notFound()

  const leggi = await loadLaws()
  const collegate = leggiDelMinistro(minister, leggi)

  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <nav aria-label="Percorso" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/" className="hover:text-accento dark:hover:text-accento-chiara">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/ministri" className="hover:text-accento dark:hover:text-accento-chiara">
                Ministri
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
              {minister.nome}
            </li>
          </ol>
        </nav>

        <header className="mt-4 flex flex-col gap-5 border-b-2 border-inchiostro pb-6 dark:border-nebbia sm:flex-row sm:items-center">
          <span
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center border border-inchiostro bg-inchiostro font-serif text-lg font-bold text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte"
          >
            {minister.nome
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase() ?? '')
              .join('')}
          </span>
          <div>
            <h1 className="font-serif text-3xl font-bold text-inchiostro dark:text-nebbia">{minister.nome}</h1>
            <p className="mt-1 text-sm font-medium text-inchiostro-soft dark:text-nebbia-soft">{minister.dicastero}</p>
            {minister.partito && (
              <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                Gruppo politico: {minister.partito}
              </p>
            )}
          </div>
        </header>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <section
            aria-labelledby="competenze"
            className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft lg:col-span-2"
          >
            <h2 id="competenze" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              Competenze
            </h2>
            {minister.competenze.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-2">
                {minister.competenze.map((competenza) => (
                  <li
                    key={competenza}
                    className="bg-carta-deep px-3 py-1.5 text-sm font-medium text-inchiostro-soft dark:bg-notte-deep dark:text-nebbia-soft"
                  >
                    {competenza}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-inchiostro-faint dark:text-nebbia-faint">Competenze non specificate.</p>
            )}
          </section>

          <section aria-labelledby="sintesi" className="border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft">
            <h2 id="sintesi" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
              In breve
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-inchiostro-soft dark:text-nebbia-soft">Dicastero</dt>
                <dd className="text-right font-semibold text-inchiostro dark:text-nebbia">
                  {minister.dicastero.replace(/^Ministero (della |del |delle |dei )?/, '')}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-inchiostro-soft dark:text-nebbia-soft">Provvedimenti in feed</dt>
                <dd className="font-semibold text-inchiostro dark:text-nebbia">{collegate.length}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section aria-labelledby="provvedimenti" className="mt-10">
          <h2
            id="provvedimenti"
            className="border-b border-regola pb-3 font-serif text-lg font-bold text-inchiostro dark:border-notte-deep dark:text-nebbia"
          >
            Provvedimenti collegati
          </h2>
          {collegate.length > 0 ? (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {collegate.map((law, index) => (
                <li key={law.eli} className="flex">
                  <Comparsa className="flex w-full" delay={Math.min(index * 0.05, 0.25)}>
                    <LawCard law={law} headingLevel="h3" />
                  </Comparsa>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 border border-dashed border-regola bg-carta p-6 text-sm text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft">
              Nessun provvedimento collegato presente nel feed.
            </p>
          )}
        </section>

        <div className="mt-10">
          <Link
            href="/ministri"
            className="inline-flex items-center gap-2 text-sm font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m6 6-6-6 6-6" />
            </svg>
            Torna ai ministri
          </Link>
        </div>
      </main>
      <Footer />
    </>
  )
}
