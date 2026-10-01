"use client";

import { useEffect, useState } from "react";
import { Bookmark01Icon } from "hugeicons-react";
import { FAVORITES_KEY, parsePreferiti } from "@/lib/validation";
import { usePreferiti } from "@/hooks/usePreferiti";

interface PulsantePreferitoProps {
  eli: string;
  /** Titolo della norma, per un'etichetta accessibile «Salva <titolo>». */
  titolo?: string;
}

function titoloBreve(titolo: string, max = 60): string {
  const pulito = titolo.trim().replace(/\s+/g, " ");
  return pulito.length <= max ? pulito : `${pulito.slice(0, max - 1).trimEnd()}…`;
}

/** Segnalibro preferiti (localStorage). z-10 per restare sopra la card. Fuori da <Link>. */
export default function PulsantePreferito({ eli, titolo }: PulsantePreferitoProps) {
  const { has, toggle } = usePreferiti();
  const [esterno, setEsterno] = useState<boolean | null>(null);

  // Sync cross-tab: se un'altra scheda cambia i preferiti, riallinea lo stato.
  useEffect(() => {
    function sincronizza() {
      try {
        const raw = localStorage.getItem(FAVORITES_KEY);
        if (!raw) {
          setEsterno(false);
          return;
        }
        const voci = parsePreferiti(JSON.parse(raw));
        setEsterno(voci.includes(eli));
      } catch {
        setEsterno(null);
      }
    }
    function suStorage(e: StorageEvent) {
      if (e.key === null || e.key === FAVORITES_KEY) sincronizza();
    }
    window.addEventListener("storage", suStorage);
    return () => window.removeEventListener("storage", suStorage);
  }, [eli]);

  const daHook = has(eli);
  const attivo = esterno ?? daHook;
  const nome = titolo ? ` «${titoloBreve(titolo)}»` : "";
  const etichetta = attivo ? `Rimuovi${nome} dai salvati` : `Salva${nome} tra i salvati`;
  const suggerimento = attivo ? "Salvato: tocca per rimuovere" : "Salva tra i salvati";

  function premi() {
    setEsterno(null);
    toggle(eli);
  }

  return (
    <button
      type="button"
      onClick={premi}
      aria-pressed={attivo}
      aria-label={etichetta}
      title={suggerimento}
      className="btn-secondario relative z-10 min-w-[48px] !px-3 !py-2 !text-sm"
    >
      <span
        key={attivo ? "on" : "off"}
        aria-hidden="true"
        className="inline-block transition-transform duration-150 motion-reduce:transition-none"
      >
        <Bookmark01Icon size={20} strokeWidth={2} fill={attivo ? "currentColor" : "none"} />
      </span>
    </button>
  );
}
