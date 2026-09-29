import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import {
  elencaRegionaliExtra,
  leggiProvenanceRegionaleExtra,
} from '@/lib/regionali-extra-dati'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Regionali Liguria 2024 e Calabria 2025 - Stato della Repubblica',
  description:
    'Elezioni regionali di Liguria (27 ottobre 2024) e Calabria (5 ottobre 2025) con dati ufficiali aggregati del Ministero dell’Interno (DAIT-Eligendo): affluenza e voti per lista, affluenza per comune, senza dati personali.',
}

/* Registro statico (solo id, mai numeri): i totali sono letti dai file. */

interface VoceRegistro {
  id: string
  titolo: string
  descrizione: string
}

const REGISTRO: VoceRegistro[] = [
  {
    id: 'regionali-2024-liguria',
    titolo: 'Elezioni regionali 2024 - Liguria',
    descrizione:
      'Voto del 27 ottobre 2024 in Liguria (data dal nome dello ZIP DAIT): affluenza e voti per lista a livello regionale e affluenza per comune. Solo aggregati, nessun nominativo; i voti del presidente non sono pubblicati come aggregato nel tracciato.',
  },
  {
    id: 'regionali-2025-calabria',
    titolo: 'Elezioni regionali 2025 - Calabria',
    descrizione:
      'Voto del 5 ottobre 2025 in Calabria (data dal nome dello ZIP DAIT): affluenza e voti per lista a livello regionale e affluenza per comune. Solo aggregati, nessun nominativo; i voti del presidente non sono pubblicati come aggregato nel tracciato.',
  },
  {
    id: 'regionali-2025-calabria',
    titolo: 'Elezioni regionali 2025 - Calabria',
    descrizione:
      'Voto del 5 ottobre 2025 in Calabria (data dal nome dello ZIP DAIT): affluenza e voti per lista a livello regionale e affluenza per comune. Solo aggregati, nessun nominativo; i voti del presidente non sono pubblicati come aggregato nel tracciato.',
  },
  {
    id: 'regionali-2024-emilia-romagna',
    titolo: 'Elezioni regionali 2024 - Emilia-Romagna',
    descrizione:
      'Voto del 17 novembre 2024 in Emilia-Romagna (data dal nome dello ZIP DAIT): affluenza e voti per lista a livello regionale e affluenza per comune. Solo aggregati, nessun nominativo.',
  },
]

function intero(value: number): string {
  try {
    return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(
      Number.isFinite(value) ? value : 0,
    )
  } catch {
    return '0'
  }
}

function decimaleIT(value: number): string {
  try {
    return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
      Number.isFinite(value) ? value : 0,
    )
  } catch {
    return '0,0'
  }
}

/**
 * Hub delle regionali-extra (Liguria 2024 + Calabria 2025).
 *
 * Elenca solo le consultazioni con dati reali disponibili: i totali
 * (elettori, votanti, affluenza) sono letti dai file aggregati, mai
 * inventati. Se un file è assente o non valido la card mostra
 * «Dati in preparazione» senza numeri.
 */
export default async function RegionaliExtraPage() {
  let voci: Awaited<ReturnType<typeof elencaRegionaliExtra>> = []
  try {
    voci = await elencaRegionaliExtra()
  } catch {
    voci = []
  }
  let provenance: Awaited<ReturnType<typeof leggiProvenanceRegionaleExtra>> = {}
  try {
    const prima = voci[0]
    provenance = prima ? await leggiProvenanceRegionaleExtra(prima.id) : {}
  } catch {
    provenance = {}
  }

  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <header className="border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Dati ufficiali
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Regionali: Liguria 2024, Emilia-Romagna 2024 e Calabria 2025
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Risultati elettorali da open data del Ministero dell’Interno (DAIT-Eligendo).
            Pubblichiamo <strong>solo aggregati</strong>: affluenza e voti per lista a livello
            regionale, affluenza per comune. Nessun nominativo, nessuna riga candidata.
          </p>
        </header>

        <section aria-labelledby="consultazioni" className="mt-8">
          <h2 id="consultazioni" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Consultazioni disponibili
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {REGISTRO.map((voce) => {
              const dati = voci.find((v) => v.id === voce.id) ?? null
              return (
                <li key={voce.id} className="flex">
                  <article className="flex w-full flex-col border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
                    <p className="inline-flex w-fit items-center border border-regola px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
                      Dati ufficiali DAIT
                    </p>
                    <h3 className="mt-3 font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
                      {voce.titolo}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                      {voce.descrizione}
                    </p>
                    {dati ? (
                      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-inchiostro-soft dark:text-nebbia-soft">
                        <div className="flex gap-2">
                          <dt className="font-semibold text-inchiostro dark:text-nebbia">Affluenza:</dt>
                          <dd>{decimaleIT(dati.affluenza)}%</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="font-semibold text-inchiostro dark:text-nebbia">Elettori:</dt>
                          <dd>{intero(dati.elettori)}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="font-semibold text-inchiostro dark:text-nebbia">Liste:</dt>
                          <dd>{intero(dati.totaleListe)}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="font-semibold text-inchiostro dark:text-nebbia">Comuni:</dt>
                          <dd>{intero(dati.totaleComuni)}</dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="mt-3 text-sm italic text-inchiostro-soft dark:text-nebbia-soft">
                        Dati in preparazione: l’aggregato ufficiale non è ancora pubblicato.
                      </p>
                    )}
                    <p className="mt-4">
                      <Link
                        href={`/regionali-extra/${voce.id}`}
                        className="inline-flex min-h-[44px] items-center bg-accento px-6 font-semibold text-white hover:opacity-90 dark:bg-accento-chiara dark:text-notte"
                      >
                        Vedi i risultati
                      </Link>
                    </p>
                  </article>
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="metodologia" className="mt-10 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
          <h2 id="metodologia" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Metodologia
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            <li>
              Fonte: Ministero dell’Interno, Dipartimento per gli Affari Interni e Territoriali
              (DAIT) - Archivio Eligendo, open data a livello di sezione (Liguria) e comunale
              (Calabria), aggregati a comune.
            </li>
            <li>
              Solo aggregati: elettori, votanti e schede contati una sola volta per sezione o
              comune; voti sommati per lista a livello regionale. Mai righe candidato né
              nominativi; file delle preferenze mai aperti.
            </li>
            <li>
              In Liguria 821 righe senza lista collegata (solo presidente) contano solo per
              l’affluenza. In Calabria la voce «circoscrizione» del tracciato indica l’area
              elettorale (Nord/Centro/Sud), non la provincia.
            </li>
            <li>
              Affluenze e percentuali arrotondate a un decimale; le somme delle percentuali
              possono discostarsi di ±0,1 per arrotondamento. I seggi non sono presenti nei
              file ministeriali e non vengono mai mostrati né stimati.
            </li>
          </ul>
          {provenance.fonte || provenance.url ? (
            <p className="mt-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Fonte: {provenance.fonte ?? 'Ministero dell’Interno DAIT'}
              {provenance.url ? (
                <>
                  {' '}(
                  <a
                    href={provenance.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-accento underline underline-offset-2 hover:text-inchiostro dark:text-accento-chiara dark:hover:text-nebbia"
                  >
                    ZIP ufficiale
                  </a>
                  )
                </>
              ) : null}
              {provenance.licenza ? ` - ${provenance.licenza}.` : '.'}
            </p>
          ) : null}
        </section>
      </main>
      <Footer />
    </>
  )
}
