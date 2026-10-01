import Link from "next/link";
import { ministerHref, type Minister } from "./seed-fallback";

interface MinisterCardProps {
  minister: Minister;
}

function initials(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Card di un ministro, con iniziali, dicastero e competenze. */
export default function MinisterCard({ minister }: MinisterCardProps) {
  return (
    <article className="group relative flex h-full flex-col gap-4 rounded-2xl border border-regola bg-carta p-5 shadow-cozy transition-all duration-200 hover:-translate-y-0.5 hover:border-accento hover:shadow-cozy-lg focus-within:border-accento dark:border-notte-deep dark:bg-notte-soft dark:hover:border-accento-chiara sm:p-6">
      <div className="flex items-baseline gap-3">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-inchiostro bg-inchiostro font-sans text-sm font-bold text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte"
        >
          {initials(minister.nome)}
        </span>
        <div className="min-w-0">
          <h2 className="font-sans text-base font-bold leading-snug text-inchiostro dark:text-nebbia">
            <Link
              href={ministerHref(minister)}
              className="after:absolute after:inset-0 after:rounded-2xl hover:text-accento focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento dark:hover:text-accento-chiara dark:focus-visible:outline-accento-chiara"
            >
              {minister.nome}
            </Link>
          </h2>
          <p className="mt-1 text-sm leading-snug text-inchiostro-soft dark:text-nebbia-soft">
            {minister.dicastero}
          </p>
        </div>
      </div>

      {minister.partito && (
        <p className="text-sm text-inchiostro-faint dark:text-nebbia-faint">
          <span className="font-semibold text-inchiostro-soft dark:text-nebbia-soft">
            Gruppo politico:
          </span>{" "}
          {minister.partito}
        </p>
      )}

      {minister.competenze.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`Competenze di ${minister.nome}`}>
          {minister.competenze.map((competenza) => (
            <li
              key={competenza}
              className="rounded-lg bg-carta-deep px-2.5 py-1 text-xs font-semibold text-inchiostro-soft dark:bg-notte-deep dark:text-nebbia-soft"
            >
              {competenza}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
