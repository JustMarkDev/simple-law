'use client'

import { useId } from 'react'
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
}

/**
 * Filtro per persona (Guida / Lavoro / Impresa / Studio) con indicatore
 * animato che scivola tra le opzioni. Aggiorna i parametri dell'URL così il
 * filtro resta condivisibile.
 */
export default function PersonaFilter({
  active = 'tutti',
  basePath = '/',
  paramName = 'persona',
  query = {},
  label = 'Filtra le leggi per persona',
  className = '',
}: PersonaFilterProps) {
  const router = useRouter()
  const ridotto = useReducedMotion()
  const id = useId()

  function select(key: string) {
    const params = new URLSearchParams(query)
    if (key === 'tutti') {
      params.delete(paramName)
    } else {
      params.set(paramName, key)
    }
    const qs = params.toString()
    router.push(qs ? `${basePath}?${qs}` : basePath)
  }

  return (
    <div role="group" aria-label={label} className={className}>
      <ul className="flex flex-wrap gap-1.5">
        {PERSONAS.map((persona) => {
          const attiva = active === persona.key
          return (
            <li key={persona.key}>
              <button
                type="button"
                aria-pressed={attiva}
                title={persona.descrizione}
                onClick={() => select(persona.key)}
                className="relative isolate border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors hover:border-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:hover:border-nebbia dark:focus-visible:outline-nebbia"
              >
                {attiva && (
                  <motion.span
                    aria-hidden="true"
                    layoutId={ridotto ? undefined : `persona-${id}`}
                    className="absolute inset-0 -z-10 bg-inchiostro dark:bg-nebbia"
                    transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                  />
                )}
                <span className={attiva ? 'text-carta dark:text-notte' : 'text-inchiostro-soft dark:text-nebbia-soft'}>
                  {persona.label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
