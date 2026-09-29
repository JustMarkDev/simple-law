'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePreferiti } from '@/hooks/usePreferiti';
import { FAVORITES_KEY, FAVORITES_MAX, parsePreferiti } from '@/lib/validation';
import type { Law } from '@/components/seed-fallback';
import { STATO_META } from '@/components/seed-fallback';
import LawCard from './LawCard';

type Ordinamento = 'recenti' | 'vecchie' | 'titolo';

const GRUPPI: Array<{ stato: Law['stato']; titolo: string }> = [
  { stato: 'verde', titolo: 'Funzionano già' },
  { stato: 'giallo', titolo: 'Funzionano in parte' },
  { stato: 'rosso', titolo: 'Non ancora attive' },
];

function eliPath(eli: string): string | null {
  const voci = parsePreferiti([eli]);
  if (voci.length === 0) return null;
  const path = voci[0].replace(/^\/+/, '').split('/').filter(Boolean);
  if (path.length === 0 || path.length > 10) return null;
  return path.map((s) => encodeURIComponent(s)).join('/');
}

async function caricaUno(eli: string, segnale: AbortSignal): Promise<Law | null> {
  const path = eliPath(eli);
  if (!path) return null;
  try {
    const res = await fetch(`/api/leggi/${path}`, { signal: segnale });
    if (!res.ok) return null;
    const data = (await res.json()) as { ui?: Law };
    return data.ui ?? null;
  } catch {
    return null;
  }
}

function leggiDaStorage(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    return parsePreferiti(JSON.parse(raw));
  } catch {
    return [];
  }
}

function ordinaLeggi(leggi: Law[], ordine: Ordinamento): Law[] {
  const copia = [...leggi];
  if (ordine === 'titolo') {
    copia.sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'));
  } else if (ordine === 'vecchie') {
    copia.sort((a, b) => a.dataEmanazione.localeCompare(b.dataEmanazione));
  } else {
    copia.sort((a, b) => b.dataEmanazione.localeCompare(a.dataEmanazione));
  }
  return copia;
}

