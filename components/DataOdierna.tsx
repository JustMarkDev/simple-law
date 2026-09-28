'use client'

import { useEffect, useState } from 'react'

/**
 * Data odierna in italiano. Viene calcolata dopo il montaggio per evitare
 * disallineamenti di idratazione tra server e client (fusi orari diversi).
 */
export default function DataOdierna({ className = '' }: { className?: string }) {
  const [data, setData] = useState('')

  useEffect(() => {
    setData(
      new Date().toLocaleDateString('it-IT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    )
  }, [])

  return (
    <time className={`capitalize ${className}`} dateTime={new Date().toISOString().slice(0, 10)}>
      {data || '\u00a0'}
    </time>
  )
}
