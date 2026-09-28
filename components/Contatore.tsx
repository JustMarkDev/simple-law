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
  const [mostrato, setMostrato] = useState(0)

  useEffect(() => {
    if (!inVista) return
    if (ridotto) {
      setMostrato(value)
      return
    }
    const controlli = animate(0, value, {
      duration: durata,
      ease: 'easeOut',
      onUpdate: (v) => setMostrato(v),
    })
    return () => controlli.stop()
  }, [inVista, value, ridotto, durata])

  return (
    <span ref={ref} className={className}>
      <span aria-hidden="true">
        {prefix}
        {formatta(mostrato, decimals)}
        {suffix}
      </span>
      <span className="sr-only">
        {prefix}
        {formatta(value, decimals)}
        {suffix}
      </span>
    </span>
  )
}