/** Legge gli ELI salvati e li idrata via /api/leggi (parallelo a chunk, ordine stabile). */
export default function ListaSalvati() {
  const { ids, toggle } = usePreferiti();
  const [leggi, setLeggi] = useState<Law[] | null>(null);
  const [sincronizzati, setSincronizzati] = useState<string[] | null>(null);
  const [ordine, setOrdine] = useState<Ordinamento>('recenti');
  const [confermaSvuota, setConfermaSvuota] = useState(false);

  // Sync cross-tab: un'altra scheda modifica localStorage -> ricarica.
  useEffect(() => {
    function suStorage(e: StorageEvent) {
      if (e.key === null || e.key === FAVORITES_KEY) {
        setSincronizzati(leggiDaStorage());
      }
    }
    window.addEventListener('storage', suStorage);
    return () => window.removeEventListener('storage', suStorage);
  }, []);

  const idsEffettivi = useMemo(
    () => parsePreferiti(sincronizzati ?? ids).slice(0, FAVORITES_MAX),
    [sincronizzati, ids],
  );
  const pieno = (sincronizzati ?? ids).length >= FAVORITES_MAX;

  useEffect(() => {
    let vivo = true;
    const controller = new AbortController();
    async function carica() {
      const validi = idsEffettivi;
      if (validi.length === 0) {
        if (vivo) setLeggi([]);
        return;
      }
      if (vivo) setLeggi(null);
      const out: Law[] = [];
      for (let i = 0; i < validi.length; i += 8) {
        const chunk = validi.slice(i, i + 8);
        const ris = await Promise.all(chunk.map((eli) => caricaUno(eli, controller.signal)));
        for (const law of ris) {
          if (law) out.push(law);
        }
        if (!vivo || controller.signal.aborted) return;
      }
      if (vivo) setLeggi(ordinaLeggi(out, ordine));
    }
    void carica();
    return () => {
      vivo = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsEffettivi.join('|')]);

  const leggiOrdinate = useMemo(() => (leggi ? ordinaLeggi(leggi, ordine) : null), [leggi, ordine]);

  function rimuovi(eli: string) {
    setSincronizzati(null);
    toggle(eli);
  }

  function svuotaTutto() {
    if (!confermaSvuota) {
      setConfermaSvuota(true);
      return;
    }
    for (const eli of idsEffettivi) toggle(eli);
    setSincronizzati([]);
    setConfermaSvuota(false);
  }

  function esportaJson() {
    const corpo = {
      esportatoIl: new Date().toISOString(),
      totale: leggiOrdinate?.length ?? 0,
      norme: (leggiOrdinate ?? []).map((law) => ({
        eli: law.eli,
        titolo: law.titolo,
        tipo: law.tipo,
        numero: law.numero,
        dataEmanazione: law.dataEmanazione,
        stato: law.stato,
      })),
    };
    const blob = new Blob([JSON.stringify(corpo, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'salvati-simple-law.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (leggiOrdinate === null) {
    return (
      <div className="mt-6" role="status" aria-busy="true" aria-label="Caricamento dei salvati">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="animate-pulse border border-regola p-5 dark:border-notte-deep">
              <div className="h-4 w-2/3 bg-inchiostro/10 dark:bg-nebbia/10" />
              <div className="mt-3 h-5 w-full bg-inchiostro/10 dark:bg-nebbia/10" />
              <div className="mt-2 h-4 w-5/6 bg-inchiostro/10 dark:bg-nebbia/10" />
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm">Caricamento…</p>
      </div>
    );
  }

  if (leggiOrdinate.length === 0) {
    return (
      <div className="mt-6 border border-dashed border-regola p-8 text-center dark:border-notte-deep">
        <p className="text-base font-semibold">Nessuna norma salvata.</p>
        <p className="mt-1 text-sm text-inchiostro-faint dark:text-nebbia-faint">
          Tocca Salva su una scheda per ritrovarla qui. I salvati restano solo su questo
          dispositivo.
        </p>
        <p className="mt-6">
          <Link
            href="/leggi"
            className="inline-flex min-h-[48px] items-center bg-inchiostro px-5 py-3 text-sm font-semibold text-carta transition-colors hover:bg-inchiostro-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:bg-nebbia dark:text-notte dark:hover:bg-nebbia-soft dark:focus-visible:outline-nebbia"
          >
            Sfoglia l’archivio delle leggi
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3 border border-regola bg-carta-soft p-4 dark:border-notte-deep dark:bg-notte-soft">
        <p className="text-sm font-semibold" role="status">
          {leggiOrdinate.length} {leggiOrdinate.length === 1 ? 'norma salvata' : 'norme salvate'}
        </p>
        {pieno && (
          <p className="w-full text-sm text-amber-800 dark:text-amber-300" role="note">
            Hai raggiunto il massimo di {FAVORITES_MAX} norme salvate. Rimuovine una per salvarne
            una nuova.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="ordina-salvati"
            className="text-sm font-medium text-inchiostro-soft dark:text-nebbia-soft"
          >
            Ordina per
          </label>
          <select
            id="ordina-salvati"
            value={ordine}
            onChange={(e) => setOrdine(e.target.value as Ordinamento)}
            className="min-h-[48px] border border-regola bg-carta px-3 py-2 text-sm text-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte dark:text-nebbia dark:focus-visible:outline-nebbia"
          >
            <option value="recenti">Data: più recenti</option>
            <option value="vecchie">Data: meno recenti</option>
            <option value="titolo">Titolo A-Z</option>
          </select>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={esportaJson}
            className="inline-flex min-h-[48px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide hover:border-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:hover:border-nebbia dark:focus-visible:outline-nebbia"
          >
            Esporta JSON
          </button>
          {!confermaSvuota ? (
            <button
              type="button"
              onClick={svuotaTutto}
              className="inline-flex min-h-[48px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-700 hover:border-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 dark:border-notte-deep dark:text-red-300 dark:hover:border-red-300"
            >
              Svuota tutto
            </button>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Rimuovere tutte le norme?</span>
              <button
                type="button"
                onClick={svuotaTutto}
                className="inline-flex min-h-[48px] items-center bg-red-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
              >
                Conferma
              </button>
              <button
                type="button"
                onClick={() => setConfermaSvuota(false)}
                className="inline-flex min-h-[48px] items-center border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide hover:border-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:hover:border-nebbia"
              >
                Annulla
              </button>
            </span>
          )}
        </div>
      </div>

      {GRUPPI.map((gruppo) => {
        const voci = leggiOrdinate.filter((law) => law.stato === gruppo.stato);
        if (voci.length === 0) return null;
        const meta = STATO_META[gruppo.stato];
        return (
          <section key={gruppo.stato} aria-labelledby={`salvati-${gruppo.stato}`} className="mt-8">
            <h2
              id={`salvati-${gruppo.stato}`}
              className="flex flex-wrap items-center gap-2 font-serif text-xl font-bold text-inchiostro dark:text-nebbia"
            >
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
              {gruppo.titolo}
              <span className="rounded-lg bg-inchiostro/5 px-2.5 py-0.5 font-sans text-xs font-bold tabular-nums text-inchiostro-soft dark:bg-notte-deep dark:text-nebbia-soft">
                {voci.length}
              </span>
            </h2>
            <p className="mt-1 text-sm text-inchiostro-faint dark:text-nebbia-faint">
              {meta.descrizione}
            </p>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {voci.map((law) => (
                <li key={law.eli} className="flex flex-col gap-2">
                  <span className="flex-1">
                    <LawCard law={law} headingLevel="h3" />
                  </span>
                  <button
                    type="button"
                    onClick={() => rimuovi(law.eli)}
                    aria-label={`Rimuovi «${law.titolo}» dai salvati`}
                    className="inline-flex min-h-[48px] items-center self-start border border-regola px-4 py-2 text-xs font-semibold uppercase tracking-wide hover:border-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:hover:border-nebbia dark:focus-visible:outline-nebbia"
                  >
                    Rimuovi
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
