'use client'

import { motion, useReducedMotion } from 'motion/react'

export interface SerieGrafico {
  chiave: string
  etichetta: string
  colore: string
}

export interface BarraGrafico {
  etichetta: string
  nota?: string
  valori: Record<string, number>
  /** Colore alternativo per la singola barra (grafici a serie unica). */
  colore?: string
}

interface Riferimento {
  valore: number
  etichetta: string
}

interface GraficoBarreProps {
  barre: BarraGrafico[]
  serie: SerieGrafico[]
  ariaLabel: string
  unita?: string
  orientamento?: 'verticale' | 'orizzontale'
  altezza?: number
  riferimento?: Riferimento
  className?: string
}

/**
 * Tetto di barre rese come SVG: oltre questa soglia si mostra solo la
 * tabella accessibile con una nota. Evita di generare decine di migliaia
 * di nodi DOM quando il corpus cresce (100GB).
 */
const MAX_BARRE_SVG = 120
/** Righe massime della tabella per tecnologie assistive. */
const MAX_RIGHE_TABELLA = 500

function tronca(testo: string, max = 10): string {
  return testo.length <= max ? testo : `${testo.slice(0, max - 1)}…`
}

function formatta(value: number): string {
  const sicuro = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(sicuro)
}

function somma(barra: BarraGrafico, serie: SerieGrafico[]): number {
  return serie.reduce((acc, s) => {
    const v = barra.valori[s.chiave]
    return acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  }, 0)
}

/**
 * Grafico a barre in SVG, verticale o orizzontale, con serie impilabili.
 * Le barre entrano in scena quando il grafico è visibile; con
 * `prefers-reduced-motion` sono mostrate subito. I valori sono replicati in
 * una tabella accessibile (sr-only) con didascalia per i lettori di schermo.
 * Non lancia mai: voci non numeriche o mancanti valgono zero.
 */
