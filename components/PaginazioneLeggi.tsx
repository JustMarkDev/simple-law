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

type Voce = number | 'ellissi-sx' | 'ellissi-dx'

/** Finestra di pagine con ellissi: prima, ultima e intorno alla corrente. */
function voci(page: number, pagine: number): Voce[] {
  if (pagine <= 7) {
    return Array.from({ length: pagine }, (_, i) => i + 1)
  }
  const vicine = new Set<number>([1, 2, pagine - 1, pagine, page - 1, page, page + 1])
  const ordinate = [...vicine].filter((n) => n >= 1 && n <= pagine).sort((a, b) => a - b)
  const risultato: Voce[] = []
  let precedente = 0
  for (const n of ordinate) {
    if (precedente && n - precedente > 1) {
      risultato.push(precedente === 1 ? 'ellissi-sx' : 'ellissi-dx')
    }
    risultato.push(n)
    precedente = n
  }
  return risultato
}

/** Paginazione server-side con link condivisibili (no JS). Ellissi + salto diretto alla pagina. */
export default function PaginazioneLeggi({ page, per, total, query, basePath = '/leggi' }: PaginazioneLeggiProps) {
  const pagine = Math.max(1, Math.ceil(total / per))
  if (pagine <= 1) return null
  const corrente = Math.min(Math.max(1, page), pagine)
  const prev = corrente > 1 ? corrente - 1 : null
  const next = corrente < pagine ? corrente + 1 : null

  const btn =
    'inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-inchiostro-soft transition-colors hover:border-inchiostro hover:text-inchiostro dark:border-notte-deep dark:text-nebbia-soft dark:hover:border-nebbia dark:hover:text-nebbia'
  const disabile = 'pointer-events-none opacity-40'
  const attivo =
    'inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-inchiostro bg-inchiostro px-3 py-2 text-xs font-bold text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte'

  const filtroNascosti = Object.entries(query).filter(([k, v]) => k !== 'page' && v)

  return (
    <nav aria-label="Paginazione" className="mt-8 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status">
        Pagina {corrente} di {pagine} · {total} {total === 1 ? 'norma' : 'norme'}
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
          {voci(corrente, pagine).map((v, i) =>
            v === 'ellissi-sx' || v === 'ellissi-dx' ? (
              <li key={v} aria-hidden="true" className="px-1 text-sm text-inchiostro-faint dark:text-nebbia-faint">
                …
              </li>
            ) : v === corrente ? (
              <li key={v}>
                <span aria-current="page" className={attivo}>
                  {v}
                </span>
              </li>
            ) : (
              <li key={i === 0 ? `prima-${v}` : v}>
                <a href={href(basePath, query, v)} aria-label={`Vai alla pagina ${v}`} className={`${btn} px-3`}>
                  {v}
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
      <form method="get" action={basePath} className="flex items-end gap-2" aria-label="Salto diretto alla pagina">
        {filtroNascosti.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="vai-pagina"
            className="text-xs font-semibold uppercase tracking-wide text-inchiostro-soft dark:text-nebbia-soft"
          >
            Vai alla pagina
          </label>
          <div className="flex items-center gap-1">
            <input
              id="vai-pagina"
              name="page"
              type="number"
              min={1}
              max={pagine}
              defaultValue={corrente}
              required
              className="min-h-[44px] w-24 border border-regola bg-carta px-3 py-2 text-sm text-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia dark:focus-visible:outline-nebbia"
            />
            <button type="submit" className={btn}>
              Vai
            </button>
          </div>
        </div>
      </form>
    </nav>
  )
}
