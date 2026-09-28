'use client'

import { useRouter } from 'next/navigation'

interface FiltriLeggiProps {
  tipo: string
  anno: string
  sort: string
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
  { value: 'data_desc', label: 'Più recenti' },
  { value: 'data_asc', label: 'Meno recenti' },
  { value: 'titolo_asc', label: 'Titolo A–Z' },
  { value: 'gulpease_desc', label: 'Più leggibili' },
  { value: 'qualita_desc', label: 'Qualità migliore' },
]

function anni(): { value: string; label: string }[] {
  const corrente = new Date().getFullYear()
  const lista = [{ value: '', label: 'Tutti gli anni' }]
  for (let a = corrente; a >= corrente - 30; a--) {
    lista.push({ value: String(a), label: String(a) })
  }
  return lista
}

/** Filtri server-side (tipo/anno/ordinamento): preservano q/persona/page. */
export default function FiltriLeggi({ tipo, anno, sort, query, basePath = '/leggi' }: FiltriLeggiProps) {
  const router = useRouter()

  function cambia(nome: string, valore: string) {
    const params = new URLSearchParams(query)
    if (valore) params.set(nome, valore)
    else params.delete(nome)
    params.delete('page')
    const qs = params.toString()
    router.push(qs ? `${basePath}?${qs}` : basePath)
  }

  const selectClass =
    'border border-regola bg-carta px-3 py-2 text-xs font-medium text-inchiostro-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft dark:focus-visible:outline-nebbia'

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtri archivio">
      <label className="sr-only" htmlFor="filtro-tipo">
        Tipo di atto
      </label>
      <select
        id="filtro-tipo"
        value={tipo}
        onChange={(e) => cambia('tipo', e.target.value)}
        className={selectClass}
      >
        {TIPI.map((t) => (
          <option key={t.value || 'tutti'} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="filtro-anno">
        Anno
      </label>
      <select id="filtro-anno" value={anno} onChange={(e) => cambia('anno', e.target.value)} className={selectClass}>
        {anni().map((a) => (
          <option key={a.value || 'tutti'} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="filtro-sort">
        Ordinamento
      </label>
      <select id="filtro-sort" value={sort} onChange={(e) => cambia('sort', e.target.value)} className={selectClass}>
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  )
}
