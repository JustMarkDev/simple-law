'use client'

import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

interface ComparsaProps {
  children: ReactNode
  className?: string
  /** Ritardo in secondi, utile per le comparse a cascata. */
  delay?: number
}

/**
 * Comparsa morbida all'ingresso nel viewport. Rispetta `prefers-reduced-motion`:
 * con movimento ridotto il contenuto è reso subito senza animazione.
 */
export default function Comparsa({ children, className, delay = 0 }: ComparsaProps) {
  const ridotto = useReducedMotion()

  // Movimento ridotto: nessun effetto, contenuto reso subito e accessibile.
  if (ridotto) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}
