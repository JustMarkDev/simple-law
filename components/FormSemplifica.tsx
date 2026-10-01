"use client";

import { useActionState, useState } from "react";
import { AlertCircleIcon, SparklesIcon } from "hugeicons-react";
import SchedaAnalisi from "./SchedaAnalisi";
import AnalisiInCorso from "./AnalisiInCorso";
import { semplifica, type StatoSemplifica } from "@/app/semplifica/actions";

const INIZIALE: StatoSemplifica = { analisi: null, errore: null, titolo: "", testo: "" };

/** Incolla un testo di legge, l'AI risponde con le quattro risposte della scheda. */
export default function FormSemplifica({ esempio }: { esempio: string }) {
  const [stato, azione, inCorso] = useActionState(semplifica, INIZIALE);
  const [testo, setTesto] = useState("");
  const [titolo, setTitolo] = useState("");

  function usaEsempio() {
    setTitolo("Decreto-legge 133/2026, energia e ILVA");
    setTesto(esempio);
  }

  return (
    <div className="grid gap-8">
      <form action={azione} className="vetro grid gap-5 p-5 sm:p-7" aria-describedby="aiuto-testo">
        <div className="grid gap-2">
          <label
            htmlFor="titolo"
            className="text-sm font-semibold text-inchiostro dark:text-nebbia"
          >
            Titolo, se lo sai
          </label>
          <input
            id="titolo"
            name="titolo"
            value={titolo}
            onChange={(e) => setTitolo(e.target.value)}
            maxLength={300}
            autoComplete="off"
            className="campo"
          />
        </div>

        <div className="grid gap-2">
          <label htmlFor="testo" className="text-sm font-semibold text-inchiostro dark:text-nebbia">
            Testo della legge
          </label>
          <textarea
            id="testo"
            name="testo"
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            rows={9}
            maxLength={40000}
            required
            aria-invalid={stato.errore ? true : undefined}
            aria-describedby={`aiuto-testo${stato.errore ? " errore-testo" : ""}`}
            className="campo resize-y leading-relaxed"
          />
          <p id="aiuto-testo" className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
            Copia il testo da Normattiva o dalla Gazzetta Ufficiale. Non salviamo niente.
            <span className="ml-1 font-mono text-xs tabular-nums">
              {testo.length.toLocaleString("it-IT")}/40.000
            </span>
          </p>
          {stato.errore && (
            <p
              id="errore-testo"
              role="alert"
              className="flex items-start gap-2 text-sm font-medium text-red-700 dark:text-red-300"
            >
              <AlertCircleIcon
                size={18}
                strokeWidth={1.8}
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              />
              {stato.errore}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={inCorso} className="btn-primario disabled:opacity-70">
            <SparklesIcon size={18} strokeWidth={1.8} aria-hidden="true" />
            {inCorso ? "Sto leggendo…" : "Semplifica"}
          </button>
          <button type="button" onClick={usaEsempio} className="btn-secondario">
            Prova con un esempio
          </button>
        </div>
      </form>

      <div aria-live="polite">
        {inCorso ? (
          <AnalisiInCorso />
        ) : stato.analisi ? (
          <SchedaAnalisi analisi={stato.analisi} />
        ) : null}
      </div>
    </div>
  );
}
