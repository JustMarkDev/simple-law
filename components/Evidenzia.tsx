import { splitEvidenzia } from '@/lib/validation'

/** Evidenzia i termini di `q` in `testo` con <mark>. Sicuro: mai dangerouslySetInnerHTML. */
export default function Evidenzia({ testo, q }: { testo: string; q: string }) {
  const parti = splitEvidenzia(testo, q)
  return (
    <>
      {parti.map((parte, i) =>
        parte.evidenzia ? (
          <mark key={i} className="bg-amber-200/70 dark:bg-amber-500/30">
            {parte.testo}
          </mark>
        ) : (
          <span key={i}>{parte.testo}</span>
        ),
      )}
    </>
  )
}
