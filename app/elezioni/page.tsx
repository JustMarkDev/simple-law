import type { Metadata } from 'next'
import Link from 'next/link'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { caricaSondaggi, type SondaggioNazionale } from '@/lib/sondaggi'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Elezioni — Stato della Repubblica',
  description:
    'Consultazioni elettorali con dati ufficiali aggregati del Ministero dell’Interno (DAIT–Eligendo): affluenza e risultati per lista e territorio, senza dati personali. Più una rassegna di sondaggi nazionali sul voto di partito (fonte secondaria Wikipedia, CC BY-SA 4.0).',
}

/* Registro delle consultazioni (solo id statici, mai numeri inventati). */

interface VoceRegistro {
  id: string
  titolo: string
  descrizione: string
  file: string
  tipo: 'liste' | 'referendum'
}

const REGISTRO: VoceRegistro[] = [
  {
    id: 'europee-2024',
    titolo: 'Elezioni europee — 9 giugno 2024',
    descrizione:
      'Affluenza nazionale, voti e percentuali delle liste, dettaglio per regione e affluenza per comune. I seggi non sono disponibili nel file ministeriale.',
    file: path.join('data', 'reali', 'elezioni-europee-2024.json'),
    tipo: 'liste',
  },
  {
    id: 'politiche-2022-camera',
    titolo: 'Elezioni politiche 2022 — Camera dei deputati',
    descrizione:
      'Voto del 25 settembre 2022 per la Camera: affluenza nazionale, liste, circoscrizioni, collegi uninominali e plurinominali, affluenza per comune.',
    file: path.join('data', 'reali', 'elezioni-politiche-2022-camera.json'),
    tipo: 'liste',
  },
  {
    id: 'politiche-2022-senato',
    titolo: 'Elezioni politiche 2022 — Senato della Repubblica',
    descrizione:
      'Voto del 25 settembre 2022 per il Senato: affluenza nazionale, liste, circoscrizioni, collegi uninominali e plurinominali, affluenza per comune.',
    file: path.join('data', 'reali', 'elezioni-politiche-2022-senato.json'),
    tipo: 'liste',
  },
  {
    id: 'referendum-2025',
    titolo: 'Referendum 8-9 giugno 2025 — 5 quesiti',
    descrizione:
      'I 5 quesiti referendari: SI e NO a livello nazionale e regionale, affluenza per comune. Solo aggregati.',
    file: path.join('data', 'reali', 'referendum-2025.json'),
    tipo: 'referendum',
  },
  {
    id: 'regionali-2025-toscana',
    titolo: 'Elezioni regionali 2025 — Toscana',
    descrizione:
      'Voto del 12 ottobre 2025 in Toscana: affluenza e voti per lista a livello regionale e affluenza per comune. Solo aggregati, nessun nominativo; i voti del presidente non sono pubblicati come aggregato nel tracciato.',
    file: path.join('data', 'reali', 'elezioni-regionali-2025-toscana.json'),
    tipo: 'liste',
  },
  {
    id: 'regionali-2024-umbria',
    titolo: 'Elezioni regionali 2024 — Umbria',
    descrizione:
      'Voto del 17 novembre 2024 in Umbria (circoscrizione unica): affluenza e voti per lista a livello regionale e affluenza per comune. Solo aggregati, nessun nominativo; i voti del presidente non sono pubblicati come aggregato nel tracciato.',
    file: path.join('data', 'reali', 'elezioni-regionali-2024-umbria.json'),
    tipo: 'liste',
  },
]

const MAX_BYTE_JSON = 1024 * 1024

interface Sintesi {
  id: string
  elettori: number
  votanti: number
  affluenza: number
  totaleListe: number
  totaleQuesiti: number
}