export default function GraficoBarre({
  barre,
  serie,
  ariaLabel,
  unita = '',
  orientamento = 'verticale',
  altezza = 200,
  riferimento,
  className = '',
}: GraficoBarreProps) {
  const ridotto = useReducedMotion()

  if (!Array.isArray(barre) || !Array.isArray(serie) || barre.length === 0 || serie.length === 0) {
    return <p className="text-sm text-inchiostro-faint dark:text-nebbia-faint">Nessun dato disponibile.</p>
  }

  const barreSicure = barre.filter((b) => b && typeof b.etichetta === 'string' && b.valori)
  if (barreSicure.length === 0) {
    return <p className="text-sm text-inchiostro-faint dark:text-nebbia-faint">Nessun dato disponibile.</p>
  }

  const righeTabella = barreSicure.slice(0, MAX_RIGHE_TABELLA)
  const tabellaAccessibile = (
    <table className="sr-only">
      <caption>{ariaLabel}</caption>
      <thead>
        <tr>
          <th scope="col">Voce</th>
          {serie.map((s) => (
            <th key={s.chiave} scope="col">
              {s.etichetta}
              {unita ? ` (${unita})` : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {righeTabella.map((b, i) => (
          <tr key={`${i}-${b.etichetta}`}>
            <th scope="row">{b.etichetta}</th>
            {serie.map((s) => (
              <td key={s.chiave}>{formatta(b.valori[s.chiave] ?? 0)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )

  const legenda =
    serie.length > 1 ? (
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-inchiostro-soft dark:text-nebbia-soft">
        {serie.map((s) => (
          <li key={s.chiave} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5" style={{ backgroundColor: s.colore }} />
            {s.etichetta}
          </li>
        ))}
      </ul>
    ) : null

  // Tutela 100GB: mai migliaia di rettangoli SVG, solo tabella + nota.
  if (barreSicure.length > MAX_BARRE_SVG) {
    const mostrate = righeTabella.length
    return (
      <figure className={className}>
        <p className="border border-regola bg-carta-soft p-4 text-sm leading-relaxed text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft">
          Il grafico mostra le prime {formatta(MAX_BARRE_SVG)} voci su {formatta(barreSicure.length)}: usa i filtri
          dell’archivio per restringere l’insieme. La tabella accessibile riporta le prime {formatta(mostrate)} voci.
        </p>
        {legenda}
        {tabellaAccessibile}
      </figure>
    )
  }

  const max = Math.max(1, ...barreSicure.map((b) => somma(b, serie)))

  if (orientamento === 'orizzontale') {
    const larghezza = 720
    const padL = 148
    const padR = 56
    const rigaH = 34
    const plotW = larghezza - padL - padR
    const altezzaTot = barreSicure.length * rigaH + 12
    const conScorrimento = barreSicure.length > 16

    return (
      <figure className={className}>
        <div className={conScorrimento ? 'max-h-[560px] overflow-y-auto' : undefined}>
          <svg
            viewBox={`0 0 ${larghezza} ${altezzaTot}`}
            className="h-auto w-full text-inchiostro dark:text-nebbia"
            role="img"
            aria-label={ariaLabel}
          >
            {barreSicure.map((barra, i) => {
              const y = i * rigaH + 6
              const h = rigaH - 16
              const totale = somma(barra, serie)
              let cursore = 0
              const segmenti = serie.map((s) => {
                const grezzo = barra.valori[s.chiave] ?? 0
                const valore = typeof grezzo === 'number' && Number.isFinite(grezzo) ? grezzo : 0
                const w = (valore / max) * plotW
                const x = padL + cursore
                cursore += w
                return { s, valore, w, x }
              })
              const colore = barra.colore ?? serie[0]?.colore
              return (
                <g key={`${i}-${barra.etichetta}`}>
                  <rect
                    x={padL}
                    y={y}
                    width={plotW}
                    height={h}
                    fill="var(--chart-grid)"
                    opacity={0.35}
                  />
                  {segmenti.map((seg, idx) =>
                    seg.w > 0 ? (
                      <motion.rect
                        key={seg.s.chiave}
                        x={seg.x}
                        y={y}
                        width={seg.w}
                        height={h}
                        fill={serie.length === 1 ? colore : seg.s.colore}
                        style={{ transformBox: 'fill-box', transformOrigin: 'left' }}
                        initial={ridotto ? { scaleX: 1 } : { scaleX: 0 }}
                        whileInView={{ scaleX: 1 }}
                        viewport={{ once: true, amount: 0.3 }}
                        transition={{ duration: 0.6, delay: i * 0.06 + idx * 0.04, ease: 'easeOut' }}
                      />
                    ) : null,
                  )}
                  <text
                    x={padL - 10}
                    y={y + h / 2 + 4}
                    textAnchor="end"
                    fontSize={12}
                    fill="currentColor"
                  >
                    {tronca(barra.etichetta, 20)}
                  </text>
                  <text
                    x={padL + (totale / max) * plotW + 8}
                    y={y + h / 2 + 4}
                    fontSize={11}
                    fill="currentColor"
                    opacity={0.75}
                  >
                    {formatta(totale)}
                    {unita}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
        {legenda}
        {tabellaAccessibile}
      </figure>
    )
  }

  // Verticale (con eventuale sovrapposizione a pila).
  const passo = 64
  const padL = 44
  const padR = 18
  const padT = 18
  const padB = 46
  const larghezza = Math.max(320, barreSicure.length * passo + padL + padR)
  const plotH = altezza - padT - padB
  const barW = Math.min(40, passo * 0.56)
  const yFor = (v: number) => padT + plotH - (Math.min(v, max) / max) * plotH
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <figure className={className}>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${larghezza} ${altezza}`}
          className="h-auto w-full min-w-[320px] text-inchiostro dark:text-nebbia"
          role="img"
          aria-label={ariaLabel}
        >
          {ticks.map((f) => {
            const valore = max * f
            const y = yFor(valore)
            return (
              <g key={f}>
                <line x1={padL} y1={y} x2={larghezza - padR} y2={y} stroke="var(--chart-grid)" strokeWidth={1} />
                <text x={padL - 8} y={y + 4} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.6}>
                  {formatta(valore)}
                </text>
              </g>
            )
          })}

          {riferimento && (
            <g>
              <line
                x1={padL}
                y1={yFor(riferimento.valore)}
                x2={larghezza - padR}
                y2={yFor(riferimento.valore)}
                stroke="var(--chart-3)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
              <text
                x={larghezza - padR}
                y={yFor(riferimento.valore) - 5}
                textAnchor="end"
                fontSize={10}
                fill="var(--chart-3)"
              >
                {riferimento.etichetta}
              </text>
            </g>
          )}

          {barreSicure.map((barra, i) => {
            const centro = padL + i * passo + passo / 2
            const x = centro - barW / 2
            let cursore = padT + plotH
            const totale = somma(barra, serie)
            const colore = barra.colore ?? serie[0]?.colore
            return (
              <g key={`${i}-${barra.etichetta}`}>
                {serie.map((s, idx) => {
                  const grezzo = barra.valori[s.chiave] ?? 0
                  const valore = typeof grezzo === 'number' && Number.isFinite(grezzo) ? grezzo : 0
                  const h = (valore / max) * plotH
                  const y = cursore - h
                  cursore -= h
                  return visibile(h) ? (
                    <motion.rect
                      key={s.chiave}
                      x={x}
                      y={y}
                      width={barW}
                      height={h}
                      fill={serie.length === 1 ? colore : s.colore}
                      style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
                      initial={ridotto ? { scaleY: 1 } : { scaleY: 0 }}
                      whileInView={{ scaleY: 1 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ duration: 0.6, delay: i * 0.06 + idx * 0.04, ease: 'easeOut' }}
                    />
                  ) : null
                })}
                {totale > 0 && (
                  <text x={centro} y={yFor(totale) - 6} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.85}>
                    {formatta(totale)}
                    {unita}
                  </text>
                )}
                <text x={centro} y={altezza - padB + 18} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.8}>
                  {tronca(barra.etichetta, 9)}
                </text>
                {barra.nota && (
                  <text x={centro} y={altezza - padB + 32} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.5}>
                    {tronca(barra.nota, 12)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      {legenda}
      {tabellaAccessibile}
    </figure>
  )
}

function visibile(altezzaSegmento: number): boolean {
  return altezzaSegmento > 0.5
}
