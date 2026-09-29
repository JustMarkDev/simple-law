'use client'

import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft01Icon, ArrowRight01Icon } from 'hugeicons-react'

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

/** Paginazione con link condivisibili (no JS). Tasti grandi da 48px, frecce Hugeicons. */
export default function PaginazioneLeggi({ page, per, total, query, basePath = '/leggi' }: PaginazioneLeggiProps) {
  const fermo = useReducedMotion()
  const pagine = Math.max(1, Math.ceil(total / per))
  if (pagine <= 1) return null
  const corrente = Math.min(Math.max(1, page), pagine)
  const prev = corrente > 1 ? corrente - 1 : null
  const next = corrente < pagine ? corrente + 1 : null

  const btn =
    'inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-1.5 rounded-xl border border-regola px-4 py-2 text-sm font-semibold text-inchiostro-soft transition-colors hover:border-accento hover:text-accento focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento dark:border-notte-deep dark:text-nebbia-soft dark:hover:border-accento-chiara dark:hover:text-accento-chiara dark:focus-visible:outline-accento-chiara'
  const disabile = 'pointer-events-none opacity-40'
  const attivo =
    'inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-accento bg-accento/10 px-3 py-2 text-sm font-bold tabular-nums text-accento dark:border-accento-chiara dark:bg-accento-chiara/10 dark:text-accento-chiara'
  const tocco = fermo ? undefined : { scale: 0.97 }

  const filtroNascosti = Object.entries(query).filter(([k, v]) => k !== 'page' && v)

  return (
    <motion.nav
      aria-label="Paginazione"
      className="mt-10 flex flex-wrap items-center justify-between gap-4"
      initial={fermo ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <p className="text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status">
        Pagina {corrente} di {pagine}, {total} {total === 1 ? 'norma' : 'norme'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {prev ? (
          <motion.a
            href={href(basePath, query, prev)}
            rel="prev"
            aria-label={`Torna alla pagina ${prev}`}
            className={btn}
            whileTap={tocco}
          >
            <ArrowLeft01Icon size={16} aria-hidden="true" />
            Indietro
          </motion.a>
        ) : (
          <span aria-hidden="true" className={`${btn} ${disabile}`}>
            <ArrowLeft01Icon size={16} aria-hidden="true" />
            Indietro
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
                <motion.a
                  href={href(basePath, query, v)}
                  aria-label={`Vai alla pagina ${v}`}
                  className={`${btn} px-3`}
                  whileTap={tocco}
                >
                  {v}
                </motion.a>
              </li>
            ),
          )}
        </ol>
        {next ? (
          <motion.a
            href={href(basePath, query, next)}
            rel="next"
            aria-label={`Vai alla pagina ${next}`}
            className={btn}
            whileTap={tocco}
          >
            Avanti
            <ArrowRight01Icon size={16} aria-hidden="true" />
          </motion.a>
        ) : (
          <span aria-hidden="true" className={`${btn} ${disabile}`}>
            Avanti
            <ArrowRight01Icon size={16} aria-hidden="true" />
          </span>
        )}
      </div>
      <form method="get" action={basePath} className="flex items-end gap-2" aria-label="Salto diretto alla pagina">
        {filtroNascosti.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="vai-pagina"
            className="text-sm font-semibold text-inchiostro dark:text-nebbia"
          >
            Vai alla pagina
          </label>
          <div className="flex items-center gap-2">
            <input
              id="vai-pagina"
              name="page"
              type="number"
              min={1}
              max={pagine}
              defaultValue={corrente}
              required
              aria-describedby="vai-pagina-aiuto"
              className="min-h-[48px] w-24 rounded-xl border border-regola bg-carta px-3 py-2 text-sm text-inchiostro transition-colors hover:border-accento focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia dark:hover:border-accento-chiara dark:focus-visible:outline-accento-chiara"
            />
            <button type="submit" className={btn}>
              Vai
            </button>
          </div>
          <p id="vai-pagina-aiuto" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
            Scrivi un numero da 1 a {pagine}.
          </p>
        </div>
      </form>
    </motion.nav>
  )
}
