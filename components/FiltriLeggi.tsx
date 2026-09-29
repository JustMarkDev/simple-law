'use client'

import { useRouter } from 'next/navigation'
import { useTransition, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

type Vista = 'griglia' | 'lista'

interface FiltriLeggiProps {
  tipo: string
  anno: string
  sort: string
  /** Risultati per pagina (12/24/48). */
  per?: number
  /** Vista corrente della griglia risultati. */
  vista?: Vista
  /** Vigenza reale: '' | in_vigore | sconosciuto | abrogato | decaduto. */
  vigenza?: string
  /** Origine scheda: '' | ufficiali | dimostrative. */
  origine?: string
  query: Record<string, string>
  basePath?: string
}

const TIPI = [
  { value: '', label: 'Tutti' },
  { value: 'decreto.legge', label: 'Decreto-legge' },
  { value: 'legge', label: 'Legge' },
  { value: 'decreto.legislativo', label: 'Decreto legislativo' },
]

const ORDINI = [
  { value: 'rilevanza', label: 'Più adatti' },
  { value: 'data_desc', label: 'Più nuovi' },
  { value: 'data_asc', label: 'Meno nuovi' },
  { value: 'titolo_asc', label: 'Dalla A alla Z' },
  { value: 'gulpease_desc', label: 'Più facili da leggere' },
  { value: 'qualita_desc', label: 'Schede più curate' },
]

const PER_OPZIONI = [12, 24, 48]

const VALIDITA = [
  { value: '', label: 'Tutte' },
  { value: 'in_vigore', label: 'Vale ancora' },
  { value: 'sconosciuto', label: 'Da controllare' },
  { value: 'abrogato', label: 'Non vale più' },
  { value: 'decaduto', label: 'Scaduta' },
]

const SCHEDE = [
  { value: '', label: 'Tutte' },
  { value: 'ufficiali', label: 'Solo testi veri' },
  { value: 'dimostrative', label: 'Solo esempi' },
]

function anni(): { value: string; label: string }[] {
  const corrente = new Date().getFullYear()
  const lista = [{ value: '', label: 'Tutti' }]
  for (let a = corrente; a >= corrente - 30; a--) {
    lista.push({ value: String(a), label: String(a) })
  }
  return lista
}

/**
 * Contenitore animato dei risultati: fade-up + layout quando cambia pagina o
 * filtro. Se la persona preferisce meno movimento resta tutto fermo.
 */
export function RisultatiMossi({ chiave, children }: { chiave: string; children: ReactNode }) {
  const fermo = useReducedMotion()
  if (fermo) return <>{children}</>
  return (
    <motion.div
      key={chiave}
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

/** Filtri semplici: base in vista, resto dentro "Altri filtri" (chiuso). */
export default function FiltriLeggi({
  tipo,
  anno,
  sort,
  per = 12,
  vista = 'griglia',
  vigenza = '',
  origine = '',
  query,
  basePath = '/leggi',
}: FiltriLeggiProps) {
  const router = useRouter()
  const [inAttesa, avviaTransizione] = useTransition()

  function cambia(nome: string, valore: string) {
    const params = new URLSearchParams(query)
    if (valore) params.set(nome, valore)
    else params.delete(nome)
    params.delete('page')
    const qs = params.toString()
    avviaTransizione(() => {
      router.push(qs ? `${basePath}?${qs}` : basePath)
    })
  }

  const selectClass =
    'min-h-[48px] w-full rounded-xl border border-regola bg-carta px-3 py-2 text-sm font-medium text-inchiostro transition-colors hover:border-accento focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento disabled:opacity-60 dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia dark:hover:border-accento-chiara dark:focus-visible:outline-accento-chiara'
  const labelClass =
    'text-sm font-semibold text-inchiostro dark:text-nebbia'
  const helperClass =
    'text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint'
  const vistaBtn = (attivo: boolean) =>
    `inline-flex min-h-[48px] items-center rounded-xl border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento dark:focus-visible:outline-accento-chiara ${
      attivo
        ? 'border-accento bg-accento/10 text-accento dark:border-accento-chiara dark:bg-accento-chiara/10 dark:text-accento-chiara'
        : 'border-regola text-inchiostro-soft hover:border-accento hover:text-accento dark:border-notte-deep dark:text-nebbia-soft dark:hover:border-accento-chiara dark:hover:text-accento-chiara'
    }`

  return (
    <div aria-busy={inAttesa}>
      <div className="grid gap-4 sm:grid-cols-3" role="group" aria-label="Filtri semplici">
        <div className="flex flex-col gap-2">
          <label htmlFor="filtro-tipo" className={labelClass}>
            Che tipo di testo
          </label>
          <select
            id="filtro-tipo"
            value={tipo}
            disabled={inAttesa}
            onChange={(e) => cambia('tipo', e.target.value)}
            className={selectClass}
          >
            {TIPI.map((t) => (
              <option key={t.value || 'tutti'} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <p className={helperClass}>Legge, decreto legge o decreto legislativo.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="filtro-anno" className={labelClass}>
            Di che anno
          </label>
          <select
            id="filtro-anno"
            value={anno}
            disabled={inAttesa}
            onChange={(e) => cambia('anno', e.target.value)}
            className={selectClass}
          >
            {anni().map((a) => (
              <option key={a.value || 'tutti'} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <p className={helperClass}>Anno in cui la norma è stata emanata.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="filtro-sort" className={labelClass}>
            Come ordinarli
          </label>
          <select
            id="filtro-sort"
            value={sort}
            disabled={inAttesa}
            onChange={(e) => cambia('sort', e.target.value)}
            className={selectClass}
          >
            {ORDINI.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <p className={helperClass}>Data, titolo o facilità di lettura.</p>
        </div>
      </div>

      <details className="mt-4 rounded-2xl border border-regola bg-carta-soft p-1 dark:border-notte-deep dark:bg-notte">
        <summary className="inline-flex min-h-[48px] w-full cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-inchiostro transition-colors hover:text-accento focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento dark:text-nebbia dark:hover:text-accento-chiara dark:focus-visible:outline-accento-chiara">
          Altri filtri
          <span aria-hidden="true" className="text-xs font-normal text-inchiostro-soft dark:text-nebbia-soft">
            validità, schede, pagina
          </span>
        </summary>
        <div className="grid gap-4 px-4 pb-5 pt-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="filtro-vigenza" className={labelClass}>
              Vale ancora?
            </label>
            <select
              id="filtro-vigenza"
              value={vigenza}
              disabled={inAttesa}
              onChange={(e) => cambia('vigenza', e.target.value)}
              className={selectClass}
            >
              {VALIDITA.map((v) => (
                <option key={v.value || 'tutte'} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
            <p className={helperClass}>Solo norme ancora in vigore o tutte.</p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="filtro-origine" className={labelClass}>
              Che schede
            </label>
            <select
              id="filtro-origine"
              value={origine}
              disabled={inAttesa}
              onChange={(e) => cambia('origine', e.target.value)}
              className={selectClass}
            >
              {SCHEDE.map((o) => (
                <option key={o.value || 'tutte'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className={helperClass}>Testi veri o schede di esempio.</p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="filtro-per" className={labelClass}>
              Quante per pagina
            </label>
            <select
              id="filtro-per"
              value={String(per)}
              disabled={inAttesa}
              onChange={(e) => cambia('per', e.target.value === '12' ? '' : e.target.value)}
              className={selectClass}
            >
              {PER_OPZIONI.map((n) => (
                <option key={n} value={String(n)}>
                  {n} per pagina
                </option>
              ))}
            </select>
            <p className={helperClass}>Quante schede vedi per volta.</p>
          </div>

          <div className="flex flex-col gap-2">
            <span id="vista-risultati-label" className={labelClass}>
              Come vederle
            </span>
            <div role="group" aria-labelledby="vista-risultati-label" className="flex gap-2">
              <button
                type="button"
                aria-pressed={vista === 'griglia'}
                disabled={inAttesa}
                onClick={() => cambia('vista', '')}
                className={vistaBtn(vista === 'griglia')}
              >
                Griglia
              </button>
              <button
                type="button"
                aria-pressed={vista === 'lista'}
                disabled={inAttesa}
                onClick={() => cambia('vista', 'lista')}
                className={vistaBtn(vista === 'lista')}
              >
                Lista
              </button>
            </div>
            <p className={helperClass}>Griglia compatta o elenco lungo.</p>
          </div>
        </div>
      </details>

      <span aria-live="polite" className="sr-only">
        {inAttesa ? 'Aggiornamento dei risultati in corso.' : ''}
      </span>
    </div>
  )
}
