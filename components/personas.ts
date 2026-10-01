/**
 * Costanti delle persona, isolate qui per restare importabili anche dai
 * componenti client senza trascinare la data layer (che usa Prisma).
 */

export type PersonaKey = "guida" | "lavoro" | "impresa" | "studio";

export interface Persona {
  key: "tutti" | PersonaKey;
  label: string;
  descrizione: string;
  /** Icona testuale (glifo semplice, niente emoji). */
  icona: string;
  /** Esempi di ricerca in italiano mostrati come suggerimenti. */
  esempi: string[];
}

export const PERSONAS: Persona[] = [
  {
    key: "tutti",
    label: "Tutti",
    descrizione: "Tutte le norme, senza filtri.",
    icona: "○",
    esempi: ["accise carburanti", "decreto energia", "sicurezza stradale"],
  },
  {
    key: "guida",
    label: "Guida",
    descrizione: "Chi guida: strada, patente e carburanti.",
    icona: "◇",
    esempi: ["prezzo alla pompa", "patente a punti", "limiti di velocità"],
  },
  {
    key: "lavoro",
    label: "Lavoro",
    descrizione: "Chi lavora: contratti, tutele e scadenze.",
    icona: "▲",
    esempi: ["contratto a termine", "congedo parentale", "sicurezza sul lavoro"],
  },
  {
    key: "impresa",
    label: "Impresa",
    descrizione: "Chi ha un’impresa: adempimenti e incentivi.",
    icona: "■",
    esempi: ["credito d’imposta", "fatturazione elettronica", "appalti pubblici"],
  },
  {
    key: "studio",
    label: "Studio",
    descrizione: "Chi studia: borse, tasse e servizi.",
    icona: "✎",
    esempi: ["borse di studio", "tasse universitarie", "alloggi per studenti"],
  },
];

export const PERSONA_KEYS: PersonaKey[] = ["guida", "lavoro", "impresa", "studio"];
