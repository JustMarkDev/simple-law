/**
 * Adattatore tra la data layer (`lib/seed-data`, `lib/quality`) e la UI.
 *
 * La data layer espone record "grezzi" (stato in_vigore, fonti con chiavi
 * gazzetta/camera/senato/governo). Qui vengono normalizzati nel modello usato
 * dai componenti: stato semaforico (verde/giallo/rosso) e template a 5 riquadri.
 *
 * Se il seed non è disponibile la UI resta funzionante con un fallback minimo.
 */

import {
  SEED_LAWS,
  SEED_MINISTERS,
  type Fonti,
  type LawRecord,
  type MinisterRecord,
} from '@/lib/seed-data'
import { scoreQuality, type AirStato, type AttuativiInput } from '@/lib/quality'
import { calcGulpease } from '@/lib/readability'
import { buildFonti } from '@/lib/fonti'
import { getLawByEli, getLawsFromDBorSeed } from '@/lib/db'
import { PERSONAS, type PersonaKey } from './personas'

export type { Fonti }
export { PERSONAS }
export type { PersonaKey }

export type Stato = 'verde' | 'giallo' | 'rosso'

export interface StatoLavora {
  colore: Stato
  motivo: string
}

export interface ProContro {
  pro: string[]
  contro: string[]
}

export interface SimplifiedLaw {
  in10Secondi: string
  perTe: Record<string, string>
  cosaFare: string[]
  statoLavora: StatoLavora
  proContro: ProContro
  gulpease: number
}

export interface Law {
  eli: string
  nir: string
  tipo: string
  numero: string
  dataEmanazione: string
  titolo: string
  sintesi: string
  stato: Stato
  gulpease: number
  fonti: Fonti
  semplificata: SimplifiedLaw
  persone: PersonaKey[]
  attuativi: AttuativiInput
  air: AirStato
  fiducia: boolean
  omnibus: boolean
  /** Punteggio di qualità complessivo (euristico, 0-100). */
  qualita: number
  featured: boolean
  /** `true` per le schede di esempio a scopo dimostrativo (vedi seed). */
  dimostrativo: boolean
}

export interface Minister {
  slug: string
  nome: string
  dicastero: string
  partito?: string
  competenze: string[]
  provvedimenti: string[]
}

export const STATO_META: Record<
  Stato,
  { label: string; descrizione: string; parole: string; text: string; bg: string; ring: string; dot: string }
> = {
  verde: {
    label: 'Funziona già',
    descrizione: 'La norma è in vigore e applicabile.',
    parole: 'Attiva',
    text: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    ring: 'ring-emerald-200 dark:ring-emerald-800',
    dot: 'bg-emerald-500',
  },
  giallo: {
    label: 'Funziona in parte',
    descrizione: 'Alcune parti aspettano decreti attuativi.',
    parole: 'In attesa',
    text: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    ring: 'ring-amber-200 dark:ring-amber-800',
    dot: 'bg-amber-500',
  },
  rosso: {
    label: 'Non ancora attiva',
    descrizione: 'Serve un passaggio attuativo per applicarla.',
    parole: 'Bloccata',
    text: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-950/40',
    ring: 'ring-red-200 dark:ring-red-900',
    dot: 'bg-red-600',
  },
}

const TIPI_LABEL: Record<string, string> = {
  'decreto.legge': 'Decreto-legge',
  'decreto.legislativo': 'Decreto legislativo',
  'decreto.presidente.repubblica': 'Decreto del Presidente della Repubblica',
  'decreto.presidente.consiglio': 'DPCM',
  legge: 'Legge',
  'legge.costituzionale': 'Legge costituzionale',
  regolamento: 'Regolamento',
}

/** Etichetta leggibile per il tipo di atto (es. `decreto.legge` -> Decreto-legge). */
export function formatTipo(tipo: string): string {
  const chiave = tipo.trim().toLowerCase()
  if (TIPI_LABEL[chiave]) return TIPI_LABEL[chiave]
  const parole = chiave.replace(/[._]/g, ' ').trim()
  return parole ? parole.charAt(0).toUpperCase() + parole.slice(1) : 'Norma'
}

