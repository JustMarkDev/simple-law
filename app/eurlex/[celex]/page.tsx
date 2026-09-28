import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import {
  etichettaTipo,
  leggiProvenanceEurlex,
  notaApplicabilita,
  trovaAttoUe,
  tuttiAttiUe,
} from '@/lib/eurlex-dati'

interface DettaglioProps {
  params: Promise<{ celex: string }>
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

/* ---------------------------------------------------------------------------
 * Recepimento in Italia (solo dati reali da data/reali/eurlex-recepimenti.json,
 * mai deduzioni). Loader never-throw: file assente o invalido → null.
 * ------------------------------------------------------------------------- */

interface AttoIT {
  titoloNim: string
  tipoNim: string
  ojData: string
  chiaveNormattiva?: string
  eliNormattiva?: string
}

interface RigaRecepimento {
  celexDirettiva: string
  termineUE?: string
  haNimITA: 'sì' | 'no'
  numNimTot: number
  attiIT: AttoIT[]
  nota: string
}

const PERCORSO_RECEPIMENTI = path.join(process.cwd(), 'data', 'reali', 'eurlex-recepimenti.json')

function stringaBreve(value: unknown, max: number): string {
  try {
    return typeof value === 'string' ? value.trim().slice(0, max) : ''
  } catch {
    return ''
  }
}

async function leggiRecepimento(celex: string): Promise<RigaRecepimento | null> {
  try {
    const chiave = (celex ?? '').trim().toUpperCase()
    if (!/^3\d{4}L\d{1,4}$/.test(chiave)) return null
    const stat = await fs.stat(PERCORSO_RECEPIMENTI)
    if (!stat.isFile() || stat.size > 50 * 1024) return null
    const raw = await fs.readFile(PERCORSO_RECEPIMENTI, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    const o0 = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>
    const righe: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(o0['righe'])
        ? (o0['righe'] as unknown[])
        : Array.isArray(o0['direttive'])
          ? (o0['direttive'] as unknown[])
          : []
    for (const voce of righe) {
      try {
        if (typeof voce !== 'object' || voce === null) continue
        const o = voce as Record<string, unknown>
        const celexRiga = stringaBreve(o['celexDirettiva'], 16).toUpperCase()
        if (celexRiga !== chiave) continue
        const haNim = stringaBreve(o['haNimITA'], 4).toLowerCase()
        const numRaw = o['numNimTot']
        const attiRaw = Array.isArray(o['attiIT'])
          ? (o['attiIT'] as unknown[])
          : Array.isArray(o['atti'])
            ? (o['atti'] as unknown[])
            : []
        const attiIT: AttoIT[] = []
        for (const a of attiRaw.slice(0, 50)) {
          try {
            if (typeof a !== 'object' || a === null) continue
            const ao = a as Record<string, unknown>
            const titoloNim = stringaBreve(ao['titoloNim'], 500)
            if (!titoloNim) continue
            attiIT.push({
              titoloNim,
              tipoNim: stringaBreve(ao['tipoNim'], 80),
              ojData: stringaBreve(ao['ojData'], 16),
              chiaveNormattiva: stringaBreve(ao['chiaveNormattiva'], 200) || undefined,
              eliNormattiva: stringaBreve(ao['eliNormattiva'], 200) || undefined,
            })
          } catch {
            continue
          }
        }
        return {
          celexDirettiva: chiave,
          termineUE: stringaBreve(o['termineUE'], 16) || undefined,
          haNimITA: haNim === 'sì' || haNim === 'si' ? 'sì' : 'no',
          numNimTot: typeof numRaw === 'number' && Number.isFinite(numRaw) && numRaw >= 0 ? Math.floor(numRaw) : attiIT.length,
          attiIT,
          nota: stringaBreve(o['nota'], 300),
        }
      } catch {
        continue
      }
    }
    return null
  } catch {
    return null
  }
}

/** Href interno /leggi solo da ELI/chiave osservati (mai URL inventati). */
function hrefLegge(atto: AttoIT): string | null {
  try {
    for (const campo of [atto.eliNormattiva, atto.chiaveNormattiva]) {
      const percorso = (campo ?? '').replace(/^\/+/, '').trim()
      if (percorso && !/\s/.test(percorso) && !/^[a-z]+:/i.test(percorso)) return `/leggi/${percorso}`
    }
    return null
  } catch {
    return null
  }
}

export async function generateStaticParams(): Promise<{ celex: string }[]> {
  try {
    const atti = await tuttiAttiUe()
    return atti.map((a) => ({ celex: a.celex }))
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: DettaglioProps): Promise<Metadata> {
  const base: Metadata = {
    title: 'Atto UE — Stato della Repubblica',
    description: 'Scheda di un atto UE 2026 dai dati ufficiali EUR-Lex CELLAR, con link al testo ufficiale.',
  }
  try {
    const { celex } = await params
    const atto = await trovaAttoUe(celex)
    if (!atto) return base
    return {
      title: `${atto.celex} — ${etichettaTipo(atto.tipo)} — Stato della Repubblica`,
      description: `Scheda ${atto.celex} (${etichettaTipo(atto.tipo)}, ${dataIT(atto.data)}): metadati ufficiali CELLAR e link al testo su EUR-Lex.`,
    }
  } catch {
    return base
  }
}

export default async function AttoUePage({ params }: DettaglioProps) {
  const { celex } = await params
  const [atto, provenance] = await Promise.all([trovaAttoUe(celex), leggiProvenanceEurlex()])
  if (!atto) notFound()

  const eDirettiva = atto.tipo === 'DIR' || atto.tipo === 'DIR_IMPL' || atto.tipo === 'DIR_DEL'
  const recepimento = eDirettiva ? await leggiRecepimento(atto.celex) : null

  const vigenza =
    atto.inVigore === true
      ? 'In vigore secondo CELLAR'
      : atto.inVigore === false
        ? 'Non in vigore secondo CELLAR'
        : 'Vigenza non indicata da CELLAR'

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
              <Link href="/eurlex" className="hover:text-accento dark:hover:text-accento-chiara">
                Diritto UE
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
              {atto.celex}
            </li>
          </ol>
        </nav>

        <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="flex flex-wrap gap-2">
            <span className="inline-flex items-center border border-inchiostro px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-inchiostro dark:border-nebbia dark:text-nebbia">
              {etichettaTipo(atto.tipo)}
            </span>
            <span className="inline-flex items-center border border-regola px-2 py-1 text-[11px] uppercase tracking-wide text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
              {notaApplicabilita(atto.tipo)}
            </span>
          </p>
          <h1 className="mt-3 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            {atto.celex}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            {atto.titolo}
          </p>
          <p className="mt-2 text-xs text-inchiostro-faint dark:text-nebbia-faint">
            Titolo in inglese così come pubblicato da CELLAR (fase-1). Non è una legge italiana.
          </p>
        </header>

        <dl className="mt-6 grid gap-3 border border-regola bg-carta p-5 text-sm dark:border-notte-deep dark:bg-notte-soft sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-inchiostro-faint dark:text-nebbia-faint">Numero CELEX</dt>
            <dd className="mt-1 font-medium text-inchiostro dark:text-nebbia">{atto.celex}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-inchiostro-faint dark:text-nebbia-faint">Tipo di atto</dt>
            <dd className="mt-1 text-inchiostro dark:text-nebbia">{etichettaTipo(atto.tipo)} ({atto.tipo})</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-inchiostro-faint dark:text-nebbia-faint">Data del documento</dt>
            <dd className="mt-1 text-inchiostro dark:text-nebbia">{dataIT(atto.data)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-inchiostro-faint dark:text-nebbia-faint">Vigenza</dt>
            <dd className="mt-1 text-inchiostro dark:text-nebbia">{vigenza}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-inchiostro-faint dark:text-nebbia-faint">Entrata in vigore</dt>
            <dd className="mt-1 text-inchiostro dark:text-nebbia">{dataIT(atto.entrataInVigore)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-inchiostro-faint dark:text-nebbia-faint">Fine di validità</dt>
            <dd className="mt-1 text-inchiostro dark:text-nebbia">{dataIT(atto.fineValidita)}</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={atto.eurlexUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-[44px] items-center border border-inchiostro bg-inchiostro px-5 py-2 text-xs font-semibold uppercase tracking-wide text-carta hover:bg-inchiostro-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-nebbia dark:bg-nebbia dark:text-notte dark:hover:bg-nebbia-soft dark:focus-visible:outline-nebbia"
          >
            Testo su EUR-Lex ↗
          </a>
          <a
            href={atto.eli}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-[44px] items-center border border-regola px-5 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro hover:border-inchiostro dark:border-notte-deep dark:text-nebbia dark:hover:border-nebbia"
          >
            Identificativo ELI ↗
          </a>
        </div>

        {eDirettiva && (
        <section
          aria-labelledby="recepimento"
          className="mt-10 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
        >
          <h2 id="recepimento" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Recepimento in Italia
          </h2>
          {recepimento ? (
            <>
              <dl className="mt-3 space-y-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-semibold text-inchiostro dark:text-nebbia">Termine UE di recepimento:</dt>
                  <dd>{recepimento.termineUE ? dataIT(recepimento.termineUE) : 'non rilevato'}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-semibold text-inchiostro dark:text-nebbia">Nel corpus italiano:</dt>
                  <dd>
                    {recepimento.attiIT.length > 0
                      ? `trovati ${recepimento.attiIT.length} ${recepimento.attiIT.length === 1 ? 'atto' : 'atti'}`
                      : `nessun atto trovato${recepimento.termineUE ? ` (termine: ${dataIT(recepimento.termineUE)})` : ''}`}
                  </dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-semibold text-inchiostro dark:text-nebbia">Notifiche NTM UE:</dt>
                  <dd>
                    {recepimento.numNimTot} (notifiche degli Stati membri, non leggi italiane
                    {recepimento.haNimITA === 'sì' ? '; Italia presente' : '; nessuna notifica italiana'})
                  </dd>
                </div>
              </dl>
              {recepimento.attiIT.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {recepimento.attiIT.map((a, i) => {
                    const href = hrefLegge(a)
                    return (
                      <li key={`${a.titoloNim}-${i}`} className="border-t border-regola pt-3 text-sm dark:border-notte-deep">
                        {href ? (
                          <Link href={href} className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara">
                            {a.titoloNim}
                          </Link>
                        ) : (
                          <span className="font-semibold text-inchiostro dark:text-nebbia">{a.titoloNim}</span>
                        )}
                        <span className="mt-1 block text-xs text-inchiostro-soft dark:text-nebbia-soft">
                          {[a.tipoNim, a.ojData ? `GU ${a.ojData}` : ''].filter(Boolean).join(' · ') || 'estremi non rilevati'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                  Nessun recepimento rilevato nei dati: nel corpus italiano non risulta alcun atto collegato a questa direttiva.
                </p>
              )}
              {recepimento.nota && (
                <p className="mt-3 text-xs text-inchiostro-faint dark:text-nebbia-faint">{recepimento.nota}</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Nessun recepimento rilevato nei dati: nel corpus italiano non risulta alcun atto collegato a questa direttiva.
            </p>
          )}
        </section>
        )}

        <section
          aria-labelledby="fonti-licenze"
          className="mt-10 border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft"
        >
          <h2 id="fonti-licenze" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Fonte e licenza
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Fonte: {provenance.fonte ?? 'EUR-Lex CELLAR SPARQL'} — licenza{' '}
            {provenance.licenza ?? 'riuso con attribuzione Dec.2011/833/UE'}
            {provenance.recuperatoIl ? ` · dati aggiornati al ${dataIT(provenance.recuperatoIl.slice(0, 10))}` : ''}.
            Fa fede il testo ufficiale su EUR-Lex.
          </p>
        </section>
      </main>
      <Footer />
    </>
  )
}