/** Legge solo i totali nazionali di un file (never-throw, null se assente/invalido). */
async function leggiSintesi(voce: VoceRegistro): Promise<Sintesi | null> {
  try {
    const ass = path.join(process.cwd(), voce.file)
    const stat = await fs.stat(ass)
    if (!stat.isFile() || stat.size > MAX_BYTE_JSON) return null
    const raw = await fs.readFile(ass, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const o = parsed as Record<string, unknown>
    const elezione = o['elezione']
    if (typeof elezione !== 'object' || elezione === null) return null
    const el = elezione as Record<string, unknown>
    const e = el['e']
    const v = el['v']
    const a = el['a']
    if (typeof e !== 'number' || typeof v !== 'number' || typeof a !== 'number') return null
    if (!Number.isFinite(e) || !Number.isFinite(v) || !Number.isFinite(a)) return null
    const liste = Array.isArray(o['liste']) ? o['liste'] : []
    const quesiti = Array.isArray(o['quesiti']) ? o['quesiti'] : []
    return { id: voce.id, elettori: Math.floor(e), votanti: Math.floor(v), affluenza: a, totaleListe: liste.length, totaleQuesiti: quesiti.length }
  } catch {
    return null
  }
}

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

/** Percentuale sondaggio (1 decimale + %) o «—» se assente. Mai numeri inventati. */
function pctSondaggio(value: number | null): string {
  try {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
    return `${new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`
  } catch {
    return '—'
  }
}

const MESI_IT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

/** ISO YYYY-MM-DD -> «28 set 2026», mai lancia, mai inventa (fallback al grezzo). */
function dataIT(iso: string): string {
  try {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
    if (!m) return iso
    const mese = MESI_IT[Number(m[2]) - 1] ?? m[2]
    return `${Number(m[3])} ${mese} ${m[1]}`
  } catch {
    return iso
  }
}

/** Intervallo fieldwork «23–28 set 2026» o giorno singolo. Mai lancia. */
function intervalloFieldwork(s: SondaggioNazionale): string {
  try {
    if (s.fieldwork_da === s.fieldwork_a) return dataIT(s.fieldwork_a)
    const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.fieldwork_da)
    const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.fieldwork_a)
    if (!a || !b) return `${s.fieldwork_da} – ${s.fieldwork_a}`
    if (a[1] === b[1] && a[2] === b[2]) {
      const mese = MESI_IT[Number(b[2]) - 1] ?? b[2]
      return `${Number(a[3])}–${Number(b[3])} ${mese} ${b[1]}`
    }
    return `${dataIT(s.fieldwork_da)} – ${dataIT(s.fieldwork_a)}`
  } catch {
    return s.fieldwork_a
  }
}

const LINK_ESTERNI = [
  { label: 'Eligendo — Ministero dell’Interno', url: 'https://elezionistorico.interno.gov.it/eligendo/opendata.php' },
  { label: 'CISE — Centro Italiano Studi Elettorali', url: 'https://cise.luiss.it/' },
  { label: 'YouTrend — analisi elettorali', url: 'https://www.youtrend.it/' },
]

/**
 * Hub delle consultazioni elettorali.
 *
 * Elenca solo le consultazioni del registro con dati reali disponibili:
 * i totali (elettori, votanti, affluenza) sono letti dai file aggregati
 * committati, mai inventati. Se un file è assente o non valido la card
 * mostra «Dati in preparazione» senza numeri.
 */
