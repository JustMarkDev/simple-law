"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import Evidenzia from "./Evidenzia";
import PulsantePreferito from "./PulsantePreferito";
import { formatDate, lawHref, tipoLabel, vigenzaParole, type Law } from "./seed-fallback";

interface LawCardProps {
  law: Law & { testoTroncato?: boolean };
  headingLevel?: "h2" | "h3";
  evidenzia?: string;
}

const FUOCO =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:focus-visible:outline-accento-chiara";

/** Card di una legge in vetro: titolo, una riga in parole semplici, a che punto è. */
export default function LawCard({ law, headingLevel = "h3", evidenzia = "" }: LawCardProps) {
  const Heading = headingLevel;
  const ridotto = useReducedMotion();
  const inBreve = (law.semplificata.in10Secondi ?? "").trim() || law.sintesi;
  const vigenza = vigenzaParole(law);

  return (
    <motion.article
      initial={ridotto ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 260px" }}
      className="card card-interattiva relative h-full w-full !gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-inchiostro-soft dark:text-nebbia-soft">
        <span className="font-medium">{tipoLabel(law)}</span>
        <time dateTime={law.dataEmanazione}>{formatDate(law.dataEmanazione)}</time>
      </div>

      <Heading className="line-clamp-3 text-lg font-semibold leading-snug tracking-tight text-inchiostro dark:text-nebbia">
        <Link
          href={lawHref(law)}
          className={`rounded-lg after:absolute after:inset-0 after:content-[''] hover:text-accento dark:hover:text-accento-chiara ${FUOCO}`}
        >
          <Evidenzia testo={law.titolo} q={evidenzia} />
        </Link>
      </Heading>

      <p className="line-clamp-3 text-[0.9375rem] leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
        <Evidenzia testo={inBreve} q={evidenzia} />
      </p>

      {law.testoTroncato === true && (
        <p className="text-xs leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
          Qui c’è solo un pezzo di testo: quello intero è nella fonte ufficiale.
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="text-sm font-medium text-inchiostro dark:text-nebbia">{vigenza}</span>
        <PulsantePreferito eli={law.eli} />
      </div>
    </motion.article>
  );
}
