'use client'

import { usePreferiti } from '@/hooks/usePreferiti'

/** Stella preferito (localStorage). z-10 per restare sopra lo stretched-link della card. */
export default function PulsantePreferito({ eli }: { eli: string }) {
  const { has, toggle } = usePreferiti()
  const attivo = has(eli)
  return (
    <button
      type="button"
      onClick={() => toggle(eli)}
      aria-pressed={attivo}
      aria-label={attivo ? 'Rimuovi dai salvati' : 'Salva tra i preferiti'}
      title={attivo ? 'Salvato' : 'Salva'}
      className="relative z-10 border border-regola px-2 py-1 text-xs font-semibold text-inchiostro-soft transition-colors hover:border-inchiostro dark:border-notte-deep dark:text-nebbia-soft dark:hover:border-nebbia"
    >
      <span aria-hidden="true">{attivo ? '★' : '☆'}</span>
    </button>
  )
}