/** Titolo breve per card: "Decreto-legge 133/2026". */
export function tipoLabel(law: Law): string {
  const anno = law.dataEmanazione ? law.dataEmanazione.slice(0, 4) : ''
  const numero = law.numero ? `${law.numero}${anno ? `/${anno}` : ''}` : ''
  return [formatTipo(law.tipo), numero].filter(Boolean).join(' ')
}

const PERSONAS_BY_NUMERO: Record<string, PersonaKey[]> = {
  '133': ['impresa', 'lavoro', 'guida'],
  '139': ['guida', 'impresa', 'lavoro'],
  '124': ['impresa', 'lavoro'],
  '36': ['lavoro', 'impresa', 'studio'],
  '8': ['lavoro', 'impresa'],
}

const PERSONE: PersonaKey[] = ['guida', 'lavoro', 'impresa', 'studio']

function derivePersone(record: LawRecord): PersonaKey[] {
  const esplicite = PERSONAS_BY_NUMERO[record.numero]
  if (esplicite) return esplicite
  const testo = `${record.titolo} ${record.sintesi}`.toLowerCase()
  const trovate = PERSONE.filter((persona) => {
    if (persona === 'guida') return /strada|guida|veicol|carburant|patente|trasport/.test(testo)
    if (persona === 'lavoro') return /lavor|occupaz|previden|contratt|salario|dipendent/.test(testo)
    if (persona === 'impresa') return /impres|industr|mercato|concorrenz|commerc|pmi|export/.test(testo)
    return /scuol|studi|universit|student|istruzion|bors/.test(testo)
  })
  return trovate.length > 0 ? trovate : ['lavoro', 'impresa']
}

function deriveStato(record: LawRecord): { stato: Stato; motivo: string } {
  const att = record.attuativi
  const adottati = att?.adottati ?? 0
  const daAdottare = att?.daAdottare ?? 0
  const scaduti = att?.scaduti ?? 0

  if (/non.?vigore|abrog|decad|sospes/i.test(record.stato)) {
    return { stato: 'rosso', motivo: 'La norma non è in vigore o risulta sospesa.' }
  }
  if (scaduti > 0) {
    return {
      stato: 'rosso',
      motivo: `${scaduti} decreti attuativi sono scaduti: la norma non è ancora pienamente applicabile.`,
    }
  }
  if (daAdottare > 0 && adottati < daAdottare) {
    return {
      stato: 'giallo',
      motivo: `Servono ancora ${daAdottare - adottati} decreti attuativi per applicarla del tutto.`,
    }
  }
  return { stato: 'verde', motivo: 'La norma è in vigore e già applicabile.' }
}

function tronca(testo: string, max = 200): string {
  const pulito = testo.trim()
  return pulito.length <= max ? pulito : `${pulito.slice(0, max - 1).trimEnd()}…`
}

function frasiDi(testo: string): string[] {
  return testo
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((frase) => frase.trim())
    .filter(Boolean)
}

const AZIONE_RE =
  /\b(deve|devono|provvedono|adottano|adotta|si adeguano|si applica|applicano|verifica|richiede|richiedono|presenta|presentano|riferisce|diritto|obbligo|occorre|è necessario|può|possono)\b/i

function deriveCosaFare(record: LawRecord): string[] {
  const testo = record.testo ?? record.sintesi
  const azioni = frasiDi(testo)
    .filter((frase) => AZIONE_RE.test(frase))
    .slice(0, 4)
    .map((frase) => tronca(frase, 170))

  while (azioni.length < 3) {
    azioni.push(
      [
        'Controlla le fonti ufficiali per leggere il testo completo.',
        'Verifica se la norma riguarda la tua situazione.',
        'Tieni d\'occhio i decreti attuativi mancanti.',
      ][azioni.length] ?? 'Chiedi assistenza se hai dubbi di applicazione.',
    )
  }
  return azioni
}

