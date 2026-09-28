import Link from 'next/link'
import Disclaimer from './Disclaimer'

const ESPLORA = [
  { href: '/leggi', label: 'Leggi' },
  { href: '/parlamento', label: 'Parlamento' },
  { href: '/gazzetta', label: 'Gazzetta' },
  { href: '/eurlex', label: 'Diritto UE' },
  { href: '/statistiche', label: 'Statistiche' },
]

const SERVIZIO = [
  { href: '/', label: 'Home' },
  { href: '/semplifica', label: 'Semplifica una norma' },
  { href: '/salvati', label: 'I tuoi salvati' },
  { href: '/fonti', label: 'Fonti' },
  { href: '/metodologia', label: 'Metodologia' },
]

/** Solo domini ufficiali ammessi (cfr. lib/sources.ts DOMINI_FONTUANTE_AMMESSI). */
const FONTI_UFFICIALI = [
  { href: 'https://www.normattiva.it', label: 'Normattiva' },
  { href: 'https://www.gazzettaufficiale.it', label: 'Gazzetta Ufficiale' },
  { href: 'https://www.camera.it', label: 'Camera dei deputati' },
  { href: 'https://www.senato.it', label: 'Senato della Repubblica' },
  { href: 'https://www.governo.it/it/archivio-consiglio-dei-ministri', label: 'Archivio Consiglio dei ministri' },
  { href: 'https://eur-lex.europa.eu', label: 'EUR-Lex' },
  { href: 'https://www.quirinale.it', label: 'Quirinale' },
  { href: 'https://www.cortecostituzionale.it', label: 'Corte costituzionale' },
]

const VERSIONE = 'v1.0 — feed dimostrativo'

const LINK_FOCUS =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:focus-visible:outline-accento-chiara'

/** Piè di pagina istituzionale: navigazione densa, fonti ufficiali verificate, licenze, limiti onesti. */
export default function Footer() {
  const anno = new Date().getFullYear()

  return (
    <footer className="mt-16 border-t border-regola bg-carta-soft dark:border-notte-deep dark:bg-notte-soft">
      <div className="riga-tricolore" aria-hidden="true">
        <span className="bg-tricolore-verde" />
        <span className="bg-tricolore-bianco" />
        <span className="bg-tricolore-rosso" />
      </div>
      <div className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <p className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">Stato della Repubblica</p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Un progetto civico che spiega le norme italiane in modo semplice. Frasi brevi, fonti ufficiali e un
              semaforo per capire subito se una legge funziona già.
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              <span className="font-semibold text-inchiostro dark:text-nebbia">Limiti:</span> le schede sono
              dimostrative e non sostituiscono il testo ufficiale né una consulenza legale. Verifica sempre la norma
              vigente sulle fonti ufficiali.{' '}
              <Link
                href="/metodologia"
                className={`font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara ${LINK_FOCUS}`}
              >
                Come lavoriamo
              </Link>
              .
            </p>
            <p className="mt-3 text-xs leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Testi originali del progetto rilasciati con licenza{' '}
              <a
                href="https://creativecommons.org/licenses/by/4.0/deed.it"
                target="_blank"
                rel="noopener noreferrer"
                className={`font-medium underline decoration-regola underline-offset-2 hover:text-accento dark:decoration-notte-deep dark:hover:text-accento-chiara ${LINK_FOCUS}`}
              >
                Creative Commons Attribuzione 4.0 (CC BY 4.0)
              </a>
              . I testi ufficiali delle norme restano delle rispettive istituzioni: riusali citando sempre la fonte
              ufficiale.
            </p>
          </div>

          <nav aria-label="Esplora">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-inchiostro dark:text-nebbia">
              Esplora
            </h2>
            <ul className="mt-3 space-y-0.5">
              {ESPLORA.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`inline-flex min-h-[44px] items-center text-sm text-inchiostro-soft transition-colors hover:text-accento dark:text-nebbia-soft dark:hover:text-accento-chiara ${LINK_FOCUS}`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Servizio">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-inchiostro dark:text-nebbia">
              Servizio
            </h2>
            <ul className="mt-3 space-y-0.5">
              {SERVIZIO.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`inline-flex min-h-[44px] items-center text-sm text-inchiostro-soft transition-colors hover:text-accento dark:text-nebbia-soft dark:hover:text-accento-chiara ${LINK_FOCUS}`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Fonti ufficiali">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-inchiostro dark:text-nebbia">
              Fonti ufficiali
            </h2>
            <ul className="mt-3 space-y-0.5">
              {FONTI_UFFICIALI.map((fonte) => (
                <li key={fonte.href}>
                  <a
                    href={fonte.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex min-h-[44px] items-center gap-1 text-sm text-inchiostro-soft transition-colors hover:text-accento dark:text-nebbia-soft dark:hover:text-accento-chiara ${LINK_FOCUS}`}
                  >
                    {fonte.label}
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h7v7M13 3 7.5 8.5M5 5v8h8" />
                    </svg>
                    <span className="sr-only">(si apre in una nuova scheda)</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              <Link
                href="/fonti"
                className={`font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara ${LINK_FOCUS}`}
              >
                Vedi tutte le fonti
              </Link>
            </p>
          </nav>
        </div>

        <div className="mt-8">
          <Disclaimer variant="banner" />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-regola pt-6 dark:border-notte-deep">
          <p className="text-xs text-inchiostro-soft dark:text-nebbia-soft">
            © {anno} Stato della Repubblica — progetto informativo indipendente, non affiliato alla pubblica
            amministrazione.
          </p>
          <p className="text-xs text-inchiostro-soft dark:text-nebbia-soft">
            {VERSIONE} · <Link href="/metodologia" className={`underline underline-offset-2 hover:text-accento dark:hover:text-accento-chiara ${LINK_FOCUS}`}>Metodologia</Link> ·{' '}
            <Link href="/fonti" className={`underline underline-offset-2 hover:text-accento dark:hover:text-accento-chiara ${LINK_FOCUS}`}>Fonti</Link>
          </p>
        </div>
      </div>
    </footer>
  )
}
