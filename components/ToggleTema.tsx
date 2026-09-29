'use client'

import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTheme } from 'next-themes'

function IconaSole() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  )
}

function IconaLuna() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  )
}

/**
 * Interruttore chiaro e scuro. Il tema predefinito resta quello di sistema:
 * il toggle scrive una preferenza esplicita solo dopo il primo clic.
 * Bersaglio 48px, azionabile con Invio e Spazio, stato annunciato in italiano.
 */
export default function ToggleTema({ className = '' }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [montato, setMontato] = useState(false)

  useEffect(() => setMontato(true), [])

  const scuro = montato && resolvedTheme === 'dark'
  const etichetta = scuro ? 'Passa al tema chiaro' : 'Passa al tema scuro'
  const stato = scuro ? 'Tema scuro attivo' : 'Tema chiaro attivo'

  function commuta() {
    setTheme(scuro ? 'light' : 'dark')
  }

  function allaTastiera(evento: KeyboardEvent<HTMLButtonElement>) {
    if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault()
      commuta()
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
      className={`inline-flex h-12 min-h-[48px] w-12 min-w-[48px] items-center justify-center rounded-xl border border-regola bg-transparent text-inchiostro-soft transition-colors hover:border-accento hover:text-accento focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:border-notte-deep dark:text-nebbia-soft dark:hover:border-accento-chiara dark:hover:text-accento-chiara dark:focus-visible:outline-accento-chiara ${className}`}
    >
      {scuro ? <IconaSole /> : <IconaLuna />}
      <span className="sr-only" aria-live="polite">{stato}</span>
    </button>
  )
}
