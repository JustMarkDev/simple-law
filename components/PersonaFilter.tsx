"use client";

import { useId, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Car01Icon, GridIcon, Mortarboard01Icon, Store01Icon, WorkIcon } from "hugeicons-react";
import { PERSONAS } from "./personas";

interface PersonaFilterProps {
  active?: string;
  basePath?: string;
  paramName?: string;
  query?: Record<string, string>;
  label?: string;
  className?: string;
  /** Conteggi per voce, es. { tutti: 120, guida: 12 }. */
  conteggi?: Partial<Record<string, number>>;
}

/**
 * Icone Hugeicons per ogni voce (niente glifi disegnati a mano).
 * `personas.ts` resta l'unica fonte per chiavi ed etichette.
 */
const ICONE: Record<string, typeof GridIcon> = {
  tutti: GridIcon,
  guida: Car01Icon,
  lavoro: WorkIcon,
  impresa: Store01Icon,
  studio: Mortarboard01Icon,
};

/**
 * Scegli chi sei (Tutti / Guida / Lavoro / Impresa / Studio): cambia la lista
 * e aggiorna l'indirizzo così resta condivisibile. Tastiera: frecce, Home, Fine.
 * Parole semplici, bersaglio 48px, angoli arrotondati cozy.
 */
export default function PersonaFilter({
  active = "tutti",
  basePath = "/",
  paramName = "persona",
  query = {},
  label = "Scegli chi sei",
  className = "",
  conteggi,
}: PersonaFilterProps) {
  const router = useRouter();
  const ridotto = useReducedMotion();
  const id = useId();
  const gruppoId = `persona-gruppo-${id}`;
  const [inAttesa, avviaTransizione] = useTransition();
  const riferimenti = useRef<Array<HTMLButtonElement | null>>([]);

  function select(key: string) {
    const params = new URLSearchParams(query);
    if (key === "tutti") {
      params.delete(paramName);
    } else {
      params.set(paramName, key);
    }
    const qs = params.toString();
    avviaTransizione(() => {
      router.push(qs ? `${basePath}?${qs}` : basePath);
    });
  }

  function allaTastiera(e: React.KeyboardEvent) {
    const tasti = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!tasti.includes(e.key)) return;
    e.preventDefault();
    const indice = riferimenti.current.findIndex((el) => el === document.activeElement);
    const totale = PERSONAS.length;
    let prossimo = indice;
    if (e.key === "ArrowRight") prossimo = (indice + 1 + totale) % totale;
    if (e.key === "ArrowLeft") prossimo = (indice - 1 + totale) % totale;
    if (e.key === "Home") prossimo = 0;
    if (e.key === "End") prossimo = totale - 1;
    const bottone = riferimenti.current[prossimo];
    bottone?.focus();
    if (bottone) select(PERSONAS[prossimo].key);
  }

  return (
    <div className={className}>
      <p id={gruppoId} className="mb-1 text-sm font-semibold text-inchiostro dark:text-nebbia">
        {label}
      </p>
      <p className="mb-3 text-sm text-inchiostro-soft dark:text-nebbia-soft">
        Tocca una voce: la lista mostra solo quelle leggi.
      </p>
      <div role="group" aria-labelledby={gruppoId} aria-busy={inAttesa}>
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- roving tabindex handled on the list */}
        <ul className="flex flex-wrap gap-2" onKeyDown={allaTastiera}>
          {PERSONAS.map((persona, indice) => {
            const attiva = active === persona.key;
            const conteggio = conteggi?.[persona.key];
            const etichettaConteggio = typeof conteggio === "number" ? `, ${conteggio} leggi` : "";
            const Icona = ICONE[persona.key] ?? GridIcon;
            return (
              <li key={persona.key}>
                <motion.button
                  ref={(el) => {
                    riferimenti.current[indice] = el;
                  }}
                  type="button"
                  aria-pressed={attiva}
                  disabled={inAttesa}
                  title={`${persona.descrizione} Esempi: ${persona.esempi.join(", ")}.`}
                  onClick={() => select(persona.key)}
                  whileTap={ridotto ? undefined : { scale: 0.97 }}
                  className={
                    attiva
                      ? "relative isolate inline-flex min-h-[48px] min-w-[48px] items-center gap-1.5 rounded-xl border border-accento bg-accento/10 px-4 py-2.5 text-sm font-semibold text-accento transition-colors hover:border-accento hover:bg-accento/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento disabled:opacity-60 dark:border-accento-chiara dark:bg-accento-chiara/10 dark:text-accento-chiara dark:hover:border-accento-chiara dark:hover:bg-accento-chiara/15 dark:focus-visible:outline-accento-chiara"
                      : "relative isolate inline-flex min-h-[48px] min-w-[48px] items-center gap-1.5 rounded-xl border border-regola bg-carta px-4 py-2.5 text-sm font-semibold text-inchiostro-soft transition-colors hover:border-accento hover:text-accento focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento disabled:opacity-60 dark:border-notte-deep dark:bg-notte dark:text-nebbia-soft dark:hover:border-accento-chiara dark:hover:text-accento-chiara dark:focus-visible:outline-accento-chiara"
                  }
                >
                  {attiva && (
                    <motion.span
                      aria-hidden="true"
                      layoutId={ridotto ? undefined : `persona-${id}`}
                      className="absolute inset-0 -z-10 rounded-xl bg-accento/10 dark:bg-accento-chiara/10"
                      transition={{ type: "spring", stiffness: 380, damping: 34 }}
                    />
                  )}
                  <Icona size={16} aria-hidden="true" className="shrink-0" />
                  <span>{persona.label}</span>
                  {typeof conteggio === "number" && (
                    <span
                      aria-label={`${conteggio} leggi per ${persona.label}${attiva ? " (scelta)" : ""}`}
                      className={
                        attiva
                          ? "rounded-lg bg-accento/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-accento dark:bg-accento-chiara/15 dark:text-accento-chiara"
                          : "rounded-lg bg-inchiostro/5 px-2 py-0.5 text-[11px] font-bold tabular-nums text-inchiostro-soft dark:bg-notte-deep dark:text-nebbia-soft"
                      }
                    >
                      {conteggio}
                      <span className="sr-only">{etichettaConteggio}</span>
                    </span>
                  )}
                </motion.button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
