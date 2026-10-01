import type { CSSProperties } from "react";

/** Le fasi che il modello attraversa, mostrate a turno mentre lavora. */
const FASI = [
  "Leggo il testo della legge",
  "Lo riassumo in poche parole",
  "Cerco chi riguarda",
  "Metto in fila le cifre",
  "Valuto se è una buona legge",
];

/** Secondi per fase: allineato alla durata `9s` di `.fase` in globals.css. */
const SECONDI_PER_FASE = 9;

function ritardo(i: number): CSSProperties {
  return { animationDelay: `${i * SECONDI_PER_FASE}s` };
}

/**
 * Attesa dell'analisi AI: orbe in vetro che "pensa", fase corrente, tacche di
 * avanzamento e secondi trascorsi, sopra lo scheletro della scheda (niente
 * salti di layout all'arrivo della risposta).
 *
 * Solo CSS, nessun hook: vive dentro il fallback di <Suspense>, che React non
 * idrata finché il contenuto non arriva, quindi un timer in JS resterebbe
 * fermo. Le fasi avanzano a tempo: indicano lavoro in corso, non una misura.
 */
export default function AnalisiInCorso() {
  return (
    <div className="grid gap-4" aria-busy="true">
      <section className="vetro relative overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <div aria-hidden="true" className="orbe shrink-0">
            <span className="orbe-nucleo" />
            <span className="orbe-riflesso" />
          </div>
          <div className="min-w-0">
            <p
              role="status"
              className="text-xl font-semibold tracking-tight text-inchiostro dark:text-nebbia"
            >
              L’AI sta leggendo la legge
            </p>
            <div
              aria-hidden="true"
              className="fasi mt-1 text-base text-inchiostro-soft dark:text-nebbia-soft"
            >
              {FASI.map((fase, i) => (
                <span
                  key={fase}
                  className={i === FASI.length - 1 ? "fase fase-ultima" : "fase"}
                  style={ritardo(i)}
                >
                  {fase}…
                </span>
              ))}
              <span className="fase-statica">Leggo e valuto la legge…</span>
            </div>
            <ol className="mt-4 flex gap-1.5" aria-hidden="true">
              {FASI.map((fase, i) => (
                <li key={fase} className="segmento h-1 w-8 rounded-sm" style={ritardo(i)} />
              ))}
            </ol>
            <p className="mt-3 font-mono text-xs tabular-nums text-inchiostro-soft dark:text-nebbia-soft">
              <span className="cronometro" aria-hidden="true" />
              di solito serve circa un minuto
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 opacity-60" aria-hidden="true">
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="scheletro-card h-44" />
          <div className="scheletro-card h-44" />
        </div>
        <div className="scheletro-card h-28" />
        <div className="scheletro-card h-64" />
      </div>
    </div>
  );
}
