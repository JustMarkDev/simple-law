"use server";

import { analizza, type Analisi } from "@/lib/analisi";

export interface StatoSemplifica {
  analisi: Analisi | null;
  errore: string | null;
  titolo: string;
  testo: string;
}

const MIN = 40;
const MAX = 40000;

/**
 * Analizza un testo incollato. Niente viene salvato.
 * ponytail: nessun rate limit, chiunque può consumare crediti AI; aggiungere
 * un limite per IP (es. Upstash/Vercel KV) prima di un traffico pubblico vero.
 */
export async function semplifica(
  _prima: StatoSemplifica,
  dati: FormData,
): Promise<StatoSemplifica> {
  const titolo = String(dati.get("titolo") ?? "")
    .slice(0, 300)
    .trim();
  const testo = String(dati.get("testo") ?? "")
    .slice(0, MAX)
    .trim();
  if (testo.length < MIN) {
    return {
      analisi: null,
      errore: `Il testo è troppo corto: ${testo.length} caratteri. Incolla almeno una frase intera della legge (${MIN} caratteri o più).`,
      titolo,
      testo,
    };
  }
  const analisi = await analizza({ titolo: titolo || "Testo incollato", testo });
  return { analisi, errore: null, titolo, testo };
}
