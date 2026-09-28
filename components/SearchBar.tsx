'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

interface SearchBarProps {
  defaultValue?: string
  action?: string
  placeholder?: string
  id?: string
  label?: string
  className?: string
  /** Parametri esistenti da preservare (tipo/anno/sort/persona). */
  query?: Record<string, string>
}

/** Barra di ricerca accessibile: invia la query alla pagina indicata. */
export default function SearchBar({
  defaultValue = '',
  action = '/leggi',
  placeholder = 'Cerca una legge, un tema o una parola',
  id = 'ricerca-legge',
  label = 'Cerca una legge',
  className = '',
  query = {},
}: SearchBarProps) {
  const router = useRouter()
  const [value, setValue] = useState(defaultValue)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const q = value.trim().slice(0, 200)
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v) params.set(k, v)
    }
    if (q) params.set('q', q)
    else params.delete('q')
    const qs = params.toString()
    router.push(qs ? `${action}?${qs}` : action)
  }

  return (
    <form role="search" onSubmit={onSubmit} className={className}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex items-center gap-2 border border-inchiostro bg-carta p-1.5 focus-within:ring-2 focus-within:ring-inchiostro/30 dark:border-nebbia/40 dark:bg-notte-soft dark:focus-within:ring-nebbia/25">
        <span aria-hidden="true" className="pl-2 text-inchiostro-faint dark:text-nebbia-faint">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.3-4.3M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
          </svg>
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
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-inchiostro placeholder:text-inchiostro-faint focus:outline-none dark:text-nebbia dark:placeholder:text-nebbia-faint"
        />
        <button
          type="submit"
          className="shrink-0 bg-inchiostro px-4 py-2 text-xs font-semibold uppercase tracking-wide text-carta transition-colors hover:bg-inchiostro-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:bg-nebbia dark:text-notte dark:hover:bg-nebbia-soft dark:focus-visible:outline-nebbia"
        >
          Cerca
        </button>
      </div>
    </form>
  )
}