function deriveProContro(record: LawRecord, qualita: number): ProContro {
  const att = record.attuativi
  const pro: string[] = []
  const contro: string[] = []

  if (record.air === 'presente') pro.push('Ha un\'analisi di impatto della regolamentazione (AIR).')
  if (record.air === 'semplificata') pro.push('Segue un percorso di semplificazione normativa.')
  if ((att?.adottati ?? 0) > 0) pro.push('Parte dei decreti attuativi è già stata adottata.')
  pro.push(qualita >= 70 ? 'Qualità redazionale buona secondo i nostri indicatori.' : 'La sintesi aiuta a orientarsi nel testo.')

  if (record.fiducia) contro.push('Posta la fiducia: il dibattito parlamentare è stato ridotto.')
  if (record.omnibus) contro.push('Testo omnibus: raccoglie materie diverse in un unico atto.')
  if (record.air === 'assente') contro.push('Manca l\'analisi di impatto (AIR).')
  if ((att?.scaduti ?? 0) > 0) contro.push('Ci sono decreti attuativi scaduti.')
  else if ((att?.daAdottare ?? 0) > 0) contro.push('Alcune parti aspettano ancora i decreti attuativi.')
  contro.push('Il linguaggio tecnico e i rinvii interni restano difficili per chi non è esperto.')

  return { pro: pro.slice(0, 3), contro: contro.slice(0, 3) }
}

function derivePerTe(record: LawRecord): Record<string, string> {
  const base = tronca(record.sintesi, 150)
  return {
    guida: `Se guidi o usi un mezzo, controlla se cambiano costi o regole. In breve: ${base}`,
    lavoro: `Se lavori come dipendente, verifica obblighi, tutele e scadenze. In breve: ${base}`,
    impresa: `Se hai un'impresa, controlla adempimenti, incentivi e tempi. In breve: ${base}`,
    studio: `Se studi, verifica borse, agevolazioni e servizi. In breve: ${base}`,
  }
}

function deriveSemplificata(record: LawRecord, override?: Partial<SimplifiedLaw>): SimplifiedLaw {
  const { stato, motivo } = deriveStato(record)
  const gulpease = record.gulpease ?? calcGulpease(record.testo ?? record.sintesi).indice
  const qualita = deriveQualita(record)

  const base: SimplifiedLaw = {
    in10Secondi: tronca(record.sintesi, 220),
    perTe: derivePerTe(record),
    cosaFare: deriveCosaFare(record),
    statoLavora: { colore: stato, motivo },
    proContro: deriveProContro(record, qualita),
    gulpease,
  }

  if (!override) return base
  return {
    in10Secondi: override.in10Secondi ?? base.in10Secondi,
    perTe: { ...base.perTe, ...(override.perTe ?? {}) },
    cosaFare: override.cosaFare ?? base.cosaFare,
    statoLavora: override.statoLavora ?? base.statoLavora,
    proContro: override.proContro ?? base.proContro,
    gulpease: override.gulpease ?? base.gulpease,
  }
}

/** Qualita' memorizzata in `extra.qualita`, se numerica e valida. */
function qualitaMemorizzata(record: LawRecord): number | undefined {
  const valore = (record as LawRecord & { qualita?: unknown }).qualita
  return typeof valore === 'number' && Number.isFinite(valore) ? Math.round(valore) : undefined
}

function deriveQualita(record: LawRecord): number {
  const memorizzata = qualitaMemorizzata(record)
  if (memorizzata !== undefined) return memorizzata
  const result = scoreQuality({
    testo: record.testo ?? record.sintesi,
    attuativi: record.attuativi ?? { daAdottare: 0, adottati: 0, scaduti: 0 },
    air: record.air ?? 'esente',
    fiducia: record.fiducia ?? false,
    omnibus: record.omnibus ?? false,
  })
  return result.totale
}

