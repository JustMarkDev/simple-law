/**
 * Costanti delle persona, isolate qui per restare importabili anche dai
 * componenti client senza trascinare la data layer (che usa Prisma).
 */

export type PersonaKey = 'guida' | 'lavoro' | 'impresa' | 'studio'

export interface Persona {
  key: 'tutti' | PersonaKey
  label: string
  descrizione: string
}

export const PERSONAS: Persona[] = [
  { key: 'tutti', label: 'Tutti', descrizione: 'Mostra tutte le norme del feed.' },
  { key: 'guida', label: 'Guida', descrizione: 'Chi guida o usa un mezzo: costi, regole e obblighi.' },
  { key: 'lavoro', label: 'Lavoro', descrizione: 'Chi lavora: contratti, tutele, previdenza e scadenze.' },
  { key: 'impresa', label: 'Impresa', descrizione: 'Chi ha un’impresa: adempimenti, incentivi e mercati.' },
  { key: 'studio', label: 'Studio', descrizione: 'Chi studia: borse, agevolazioni e servizi.' },
]
