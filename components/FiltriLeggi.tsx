'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

type Vista = 'griglia' | 'lista'

interface FiltriLeggiProps {
  tipo: string
  anno: string
  sort: string
  /** Risultati per pagina (12/24/48). */
  per?: number
  /** Vista corrente della griglia risultati. */
  vista?: Vista
  query: Record<string, string>
  basePath?: string
}

const TIPI = [
  { value: '', label: 'Tutti i tipi' },
  { value: 'decreto.legge', label: 'Decreto-legge' },
  { value: 'legge', label: 'Legge' },
  { value: 'decreto.legislativo', label: 'Decreto legislativo' },
]

const SORTS = [
  { value: 'rilevanza', label: 'Più rilevanti' },
  { value: 'data_desc', label: 'Più recenti' },
  { value: 'data_asc', label: 'Meno recenti' },
  { value: 'titolo_asc', label: 'Titolo A–Z' },
  { value: 'gulpease_desc', label: 'Più leggibili' },
  { value: 'qualita_desc', label: 'Qualità migliore' },
]

const PER_OPZIONI = [12, 24, 48]

function anni(): { value: string; label: string }[] {
  const corrente = new Date().getFullYear()
  const lista = [{ value: '', label: 'Tutti gli anni' }]
  for (let a = corrente; a >= corrente - 30; a--) {
    lista.push({ value: String(a), label: String(a) })
  }
  return lista
}

/** Filtri server-side (tipo/anno/ordinamento/per/vista): preservano q/persona/page. */
export default function FiltriLeggi({
  tipo,
  anno,
  sort,
  per = 12,
  vista = 'griglia',
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
    'min-h-[44px] border border-regola bg-carta px-3 py-2 text-sm font-medium text-inchiostro-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro disabled:opacity-60 dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft dark:focus-visible:outline-nebbia'
  const labelClass =
    'text-xs font-semibold uppercase tracking-wide text-inchiostro-soft dark:text-nebbia-soft'
  const vistaBtn = (attivo: boolean) =>
    `inline-flex min-h-[44px] items-center border px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:focus-visible:outline-nebbia ${
      attivo
        ? 'border-inchiostro bg-inchiostro text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte'
        : 'border-regola text-inchiostro-soft hover:border-inchiostro hover:text-inchiostro dark:border-notte-deep dark:text-nebbia-soft dark:hover:border-nebbia dark:hover:text-nebbia'
    }`

  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-3" role="group" aria-label="Filtri archivio" aria-busy={inAttesa}>
      <div className="flex flex-col gap-1">
        <label htmlFor="filtro-tipo" className={labelClass}>
          Tipo di atto
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
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filtro-anno" className={labelClass}>
          Anno
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
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filtro-sort" className={labelClass}>
          Ordinamento
        </label>
        <select
          id="filtro-sort"
          value={sort}
          disabled={inAttesa}
          onChange={(e) => cambia('sort', e.target.value)}
          className={selectClass}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filtro-per" className={labelClass}>
          Risultati per pagina
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
      </div>

      <div className="flex flex-col gap-1">
        <span id="vista-risultati-label" className={labelClass}>
          Vista
        </span>
        <div role="group" aria-labelledby="vista-risultati-label" className="flex gap-1">
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
      </div>

      <span aria-live="polite" className="sr-only">
        {inAttesa ? 'Aggiornamento dei risultati in corso.' : ''}
      </span>
    </div>
  )
}
