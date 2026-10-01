"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Cancel01Icon, Menu01Icon } from "hugeicons-react";
import ToggleTema from "./ToggleTema";

/** Navigazione: solo lo strumento leggi. Le altre sezioni restano raggiungibili per URL. */
const NAV_PRINCIPALE = [
  { href: "/leggi", label: "Leggi" },
  { href: "/semplifica", label: "Semplifica" },
  { href: "/salvati", label: "Salvate" },
];

function isAttiva(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ID_MENU_MOBILE = "menu-mobile-pannello";

const FUOCO_LINK =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:focus-visible:outline-accento-chiara";

/** Menu mobile accessibile: bottone + dialogo con focus-trap, ESC, click fuori e ritorno del focus. */
function MenuMobile({ pathname }: { pathname: string }) {
  const [aperto, setAperto] = useState(false);
  const riferimentoBottone = useRef<HTMLButtonElement | null>(null);
  const riferimentoPannello = useRef<HTMLDivElement | null>(null);
  const riferimentoPrimoCollegamento = useRef<HTMLAnchorElement | null>(null);
  const eraAperto = useRef(false);

  // Chiudi il menu a ogni cambio di pagina.
  useEffect(() => {
    setAperto(false);
  }, [pathname]);

  // Porta il focus sul primo collegamento all'apertura e restituiscilo al bottone alla chiusura.
  useEffect(() => {
    if (aperto) {
      eraAperto.current = true;
      const primo =
        riferimentoPrimoCollegamento.current ?? riferimentoPannello.current?.querySelector("a");
      if (primo instanceof HTMLElement) {
        primo.focus();
      }
    } else if (eraAperto.current) {
      eraAperto.current = false;
      riferimentoBottone.current?.focus();
    }
  }, [aperto]);

  // ESC per chiudere, trap circolare del TAB, click fuori per chiudere.
  useEffect(() => {
    if (!aperto) return;

    function gestisciTastiera(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        setAperto(false);
        return;
      }
      if (evento.key !== "Tab") return;
      const pannello = riferimentoPannello.current;
      if (!pannello) return;
      const elementi = Array.from(
        pannello.querySelectorAll("a[href], button:not([disabled])"),
      ).filter((elemento) => elemento instanceof HTMLElement) as HTMLElement[];
      if (elementi.length === 0) {
        evento.preventDefault();
        return;
      }
      const primo = elementi[0];
      const ultimo = elementi[elementi.length - 1];
      if (evento.shiftKey && document.activeElement === primo) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primo.focus();
      }
    }

    function gestisciClickFuori(evento: MouseEvent | TouchEvent) {
      const bersaglio = evento.target as Node | null;
      if (!bersaglio) return;
      if (riferimentoPannello.current?.contains(bersaglio)) return;
      if (riferimentoBottone.current?.contains(bersaglio)) return;
      setAperto(false);
    }

    document.addEventListener("keydown", gestisciTastiera);
    document.addEventListener("mousedown", gestisciClickFuori);
    document.addEventListener("touchstart", gestisciClickFuori);
    return () => {
      document.removeEventListener("keydown", gestisciTastiera);
      document.removeEventListener("mousedown", gestisciClickFuori);
      document.removeEventListener("touchstart", gestisciClickFuori);
    };
  }, [aperto]);

  return (
    <div className="relative md:hidden">
      <button
        ref={riferimentoBottone}
        type="button"
        aria-expanded={aperto}
        aria-controls={ID_MENU_MOBILE}
        aria-haspopup="dialog"
        aria-label={aperto ? "Chiudi il menu" : "Apri il menu"}
        onClick={() => setAperto((valore) => !valore)}
        className={`flex min-h-[48px] cursor-pointer items-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold text-inchiostro-soft transition-colors hover:bg-inchiostro/5 hover:text-inchiostro dark:text-nebbia-soft dark:hover:bg-white/5 dark:hover:text-nebbia ${FUOCO_LINK}`}
      >
        {aperto ? (
          <Cancel01Icon size={20} aria-hidden="true" className="h-5 w-5" />
        ) : (
          <Menu01Icon size={20} aria-hidden="true" className="h-5 w-5" />
        )}
        Menu
      </button>
      {aperto && (
        <div
          ref={riferimentoPannello}
          role="dialog"
          aria-modal="false"
          aria-label="Navigazione principale"
          id={ID_MENU_MOBILE}
          className="vetro vetro-foto absolute right-0 z-50 mt-3 max-h-[70vh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto p-2"
        >
          <ul className="flex flex-col gap-0.5">
            {NAV_PRINCIPALE.map((voce, indice) => {
              const attiva = isAttiva(pathname, voce.href);
              return (
                <li key={voce.href}>
                  <Link
                    ref={indice === 0 ? riferimentoPrimoCollegamento : undefined}
                    href={voce.href}
                    aria-current={attiva ? "page" : undefined}
                    onClick={() => setAperto(false)}
                    className={`block min-h-[48px] rounded-xl px-4 py-3 text-sm font-medium transition-colors ${FUOCO_LINK} ${
                      attiva
                        ? "bg-accento/10 font-semibold text-accento dark:bg-notte-deep dark:text-accento-chiara"
                        : "text-inchiostro-soft hover:bg-carta-deep/70 hover:text-inchiostro dark:text-nebbia-soft dark:hover:bg-notte-deep/70 dark:hover:text-nebbia"
                    }`}
                  >
                    {voce.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Testata a riga singola in vetro liquido (.vetro in app/globals.css), 64px. */
export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:min-h-[48px] focus:items-center focus:rounded-xl focus:border focus:border-inchiostro focus:bg-inchiostro focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-carta dark:focus:border-nebbia dark:focus:bg-nebbia dark:focus:text-notte"
      >
        Salta al contenuto
      </a>

      <div className="vetro mx-auto flex h-16 w-full max-w-editoriale flex-nowrap items-center gap-2 px-3 sm:px-4">
        <Link
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
          className={`group flex min-h-[48px] min-w-0 shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-2 py-2 ${FUOCO_LINK}`}
        >
          <span className="text-lg font-semibold leading-none tracking-tight text-inchiostro dark:text-nebbia">
            Simple Law
          </span>
        </Link>

        <nav aria-label="Navigazione principale" className="hidden min-w-0 flex-1 md:block">
          <ul className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
            {NAV_PRINCIPALE.map((item) => {
              const attiva = isAttiva(pathname, item.href);
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={attiva ? "page" : undefined}
                    className={`flex min-h-[48px] items-center whitespace-nowrap rounded-xl px-2.5 py-3 text-sm font-semibold transition-colors lg:px-3 ${FUOCO_LINK} ${
                      attiva
                        ? "bg-accento/10 text-accento dark:bg-notte-deep dark:text-accento-chiara"
                        : "text-inchiostro-soft hover:bg-carta-deep/70 hover:text-inchiostro dark:text-nebbia-soft dark:hover:bg-notte-deep/70 dark:hover:text-nebbia"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 md:ml-2">
          <ToggleTema />
          <MenuMobile pathname={pathname} />
        </div>
      </div>
    </header>
  );
}
