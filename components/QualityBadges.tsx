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

type LivelloLeggibilita = 'Facile' | 'Medio' | 'Difficile'

function livelloLeggibilita(gulpease?: number, fleschVacca?: number): LivelloLeggibilita | null {
  const punteggi = [gulpease, fleschVacca].filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (punteggi.length === 0) return null
  const media = punteggi.reduce((a, b) => a + b, 0) / punteggi.length
  if (media >= 60) return 'Facile'
  if (media >= 40) return 'Medio'
  return 'Difficile'
}

function dettaglioLeggibilita(livello: LivelloLeggibilita): string {
  if (livello === 'Facile') return 'Facile da leggere'
  if (livello === 'Medio') return 'Leggibilità media'
  return 'Lettura impegnativa'
}

/**
 * Indicatori di qualità editoriale e trasparenza, usati nel riquadro 5 e sulle card.
 * Resi come lista semantica di badge.
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
  const items: { key: string; label: string; value: string; detail?: string; tone: string }[] = []

  const livello = livelloLeggibilita(gulpease, fleschVacca)
  if (livello) {
    const valore = typeof gulpease === 'number' && Number.isFinite(gulpease) ? `${Math.round(gulpease)}/100` : livello
    items.push({
      key: 'leggibilita',
      label: 'Leggibilità',
      value: valore,
      detail: `${dettaglioLeggibilita(livello)} (${livello.toLowerCase()})`,
      tone: 'bg-carta text-inchiostro-soft ring-regola dark:bg-notte dark:text-nebbia-soft dark:ring-notte-deep',
    })
  }

  if (typeof qualita === 'number' && qualita > 0) {
    items.push({
      key: 'qualita',
      label: 'Qualità',
      value: `${qualita}/100`,
      detail: 'Indicatore euristico',
      tone: 'bg-carta text-inchiostro-soft ring-regola dark:bg-notte dark:text-nebbia-soft dark:ring-notte-deep',
    })
  }

  if (typeof fontiCount === 'number' && fontiCount > 0) {
    items.push({
      key: 'fonti',
      label: 'Fonti ufficiali',
      value: String(fontiCount),
      detail: 'Collegate',
      tone: 'bg-carta text-inchiostro-soft ring-regola dark:bg-notte dark:text-nebbia-soft dark:ring-notte-deep',
    })
  }

  if (typeof soldiBloccati === 'number' && soldiBloccati > 0) {
    items.push({
      key: 'soldi',
      label: 'Fondi in attesa',
      value: formatEuro(soldiBloccati),
      detail: 'Richiedono attuativi',
      tone: 'bg-carta text-inchiostro-soft ring-regola dark:bg-notte dark:text-nebbia-soft dark:ring-notte-deep',
    })
  }

  if (typeof attuativiCount === 'number' && attuativiCount > 0) {
    items.push({
      key: 'attuativi',
      label: 'Attuativi mancanti',
      value: String(attuativiCount),
      detail: 'Prima di applicare la norma',
      tone: 'bg-carta text-accento ring-accento dark:bg-notte dark:text-accento-chiara dark:ring-accento-chiara',
    })
  }

  if (pareri && pareri.length > 0) {
    items.push({
      key: 'pareri',
      label: 'Pareri',
      value: String(pareri.length),
      detail: 'Raccolti',
      tone: 'bg-carta text-inchiostro-soft ring-regola dark:bg-notte dark:text-nebbia-soft dark:ring-notte-deep',
    })
  }

  if (items.length === 0) return null

  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Indicatori di qualità">
      {items.map((item) => (
        <li key={item.key} className={`border px-2 py-1 text-[11px] leading-tight ring-1 ${item.tone}`}>
          <span className="font-semibold">{item.label}:</span>{' '}
          <span className="font-bold tabular-nums">{item.value}</span>
          {item.detail && <span className="sr-only"> — {item.detail}</span>}
        </li>
      ))}
    </ul>
  )
}
