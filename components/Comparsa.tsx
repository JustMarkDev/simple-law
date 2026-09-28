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

  return (
    <motion.div
      className={className}
      initial={ridotto ? false : { opacity: 0, y: 14 }}
      whileInView={ridotto ? undefined : { opacity: 1, y: 0 }}
      viewport={ridotto ? undefined : { once: true, amount: 0.15 }}
      transition={ridotto ? undefined : { duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}
