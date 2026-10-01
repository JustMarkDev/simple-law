"use client";

import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTheme } from "next-themes";
import { Moon02Icon, Sun03Icon } from "hugeicons-react";

/**
 * Interruttore chiaro e scuro. Il tema predefinito resta quello di sistema:
 * il toggle scrive una preferenza esplicita solo dopo il primo clic.
 * Bersaglio 48px, azionabile con Invio e Spazio, stato annunciato in italiano.
 */
export default function ToggleTema({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [montato, setMontato] = useState(false);

  useEffect(() => setMontato(true), []);

  const scuro = montato && resolvedTheme === "dark";
  const etichetta = scuro ? "Passa al tema chiaro" : "Passa al tema scuro";
  const stato = scuro ? "Tema scuro attivo" : "Tema chiaro attivo";

  function commuta() {
    setTheme(scuro ? "light" : "dark");
  }

  function allaTastiera(evento: KeyboardEvent<HTMLButtonElement>) {
    if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      commuta();
    }
  }

  return (
    <button
      type="button"
      onClick={commuta}
      onKeyDown={allaTastiera}
      aria-label={etichetta}
      aria-pressed={scuro}
      title={etichetta}
      className={`inline-flex h-12 min-h-[48px] w-12 min-w-[48px] items-center justify-center rounded-xl text-inchiostro-soft transition-colors hover:bg-inchiostro/5 hover:text-inchiostro focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:text-nebbia-soft dark:hover:bg-white/5 dark:hover:text-nebbia dark:focus-visible:outline-accento-chiara ${className}`}
    >
      {scuro ? (
        <Sun03Icon size={18} strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <Moon02Icon size={18} strokeWidth={1.8} aria-hidden="true" />
      )}
      <span className="sr-only" aria-live="polite">
        {stato}
      </span>
    </button>
  );
}
