'use client'

import { useId, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'motion/react'
import { PERSONAS } from './personas'

interface PersonaFilterProps {
  active?: string
  basePath?: string
  paramName?: string
  query?: Record<string, string>
  label?: string
  className?: string
  /** Conteggi per pill, es. { tutti: 120, guida: 12 }. */
  conteggi?: Partial<Record<string, number>>
}

/**
 * Filtro per persona (Tutti / Guida / Lavoro / Impresa / Studio) con
 * indicatore animato che scivola tra le opzioni. Aggiorna i parametri
 * dell'URL così il filtro resta condivisibile. Tastiera: frecce, Home, Fine.
 */
export default function PersonaFilter({
  active = 'tutti',
  basePath = '/',
  paramName = 'persona',
  query = {},
  label = 'Filtra le leggi per persona',
  className = '',
  conteggi,
}: PersonaFilterProps) {
  const router = useRouter()
  const ridotto = useReducedMotion()
  const id = useId()
  const gruppoId = `persona-gruppo-${id}`
  const [inAttesa, avviaTransizione] = useTransition()
  const riferimenti = useRef<Array<HTMLButtonElement | null>>([])

  function select(key: string) {
    const params = new URLSearchParams(query)
    if (key === 'tutti') {
      params.delete(paramName)
    } else {
      params.set(paramName, key)
    }
    const qs = params.toString()
    avviaTransizione(() => {
      router.push(qs ? `${basePath}?${qs}` : basePath)
    })
  }

  function allaTastiera(e: React.KeyboardEvent) {
    const tasti = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
    if (!tasti.includes(e.key)) return
    e.preventDefault()
    const indice = riferimenti.current.findIndex((el) => el === document.activeElement)
    const totale = PERSONAS.length
    let prossimo = indice
    if (e.key === 'ArrowRight') prossimo = (indice + 1 + totale) % totale
    if (e.key === 'ArrowLeft') prossimo = (indice - 1 + totale) % totale
    if (e.key === 'Home') prossimo = 0
    if (e.key === 'End') prossimo = totale - 1
    const bottone = riferimenti.current[prossimo]
    bottone?.focus()
    if (bottone) select(PERSONAS[prossimo].key)
  }

  return (
    <div className={className}>
      <p id={gruppoId} className="mb-2 text-sm font-semibold text-inchiostro dark:text-nebbia">
        {label}
      </p>
      <div role="group" aria-labelledby={gruppoId} aria-busy={inAttesa}>
        <ul className="flex flex-wrap gap-2" onKeyDown={allaTastiera}>
          {PERSONAS.map((persona, indice) => {
            const attiva = active === persona.key
            const conteggio = conteggi?.[persona.key]
            const etichettaConteggio =
              typeof conteggio === 'number' ? `, ${conteggio} norme` : ''
            return (
              <li key={persona.key}>
                <button
                  ref={(el) => {
                    riferimenti.current[indice] = el
                  }}
                  type="button"
                  aria-pressed={attiva}
                  disabled={inAttesa}
                  title={`${persona.descrizione} Esempi: ${persona.esempi.join(', ')}.`}
                  onClick={() => select(persona.key)}
                  className="relative isolate inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 border border-regola px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors hover:border-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro disabled:opacity-60 dark:border-notte-deep dark:hover:border-nebbia dark:focus-visible:outline-nebbia"
                >
                  {attiva && (
                    <motion.span
                      aria-hidden="true"
                      layoutId={ridotto ? undefined : `persona-${id}`}
                      className="absolute inset-0 -z-10 bg-inchiostro dark:bg-nebbia"
                      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                    />
                  )}
                  <span aria-hidden="true" className={attiva ? 'text-carta dark:text-notte' : 'text-inchiostro-faint dark:text-nebbia-faint'}>
                    {persona.icona}
                  </span>
                  <span className={attiva ? 'text-carta dark:text-notte' : 'text-inchiostro-soft dark:text-nebbia-soft'}>
                    {persona.label}
                  </span>
                  {typeof conteggio === 'number' && (
                    <span
                      aria-label={`${conteggio} norme per ${persona.label}${attiva ? ' (selezionato)' : ''}`}
                      className={
                        attiva
                          ? 'rounded-full bg-carta/20 px-2 py-0.5 text-[11px] font-bold tabular-nums text-carta dark:bg-notte/20 dark:text-notte'
                          : 'rounded-full bg-inchiostro/5 px-2 py-0.5 text-[11px] font-bold tabular-nums text-inchiostro-soft dark:bg-notte-deep dark:text-nebbia-soft'
                      }
                    >
                      {conteggio}
                      <span className="sr-only">{etichettaConteggio}</span>
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
