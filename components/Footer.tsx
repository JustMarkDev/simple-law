import Link from "next/link";

const LINK = [
  { href: "/leggi", label: "Leggi" },
  { href: "/semplifica", label: "Semplifica" },
  { href: "/salvati", label: "Salvate" },
  { href: "/fonti", label: "Fonti" },
];

const FUOCO =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:focus-visible:outline-accento-chiara";

/** Piè di pagina sobrio, stesso tema della pagina. */
export default function Footer() {
  return (
    <footer className="mx-auto mt-20 w-full max-w-editoriale px-4 pb-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6 border-t border-regola pt-8 dark:border-notte-deep md:flex-row md:items-start md:justify-between">
        <div className="max-w-md">
          <p className="text-base font-semibold text-inchiostro dark:text-nebbia">Simple Law</p>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Spiegazioni e giudizi sono scritti da un’AI e possono sbagliare. Non sono un parere
            legale: il testo che conta è quello ufficiale.
          </p>
        </div>
        <nav aria-label="Piè di pagina">
          <ul className="flex flex-wrap gap-x-1 gap-y-1">
            {LINK.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`inline-flex min-h-[48px] items-center rounded-lg px-3 text-sm text-inchiostro-soft transition-colors hover:text-accento dark:text-nebbia-soft dark:hover:text-accento-chiara ${FUOCO}`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="mt-6 text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint">
        Spiegazioni con licenza CC BY 4.0. I testi di legge restano delle istituzioni.
      </p>
    </footer>
  );
}
