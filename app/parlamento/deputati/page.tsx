import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import {
  tuttiDeputati,
  contaPerGruppo,
  filtraPerGruppo,
  cercaMembri,
  pagina,
  leggiProvenance,
  type Membro,
} from '@/lib/parlamento-dati'

interface DeputatiProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const PER_OPZIONI = [12, 24] as const
const PER_DEFAULT = 24

function str(sp: Record<string, string | string[] | undefined>, nome: string): string {
  const v = sp[nome]
  return typeof v === 'string' ? v : ''
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

function hrefSenza(query: Record<string, string>, chiave: string): string {
  const params = new URLSearchParams(query)
  params.delete(chiave)
  params.delete('page')
  const qs = params.toString()
  return qs ? `/parlamento/deputati?${qs}` : '/parlamento/deputati'
}

export async function generateMetadata({ searchParams }: DeputatiProps): Promise<Metadata> {
  const base: Metadata = {
    title: 'Deputati - Legislatura 19 - Stato della Repubblica',
    description: 'I 414 deputati della Camera, legislatura 19: cerca per nome o filtra per gruppo.',
  }
  try {
    const sp = await searchParams
    const q = str(sp, 'q').slice(0, 100)
    const gruppo = str(sp, 'gruppo').slice(0, 120)
    const base2 = await tuttiDeputati()
    let filtrati = base2
    const nomiGruppi = new Set((await contaPerGruppo(base2)).map((g) => g.nome))
    const gruppoValido = gruppo && nomiGruppi.has(gruppo) ? gruppo : ''
    if (gruppoValido) filtrati = await filtraPerGruppo(filtrati, gruppoValido)
    const qValida = q.trim().length >= 2 ? q.trim() : ''
    if (qValida) filtrati = await cercaMembri(filtrati, qValida)
    const pezzi: string[] = []
    if (qValida) pezzi.push(`“${qValida}”`)
    if (gruppoValido) pezzi.push(gruppoValido)
    const dettaglio = pezzi.length > 0 ? ` - ${pezzi.join(' · ')}` : ''
    return {
      title: `Deputati (${filtrati.length})${dettaglio} - Stato della Repubblica`,
      description: `Archivio di ${filtrati.length} deputati della legislatura 19${dettaglio}.`,
    }
  } catch {
    return base
  }
}

function SchedaDeputato({ membro }: { membro: Membro }) {
  return (
    <article className="group relative flex h-full flex-col gap-3 border border-regola bg-carta p-5 transition-colors hover:border-accento focus-within:border-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:hover:border-nebbia dark:focus-within:border-nebbia">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center border border-inchiostro bg-inchiostro text-sm font-bold text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte"
        >
          {iniziali(membro.nome)}
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-inchiostro dark:text-nebbia">
            <Link
              href={`/parlamento/deputati/${encodeURIComponent(membro.slug)}`}
              className="after:absolute after:inset-0 hover:text-accento focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:hover:text-accento-chiara dark:focus-visible:outline-nebbia"
            >
              {membro.nome}
            </Link>
          </h3>
          {membro.gruppo ? (
            <p className="mt-0.5 truncate text-xs leading-snug text-inchiostro-soft dark:text-nebbia-soft">
              {membro.gruppo}
            </p>
          ) : (
            <p className="mt-0.5 text-xs leading-snug text-inchiostro-faint dark:text-nebbia-faint">
              Gruppo non indicato
            </p>
          )}
        </div>
      </div>
      {membro.collegio && (
        <p className="text-xs text-inchiostro-soft dark:text-nebbia-soft">
          <span className="font-semibold">Collegio:</span> {membro.collegio}
        </p>
      )}
      {membro.urlScheda && (
        <p className="mt-auto pt-1 text-xs">
          <a
            href={membro.urlScheda}
            target="_blank"
            rel="noopener"
            className="relative z-10 inline-flex min-h-[48px] items-center font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
          >
            Scheda ufficiale ↗
          </a>
        </p>
      )}
    </article>
  )
}

export default async function DeputatiPage({ searchParams }: DeputatiProps) {
  const sp = await searchParams
  const qGrezza = str(sp, 'q').slice(0, 100)
  const q = qGrezza.trim().length >= 2 ? qGrezza.trim() : ''
  const gruppoParam = str(sp, 'gruppo').slice(0, 120)
  const perRaw = Math.floor(Number(str(sp, 'per'))) || PER_DEFAULT
  const per = (PER_OPZIONI as readonly number[]).includes(perRaw) ? (perRaw as 12 | 24) : PER_DEFAULT
  const pageRaw = Math.floor(Number(str(sp, 'page'))) || 1
  const pageRichiesta = Math.max(1, pageRaw)

  const tutti = await tuttiDeputati()
  const gruppi = await contaPerGruppo(tutti)
  const nomiGruppi = new Set(gruppi.map((g) => g.nome))
  const gruppo = gruppoParam && nomiGruppi.has(gruppoParam) ? gruppoParam : ''

  let filtrati: Membro[] = tutti
  if (gruppo) filtrati = await filtraPerGruppo(filtrati, gruppo)
  if (q) filtrati = await cercaMembri(filtrati, q)

  const totale = filtrati.length
  const totPagine = Math.max(1, Math.ceil(totale / per))
  const page = Math.min(pageRichiesta, totPagine)
  const risultati = await pagina(filtrati, page, per)

  let provCamera: { recuperatoIl?: string } | null = null
  try {
    provCamera = (await leggiProvenance()).camera ?? null
  } catch {
    provCamera = null
  }

  const queryBase: Record<string, string> = {}
  if (qGrezza.trim()) queryBase.q = qGrezza.trim().slice(0, 100)
  if (gruppo) queryBase.gruppo = gruppo
  if (per !== PER_DEFAULT) queryBase.per = String(per)

  const filtriAttivi: { chiave: string; etichetta: string }[] = []
  if (q) filtriAttivi.push({ chiave: 'q', etichetta: `Ricerca: ${q}` })
  if (gruppo) filtriAttivi.push({ chiave: 'gruppo', etichetta: `Gruppo: ${gruppo}` })
  if (per !== PER_DEFAULT) filtriAttivi.push({ chiave: 'per', etichetta: `Per pagina: ${per}` })

  function hrefPagina(p: number): string {
    const params = new URLSearchParams(queryBase)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `/parlamento/deputati?${qs}` : '/parlamento/deputati'
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
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
              Deputati
            </li>
          </ol>
        </nav>

        <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-sm font-bold text-accento dark:text-accento-chiara">
            Camera · Legislatura 19
          </p>
          <h1 className="mt-2 text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Deputati
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Cerca per nome (minimo 2 caratteri) oppure filtra per gruppo parlamentare.
          </p>
        </header>

        <form
          method="get"
          action="/parlamento/deputati"
          className="mt-6 grid gap-3 border border-regola bg-carta-soft p-4 dark:border-notte-deep dark:bg-notte-soft sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <div>
            <label
              htmlFor="q-deputati"
              className="mb-1 block text-xs font-semibold text-inchiostro-soft dark:text-nebbia-soft"
            >
              Cerca per nome
            </label>
            <input
              id="q-deputati"
              name="q"
              type="search"
              defaultValue={qGrezza}
              maxLength={100}
              placeholder="Es. AIELLO"
              autoComplete="off"
              className="campo text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="gruppo-deputati"
              className="mb-1 block text-xs font-semibold text-inchiostro-soft dark:text-nebbia-soft"
            >
              Gruppo
            </label>
            <select
              id="gruppo-deputati"
              name="gruppo"
              defaultValue={gruppo}
              className="campo text-sm"
            >
              <option value="">Tutti i gruppi</option>
              {gruppi.map((g) => (
                <option key={g.nome} value={g.nome}>
                  {g.nome} ({g.componenti})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="per-deputati"
              className="mb-1 block text-xs font-semibold text-inchiostro-soft dark:text-nebbia-soft"
            >
              Per pagina
            </label>
            <select
              id="per-deputati"
              name="per"
              defaultValue={String(per)}
              className="campo text-sm"
            >
              <option value="12">12</option>
              <option value="24">24</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="btn-primario"
            >
              Filtra
            </button>
          </div>
        </form>

        <p className="mt-6 text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status" aria-live="polite">
          {totale} {totale === 1 ? 'deputato trovato' : 'deputati trovati'}
          {q ? ` per “${q}”` : ''}
          {gruppo ? ` · gruppo: ${gruppo}` : ''} · pagina {page} di {totPagine}.
        </p>

        {filtriAttivi.length > 0 && (
          <ul aria-label="Filtri attivi" className="mt-3 flex flex-wrap gap-2">
            {filtriAttivi.map((f) => (
              <li key={f.chiave}>
                <Link
                  href={hrefSenza(queryBase, f.chiave)}
                  aria-label={`Rimuovi il filtro ${f.etichetta}`}
                  className="inline-flex min-h-[48px] items-center gap-1 border border-regola bg-carta-soft px-3 py-2 text-xs font-medium text-inchiostro-soft hover:border-accento hover:text-accento dark:border-notte-deep dark:bg-notte dark:text-nebbia-soft dark:hover:border-accento-chiara dark:hover:text-accento-chiara"
                >
                  {f.etichetta} <span aria-hidden="true">×</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {risultati.length > 0 ? (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {risultati.map((m) => (
              <li key={m.slug} className="flex">
                <SchedaDeputato membro={m} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 border border-dashed border-regola bg-carta p-8 text-center dark:border-notte-deep dark:bg-notte-soft">
            <p className="text-sm font-medium text-inchiostro dark:text-nebbia">
              Nessun deputato trovato con questi filtri.
            </p>
            <p className="mt-6">
              <Link
                href="/parlamento/deputati"
                className="inline-flex min-h-[48px] items-center bg-inchiostro px-5 py-2 text-xs font-semibold text-carta hover:bg-inchiostro-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:bg-nebbia dark:text-notte dark:hover:bg-nebbia-soft dark:focus-visible:outline-nebbia"
              >
                Rimuovi filtri
              </Link>
            </p>
          </div>
        )}

        {totPagine > 1 && (
          <nav aria-label="Paginazione deputati" className="mt-8 flex flex-wrap items-center gap-3">
            {page > 1 ? (
              <Link
                href={hrefPagina(page - 1)}
                className="inline-flex min-h-[48px] items-center border border-inchiostro px-4 py-2 text-xs font-semibold text-inchiostro hover:bg-inchiostro hover:text-carta dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte"
              >
                ← Precedente
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex min-h-[48px] cursor-not-allowed items-center border border-regola px-4 py-2 text-xs font-semibold text-inchiostro-faint dark:border-notte-deep dark:text-nebbia-faint"
              >
                ← Precedente
              </span>
            )}
            <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
              Pagina {page} di {totPagine}
            </span>
            {page < totPagine ? (
              <Link
                href={hrefPagina(page + 1)}
                className="inline-flex min-h-[48px] items-center border border-inchiostro px-4 py-2 text-xs font-semibold text-inchiostro hover:bg-inchiostro hover:text-carta dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte"
              >
                Successiva →
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex min-h-[48px] cursor-not-allowed items-center border border-regola px-4 py-2 text-xs font-semibold text-inchiostro-faint dark:border-notte-deep dark:text-nebbia-faint"
              >
                Successiva →
              </span>
            )}
          </nav>
        )}

        <p className="mt-10 border-t border-regola pt-4 text-xs leading-relaxed text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
          Camera: dati.camera.it - CC BY-SA 4.0 · legislatura 19
          {provCamera?.recuperatoIl ? ` · aggiornati al ${dataIT(provCamera.recuperatoIl)}` : ''}.
        </p>
      </main>
      <Footer />
    </>
  )
}
