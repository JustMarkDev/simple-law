import { STATO_META, type Stato } from './seed-fallback'

interface TrafficLightProps {
  stato: Stato
  motivo?: string
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

const ORDER: Stato[] = ['rosso', 'giallo', 'verde']

/**
 * Semaforo di attuazione. Non usa emoji: lo stato è reso con pallini colorati
 * e testo accessibile (role="img" + aria-label).
 *   contenitore in tinta carta/notte con bordo visibile.
  Pallini spenti in carta-deep/notte-deep (mai grigi freddi).
 */
export default function TrafficLight({ stato, motivo, size = 'md', showLabel = true }: TrafficLightProps) {
  const meta = STATO_META[stato]
  const lamp = size === 'sm' ? 'h-2.5 w-2.5' : size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'
  const housing = size === 'sm' ? 'gap-1 p-1' : 'gap-1.5 p-1.5'

  return (
    <div className="flex items-start gap-3">
      <span
        role="img"
        aria-label={`Stato della norma: ${meta.label}. ${meta.descrizione}`}
        className={`inline-flex shrink-0 flex-col ${housing} rounded-lg border border-regola bg-carta dark:border-notte-deep dark:bg-notte`}
      >
        {ORDER.map((lampStato) => (
          <span
            key={lampStato}
            aria-hidden="true"
            className={`${lamp} rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/20 ${lampStato === stato ? STATO_META[lampStato].dot : 'bg-carta-deep dark:bg-notte-deep'}`}
          />
        ))}
      </span>

      <span className="min-w-0">
        {showLabel && (
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${meta.text}`}>
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        )}
        {showLabel && !motivo && (
          <span className="mt-0.5 block text-xs text-inchiostro-soft dark:text-nebbia-soft">{meta.descrizione}</span>
        )}
        {motivo && (
          <span className="mt-0.5 block text-xs leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            {motivo}
          </span>
        )}
      </span>
    </div>
  )
}
