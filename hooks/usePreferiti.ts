'use client'

import { useCallback, useEffect, useState } from 'react'
import { FAVORITES_KEY, FAVORITES_MAX, parsePreferiti } from '@/lib/validation'

function leggi(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    if (!raw) return []
    return parsePreferiti(JSON.parse(raw))
  } catch {
    return []
  }
}

/** Preferiti solo-ELI in localStorage (anonimo, validato, mai HTML/testo). */
export function usePreferiti() {
  const [ids, setIds] = useState<string[]>([])

  useEffect(() => {
    setIds(leggi())
  }, [])

  const toggle = useCallback((eli: string) => {
    const candidati = parsePreferiti([eli])
    if (candidati.length === 0) return
    const chiave = candidati[0]
    setIds((prev) => {
      const base = parsePreferiti(prev)
      const next = base.includes(chiave) ? base.filter((v) => v !== chiave) : [...base, chiave].slice(0, FAVORITES_MAX)
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
      } catch {
        // quota piena o storage disabilitato: stato solo in memoria
      }
      return next
    })
  }, [])

  return { ids, toggle, has: (eli: string) => ids.includes(eli) }
}
