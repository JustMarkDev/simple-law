import Link from 'next/link'
import { ministerHref, type Minister } from './seed-fallback'

interface MinisterCardProps {
  minister: Minister
}

function initials(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Card di un ministro, con iniziali, dicastero e competenze. */
export default function MinisterCard({ minister }: MinisterCardProps) {
  return (
    <article className="group relative flex h-full flex-col gap-4 border border-regola bg-carta p-5 transition-colors hover:border-inchiostro focus-within:border-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:hover:border-nebbia dark:focus-within:border-nebbia">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center border border-inchiostro bg-inchiostro font-serif text-sm font-bold text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte"
        >
          {initials(minister.nome)}
        </span>
        <div className="min-w-0">
          <h2 className="font-serif text-base font-bold text-inchiostro dark:text-nebbia">
            <Link
              href={ministerHref(minister)}
              className="after:absolute after:inset-0 hover:text-accento focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:hover:text-accento-chiara dark:focus-visible:outline-nebbia"
            >
              {minister.nome}
            </Link>
          </h2>
          <p className="mt-0.5 text-xs leading-snug text-inchiostro-soft dark:text-nebbia-soft">{minister.dicastero}</p>
        </div>
      </div>

      {minister.partito && (
        <p className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
          <span className="font-semibold text-inchiostro-soft dark:text-nebbia-soft">Gruppo politico:</span>{' '}
          {minister.partito}
        </p>
      )}

      {minister.competenze.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`Competenze di ${minister.nome}`}>
          {minister.competenze.map((competenza) => (
            <li
              key={competenza}
              className="bg-carta-deep px-2 py-1 text-[11px] font-medium text-inchiostro-soft dark:bg-notte-deep dark:text-nebbia-soft"
            >
              {competenza}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
