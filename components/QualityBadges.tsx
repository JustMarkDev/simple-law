import { formatEuro } from './seed-fallback'

interface QualityBadgesProps {
  gulpease?: number
  /** Punteggio di qualità complessivo (euristico, 0-100). */
  qualita?: number
  soldiBloccati?: number
  pareri?: string[]
  fontiCount?: number
  attuativiCount?: number
  className?: string
}

function gulpeaseLabel(score: number): string {
  if (score >= 80) return 'Molto chiaro'
  if (score >= 60) return 'Chiaro'
  if (score >= 40) return 'Medio'
  return 'Difficile'
}

/**
 * Indicatori di qualità editoriale e trasparenza, usati nel riquadro 5 e sulle card.
 * Resi come lista semantica di badge.
 */
export default function QualityBadges({
  gulpease,
  qualita,
  soldiBloccati,
  pareri,
  fontiCount,
  attuativiCount,
  className = '',
}: QualityBadgesProps) {
  const items: { key: string; label: string; value: string; detail?: string; tone: string }[] = []

  if (typeof gulpease === 'number' && gulpease > 0) {
    items.push({
      key: 'gulpease',
      label: 'Leggibilità',
      value: `${gulpease}/100`,
      detail: gulpeaseLabel(gulpease),
      tone: 'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-900',
    })
  }

  if (typeof qualita === 'number' && qualita > 0) {
    items.push({
      key: 'qualita',
      label: 'Qualità',
      value: `${qualita}/100`,
      detail: 'Indicatore euristico',
      tone: 'bg-carta-deep text-inchiostro ring-regola dark:bg-notte-deep dark:text-nebbia dark:ring-notte-deep',
    })
  }

  if (typeof fontiCount === 'number' && fontiCount > 0) {
    items.push({
      key: 'fonti',
      label: 'Fonti ufficiali',
      value: String(fontiCount),
      detail: 'Collegate',
      tone: 'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900',
    })
  }

  if (typeof soldiBloccati === 'number' && soldiBloccati > 0) {
    items.push({
      key: 'soldi',
      label: 'Fondi in attesa',
      value: formatEuro(soldiBloccati),
      detail: 'Richiedono attuativi',
      tone: 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900',
    })
  }

  if (typeof attuativiCount === 'number' && attuativiCount > 0) {
    items.push({
      key: 'attuativi',
      label: 'Attuativi mancanti',
      value: String(attuativiCount),
      detail: 'Prima di applicare la norma',
      tone: 'bg-red-50 text-red-900 ring-red-200 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900',
    })
  }

  if (pareri && pareri.length > 0) {
    items.push({
      key: 'pareri',
      label: 'Pareri',
      value: String(pareri.length),
      detail: 'Raccolti',
      tone: 'bg-carta-deep text-inchiostro-soft ring-regola dark:bg-notte-deep dark:text-nebbia-soft dark:ring-notte-deep',
    })
  }

  if (items.length === 0) return null

  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Indicatori di qualità">
      {items.map((item) => (
        <li key={item.key} className={`px-2.5 py-1.5 text-xs ring-1 ${item.tone}`}>
          <span className="font-semibold">{item.label}:</span>{' '}
          <span className="font-bold">{item.value}</span>
          {item.detail && <span className="sr-only"> — {item.detail}</span>}
          {item.detail && <span className="ml-1 text-[11px] opacity-80">{item.detail}</span>}
        </li>
      ))}
    </ul>
  )
}
