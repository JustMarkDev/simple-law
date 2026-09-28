'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePreferiti } from '@/hooks/usePreferiti'
import { parsePreferiti } from '@/lib/validation'
import type { Law } from '@/components/seed-fallback'
import LawCard from './LawCard'

function eliPath(eli: string): string | null {
  const voci = parsePreferiti([eli])
  if (voci.length === 0) return null
  const path = voci[0].replace(/^\/+/, '').split('/').filter(Boolean)
  if (path.length === 0 || path.length > 10) return null
  return path.map((s) => encodeURIComponent(s)).join('/')
}

async function caricaUno(eli: string): Promise<Law | null> {
  const path = eliPath(eli)
  if (!path) return null
  try {
    const res = await fetch(`/api/leggi/${path}`)
    if (!res.ok) return null
    const data = (await res.json()) as { ui?: Law }
    return data.ui ?? null
  } catch {
    return null
  }
}

/** Legge gli ELI salvati e li idrata via /api/leggi (parallelo a chunk, ordine stabile). */
export default function ListaSalvati() {
  const { ids, toggle } = usePreferiti()
  const [leggi, setLeggi] = useState<Law[] | null>(null)

  useEffect(() => {
    let vivo = true
    const controller = new AbortController()
    async function carica() {
      const validi = parsePreferiti(ids).slice(0, 200)
      if (validi.length === 0) {
        if (vivo) setLeggi([])
        return
      }
      const out: Law[] = []
      for (let i = 0; i < validi.length; i += 8) {
        const chunk = validi.slice(i, i + 8)
        const ris = await Promise.all(chunk.map((eli) => caricaUno(eli)))
        for (const law of ris) {
          if (law) out.push(law)
        }
        if (!vivo || controller.signal.aborted) return
      }
      if (vivo) setLeggi(out)
    }
    void carica()
    return () => {
      vivo = false
      controller.abort()
    }
  }, [ids])

  if (leggi === null) {
    return <p className="mt-6 text-sm" role="status">Caricamento…</p>
  }

  if (leggi.length === 0) {
    return (
      <div className="mt-6 border border-dashed border-regola p-8 text-center dark:border-notte-deep">
        <p className="text-sm font-medium">Nessuna norma salvata.</p>
        <p className="mt-1 text-sm text-inchiostro-faint dark:text-nebbia-faint">
          Tocca la stella ☆ su una scheda per ritrovarla qui.
        </p>
        <p className="mt-4">
          <Link href="/leggi" className="text-sm underline underline-offset-4 hover:text-accento">
            Sfoglia l’archivio
          </Link>
        </p>
      </div>
    )
  }

  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {leggi.map((law) => (
        <li key={law.eli} className="flex flex-col gap-2">
          <span className="flex-1">
            <LawCard law={law} headingLevel="h2" />
          </span>
          <button
            type="button"
            onClick={() => toggle(law.eli)}
            className="self-start border border-regola px-3 py-1.5 text-xs font-semibold uppercase tracking-wide hover:border-inchiostro dark:border-notte-deep dark:hover:border-nebbia"
          >
            Rimuovi ★
          </button>
        </li>
      ))}
    </ul>
  )
}
