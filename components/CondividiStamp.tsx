"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";

/** Condividi (Web Share → clipboard) + stampa. Solo client, con conferma aria-live. */
export default function CondividiStampa({ titolo }: { titolo: string }) {
  const [msg, setMsg] = useState("");
  const ridotto = useReducedMotion();

  async function condividi() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: titolo, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMsg("Link copiato negli appunti.");
    } catch {
      setMsg("Copia il link dalla barra del browser.");
    }
  }

  const btn = "btn-secondario !px-4 !py-2 !text-sm";

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <motion.button
        type="button"
        onClick={condividi}
        className={btn}
        whileTap={ridotto ? undefined : { scale: 0.97 }}
      >
        Condividi
      </motion.button>
      <motion.button
        type="button"
        onClick={() => window.print()}
        className={btn}
        whileTap={ridotto ? undefined : { scale: 0.97 }}
      >
        Stampa
      </motion.button>
      <span
        aria-live="polite"
        className="min-h-[24px] text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint"
      >
        {msg}
      </span>
    </div>
  );
}
