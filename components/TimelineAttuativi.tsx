import { attuativiRiepilogo, formatDate } from '@/components/seed-fallback'

interface AttuativiConteggi {
  daAdottare: number
  adottati: number
  scaduti: number
}

interface TimelineAttuativiProps {
  dataEmanazione: string
  /** Data di pubblicazione in Gazzetta Ufficiale; se assente si usa la data di emanazione. */
  dataGU?: string
  attuativi?: AttuativiConteggi
  stato?: 'verde' | 'giallo' | 'rosso'
}

type StatoFase = 'completata' | 'in-corso' | 'bloccata' | 'attesa'

interface Fase {
  id: string
  titolo: string
  descrizione: string
  data?: string
  stato: StatoFase
}

function dataValida(iso?: string): boolean {
  if (!iso) return false
  const d = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(d.getTime())
}

function aggiungiGiorni(iso: string, giorni: number): string | undefined {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return undefined
  d.setUTCDate(d.getUTCDate() + giorni)
  return d.toISOString().slice(0, 10)
}

const STILE_FASE: Record<StatoFase, { punto: string; etichetta: string }> = {
  completata: { punto: 'bg-emerald-500', etichetta: 'Completata' },
  'in-corso': { punto: 'bg-amber-500', etichetta: 'In corso' },
  bloccata: { punto: 'bg-red-600', etichetta: 'Bloccata' },
  attesa: { punto: 'bg-stone-300 dark:bg-stone-600', etichetta: 'In attesa' },
}

/**
 * Cronologia delle fasi di attuazione: emanazione → Gazzetta Ufficiale →
 * decreti attuativi → piena vigenza. Solo presentazione, nessun dato salvato.
 */
export default function TimelineAttuativi({ dataEmanazione, dataGU, attuativi, stato = 'giallo' }: TimelineAttuativiProps) {
  const att = {
    daAdottare: Number.isFinite(attuativi?.daAdottare) ? (attuativi?.daAdottare ?? 0) : 0,
    adottati: Number.isFinite(attuativi?.adottati) ? (attuativi?.adottati ?? 0) : 0,
    scaduti: Number.isFinite(attuativi?.scaduti) ? (attuativi?.scaduti ?? 0) : 0,
  }
  const gu = dataValida(dataGU) ? (dataGU as string) : dataEmanazione
  const vigore = dataValida(dataEmanazione) ? aggiungiGiorni(dataEmanazione, 15) : undefined

  const statoAttuativi: StatoFase = att.scaduti > 0 ? 'bloccata' : att.daAdottare > 0 ? 'in-corso' : 'completata'
  const statoVigore: StatoFase = stato === 'verde' ? 'completata' : stato === 'rosso' ? 'bloccata' : 'in-corso'

  const fasi: Fase[] = [
    {
      id: 'emanazione',
      titolo: 'Emanazione',
      descrizione: dataValida(dataEmanazione) ? 'Atto emanato e firmato.' : 'Data di emanazione non disponibile.',
      data: dataValida(dataEmanazione) ? dataEmanazione : undefined,
      stato: dataValida(dataEmanazione) ? 'completata' : 'attesa',
    },
    {
      id: 'gazzetta',
      titolo: 'Pubblicazione in Gazzetta Ufficiale',
      descrizione: dataValida(gu) ? 'Testo pubblicato e consultabile nelle fonti ufficiali.' : 'Pubblicazione non ancora registrata.',
      data: dataValida(gu) ? gu : undefined,
      stato: dataValida(gu) ? 'completata' : 'attesa',
    },
    {
      id: 'attuativi',
      titolo: 'Decreti attuativi',
      descrizione: attuativiRiepilogo(att),
      stato: statoAttuativi,
    },
    {
      id: 'vigore',
      titolo: 'Piena vigenza',
      descrizione:
        statoVigore === 'completata'
          ? 'La norma è pienamente operativa.'
          : statoVigore === 'bloccata'
            ? 'Operatività bloccata: servono provvedimenti attuativi.'
            : 'Operatività parziale: restano adempimenti attuativi.',
      data: vigore,
      stato: statoVigore,
    },
  ]

  return (
    <div className="rounded-2xl border border-regola bg-carta-soft p-5 shadow-cozy dark:border-notte-deep dark:bg-notte-soft sm:p-6">
      <h3 className="text-base font-bold text-inchiostro dark:text-nebbia">Cronologia di attuazione</h3>
      <p className="mt-1 text-sm text-inchiostro-soft dark:text-nebbia-soft">
        Le tappe della norma, in ordine di tempo.
      </p>
      <ol className="mt-4 space-y-0 border-l-2 border-regola pl-0 dark:border-notte-deep" aria-label="Fasi di attuazione della norma">
        {fasi.map((fase) => {
          const stile = STILE_FASE[fase.stato]
          return (
            <li key={fase.id} className="relative flex flex-col gap-1 pb-5 pl-6 last:pb-0">
              <span aria-hidden="true" className={`absolute -left-[7px] top-1 h-3 w-3 rounded-full border border-white ${stile.punto} dark:border-black`} />
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-inchiostro dark:text-nebbia">
                {fase.titolo}
                <span className="text-xs font-normal text-inchiostro-faint dark:text-nebbia-faint">
                  {stile.etichetta}
                </span>
              </p>
              {fase.data ? (
                <p className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
                  <time dateTime={fase.data}>{formatDate(fase.data)}</time>
                </p>
              ) : null}
              <p className="text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">{fase.descrizione}</p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
