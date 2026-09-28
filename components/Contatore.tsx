'use client'

import { useEffect, useRef, useState } from 'react'
import { animate, useInView, useReducedMotion } from 'motion/react'

interface ContatoreProps {
  value: number
  decimals?: number
  prefix?: string
  suffix?: string
  durata?: number
  className?: string
}

function formatta(value: number, decimals: number): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/**
 * Numero che sale da 0 al valore finale quando entra nel viewport.
 * Con `prefers-reduced-motion` mostra subito il valore finale; per i lettori
 * di schermo il valore finale è sempre annunciato.
 */
export default function Contatore({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  durata = 1.1,
  className = '',
}: ContatoreProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const inVista = useInView(ref, { once: true, amount: 0.4 })
  const ridotto = useReducedMotion()
  const [mostrato, setMostrato] = useState(() => (ridotto ? value : 0))

  const valoreFinale = Number.isFinite(value) ? value : 0
  const cifre = Number.isInteger(decimals) ? Math.min(Math.max(decimals, 0), 5) : 0
  const durataAnimazione = Number.isFinite(durata) ? Math.min(Math.max(durata, 0), 5) : 1.1

  useEffect(() => {
    if (!inVista) return
    if (ridotto || durataAnimazione === 0) {
      setMostrato(valoreFinale)
      return
    }
    const controlli = animate(0, valoreFinale, {
      duration: durataAnimazione,
      ease: 'easeOut',
      onUpdate: (v) => setMostrato(v),
    })
    return () => controlli.stop()
  }, [inVista, valoreFinale, ridotto, durataAnimazione])

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      <span aria-hidden="true">
        {prefix}
        {formatta(mostrato, cifre)}
        {suffix}
      </span>
      <span className="sr-only">
        {prefix}
        {formatta(valoreFinale, cifre)}
        {suffix}
      </span>
    </span>
  )
}
