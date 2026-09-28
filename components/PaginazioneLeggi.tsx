interface PaginazioneLeggiProps {
  page: number
  per: number
  total: number
  query: Record<string, string>
  basePath?: string
}

function href(basePath: string, query: Record<string, string>, page: number): string {
  const params = new URLSearchParams(query)
  if (page <= 1) params.delete('page')
  else params.set('page', String(page))
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

/** Paginazione server-side con link condivisibili (no JS). Finestra max 7 numeri con `aria-current="page"`, `rel="prev"/"next"`. */
export default function PaginazioneLeggi({ page, per, total, query, basePath = '/leggi' }: PaginazioneLeggiProps) {
  const pagine = Math.max(1, Math.ceil(total / per))
  if (pagine <= 1) return null
  const prev = page > 1 ? page - 1 : null
  const next = page < pagine ? page + 1 : null

  const btn =
    'border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro-soft transition-colors hover:border-inchiostro hover:text-inchiostro dark:border-notte-deep dark:text-nebbia-soft dark:hover:border-nebbia dark:hover:text-nebbia'
  const disabile = 'pointer-events-none opacity-40'
  const corrente =
    'border border-inchiostro bg-inchiostro px-3 py-2 text-xs font-bold text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte'

  // Finestra di pagine numerate (max 7): prima, ultima e intorno alla corrente.
  const numeri: number[] = []
  const inizio = Math.max(1, Math.min(page - 3, pagine - 6))
  const fine = Math.min(pagine, inizio + 6)
  for (let n = Math.max(1, fine - 6); n <= fine; n += 1) numeri.push(n)

  return (
    <nav aria-label="Paginazione" className="mt-8 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-inchiostro-faint dark:text-nebbia-faint" role="status">
        Pagina {page} di {pagine} · {total} {total === 1 ? 'norma' : 'norme'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {prev ? (
          <a href={href(basePath, query, prev)} rel="prev" className={btn}>
            ← Precedente
          </a>
        ) : (
          <span aria-hidden="true" className={`${btn} ${disabile}`}>
            ← Precedente
          </span>
        )}
        <ol className="flex flex-wrap items-center gap-1" aria-label="Vai alla pagina">
          {numeri.map((n) =>
            n === page ? (
              <li key={n}>
                <span aria-current="page" className={corrente}>
                  {n}
                </span>
              </li>
            ) : (
              <li key={n}>
                <a href={href(basePath, query, n)} aria-label={`Vai alla pagina ${n}`} className={`${btn} px-3`}>
                  {n}
                </a>
              </li>
            ),
          )}
        </ol>
        {next ? (
          <a href={href(basePath, query, next)} rel="next" className={btn}>
            Successiva →
          </a>
        ) : (
          <span aria-hidden="true" className={`${btn} ${disabile}`}>
            Successiva →
          </span>
        )}
      </div>
    </nav>
  )
}