export default async function ElezioniPage() {
  let sintesi: Array<Sintesi | null> = []
  try {
    sintesi = await Promise.all(REGISTRO.map((voce) => leggiSintesi(voce)))
  } catch {
    sintesi = REGISTRO.map(() => null)
  }
  let sondaggi: SondaggioNazionale[] = []
  let sondaggiProvenance: { fonte?: string; url?: string; revid?: number; estratto_il?: string; licenza?: string; licenza_url?: string } = {}
  let sondaggiAttribuzione = ''
  try {
    const envelope = await caricaSondaggi()
    if (envelope) {
      sondaggi = envelope.sondaggi
      sondaggiProvenance = envelope.provenance
      sondaggiAttribuzione = envelope.attribuzione
    }
  } catch {
    sondaggi = []
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
            Elezioni
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Risultati elettorali da open data del Ministero dell’Interno (DAIT–Eligendo).
            Pubblichiamo <strong>solo aggregati</strong>: affluenza e voti per lista a livello
            nazionale, regionale e comunale. Nessun nominativo, nessuna riga candidata.
          </p>
        </header>

        <section aria-labelledby="consultazioni" className="mt-8">
          <h2 id="consultazioni" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Consultazioni disponibili
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {REGISTRO.map((voce, indice) => {
              const dati = sintesi[indice] ?? null
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
                          <dt className="font-semibold text-inchiostro dark:text-nebbia">
                            {voce.tipo === 'referendum' ? 'Quesiti:' : 'Liste:'}
                          </dt>
                          <dd>
                            {intero(voce.tipo === 'referendum' ? dati.totaleQuesiti : dati.totaleListe)}
                          </dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="mt-3 text-sm italic text-inchiostro-soft dark:text-nebbia-soft">
                        Dati in preparazione: l’aggregato ufficiale non è ancora pubblicato.
                      </p>
                    )}
                    <p className="mt-4">
                      <Link
                        href={`/elezioni/${voce.id}`}
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

        <section aria-labelledby="sondaggi" className="mt-10">
          <h2 id="sondaggi" className="font-serif text-xl font-bold text-inchiostro dark:text-nebbia">
            Sondaggi nazionali — voto di partito
          </h2>
          <p className="mt-2 inline-flex w-fit items-center border border-regola px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-inchiostro-soft dark:border-notte-deep dark:text-nebbia-soft">
            Sondaggi — non sono voti reali, non sono leggi
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Ultimi {sondaggi.length > 0 ? intero(sondaggi.length) : '—'} sondaggi nazionali sul voto di partito:
            stime degli istituti con margine di errore, mai risultati elettorali e mai seggi.
            Solo sezione «Party vote» nazionale; esclusi gradimenti, primarie, scenari ipotetici
            e aggregatori di secondo livello.
          </p>
          {sondaggi.length > 0 ? (
            <div className="mt-4 overflow-x-auto border border-regola dark:border-notte-deep">
              <table className="w-full min-w-[720px] border-collapse bg-carta text-sm dark:bg-notte-soft">
                <caption className="sr-only">
                  Ultimi sondaggi nazionali sul voto di partito con istituto, periodo di rilevazione, campione e percentuali dei principali partiti
                </caption>
                <thead>
                  <tr className="border-b border-regola text-left dark:border-notte-deep">
                    <th scope="col" className="px-3 py-2 font-semibold text-inchiostro dark:text-nebbia">Istituto</th>
                    <th scope="col" className="px-3 py-2 font-semibold text-inchiostro dark:text-nebbia">Rilevazione</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">Campione</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">FdI</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">PD</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">M5S</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">Lega</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">FI</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">Vantaggio</th>
                    <th scope="col" className="px-3 py-2 font-semibold text-inchiostro dark:text-nebbia">Fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {sondaggi.map((s, i) => (
                    <tr key={`${s.istituto}-${s.fieldwork_a}-${i}`} className="border-b border-regola last:border-0 dark:border-notte-deep">
                      <td className="px-3 py-2 font-medium text-inchiostro dark:text-nebbia">{s.istituto}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-inchiostro-soft dark:text-nebbia-soft">{intervalloFieldwork(s)}</td>
                      <td className="px-3 py-2 text-right text-inchiostro-soft dark:text-nebbia-soft">
                        {typeof s.campione_n === 'number' ? intero(s.campione_n) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">{pctSondaggio(s.fdi)}</td>
                      <td className="px-3 py-2 text-right text-inchiostro-soft dark:text-nebbia-soft">{pctSondaggio(s.pd)}</td>
                      <td className="px-3 py-2 text-right text-inchiostro-soft dark:text-nebbia-soft">{pctSondaggio(s.m5s)}</td>
                      <td className="px-3 py-2 text-right text-inchiostro-soft dark:text-nebbia-soft">{pctSondaggio(s.lega)}</td>
                      <td className="px-3 py-2 text-right text-inchiostro-soft dark:text-nebbia-soft">{pctSondaggio(s.fi)}</td>
                      <td className="px-3 py-2 text-right text-inchiostro-soft dark:text-nebbia-soft">{pctSondaggio(s.lead)}</td>
                      <td className="px-3 py-2">
                        <a
                          href={s.url_fonte}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Fonte originaria del sondaggio ${s.istituto} del ${intervalloFieldwork(s)} (si apre in una nuova scheda)`}
                          className="inline-flex min-h-[44px] items-center font-medium text-accento underline underline-offset-2 hover:text-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:text-accento-chiara dark:hover:text-nebbia dark:focus-visible:outline-nebbia"
                        >
                          Istituto
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm italic text-inchiostro-soft dark:text-nebbia-soft">
              Dati in preparazione: la rassegna sondaggi non è ancora pubblicata.
            </p>
          )}
          <div className="mt-4 border border-regola bg-carta p-5 text-sm leading-relaxed text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft">
            <p>
              Fonte secondaria:{' '}
              {sondaggiProvenance.url ? (
                <a
                  href={sondaggiProvenance.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accento underline underline-offset-2 hover:text-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:text-accento-chiara dark:hover:text-nebbia dark:focus-visible:outline-nebbia"
                >
                  Wikipedia — «Opinion polling for the next Italian general election»
                </a>
              ) : (
                'Wikipedia — «Opinion polling for the next Italian general election»'
              )}
              {typeof sondaggiProvenance.revid === 'number' ? ` (revid ${sondaggiProvenance.revid}` : ''}
              {sondaggiProvenance.estratto_il ? `, estratto il ${dataIT(sondaggiProvenance.estratto_il)}` : ''}
              {typeof sondaggiProvenance.revid === 'number' ? ')' : ''}. Licenza:{' '}
              {sondaggiProvenance.licenza_url ? (
                <a
                  href={sondaggiProvenance.licenza_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accento underline underline-offset-2 hover:text-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:text-accento-chiara dark:hover:text-nebbia dark:focus-visible:outline-nebbia"
                >
                  {sondaggiProvenance.licenza ?? 'CC BY-SA 4.0'}
                </a>
              ) : (
                (sondaggiProvenance.licenza ?? 'CC BY-SA 4.0')
              )}
              , con attribuzione agli istituti (colonna Fonte).
            </p>
            {sondaggiAttribuzione ? <p className="mt-2">{sondaggiAttribuzione}</p> : null}
          </div>
        </section>

        <section aria-labelledby="metodologia" className="mt-10 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
          <h2 id="metodologia" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Metodologia
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            <li>
              Fonte: Ministero dell’Interno, Dipartimento per gli Affari Interni e Territoriali
              (DAIT) — Archivio Eligendo, open data a livello comunale.
            </li>
            <li>
              Solo aggregati: elettori, votanti, schede bianche una volta per
              comune; voti sommati per lista a livello nazionale e regionale. Mai righe
              candidato né nominativi.
            </li>
            <li>
              Affluenze e percentuali arrotondate a un decimale; le somme delle percentuali
              possono discostarsi di ±0,1 per arrotondamento.
            </li>
            <li>
              I seggi non sono presenti nei file ministeriali e non vengono mai mostrati né stimati.
            </li>
          </ul>
        </section>

        <section aria-labelledby="licenze" className="mt-6 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
          <h2 id="licenze" className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
            Licenze e riuso
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Dati di fonte ministeriale (DAIT–Eligendo), riuso open-data da confermare sul
            catalogo ufficiale: la pagina «info open data» non riporta una stringa di licenza
            machine-readable (es. CC-BY). Fanno fede i verbali dei seggi e le proclamazioni
            ufficiali. I testi di questo sito restano rilasciati con licenza{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/deed.it"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
            >
              CC BY 4.0
            </a>
            .
          </p>
          <nav aria-label="Collegamenti esterni elettorali" className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-inchiostro-faint dark:text-nebbia-faint">
              Fonti e analisi esterne
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {LINK_ESTERNI.map((link) => (
                <li key={link.url} className="flex min-h-[44px] items-center">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-accento underline underline-offset-2 hover:text-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:text-accento-chiara dark:hover:text-nebbia dark:focus-visible:outline-nebbia"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </section>
      </main>
      <Footer />
    </>
  )
}
