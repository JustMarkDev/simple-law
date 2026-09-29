import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { tuttiDeputati, tuttiSenatori, contaPerGruppo, leggiProvenance } from '@/lib/parlamento-dati'

export const metadata: Metadata = {
  title: 'Gruppi parlamentari - Legislatura 19 - Stato della Repubblica',
  description:
    'I gruppi della Camera con la consistenza contata dai dati e i gruppi correnti del Senato, legislatura 19.',
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

export default async function GruppiPage() {
  const [deputati, senatori] = await Promise.all([tuttiDeputati(), tuttiSenatori()])
  const gruppiCamera = await contaPerGruppo(deputati)
  const gruppiSenato = await contaPerGruppo(senatori)

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

  const ordinatiCamera = [...gruppiCamera].sort((a, b) => b.componenti - a.componenti || a.nome.localeCompare(b.nome, 'it'))
  const ordinatiSenato = [...gruppiSenato].sort((a, b) => b.componenti - a.componenti || a.nome.localeCompare(b.nome, 'it'))

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
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
              Gruppi
            </li>
          </ol>
        </nav>

        <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Legislatura 19
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Gruppi parlamentari
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            La consistenza è contata dai dati reali dei membri, mai da elenchi storici.
          </p>
          <p className="mt-3 flex flex-wrap gap-3 text-sm">
            <a
              href="#camera"
              className="inline-flex min-h-[44px] items-center font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
            >
              Gruppi della Camera
            </a>
            <a
              href="#senato"
              className="inline-flex min-h-[44px] items-center font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
            >
              Gruppi del Senato
            </a>
          </p>
        </header>

        <section aria-labelledby="titolo-camera" id="camera" className="mt-10 scroll-mt-24">
          <h2 id="titolo-camera" className="scroll-mt-24 font-serif text-2xl font-bold text-inchiostro dark:text-nebbia">
            Camera dei deputati
          </h2>
          <p className="mt-1 text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status">
            {ordinatiCamera.length} {ordinatiCamera.length === 1 ? 'gruppo' : 'gruppi'} · {deputati.length} deputati
            totali.
          </p>
          {ordinatiCamera.length > 0 ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {ordinatiCamera.map((g) => (
                <li
                  key={g.nome}
                  className="flex items-center justify-between gap-3 border border-regola bg-carta p-4 dark:border-notte-deep dark:bg-notte-soft"
                >
                  <div className="min-w-0">
                    <p className="font-serif text-base font-bold text-inchiostro dark:text-nebbia">{g.nome}</p>
                    <p className="mt-0.5 text-xs text-inchiostro-soft dark:text-nebbia-soft">
                      {g.componenti} {g.componenti === 1 ? 'componente' : 'componenti'}
                    </p>
                  </div>
                  <Link
                    href={`/parlamento/deputati?gruppo=${encodeURIComponent(g.nome)}`}
                    aria-label={`Vedi i deputati del gruppo ${g.nome}`}
                    className="inline-flex min-h-[44px] shrink-0 items-center border border-inchiostro px-3 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro transition-colors hover:bg-inchiostro hover:text-carta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte dark:focus-visible:outline-nebbia"
                  >
                    Vedi →
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 border border-dashed border-regola bg-carta p-6 text-sm text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft">
              Nessun gruppo disponibile nei dati della Camera.
            </p>
          )}
        </section>

        <section aria-labelledby="titolo-senato" id="senato" className="mt-12 scroll-mt-24">
          <h2 id="titolo-senato" className="scroll-mt-24 font-serif text-2xl font-bold text-inchiostro dark:text-nebbia">
            Senato della Repubblica
          </h2>
          <p className="mt-1 text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status">
            {ordinatiSenato.length} {ordinatiSenato.length === 1 ? 'gruppo corrente' : 'gruppi correnti'} ·{' '}
            {senatori.length} senatori totali.
          </p>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint">
            Nota: l&apos;archivio del Senato conserva 14 denominazioni storiche con date di inizio e fine
            (2022-2024): non sono il conteggio corrente. Qui sotto solo i gruppi correnti, aggregati dai{' '}
            {senatori.length} senatori.
          </p>
          {ordinatiSenato.length > 0 ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {ordinatiSenato.map((g) => (
                <li
                  key={g.nome}
                  className="flex items-center justify-between gap-3 border border-regola bg-carta p-4 dark:border-notte-deep dark:bg-notte-soft"
                >
                  <div className="min-w-0">
                    <p className="font-serif text-base font-bold text-inchiostro dark:text-nebbia">{g.nome}</p>
                    <p className="mt-0.5 text-xs text-inchiostro-soft dark:text-nebbia-soft">
                      {g.componenti} {g.componenti === 1 ? 'componente' : 'componenti'}
                    </p>
                  </div>
                  <Link
                    href={`/parlamento/senatori?gruppo=${encodeURIComponent(g.nome)}`}
                    aria-label={`Vedi i senatori del gruppo ${g.nome}`}
                    className="inline-flex min-h-[44px] shrink-0 items-center border border-inchiostro px-3 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro transition-colors hover:bg-inchiostro hover:text-carta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte dark:focus-visible:outline-nebbia"
                  >
                    Vedi →
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 border border-dashed border-regola bg-carta p-6 text-sm text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft">
              Nessun gruppo disponibile nei dati del Senato.
            </p>
          )}
        </section>

        <section
          aria-labelledby="fonti-gruppi"
          className="mt-10 border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft"
        >
          <h2 id="fonti-gruppi" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Fonti e licenze
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Camera: dati.camera.it - CC BY-SA 4.0 · Senato: dati.senato.it - CC BY 3.0 IT · legislatura 19
            {provCamera?.recuperatoIl ? ` · dati Camera aggiornati al ${dataIT(provCamera.recuperatoIl)}` : ''}
            {provSenato?.recuperatoIl ? ` · dati Senato aggiornati al ${dataIT(provSenato.recuperatoIl)}` : ''}.
          </p>
        </section>
      </main>
      <Footer />
    </>
  )
}
