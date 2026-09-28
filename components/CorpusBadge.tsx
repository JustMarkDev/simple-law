import Link from 'next/link'

export interface CorpusBadgeProps {
  /** Numero totale di norme nel corpus. */
  totale: number
  /** Quante schede sono a scopo dimostrativo. */
  dimostrative?: number
  /** Quanti atti provengono da `data/reali/` (naming §3). */
  ufficiali?: number
  /** Alias futuro da `getCorpusInfo` esteso (`{base,espansi,reali,totale}`). */
  reali?: number
}

function numeroSano(valore: unknown): number {
  return typeof valore === 'number' && Number.isFinite(valore) && valore > 0 ? Math.floor(valore) : 0
}

function formattaNumero(valore: number): string {
  try {
    return new Intl.NumberFormat('it-IT').format(valore)
  } catch {
    return String(valore)
  }
}

/**
 * Riepilogo onesto del corpus: "X atti ufficiali su Y totali (Z% reale)".
 * Componente puro (solo props, nessun accesso dati): la UI lo usa nelle
 * pagine, mai dentro `LawCard` per evitare prop drilling. Non lancia mai:
 * se `totale` non è valido restituisce `null` (nascosto).
 */
export default function CorpusBadge({ totale, dimostrative, ufficiali, reali }: CorpusBadgeProps) {
  try {
    const totaleSano = numeroSano(totale)
    if (totaleSano <= 0) return null
    const ufficialiGrezzi = ufficiali ?? reali ?? 0
    const ufficialiSani = Math.min(numeroSano(ufficialiGrezzi), totaleSano)
    const dimostrativeSane = Math.min(numeroSano(dimostrative), totaleSano)
    const percentuale =
      ufficialiSani > 0 ? Math.min(100, Math.max(0, Math.round((ufficialiSani / totaleSano) * 100))) : 0
    const haUfficiali = ufficialiSani > 0
    const etichettaNorme = totaleSano === 1 ? 'norma nel corpus' : 'norme nel corpus'
    const etichettaDimostrative =
      dimostrativeSane === 1 ? 'di cui 1 dimostrativa' : `di cui ${formattaNumero(dimostrativeSane)} dimostrative`

    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border border-regola bg-carta px-4 py-3 text-sm text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft">
        {haUfficiali ? (
          <p className="font-semibold text-inchiostro dark:text-nebbia">
            {formattaNumero(ufficialiSani)} atti ufficiali su {formattaNumero(totaleSano)} totali
            <span className="ml-2 font-normal text-inchiostro-soft dark:text-nebbia-soft">
              ({formattaNumero(percentuale)}% reale
              {dimostrativeSane > 0 ? ` · ${etichettaDimostrative}` : ''})
            </span>
          </p>
        ) : (
          <p className="font-semibold text-inchiostro dark:text-nebbia">
            {formattaNumero(totaleSano)} {etichettaNorme}
            {dimostrativeSane > 0 && (
              <span className="ml-2 font-normal text-inchiostro-soft dark:text-nebbia-soft">
                ({etichettaDimostrative})
              </span>
            )}
          </p>
        )}
      <nav aria-label="Collegamenti al corpus" className="flex flex-wrap items-center gap-2">
        <Link
          href="/leggi"
          className="underline underline-offset-4 hover:text-accento focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:hover:text-accento-chiara dark:focus-visible:outline-nebbia"
        >
          Sfoglia l’archivio
        </Link>
        <span aria-hidden="true">·</span>
        <Link
          href="/metodologia"
          className="underline underline-offset-4 hover:text-accento focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:hover:text-accento-chiara dark:focus-visible:outline-nebbia"
        >
          Come sono fatte le schede
        </Link>
      </nav>
    </div>
    )
  } catch {
    return null
  }
}
