import Link from 'next/link'
import Disclaimer from './Disclaimer'

const COLONNE = [
  {
    titolo: 'Esplora',
    links: [
      { href: '/', label: 'Home' },
      { href: '/leggi', label: 'Tutte le leggi' },
      { href: '/ministri', label: 'Ministri' },
      { href: '/semplifica', label: 'Semplifica una norma' },
    ],
  },
  {
    titolo: 'Strumenti',
    links: [
      { href: '/salvati', label: 'I tuoi salvati' },
      { href: '/statistiche', label: 'Statistiche del corpus' },
      { href: '/fonti', label: 'Fonti ufficiali' },
      { href: '/metodologia', label: 'Metodologia' },
    ],
  },
]

const VERSIONE = 'v1.0 — feed dimostrativo'

/** Piè di pagina: esplorazione, fonti, metodologia, limiti e versione. */
export default function Footer() {
  const anno = new Date().getFullYear()

  return (
    <footer className="mt-16 border-t border-regola bg-carta-soft dark:border-notte-deep dark:bg-notte-soft">
      <div className="riga-tricolore" aria-hidden="true">
        <span className="bg-tricolore-verde" />
        <span className="bg-tricolore-bianco" />
        <span className="bg-tricolore-rosso" />
      </div>
      <div className="mx-auto w-full max-w-editoriale px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="font-serif text-lg font-bold text-inchiostro dark:text-nebbia">Stato della Repubblica</p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Un progetto civico che spiega le norme italiane in modo semplice. Frasi brevi, fonti ufficiali e un
              semaforo per capire subito se una legge funziona già.
            </p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              <span className="font-semibold text-inchiostro dark:text-nebbia">Fonti:</span> Normattiva, Gazzetta
              Ufficiale, Camera dei deputati e Senato della Repubblica.{' '}
              <Link
                href="/fonti"
                className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
              >
                Vedi tutte le fonti
              </Link>
              .
            </p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              <span className="font-semibold text-inchiostro dark:text-nebbia">Limiti:</span> le schede sono
              dimostrative e non sostituiscono il testo ufficiale né una consulenza legale. Verifica sempre la norma
              vigente sulle fonti ufficiali.{' '}
              <Link
                href="/metodologia"
                className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
              >
                Come lavoriamo
              </Link>
              .
            </p>
            <p className="mt-4 text-xs leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Contenuti rilasciati con licenza{' '}
              <a
                href="https://creativecommons.org/licenses/by/4.0/deed.it"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-inchiostro-soft underline decoration-regola underline-offset-2 hover:text-accento dark:text-nebbia-soft dark:decoration-notte-deep dark:hover:text-accento-chiara"
              >
                Creative Commons Attribuzione 4.0 (CC BY 4.0)
              </a>
              . Cita la fonte quando riusi i testi.
            </p>
          </div>

          {COLONNE.map((colonna) => (
            <nav key={colonna.titolo} aria-label={colonna.titolo}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-inchiostro dark:text-nebbia">
                {colonna.titolo}
              </h2>
              <ul className="mt-4 space-y-1">
                {colonna.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-[44px] items-center text-sm text-inchiostro-soft transition-colors hover:text-accento focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:text-nebbia-soft dark:hover:text-accento-chiara dark:focus-visible:outline-nebbia"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10">
          <Disclaimer variant="banner" />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-regola pt-6 dark:border-notte-deep">
          <p className="text-xs text-inchiostro-soft dark:text-nebbia-soft">
            © {anno} Stato della Repubblica — progetto informativo indipendente, non affiliato alla pubblica
            amministrazione.
          </p>
          <p className="text-xs text-inchiostro-soft dark:text-nebbia-soft">
            {VERSIONE} · <Link href="/metodologia" className="underline underline-offset-2 hover:text-accento dark:hover:text-accento-chiara">Metodologia</Link> ·{' '}
            <Link href="/fonti" className="underline underline-offset-2 hover:text-accento dark:hover:text-accento-chiara">Fonti</Link>
          </p>
        </div>
      </div>
    </footer>
  )
}
