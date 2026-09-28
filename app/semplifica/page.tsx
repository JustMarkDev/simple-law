import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SearchBar from '@/components/SearchBar'
import LawCard from '@/components/LawCard'
import { simplifyLaw } from '@/lib/simplify'
import { loadLawByEli, loadLaws, lawHref } from '@/components/seed-fallback'

export const metadata: Metadata = {
  title: 'Semplifica una norma — Stato della Repubblica',
  description: 'Incolla il testo di una norma oppure confronta due atti: anteprima offline con le 5 caselle.',
}

interface SemplificaProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function str(sp: Record<string, string | string[] | undefined>, nome: string): string {
  const v = sp[nome]
  return typeof v === 'string' ? v : ''
}

/**
 * Strumento di semplificazione: anteprima offline (nessuna scrittura, nessun LLM
 * senza chiave). Supporta `?testo=` + `?titolo=` incollati e `?confronta=eliA,eliB`.
 */
export default async function SemplificaPage({ searchParams }: SemplificaProps) {
  const sp = await searchParams
  const titolo = str(sp, 'titolo').slice(0, 500)
  const testo = str(sp, 'testo').slice(0, 20000)
  const confrontaRaw = str(sp, 'confronta').slice(0, 1000)
  const eliSingolo = str(sp, 'eli').slice(0, 500)

  const haTesto = testo.trim().length >= 20
  const anteprima = haTesto
    ? simplifyLaw({ titolo: titolo || 'Testo incollato', testo })
    : null

  let leggeSingola: Awaited<ReturnType<typeof loadLawByEli>> = undefined
  if (!haTesto && eliSingolo) {
    leggeSingola = (await loadLawByEli(eliSingolo)) ?? undefined
  }

  let confronto: Awaited<ReturnType<typeof loadLaws>> = []
  if (!haTesto && confrontaRaw) {
    const [a, b] = confrontaRaw.split(',').map((s) => s.trim()).filter(Boolean)
    const tutte = await loadLaws()
    const trova = (eli: string) =>
      tutte.find((l) => l.eli.toLowerCase() === eli.toLowerCase()) ??
      tutte.find((l) => l.eli.toLowerCase().endsWith((eli.toLowerCase().split('/').pop() ?? '')))
    const trovate: typeof tutte = []
    if (a) {
      const la = trova(a)
      if (la) trovate.push(la)
    }
    if (b) {
      const lb = trova(b)
      if (lb) trovate.push(lb)
    }
    confronto = trovate
  }

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
              Semplifica
            </li>
          </ol>
        </nav>

        <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Strumento
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Semplifica una norma
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Incolla un testo (minimo 20 caratteri, massimo 20.000) per un&apos;anteprima offline con le 5 caselle,
            oppure confronta due atti dell&apos;archivio. Nessun dato viene salvato.
          </p>
        </header>

        <form method="get" action="/semplifica" className="mt-6 grid gap-3 border border-regola bg-carta-soft p-4 dark:border-notte-deep dark:bg-notte-soft">
          <label htmlFor="titolo" className="text-xs font-semibold uppercase tracking-wide">
            Titolo (facoltativo, max 500)
          </label>
          <input
            id="titolo"
            name="titolo"
            defaultValue={titolo}
            maxLength={500}
            placeholder="Es. Disposizioni in materia di energia"
            className="border border-regola bg-carta px-3 py-2 text-sm dark:border-notte-deep dark:bg-notte"
          />
          <label htmlFor="testo" className="text-xs font-semibold uppercase tracking-wide">
            Testo da semplificare (20–20.000 caratteri)
          </label>
          <textarea
            id="testo"
            name="testo"
            defaultValue={testo}
            rows={6}
            maxLength={20000}
            placeholder="Incolla qui il testo della norma…"
            className="border border-regola bg-carta px-3 py-2 text-sm leading-relaxed dark:border-notte-deep dark:bg-notte"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="bg-inchiostro px-4 py-2 text-xs font-semibold uppercase tracking-wide text-carta hover:bg-inchiostro-soft dark:bg-nebbia dark:text-notte"
            >
              Semplifica
            </button>
            <Link href="/leggi" className="border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide hover:border-inchiostro dark:border-notte-deep">
              Vai all&apos;archivio
            </Link>
          </div>
        </form>

        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Oppure cerca un atto</h2>
          <SearchBar action="/semplifica" query={{}} placeholder="Cerca per parola, poi apri la scheda e confronta" />
          <p className="mt-2 text-xs text-inchiostro-faint dark:text-nebbia-faint">
            Suggerimento confronto: <code>?confronta=eliA,eliB</code> con due ELI separati da virgola.
          </p>
        </div>

        {anteprima ? (
          <section aria-live="polite" className="mt-8 border border-inchiostro p-5 dark:border-nebbia">
            <h2 className="font-serif text-xl font-bold">Anteprima (euristica offline)</h2>
            <p className="mt-2 border-l-2 border-tricolore-rosso bg-carta px-4 py-3 text-sm font-medium">{anteprima.in10Secondi}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {Object.entries(anteprima.perTe).map(([k, v]) => (
                <div key={k} className="border border-regola p-3 text-sm dark:border-notte-deep">
                  <p className="text-xs font-semibold uppercase tracking-wide">{k}</p>
                  <p className="mt-1 text-sm leading-relaxed">{v}</p>
                </div>
              ))}
            </div>
            <h3 className="mt-4 text-sm font-semibold">Cosa fare</h3>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {anteprima.cosaFare.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              <strong>Stato:</strong> {anteprima.statoLavora.colore} — {anteprima.statoLavora.motivo} · Gulpease {anteprima.gulpease}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Pro</h3>
                <ul className="list-disc pl-5 text-sm">
                  {anteprima.proContro.pro.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Contro</h3>
                <ul className="list-disc pl-5 text-sm">
                  {anteprima.proContro.contro.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ) : leggeSingola ? (
          <section className="mt-8">
            <h2 className="font-serif text-xl font-bold">Scheda selezionata</h2>
            <div className="mt-3 max-w-xl">
              <LawCard law={leggeSingola} headingLevel="h3" />
            </div>
            <p className="mt-2 text-sm">
              <Link href={lawHref(leggeSingola)} className="underline underline-offset-4">
                Apri la scheda completa
              </Link>
            </p>
          </section>
        ) : confronto.length > 0 ? (
          <section className="mt-8">
            <h2 className="font-serif text-xl font-bold">Confronto ({confronto.length}/2)</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {confronto.map((law) => (
                <LawCard key={law.eli} law={law} headingLevel="h3" />
              ))}
            </div>
            {confronto.length < 2 && (
              <p className="mt-2 text-sm text-amber-800 dark:text-amber-300" role="alert">
                Trovato solo un atto: verifica gli ELI separati da virgola.
              </p>
            )}
          </section>
        ) : (
          <p className="mt-6 text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status">
            Nessuna anteprima ancora: incolla un testo oppure usa <code>?eli=…</code> / <code>?confronta=…,…</code>.
          </p>
        )}
      </main>
      <Footer />
    </>
  )
}
