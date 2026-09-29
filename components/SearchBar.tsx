'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Search01Icon } from 'hugeicons-react'

interface SearchBarProps {
  defaultValue?: string
  action?: string
  placeholder?: string
  id?: string
  label?: string
  className?: string
  /** Parametri esistenti da preservare (tipo/anno/sort/persona/per/vista). */
  query?: Record<string, string>
}

/** Barra di ricerca accogliente: parole semplici, bersaglio ampio, icona Hugeicons. */
export default function SearchBar({
  defaultValue = '',
  action = '/leggi',
  placeholder = 'Scrivi una parola: lavoro, casa, scuola…',
  id = 'ricerca-legge',
  label = 'Cerca',
  className = '',
  query = {},
}: SearchBarProps) {
  const router = useRouter()
  const [value, setValue] = useState(defaultValue)
  const [inAttesa, avviaTransizione] = useTransition()
  const ridotto = useReducedMotion()

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const q = value.trim().slice(0, 200)
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v) params.set(k, v)
    }
    if (q) params.set('q', q)
    else params.delete('q')
    params.delete('page')
    const qs = params.toString()
    avviaTransizione(() => {
      router.push(qs ? `${action}?${qs}` : action)
    })
  }

  return (
    <form role="search" onSubmit={onSubmit} className={className} aria-busy={inAttesa}>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-bold text-inchiostro dark:text-nebbia"
      >
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-regola bg-carta p-2 transition-colors focus-within:border-accento dark:border-notte-deep dark:bg-notte dark:focus-within:border-accento-chiara">
        <span aria-hidden="true" className="pl-2 text-inchiostro-faint dark:text-nebbia-faint">
          <Search01Icon size={22} strokeWidth={2} />
        </span>
        <input
          id={id}
          name="q"
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          maxLength={200}
          disabled={inAttesa}
          aria-busy={inAttesa}
          className="min-h-[48px] min-w-0 flex-1 rounded-lg bg-transparent px-1 py-2 text-base text-inchiostro placeholder:text-inchiostro-faint focus:outline-none disabled:opacity-60 dark:text-nebbia dark:placeholder:text-nebbia-faint"
        />
        <motion.button
          type="submit"
          disabled={inAttesa}
          aria-disabled={inAttesa}
          whileTap={ridotto ? undefined : { scale: 0.97 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="inline-flex min-h-[48px] shrink-0 items-center rounded-xl bg-accento px-5 py-3 text-sm font-bold text-white transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento disabled:opacity-60 motion-reduce:transition-none dark:bg-accento-chiara dark:text-notte dark:focus-visible:outline-accento-chiara"
        >
          {inAttesa ? 'Aspetta…' : 'Cerca'}
        </motion.button>
      </div>
      <span aria-live="polite" className="sr-only">
        {inAttesa ? 'Ricerca in corso.' : ''}
      </span>
    </form>
  )
}
