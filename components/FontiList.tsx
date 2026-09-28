import type { Fonti } from './seed-fallback'
import { FONTI_LABELS } from '@/lib/fonti'

interface FontiListProps {
  fonti: Fonti
  modalita?: 'inline' | 'block'
  className?: string
}

const SOURCES: { key: keyof Fonti; descrizione: string }[] = [
  { key: 'normattiva', descrizione: 'Testo consolidato della norma' },
  { key: 'gazzetta', descrizione: 'Pubblicazione ufficiale' },
  { key: 'governo', descrizione: 'Archivio dei comunicati del Consiglio dei ministri' },
  { key: 'camera', descrizione: 'Lavori e dossier parlamentari' },
  { key: 'senato', descrizione: 'Lavori e dossier parlamentari' },
]

/** Elenco delle fonti ufficiali di una norma, con link esterni accessibili. */
export default function FontiList({ fonti, modalita = 'inline', className = '' }: FontiListProps) {
  const disponibili = SOURCES.filter((source) => Boolean(fonti[source.key]))

  if (disponibili.length === 0) {
    return (
      <p className={`text-sm text-slate-500 dark:text-notte-400 ${className}`}>
        Fonti ufficiali non ancora collegate per questa scheda.
      </p>
    )
  }

  return (
    <ul className={`space-y-2 ${className}`}>
      {disponibili.map((source) => (
        <li key={source.key}>
          <a
            href={fonti[source.key]}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-start gap-2 rounded-lg px-2 py-1.5 -mx-2 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:hover:bg-notte-800 dark:focus-visible:outline-accento"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 group-hover:text-brand-600 dark:text-notte-500 dark:group-hover:text-accento" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 4h6m0 0v6m0-6L10 14m-4-6H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" />
            </svg>
            <span className="min-w-0">
              <span className="text-sm font-semibold text-slate-800 underline decoration-slate-300 underline-offset-2 group-hover:decoration-brand-500 dark:text-notte-100 dark:decoration-notte-700 dark:group-hover:decoration-accento">
                {FONTI_LABELS[source.key]}
              </span>
              {modalita === 'block' && (
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-notte-400">{source.descrizione}</span>
              )}
              <span className="sr-only"> (si apre in una nuova scheda)</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}
