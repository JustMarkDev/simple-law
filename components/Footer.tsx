import Link from 'next/link';
import Disclaimer from './Disclaimer';

const NORME = [
  { href: '/leggi', label: 'Leggi' },
  { href: '/gazzetta', label: 'Gazzetta' },
  { href: '/eurlex', label: 'Diritto UE' },
  { href: '/semplifica', label: 'Semplifica' },
];

const ISTITUZIONI = [
  { href: '/parlamento', label: 'Parlamento' },
  { href: '/ministri', label: 'Ministri' },
  { href: '/quirinale', label: 'Quirinale' },
  { href: '/consulta', label: 'Consulta' },
];

const SERVIZIO = [
  { href: '/statistiche', label: 'Statistiche' },
  { href: '/fonti', label: 'Fonti' },
  { href: '/metodologia', label: 'Metodo' },
  { href: '/salvati', label: 'Salvate' },
];

const LINK_FOCUS =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white';

const LINK_BASE = 'inline-flex min-h-[48px] items-center rounded-lg px-2 text-sm transition-colors';

const LINK_COLOR = 'text-white/85 hover:text-white hover:underline underline-offset-4';

/**
 * Pie di pagina editoriale a tutto schermo.
 * Unico blocco colore della pagina (eccezione "color block" documentata:
 * il footer chiude con un blu notte dusk, tutto il resto resta caldo).
 * Cielo dusk in puro CSS (gradiente onesto, niente foto remote, niente
 * tracking di terze parti, contrasto AA garantito su fondo solido).
 */
export default function Footer() {
  const anno = new Date().getFullYear();

  return (
    <footer className="relative mt-16 overflow-hidden rounded-t-2xl bg-[#1a2456] text-white dark:bg-[#1a2456]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, #27336e 0%, #1a2456 45%, #121a44 100%)',
        }}
      />
      <div className="relative mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 lg:px-8">
        <div className="border-b border-white/15 pb-8">
          <p className="font-sans text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Simple Law
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/80">
            Le leggi italiane spiegate con parole semplici, con i testi ufficiali sempre a portata
            di mano.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-white/70">
            © {anno} Simple Law. Progetto informativo indipendente.
          </p>
        </div>

        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          <nav aria-label="Norme">
            <h2 className="text-sm font-semibold text-white">Norme</h2>
            <ul className="mt-2 space-y-1">
              {NORME.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={`${LINK_BASE} ${LINK_COLOR} ${LINK_FOCUS}`}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Istituzioni">
            <h2 className="text-sm font-semibold text-white">Istituzioni</h2>
            <ul className="mt-2 space-y-1">
              {ISTITUZIONI.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={`${LINK_BASE} ${LINK_COLOR} ${LINK_FOCUS}`}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Servizio">
            <h2 className="text-sm font-semibold text-white">Servizio</h2>
            <ul className="mt-2 space-y-1">
              {SERVIZIO.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={`${LINK_BASE} ${LINK_COLOR} ${LINK_FOCUS}`}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-8">
          <Disclaimer variant="banner" />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-6">
          <p className="text-xs leading-relaxed text-white/70">
            Spiegazioni nostre con licenza CC BY 4.0. I testi ufficiali restano delle istituzioni.
          </p>
          <p className="text-xs text-white/70">
            <Link
              href="/fonti"
              className={`underline underline-offset-2 hover:text-white ${LINK_FOCUS}`}
            >
              Fonti
            </Link>
            {' e '}
            <Link
              href="/metodologia"
              className={`underline underline-offset-2 hover:text-white ${LINK_FOCUS}`}
            >
              Metodologia
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