/** Contenuti specifici per gli atti di riferimento, richiesti dal brief. */
const OVERRIDES: Record<string, Partial<SimplifiedLaw>> = {
  '133': {
    in10Secondi:
      'Il diesel costa 17 centesimi in meno al litro per 8 giorni. Aiuti anche ai camion e 100,5 milioni per l\'ILVA di Taranto.',
    perTe: {
      guida: 'Se fai il pieno di diesel, paghi meno. Lo sconto dura 8 giorni.',
      lavoro: 'Se lavori nel trasporto, la tua azienda riceve nuovi aiuti.',
      impresa: 'Se hai camion o autotreni, hai contributi e credito d\'imposta.',
      studio: 'Se studi, questa misura non ti riguarda direttamente.',
    },
    cosaFare: [
      'Fai il pieno entro 8 giorni per usare lo sconto.',
      'Chiedi al distributore se applica già la riduzione.',
      'Le imprese di trasporto preparano la domanda per gli incentivi.',
      'Segui il decreto attuativo per i fondi ILVA.',
    ],
    statoLavora: {
      colore: 'giallo',
      motivo: 'Lo sconto è attivo. I fondi per l\'ILVA aspettano un decreto attuativo.',
    },
    proContro: {
      pro: ['Prezzi del gasolio più bassi subito', 'Sostegno ai camionisti', 'Tutela dei posti di lavoro ILVA'],
      contro: ['Misura valida solo 8 giorni', 'Costo alto per lo Stato', 'Nessun taglio strutturale delle accise'],
    },
  },
  '139': {
    in10Secondi: 'Il Governo riduce la pressione delle accise sui carburanti e impone più trasparenza sui prezzi alla pompa.',
    perTe: {
      guida: 'Se fai il pieno, controlla il prezzo esposto e le riduzioni applicate.',
      lavoro: 'Se guidi per lavoro, tieni traccia delle spese per il rimborso.',
      impresa: 'Se hai una flotta, aggiorna i contratti carburante con i fornitori.',
      studio: 'Se studi, la misura non ti riguarda direttamente.',
    },
    cosaFare: [
      'Controlla il prezzo esposto prima di fare il pieno.',
      'Segnala prezzi non trasparenti all\'Autorità competente.',
      'Aspetta la circolare attuativa per i rimborsi.',
    ],
    statoLavora: { colore: 'giallo', motivo: 'Manca il provvedimento attuativo per i rimborsi.' },
    proContro: {
      pro: ['Prezzi alla pompa più trasparenti', 'Meno pressione sui consumatori', 'Obblighi di comunicazione chiari'],
      contro: ['Serve un attuativo per i rimborsi', 'Controlli non ancora a regime', 'Effetto limitato nel tempo'],
    },
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Valida una semplificazione già calcolata e memorizzata (es. `extra.semplificata`
 * nel DB). Restituisce solo i campi riconosciuti, così la UI non si fida di dati
 * esterni malformati.
 */
function coerceSemplificata(value: unknown): Partial<SimplifiedLaw> | undefined {
  if (!isRecord(value)) return undefined
  const out: Partial<SimplifiedLaw> = {}

  if (typeof value.in10Secondi === 'string' && value.in10Secondi.trim()) {
    out.in10Secondi = value.in10Secondi
  }

  if (isRecord(value.perTe)) {
    const perTe: Record<string, string> = {}
    for (const [chiave, testo] of Object.entries(value.perTe)) {
      if (typeof testo === 'string') perTe[chiave] = testo
    }
    if (Object.keys(perTe).length > 0) out.perTe = perTe
  }

  if (Array.isArray(value.cosaFare)) {
    const azioni = value.cosaFare.filter((voce): voce is string => typeof voce === 'string')
    if (azioni.length > 0) out.cosaFare = azioni
  }

  if (isRecord(value.statoLavora)) {
    const colore = value.statoLavora.colore
    const valido = colore === 'verde' || colore === 'giallo' || colore === 'rosso'
    const motivo = value.statoLavora.motivo
    if (valido && typeof motivo === 'string') out.statoLavora = { colore, motivo }
  }

  if (isRecord(value.proContro)) {
    const pro = Array.isArray(value.proContro.pro)
      ? value.proContro.pro.filter((voce): voce is string => typeof voce === 'string')
      : []
    const contro = Array.isArray(value.proContro.contro)
      ? value.proContro.contro.filter((voce): voce is string => typeof voce === 'string')
      : []
    if (pro.length > 0 || contro.length > 0) out.proContro = { pro, contro }
  }

  if (typeof value.gulpease === 'number' && Number.isFinite(value.gulpease)) {
    out.gulpease = value.gulpease
  }

  return Object.keys(out).length > 0 ? out : undefined
}

/** Legge `extra.semplificata` da un record, se presente e valido. */
function semplificataMemorizzata(record: LawRecord): Partial<SimplifiedLaw> | undefined {
  return coerceSemplificata((record as LawRecord & { semplificata?: unknown }).semplificata)
}

/**
 * Unisce la semplificazione memorizzata (preferita) con i contenuti redazionali
 * curati. Restituisce `undefined` quando non c'è nulla da sovrascrivere.
 */
function overrideSemplificata(record: LawRecord): Partial<SimplifiedLaw> | undefined {
  const memorizzata = semplificataMemorizzata(record)
  const curata = OVERRIDES[record.numero]
  if (!memorizzata && !curata) return undefined
  const unita: Partial<SimplifiedLaw> = { ...curata, ...memorizzata }
  if (curata?.perTe || memorizzata?.perTe) {
    unita.perTe = { ...(curata?.perTe ?? {}), ...(memorizzata?.perTe ?? {}) }
  }
  return unita
}

export function normalizeLaw(record: LawRecord): Law {
  const persone = derivePersone(record)
  return {
    eli: record.eli,
    nir: record.nir,
    tipo: record.tipo,
    numero: record.numero,
    dataEmanazione: record.dataEmanazione,
    titolo: record.titolo,
    sintesi: record.sintesi,
    stato: deriveStato(record).stato,
    gulpease: record.gulpease ?? calcGulpease(record.testo ?? record.sintesi).indice,
    fonti: record.fonti ?? {},
    semplificata: deriveSemplificata(record, overrideSemplificata(record)),
    persone,
    attuativi: record.attuativi ?? { daAdottare: 0, adottati: 0, scaduti: 0 },
    air: record.air ?? 'esente',
    fiducia: record.fiducia ?? false,
    omnibus: record.omnibus ?? false,
    qualita: deriveQualita(record),
    featured: record.numero === '133' && record.tipo.includes('decreto.legge'),
    dimostrativo: record.dimostrativo ?? false,
  }
}

function normalizeMinister(record: MinisterRecord): Minister {
  return {
    slug: record.slug,
    nome: record.nome,
    dicastero: record.dicastero,
    partito: record.partito ?? undefined,
    competenze: record.competenze,
    provvedimenti: record.provvedimenti,
  }
}

/**
 * Fallback minimo: garantisce che la UI renderizzi anche se il seed fosse
 * vuoto o non disponibile.
 */
const FALLBACK_RECORD: LawRecord = {
  eli: '/eli/id/2026/07/27/26G00155/sg',
  nir: 'urn:nir:stato:decreto.legge:2026-07-27;133',
  tipo: 'decreto.legge',
  numero: '133',
  dataEmanazione: '2026-07-27',
  titolo: 'Disposizioni urgenti in materia di energia e di riconversione industriale dei siti produttivi strategici',
  sintesi:
    'Il decreto incentiva la riconversione degli impianti alimentati a gasolio e avvia un programma straordinario per il sito di ILVA a Taranto.',
  stato: 'in_vigore',
  gulpease: null,
  fonti: buildFonti({
    tipo: 'decreto.legge',
    numero: '133',
    dataEmanazione: '2026-07-27',
    codiceRedazionale: '26G00155',
    dataGU: '2026-07-27',
    numeroGU: '172',
  }),
  air: 'semplificata',
  attuativi: { daAdottare: 2, adottati: 0, scaduti: 0 },
  fiducia: false,
  omnibus: false,
  testo:
    'Disposizioni urgenti in materia di energia e di riconversione industriale dei siti produttivi strategici. Il Governo adotta misure per la riconversione degli impianti alimentati a gasolio. Le amministrazioni competenti adottano i decreti attuativi entro sessanta giorni.',
}

const FALLBACK_LAWS: Law[] = [normalizeLaw(FALLBACK_RECORD)]

function tutteLeLeggi(): Law[] {
  const leggi = SEED_LAWS.map(normalizeLaw)
  return leggi.length > 0 ? leggi : FALLBACK_LAWS
}

function tuttiIMinistri(): Minister[] {
  return SEED_MINISTERS.map(normalizeMinister)
}

/* ---------------------------------------------------------------------------
 * API usata dalle pagine.
 * ------------------------------------------------------------------------- */

/**
 * Carica le norme preferendo il database, con ricaduta automatica sul seed.
 * Non lancia mai: se il DB è assente o vuoto restituisce comunque un corpus.
 */
export async function loadLaws(): Promise<Law[]> {
  try {
    const records = await getLawsFromDBorSeed()
    const leggi = records.map(normalizeLaw)
    return leggi.length > 0 ? leggi : FALLBACK_LAWS
  } catch {
    return tutteLeLeggi()
  }
}

export async function loadMinisters(): Promise<Minister[]> {
  return tuttiIMinistri()
}

/** Cerca una norma per ELI/NIR preferendo il DB, con ricaduta sul seed. */
export async function loadLawByEli(eliParam: string): Promise<Law | undefined> {
  try {
    const record = await getLawByEli(eliParam)
    if (record) return normalizeLaw(record)
  } catch {
    // ricade sul seed
  }
  return findLawByEli(tutteLeLeggi(), eliParam)
}

export async function loadMinisterBySlug(slug: string): Promise<Minister | undefined> {
  return tuttiIMinistri().find((minister) => minister.slug === slug)
}

/**
 * Ricerca testuale sul corpus. Se `corpus` non è fornito usa il seed; le pagine
 * passano l'elenco già caricato (DB + seed) per coerenza con il feed.
 */
export async function searchLaws(query: string, corpus?: Law[]): Promise<Law[]> {
  const leggi = corpus ?? tutteLeLeggi()
  const q = normalizeText(query)
  if (!q) return leggi
  return leggi.filter((law) => {
    const testo = normalizeText(
      [law.titolo, law.sintesi, law.numero, formatTipo(law.tipo), law.semplificata.in10Secondi].join(' '),
    )
    return testo.includes(q)
  })
}

/** Scheda di un ministro e leggi collegate (dai `provvedimenti`). */
export function leggiDelMinistro(minister: Minister, leggi: Law[]): Law[] {
  const numeri = new Set(
    minister.provvedimenti
      .map((provvedimento) => provvedimento.match(/(\d+)\s*\/\s*(\d{4})/)?.[1] ?? provvedimento.match(/(\d+)/)?.[1])
      .filter((value): value is string => Boolean(value)),
  )
  return leggi.filter((law) => numeri.has(law.numero))
}

/* ---------------------------------------------------------------------------
 * Utility.
 * ------------------------------------------------------------------------- */

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function eliSegments(eli: string): string[] {
  return eli
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
}

export function eliPath(law: Law): string[] {
  return eliSegments(law.eli)
}

export function lawHref(law: Law): string {
  const path = eliSegments(law.eli).map((segment) => encodeURIComponent(segment)).join('/')
  return `/leggi/${path}`
}

export function ministerHref(minister: Minister): string {
  return `/ministri/${encodeURIComponent(minister.slug)}`
}

export function findLawByEli(leggi: Law[], eliParam: string): Law | undefined {
  const target = normalizeEliKey(eliParam)
  return (
    leggi.find((law) => normalizeEliKey(law.eli) === target) ??
    leggi.find((law) => normalizeEliKey(law.eli).split('/').pop() === target.split('/').pop())
  )
}

function normalizeEliKey(value: string): string {
  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    decoded = value
  }
  return decoded.toLowerCase().replace(/^\/+/, '').replace(/\/+$/, '')
}

export function formatDate(iso: string): string {
  if (!iso) return ''
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function formatEuro(value: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
}

export function personaRelevant(law: Law, persona: string): boolean {
  if (!persona || persona === 'tutti') return true
  return law.persone.includes(persona as PersonaKey)
}

export function attuativiRiepilogo(attuativi: AttuativiInput): string {
  const parti: string[] = []
  if (attuativi.adottati > 0) parti.push(`${attuativi.adottati} adottati`)
  if (attuativi.daAdottare > 0) parti.push(`${attuativi.daAdottare} da adottare`)
  if (attuativi.scaduti > 0) parti.push(`${attuativi.scaduti} scaduti`)
  if (parti.length === 0) return 'Nessun decreto attuativo previsto.'
  return `Decreti attuativi: ${parti.join(', ')}.`
}
