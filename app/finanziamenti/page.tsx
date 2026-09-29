import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import {
  DISCLAIMER_FINANZIAMENTI,
  leggiProvenanceFinanziamenti,
  LICENZA_FINANZIAMENTI,
  sintesiFinanziamenti,
  tutteErogazioni,
} from '@/lib/finanziamenti-dati'

export const metadata: Metadata = {
  title: 'Finanziamenti ai partiti politici 2024-2026 - Stato della Repubblica',
  description:
    'Erogazioni sopra soglia comunicate alla Camera dei deputati (art. 5 DL 149/2013): solo aggregati per beneficiario e anno, zero nominativi. Non sono leggi in vigore.',
}

function dataIT(iso?: string): string {
  try {
    if (!iso) return 'data non indicata'
    const base = iso.slice(0, 10)
    const d = new Date(`${base}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return base
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return (iso ?? '').slice(0, 10)
  }
}

function euroIT(valore: number): string {
  try {
    if (typeof valore !== 'number' || !Number.isFinite(valore)) return 'importo non indicato'
    return valore.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
  } catch {
    return String(valore)
  }
}

function dataPdfIT(lastModified?: string): string {
  try {
    if (!lastModified) return 'data non indicata'
    const d = new Date(lastModified)
    if (Number.isNaN(d.getTime())) return lastModified
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return lastModified ?? ''
  }
}

export default async function FinanziamentiPage() {
  const [sintesi, provenance, voci] = await Promise.all([
    sintesiFinanziamenti(),
    leggiProvenanceFinanziamenti(),
    tutteErogazioni(),
  ])
  const ordinate = voci.slice().sort((a, b) => b.totale_euro - a.totale_euro)

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
              Finanziamenti ai partiti
            </li>
          </ol>
        </nav>

        <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-sm font-bold text-accento dark:text-accento-chiara">
            Trasparenza · Erogazioni art. 5 DL 149/2013
          </p>
          <h1 className="mt-2 text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Finanziamenti ai partiti politici
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Erogazioni di importo sopra soglia comunicate alla Presidenza della Camera dai partiti
            iscritti nel registro nazionale e da fondazioni, associazioni e comitati collegati.
            Qui solo <strong>aggregati per beneficiario e anno</strong>: nessun nominativo di chi
            ha erogato. <strong>Non sono leggi in vigore</strong> e non sono i bilanci dei partiti.
          </p>
          <p className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia" role="status">
            {sintesi.coppieDisponibili
              ? `${sintesi.coppie} coppie beneficiario×anno pubblicate (le maggiori per totale comunicato${sintesi.anni.length > 0 ? `, anni ${sintesi.anni.join(', ')}` : ''}). L'elenco completo, con migliaia di righe, resta nei PDF ufficiali linkati sotto.`
              : 'Dati in preparazione: il file degli aggregati non è ancora disponibile. Nessun numero stimato qui.'}
          </p>
        </header>

        <section aria-labelledby="titolo-tabella" className="mt-8">
          <h2 id="titolo-tabella" className="text-xl font-bold text-inchiostro dark:text-nebbia">
            Maggiori beneficiari per totale comunicato
          </h2>
          {ordinate.length === 0 ? (
            <p className="mt-3 text-sm text-inchiostro-soft dark:text-nebbia-soft">
              Nessun aggregato disponibile al momento.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  Erogazioni comunicate per beneficiario e anno: numero di comunicazioni e totale in euro
                </caption>
                <thead>
                  <tr className="border-b-2 border-inchiostro dark:border-nebbia">
                    <th scope="col" className="px-3 py-2 text-left font-semibold text-inchiostro dark:text-nebbia">
                      Beneficiario
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">
                      Anno
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">
                      Comunicazioni
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-inchiostro dark:text-nebbia">
                      Totale comunicato
                    </th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold text-inchiostro dark:text-nebbia">
                      Fonte
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ordinate.map((voce) => (
                    <tr
                      key={`${voce.beneficiario}|||${voce.anno}`}
                      className="border-b border-regola dark:border-notte-deep"
                    >
                      <th scope="row" className="px-3 py-2 text-left font-medium text-inchiostro dark:text-nebbia">
                        {voce.beneficiario}
                      </th>
                      <td className="px-3 py-2 text-right tabular-nums text-inchiostro-soft dark:text-nebbia-soft">
                        {voce.anno}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-inchiostro-soft dark:text-nebbia-soft">
                        {voce.n_erogazioni.toLocaleString('it-IT')}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-inchiostro dark:text-nebbia">
                        {euroIT(voce.totale_euro)}
                      </td>
                      <td className="px-3 py-2 text-xs text-inchiostro-soft dark:text-nebbia-soft">
                        <a
                          href={voce.fonte_pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-accento dark:hover:text-accento-chiara"
                        >
                          PDF Camera
                        </a>{' '}
                        (agg. {dataPdfIT(voce.lastModified)})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="titolo-fonti" className="mt-8 border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
          <h2 id="titolo-fonti" className="text-xl font-bold text-inchiostro dark:text-nebbia">
            Fonti e licenza
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            {DISCLAIMER_FINANZIAMENTI}
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-inchiostro-soft dark:text-nebbia-soft">
            <li>
              Elenco ufficiale:{' '}
              <a
                href={provenance.url ?? 'https://parlamento18.camera.it/199'}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-accento dark:hover:text-accento-chiara"
              >
                parlamento18.camera.it/199 - Erogazioni ai partiti politici
              </a>
              {provenance.recuperatoIl ? ` (dati recuperati il ${dataIT(provenance.recuperatoIl)})` : ''}.
            </li>
            <li>
              Contesto:{' '}
              <a
                href={provenance.hub ?? 'https://www.camera.it/leg19/1384'}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-accento dark:hover:text-accento-chiara"
              >
                Camera - Partiti e Gruppi parlamentari
              </a>
              {' · '}
              <a
                href={provenance.relazioni ?? 'https://www.camera.it/leg19/1234'}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-accento dark:hover:text-accento-chiara"
              >
                Controllo dei rendiconti dei partiti politici
              </a>
              .
            </li>
            <li>Fonte dichiarata: {provenance.fonte ?? 'Camera dei deputati'}.</li>
            <li>Licenza: {provenance.licenza ?? LICENZA_FINANZIAMENTI}.</li>
          </ul>
          <p className="mt-3 text-xs text-inchiostro-faint dark:text-nebbia-faint">
            Metodo: una riga pubblicata nei PDF = una comunicazione; i totali sono somme algebriche
            delle righe (incluse quelle a zero o rettificate in negativo), senza giudizi. Le 50 coppie
            mostrate sono le maggiori per totale; il resto è consultabile nei PDF ufficiali.
          </p>
        </section>
      </main>
      <Footer />
    </>
  )
}
