'use client'

import { motion, useReducedMotion } from 'motion/react'
import {
  AlertCircleIcon,
  BookOpen01Icon,
  Bookmark01Icon,
  CheckmarkCircle01Icon,
  CoinsEuroIcon,
  Link01Icon,
} from 'hugeicons-react'
import { formatEuro } from './seed-fallback'

interface QualityBadgesProps {
  gulpease?: number
  /** Indice Flesch-Vacca (0-100, facoltativo): se presente viene mediato con Gulpease. */
  fleschVacca?: number
  /** Punteggio di qualità complessivo (euristico, 0-100). */
  qualita?: number
  soldiBloccati?: number
  pareri?: string[]
  fontiCount?: number
  attuativiCount?: number
  className?: string
}

type LivelloLeggibilita = 'Facile' | 'Media' | 'Difficile'

function livelloLeggibilita(gulpease?: number, fleschVacca?: number): LivelloLeggibilita | null {
  const punteggi = [gulpease, fleschVacca].filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (punteggi.length === 0) return null
  const media = punteggi.reduce((a, b) => a + b, 0) / punteggi.length
  if (media >= 60) return 'Facile'
  if (media >= 40) return 'Media'
  return 'Difficile'
}

function dettaglioLeggibilita(livello: LivelloLeggibilita): string {
  if (livello === 'Facile') return 'Facile da leggere'
  if (livello === 'Media') return 'Lettura nella media'
  return 'Lettura impegnativa'
}

/**
 * Indicatori della scheda in parole semplici, con icone Hugeicons.
 * Angoli morbidi (rounded-lg), mai pill. Entrata leggera, ferma se serve.
 */
export default function QualityBadges({
  gulpease,
  fleschVacca,
  qualita,
  soldiBloccati,
  pareri,
  fontiCount,
  attuativiCount,
  className = '',
}: QualityBadgesProps) {
  const fermo = useReducedMotion()
  const items: {
    key: string
    label: string
    value: string
    detail?: string
    tone: string
    Icon: typeof BookOpen01Icon
  }[] = []

  const livello = livelloLeggibilita(gulpease, fleschVacca)
  if (livello) {
    const valore = typeof gulpease === 'number' && Number.isFinite(gulpease) ? `${Math.round(gulpease)}/100` : livello
    items.push({
      key: 'lettura',
      label: 'Lettura',
      value: valore,
      detail: `${dettaglioLeggibilita(livello)} (${livello.toLowerCase()})`,
      tone: 'bg-carta text-inchiostro-soft ring-regola dark:bg-notte dark:text-nebbia-soft dark:ring-notte-deep',
      Icon: BookOpen01Icon,
    })
  }

  if (typeof qualita === 'number' && qualita > 0) {
    items.push({
      key: 'scheda',
      label: 'Scheda curata',
      value: `${qualita}/100`,
      detail: 'Quanto è completa la scheda',
      tone: 'bg-carta text-inchiostro-soft ring-regola dark:bg-notte dark:text-nebbia-soft dark:ring-notte-deep',
      Icon: CheckmarkCircle01Icon,
    })
  }

  if (typeof fontiCount === 'number' && fontiCount > 0) {
    items.push({
      key: 'fonti',
      label: 'Testi veri',
      value: String(fontiCount),
      detail: 'Collegati alla scheda',
      tone: 'bg-carta text-inchiostro-soft ring-regola dark:bg-notte dark:text-nebbia-soft dark:ring-notte-deep',
      Icon: Link01Icon,
    })
  }

  if (typeof soldiBloccati === 'number' && soldiBloccati > 0) {
    items.push({
      key: 'soldi',
      label: 'Soldi fermi',
      value: formatEuro(soldiBloccati),
      detail: 'In attesa di nuove regole',
      tone: 'bg-carta text-inchiostro-soft ring-regola dark:bg-notte dark:text-nebbia-soft dark:ring-notte-deep',
      Icon: CoinsEuroIcon,
    })
  }

  if (typeof attuativiCount === 'number' && attuativiCount > 0) {
    items.push({
      key: 'manca',
      label: 'Manca ancora',
      value: String(attuativiCount),
      detail: 'Passaggi prima che valga davvero',
      tone: 'bg-carta text-accento ring-accento dark:bg-notte dark:text-accento-chiara dark:ring-accento-chiara',
      Icon: AlertCircleIcon,
    })
  }

  if (pareri && pareri.length > 0) {
    items.push({
      key: 'pareri',
      label: 'Pareri',
      value: String(pareri.length),
      detail: 'Raccolti sulla scheda',
      tone: 'bg-carta text-inchiostro-soft ring-regola dark:bg-notte dark:text-nebbia-soft dark:ring-notte-deep',
      Icon: Bookmark01Icon,
    })
  }

  if (items.length === 0) return null

  if (fermo) {
    return (
      <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Come è fatta la scheda">
        {items.map((item) => (
          <li
            key={item.key}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] leading-tight ring-1 ${item.tone}`}
          >
            <item.Icon size={14} aria-hidden="true" className="shrink-0" />
            <span className="font-semibold">{item.label}:</span>{' '}
            <span className="font-bold tabular-nums">{item.value}</span>
            {item.detail && <span className="sr-only"> - {item.detail}</span>}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <motion.ul
      className={`flex flex-wrap gap-1.5 ${className}`}
      aria-label="Come è fatta la scheda"
      initial="nascosto"
      animate="visibile"
      variants={{ nascosto: {}, visibile: { transition: { staggerChildren: 0.06 } } }}
    >
      {items.map((item) => (
        <motion.li
          key={item.key}
          variants={{
            nascosto: { opacity: 0, y: 6 },
            visibile: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
          }}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] leading-tight ring-1 ${item.tone}`}
        >
          <item.Icon size={14} aria-hidden="true" className="shrink-0" />
          <span className="font-semibold">{item.label}:</span>{' '}
          <span className="font-bold tabular-nums">{item.value}</span>
          {item.detail && <span className="sr-only"> - {item.detail}</span>}
        </motion.li>
      ))}
    </motion.ul>
  )
}
