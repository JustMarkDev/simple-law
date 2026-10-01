import { LinkSquare01Icon } from "hugeicons-react";
import type { Fonti } from "./seed-fallback";
import { FONTI_LABELS } from "@/lib/fonti";

interface FontiListProps {
  fonti: Fonti;
  modalita?: "inline" | "block";
  className?: string;
}

const SOURCES: { key: keyof Fonti; descrizione: string }[] = [
  { key: "normattiva", descrizione: "Il testo della norma, aggiornato" },
  { key: "gazzetta", descrizione: "La prima pubblicazione ufficiale" },
  { key: "governo", descrizione: "Le notizie dal Governo" },
  { key: "camera", descrizione: "I lavori alla Camera" },
  { key: "senato", descrizione: "I lavori al Senato" },
];

const DOMINI_CONSENTITI = [
  "normattiva.it",
  "gazzettaufficiale.it",
  "governo.it",
  "camera.it",
  "senato.it",
];

/** Accetta solo https verso domini ufficiali; blocca javascript:, data: e altri schemi. */
function fonteSicura(url: unknown): boolean {
  if (typeof url !== "string" || url.length === 0 || url.length > 2000) return false;
  const testo = url.trim().toLowerCase();
  if (testo.startsWith("javascript:") || testo.startsWith("data:") || testo.startsWith("vbscript:"))
    return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return DOMINI_CONSENTITI.some(
      (dominio) => parsed.hostname === dominio || parsed.hostname.endsWith(`.${dominio}`),
    );
  } catch {
    return false;
  }
}

/** Elenco dei testi veri di una norma, con icona di link esterno. */
export default function FontiList({ fonti, modalita = "inline", className = "" }: FontiListProps) {
  const disponibili = SOURCES.filter((source) => fonteSicura(fonti[source.key]));

  if (disponibili.length === 0) {
    return (
      <p
        role="status"
        className={`rounded-2xl border border-regola bg-carta-soft p-5 text-sm leading-relaxed text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft sm:p-6 ${className}`}
      >
        Per ora non ci sono link diretti. Cerca numero e anno della norma su Normattiva o in
        Gazzetta Ufficiale.
      </p>
    );
  }

  return (
    <ul className={`flex flex-col gap-1 ${className}`}>
      {disponibili.map((source) => (
        <li key={source.key}>
          <a
            href={fonti[source.key] as string}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex min-h-[48px] items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accento/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento dark:hover:bg-accento-chiara/10 dark:focus-visible:outline-accento-chiara"
          >
            <LinkSquare01Icon
              size={18}
              aria-hidden="true"
              className="mt-0.5 h-[18px] w-[18px] shrink-0 text-inchiostro-faint transition-colors group-hover:text-accento dark:text-nebbia-faint dark:group-hover:text-accento-chiara"
            />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-semibold text-inchiostro underline decoration-regola underline-offset-2 transition-colors group-hover:text-accento group-hover:decoration-accento dark:text-nebbia dark:decoration-notte-deep dark:group-hover:text-accento-chiara dark:group-hover:decoration-accento-chiara">
                {FONTI_LABELS[source.key]}
              </span>
              {modalita === "block" && (
                <span className="block text-xs leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                  {source.descrizione}
                </span>
              )}
              <span className="sr-only"> (si apre in una nuova scheda)</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
