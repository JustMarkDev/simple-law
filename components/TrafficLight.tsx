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
 * Contrasto: contenitore sempre bg-white/dark:bg-black con bordo visibile.
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
        className={`inline-flex shrink-0 flex-col ${housing} rounded-md border border-regola bg-white dark:border-nebbia/40 dark:bg-black`}
      >
        {ORDER.map((lampStato) => (
          <span
            key={lampStato}
            aria-hidden="true"
            className={`${lamp} rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/20 ${lampStato === stato ? STATO_META[lampStato].dot : 'bg-slate-200 dark:bg-neutral-800'}`}
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
