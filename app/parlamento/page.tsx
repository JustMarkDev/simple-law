import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import {
  tuttiDeputati,
  tuttiSenatori,
  contaPerGruppo,
  leggiProvenance,
} from '@/lib/parlamento-dati'

export const metadata: Metadata = {
  title: 'Parlamento - Legislatura 19 - Stato della Repubblica',
  description:
    'Camera e Senato della legislatura 19: 414 deputati, 212 senatori e i gruppi parlamentari, dai dati reali di Camera e Senato.',
}

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

export default async function ParlamentoPage() {
  const [deputati, senatori] = await Promise.all([tuttiDeputati(), tuttiSenatori()])
  const nDep = deputati.length
  const nSen = senatori.length
  let nGruppiCamera = 0
  try {
    nGruppiCamera = (await contaPerGruppo(deputati)).length
  } catch {
    nGruppiCamera = 0
  }

  let provCamera: { recuperatoIl?: string } | null = null
  let provSenato: { recuperatoIl?: string } | null = null
  try {
    const prov = await leggiProvenance()
    provCamera = prov.camera ?? null
    provSenato = prov.senato ?? null
  } catch {
    provCamera = null
    provSenato = null
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
              Parlamento
            </li>
          </ol>
        </nav>

        <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Legislatura 19
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Parlamento - Legislatura 19
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            I membri di Camera e Senato dai dati reali aperti, senza duplicati né stime.
          </p>
          <p className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia" role="status">
            {nDep} deputati · {nSen} senatori · {nGruppiCamera} gruppi Camera
          </p>
        </header>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li className="flex">
            <Link
              href="/parlamento/deputati"
              className="flex min-h-[44px] w-full flex-col gap-2 border border-regola bg-carta p-5 transition-colors hover:border-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:hover:border-nebbia dark:focus-visible:outline-nebbia"
            >
              <span className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
                Deputati
              </span>
              <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
                {nDep} schede della Camera · cerca per nome, filtra per gruppo.
              </span>
              <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-accento dark:text-accento-chiara">
                Sfoglia i deputati →
              </span>
            </Link>
          </li>
          <li className="flex">
            <Link
              href="/parlamento/senatori"
              className="flex min-h-[44px] w-full flex-col gap-2 border border-regola bg-carta p-5 transition-colors hover:border-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:hover:border-nebbia dark:focus-visible:outline-nebbia"
            >
              <span className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
                Senatori
              </span>
              <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
                {nSen} schede del Senato · con foto ufficiale quando disponibile.
              </span>
              <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-accento dark:text-accento-chiara">
                Sfoglia i senatori →
              </span>
            </Link>
          </li>
          <li className="flex">
            <Link
              href="/parlamento/gruppi"
              className="flex min-h-[44px] w-full flex-col gap-2 border border-regola bg-carta p-5 transition-colors hover:border-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:hover:border-nebbia dark:focus-visible:outline-nebbia"
            >
              <span className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
                Gruppi
              </span>
              <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
                {nGruppiCamera} gruppi della Camera · consistenza contata dai dati.
              </span>
              <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-accento dark:text-accento-chiara">
                Vedi i gruppi →
              </span>
            </Link>
          </li>
          <li className="flex">
            <Link
              href="/parlamento/ddl"
              className="flex min-h-[44px] w-full flex-col gap-2 border border-regola bg-carta p-5 transition-colors hover:border-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:hover:border-nebbia dark:focus-visible:outline-nebbia"
            >
              <span className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
                Disegni di legge
              </span>
              <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
                DDL e atti all&apos;esame delle Camere · non sono leggi in vigore.
              </span>
              <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-accento dark:text-accento-chiara">
                Vedi i disegni di legge →
              </span>
            </Link>
          </li>
        </ul>

        {deputati.length > 0 && (
          <section aria-labelledby="esempi-deputati" className="mt-10">
            <h2
              id="esempi-deputati"
              className="border-b border-regola pb-3 font-serif text-lg font-bold text-inchiostro dark:border-notte-deep dark:text-nebbia"
            >
              In evidenza
            </h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {deputati.slice(0, 3).map((d) => (
                <li
                  key={d.slug}
                  className="flex items-center gap-3 border border-regola bg-carta p-4 dark:border-notte-deep dark:bg-notte-soft"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 shrink-0 items-center justify-center border border-inchiostro bg-inchiostro font-serif text-sm font-bold text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte"
                  >
                    {iniziali(d.nome)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-serif text-base font-bold text-inchiostro dark:text-nebbia">
                      <Link
                        href={`/parlamento/deputati/${encodeURIComponent(d.slug)}`}
                        className="hover:text-accento dark:hover:text-accento-chiara"
                      >
                        {d.nome}
                      </Link>
                    </p>
                    {d.gruppo && (
                      <p className="truncate text-xs text-inchiostro-soft dark:text-nebbia-soft">{d.gruppo}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section
          aria-labelledby="fonti-licenze"
          className="mt-10 border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft"
        >
          <h2 id="fonti-licenze" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Fonti e licenze
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Camera: dati.camera.it - CC BY-SA 4.0 · Senato: dati.senato.it - CC BY 3.0 IT · legislatura 19
            {provCamera?.recuperatoIl ? ` · dati Camera aggiornati al ${dataIT(provCamera.recuperatoIl)}` : ''}
            {provSenato?.recuperatoIl ? ` · dati Senato aggiornati al ${dataIT(provSenato.recuperatoIl)}` : ''}.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint">
            Gruppi e foto mostrati solo quando presenti nei dati reali. Nessun collegio disponibile nei dati della
            Camera: la voce è omessa, mai riempita.
          </p>
        </section>
      </main>
      <Footer />
    </>
  )
}
