/**
 * Unica fonte di verità per i record grezzi (puro, zero import).
 *
 * Questo modulo non importa altri moduli `lib/components/app`: è condiviso
 * da `seed-fallback`, `db`, pagine e API senza creare cicli.
 * Tutte le funzioni sono never-throw.
 */

export type ColoreSemaforo = "verde" | "giallo" | "rosso";

export const PERSONA_NUMERI: Record<string, readonly string[]> = {
  "133": ["impresa", "lavoro", "guida"],
  "139": ["guida", "impresa", "lavoro"],
  "124": ["impresa", "lavoro"],
  "36": ["lavoro", "impresa", "studio"],
  "8": ["lavoro", "impresa"],
};

/** Alias di compatibilità per i test (home e archivio usano la stessa mappa). */
export const PERSONA_NUMERO_HOME = PERSONA_NUMERI;
/** Alias di compatibilità per i test (home e archivio usano la stessa mappa). */
export const PERSONA_NUMERO_ARCHIVIO = PERSONA_NUMERI;

const MAX_TESTO = 2000;
// `non.?vig` copre sia `non vigore` sia `non vigente` (stati reali del seed).
const RE_NON_VIGORE = /non.?vig|abrog|decad|sospes/i;
const RE_GUIDA = /strada|guida|veicol|carburant|patente|trasport/;
const RE_LAVORO = /lavor|occupaz|previden|contratt|salario|dipendent/;
const RE_IMPRESA = /impres|industr|mercato|concorrenz|commerc|pmi|export/;
const RE_STUDIO = /scuol|studi|universit|student|istruzion|bors/;

function numeroAttuativi(v: unknown): number {
  try {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return 0;
    return Math.floor(v);
  } catch {
    return 0;
  }
}

/**
 * Colore del semaforo per un record grezzo. Never-throw (fallback `verde`).
 * Ordine: sconosciuto -> giallo (vigenza non verificata) -> non-vigore ->
 * scaduti>0 -> daAdottare>0&&adottati<daAdottare -> verde.
 */
export function coloreSemaforoRecord(r: {
  stato?: unknown;
  attuativi?: { daAdottare?: unknown; adottati?: unknown; scaduti?: unknown };
}): ColoreSemaforo {
  try {
    const rec = (r ?? {}) as {
      stato?: unknown;
      attuativi?: { daAdottare?: unknown; adottati?: unknown; scaduti?: unknown };
    };
    const stato = typeof rec.stato === "string" ? rec.stato : String(rec.stato ?? "");
    // Atti lista-only (vigenza non verificata): mai verde.
    if (stato.trim().toLowerCase() === "sconosciuto") return "giallo";
    if (stato && RE_NON_VIGORE.test(stato)) return "rosso";
    const att = (rec.attuativi ?? {}) as {
      daAdottare?: unknown;
      adottati?: unknown;
      scaduti?: unknown;
    };
    const scaduti = numeroAttuativi(att.scaduti);
    if (scaduti > 0) return "rosso";
    const daAdottare = numeroAttuativi(att.daAdottare);
    const adottati = numeroAttuativi(att.adottati);
    if (daAdottare > 0 && adottati < daAdottare) return "giallo";
    return "verde";
  } catch {
    return "verde";
  }
}

/**
 * Persone derivate da un record grezzo. Never-throw (fallback `['lavoro','impresa']`).
 * Prima la mappa `PERSONA_NUMERI[String(numero)]`, poi le regex su
 * `(titolo+sintesi)` troncato a `MAX_TESTO` e in minuscolo, poi il fallback.
 */
export function personeDelRecord(r: {
  numero?: unknown;
  titolo?: unknown;
  sintesi?: unknown;
}): string[] {
  try {
    const rec = (r ?? {}) as {
      numero?: unknown;
      titolo?: unknown;
      sintesi?: unknown;
    };
    const chiave = String(rec.numero ?? "");
    const mappate = (PERSONA_NUMERI as Record<string, readonly string[]>)[chiave];
    if (mappate) return [...mappate];
    const titolo = typeof rec.titolo === "string" ? rec.titolo : String(rec.titolo ?? "");
    const sintesi = typeof rec.sintesi === "string" ? rec.sintesi : String(rec.sintesi ?? "");
    const testo = `${titolo} ${sintesi}`.slice(0, MAX_TESTO).toLowerCase();
    if (!testo.trim()) return ["lavoro", "impresa"];
    const out: string[] = [];
    if (RE_GUIDA.test(testo)) out.push("guida");
    if (RE_LAVORO.test(testo)) out.push("lavoro");
    if (RE_IMPRESA.test(testo)) out.push("impresa");
    if (RE_STUDIO.test(testo)) out.push("studio");
    if (out.length > 0) return out;
    return ["lavoro", "impresa"];
  } catch {
    return ["lavoro", "impresa"];
  }
}

/**
 * Parole oneste per la vigenza. Never-throw.
 * Se `stato` matcha non-vigore (`RE_NON_VIGORE`: abrogata, decaduta,
 * sospesa o non vigente) restituisce parole oneste per atti abrogati.
 * Altrimenti restituisce parole, label e descrizione del meta semaforo
 * corrispondente (verde, giallo o rosso).
 */
export function paroleVigenza(stato: unknown): {
  parole: string;
  label: string;
  descrizione: string;
} {
  try {
    const testo = typeof stato === "string" ? stato : String(stato ?? "");
    if (testo && RE_NON_VIGORE.test(testo)) {
      return {
        parole: "Non più in vigore",
        label: "Non più in vigore",
        descrizione: "Abrogata o decaduta: non si applica più.",
      };
    }
    const chiave = testo.trim().toLowerCase();
    if (chiave === "giallo" || chiave === "sconosciuto") {
      return {
        parole: "In attesa",
        label: "Funziona in parte",
        descrizione: "Alcune parti aspettano decreti attuativi.",
      };
    }
    if (chiave === "rosso") {
      return {
        parole: "Bloccata",
        label: "Non ancora attiva",
        descrizione: "Serve un passaggio attuativo per applicarla.",
      };
    }
    return {
      parole: "Attiva",
      label: "Funziona già",
      descrizione: "La norma è in vigore e applicabile.",
    };
  } catch {
    return {
      parole: "Attiva",
      label: "Funziona già",
      descrizione: "La norma è in vigore e applicabile.",
    };
  }
}

/**
 * Verifica se un record è rilevante per una persona. Never-throw.
 * Persona vuota o `tutti` → `true`; altrimenti appartenza a `personeDelRecord`.
 */
export function personaRilevanteRecord(
  r: { numero?: unknown; titolo?: unknown; sintesi?: unknown },
  persona: string,
): boolean {
  try {
    const p = String(persona ?? "")
      .trim()
      .toLowerCase();
    if (!p || p === "tutti") return true;
    const persone = personeDelRecord(r);
    return persone.includes(p);
  } catch {
    return false;
  }
}
