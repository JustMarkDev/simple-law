'use client'

import { useState } from 'react'

/** Condividi (Web Share → clipboard) + stampa. Solo client, con conferma aria-live. */
export default function CondividiStampa({ titolo }: { titolo: string }) {
  const [msg, setMsg] = useState('')

  async function condividi() {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: titolo, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setMsg('Link copiato negli appunti.')
    } catch {
      setMsg('Copia il link dalla barra del browser.')
    }
  }

  const btn =
    'border border-regola px-3 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro-soft transition-colors hover:border-inchiostro hover:text-inchiostro dark:border-notte-deep dark:text-nebbia-soft dark:hover:border-nebbia dark:hover:text-nebbia'

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button type="button" onClick={condividi} className={btn}>
        Condividi
      </button>
      <button type="button" onClick={() => window.print()} className={btn}>
        Stampa
      </button>
      <span aria-live="polite" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
        {msg}
      </span>
    </div>
  )
}
