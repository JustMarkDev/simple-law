import type { ReactNode } from "react";
import { SparklesIcon, ThumbsDownIcon, ThumbsUpIcon } from "hugeicons-react";
import type { Analisi } from "@/lib/analisi";
import { paroleLeggibilita } from "@/lib/readability";

interface SchedaAnalisiProps {
  analisi: Analisi;
  /** Fatti sull'iter (AIR, fiducia, attuativi...) mostrati accanto alla leggibilità. */
  fatti?: { etichetta: string; valore: string }[];
}

function Pannello({
  titolo,
  children,
  className = "",
}: {
  titolo: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={titolo} className={`vetro p-5 sm:p-7 ${className}`}>
      <h2 className="text-sm font-semibold text-inchiostro-soft dark:text-nebbia-soft">{titolo}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Elenco({ voci, icona }: { voci: string[]; icona: ReactNode }) {
  return (
    <ul className="space-y-2.5">
      {voci.map((voce) => (
        <li
          key={voce}
          className="flex gap-2.5 text-[0.9375rem] leading-relaxed text-inchiostro dark:text-nebbia"
        >
          <span
            aria-hidden="true"
            className="mt-1 shrink-0 text-inchiostro-faint dark:text-nebbia-faint"
          >
            {icona}
          </span>
          {voce}
        </li>
      ))}
    </ul>
  );
}

/**
 * Le quattro risposte su una legge: in poche parole, spiegata, cosa tocca
 * (chi e quanto) e se è una buona legge nel merito, tenuta separata da come
 * è scritta. Nessun hook: va bene sia in pagine server sia in form client.
 */
export default function SchedaAnalisi({ analisi, fatti = [] }: SchedaAnalisiProps) {
  const { giudizio } = analisi;

  return (
    <div className="grid gap-4">
      <section aria-label="In poche parole" className="vetro p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-inchiostro-soft dark:text-nebbia-soft">
            In poche parole
          </h2>
          <span className="badge">
            <SparklesIcon size={14} strokeWidth={1.8} aria-hidden="true" />
            {analisi.conAI ? "Analisi AI" : "Analisi automatica, senza AI"}
          </span>
        </div>
        <p className="mt-3 max-w-[40ch] text-2xl font-semibold leading-snug sm:leading-9 tracking-tight text-inchiostro dark:text-nebbia sm:text-3xl">
          {analisi.inPocheParole}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Pannello titolo="Spiegata semplice">
          <p className="max-w-[65ch] text-base leading-relaxed text-inchiostro dark:text-nebbia">
            {analisi.spiegazione}
          </p>
        </Pannello>

        <Pannello titolo="Chi riguarda">
          {analisi.chiRiguarda.length > 0 ? (
            <ul className="divide-y divide-regola/70 dark:divide-notte-deep">
              {analisi.chiRiguarda.map((voce) => (
                <li key={voce.chi} className="py-2.5 first:pt-0 last:pb-0">
                  <p className="font-semibold text-inchiostro dark:text-nebbia">{voce.chi}</p>
                  {voce.effetto && (
                    <p className="mt-0.5 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                      {voce.effetto}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
              Il testo non indica gruppi precisi.
            </p>
          )}
        </Pannello>
      </div>

      <Pannello titolo="I numeri">
        {analisi.numeri.length > 0 ? (
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {analisi.numeri.map((numero) => (
              <div key={`${numero.valore}-${numero.cosa}`} className="min-w-0">
                <dt className="sr-only">{numero.cosa}</dt>
                <dd>
                  <span className="block font-mono text-2xl font-semibold tracking-tight text-accento dark:text-accento-chiara">
                    {numero.valore}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                    {numero.cosa}
                    {numero.stima && (
                      <span className="ml-1.5 font-semibold text-inchiostro dark:text-nebbia">
                        (stima)
                      </span>
                    )}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
            Il testo non riporta cifre.
          </p>
        )}
      </Pannello>

      <section aria-label="È una buona legge?" className="vetro p-6 sm:p-8">
        <h2 className="text-sm font-semibold text-inchiostro-soft dark:text-nebbia-soft">
          È una buona legge?
        </h2>
        <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div>
            {giudizio.voto !== null ? (
              <p className="flex items-baseline gap-1 font-mono text-accento dark:text-accento-chiara">
                <span className="text-6xl font-semibold leading-none tracking-tighter">
                  {giudizio.voto}
                </span>
                <span className="text-xl font-medium">/10</span>
                <span className="sr-only">nel merito</span>
              </p>
            ) : null}
            <p className="mt-3 text-xl font-semibold leading-snug text-inchiostro dark:text-nebbia">
              {giudizio.verdetto}
            </p>
            {giudizio.perche && (
              <p className="mt-2 max-w-[55ch] text-[0.9375rem] leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                {giudizio.perche}
              </p>
            )}
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-inchiostro dark:text-nebbia">A favore</h3>
              <div className="mt-2.5">
                {giudizio.pro.length > 0 ? (
                  <Elenco
                    voci={giudizio.pro}
                    icona={<ThumbsUpIcon size={16} strokeWidth={1.8} />}
                  />
                ) : (
                  <p className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
                    Nessun punto a favore dai dati.
                  </p>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-inchiostro dark:text-nebbia">Contro</h3>
              <div className="mt-2.5">
                {giudizio.contro.length > 0 ? (
                  <Elenco
                    voci={giudizio.contro}
                    icona={<ThumbsDownIcon size={16} strokeWidth={1.8} />}
                  />
                ) : (
                  <p className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
                    Nessun punto contro dai dati.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-regola/80 pt-5 dark:border-notte-deep">
          <h3 className="text-sm font-semibold text-inchiostro dark:text-nebbia">
            E come è scritta?
          </h3>
          <p className="mt-1 text-sm text-inchiostro-soft dark:text-nebbia-soft">
            Conta a parte: una legge chiara può essere inutile, una utile può essere scritta male.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <dt className="text-xs text-inchiostro-soft dark:text-nebbia-soft">Leggibilità</dt>
              <dd className="mt-0.5 font-semibold text-inchiostro dark:text-nebbia">
                <span className="font-mono">{analisi.leggibilita}/100</span>
                <span className="block text-xs font-normal text-inchiostro-soft dark:text-nebbia-soft">
                  {paroleLeggibilita(analisi.leggibilita)}
                </span>
              </dd>
            </div>
            {fatti.map((fatto) => (
              <div key={fatto.etichetta}>
                <dt className="text-xs text-inchiostro-soft dark:text-nebbia-soft">
                  {fatto.etichetta}
                </dt>
                <dd className="mt-0.5 font-semibold text-inchiostro dark:text-nebbia">
                  {fatto.valore}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
