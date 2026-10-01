/**
 * Seed espanso realistico - 72 atti curati (1948-2026).
 *
 * - 2 atti di riferimento con `dimostrativo: false` (Costituzione, Codice della strada).
 * - 70 atti dimostrativi con `dimostrativo: true`.
 * - Numeri riservati MAI usati: 8, 36, 124, 133, 139.
 * - ELI canonico: `/eli/<slug-tipo>/<anno>/<numero>`
 * - NIR canonico: `urn:nir:stato:<slug-tipo>:<anno>-<mm>-<giorno>;<numero>`
 * - Testi generati in modo deterministico (300-800 parole) con rinvii espliciti.
 * - Funzioni di accesso never-throw: restituiscono sempre `{ ok: true | false }`, mai `throw`.
 */

export type TipoAtto =
  | "Legge"
  | "Legge Costituzionale"
  | "Decreto-Legge"
  | "Decreto Legislativo"
  | "D.P.R."
  | "Regolamento";

export interface AttoEspanso {
  eli: string;
  nir: string;
  tipo: TipoAtto;
  numero: number;
  anno: number;
  dataEmanazione: string;
  titolo: string;
  sintesi: string;
  testo: string;
  tema: string;
  dimostrativo: boolean;
  air: boolean;
  attuativiPrevisti: number;
  attuativiAdottati: number;
  fiducia: boolean;
  omnibus: boolean;
  rinviiEli: string[];
}

export type Risultato<T> = { ok: true; valore: T } | { ok: false; errore: string };

export const NUMERI_RISERVATI = [8, 36, 124, 133, 139] as const;
export const ANNO_MIN = 1948;
export const ANNO_MAX = 2026;

const SLUG_PER_TIPO: Record<TipoAtto, string> = {
  Legge: "legge",
  "Legge Costituzionale": "legge-costituzionale",
  "Decreto-Legge": "decreto-legge",
  "Decreto Legislativo": "decreto-legislativo",
  "D.P.R.": "dpr",
  Regolamento: "regolamento",
};

function dueCifre(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function costruisciEli(tipo: string, anno: number, numero: number): string {
  const slug = (SLUG_PER_TIPO[tipo as TipoAtto] ?? "legge") as string;
  return `/eli/${slug}/${anno}/${numero}`;
}

export function costruisciNir(
  tipo: string,
  anno: number,
  mese: number,
  giorno: number,
  numero: number,
): string {
  const slug = (SLUG_PER_TIPO[tipo as TipoAtto] ?? "legge") as string;
  return `urn:nir:stato:${slug}:${anno}-${dueCifre(mese)}-${dueCifre(giorno)};${numero}`;
}

const REGEX_ELI = /^\/eli\/[a-z0-9-]+\/[0-9]{4}\/[0-9]+$/;
const REGEX_NIR = /^urn:nir:stato:[a-z0-9-]+:[0-9]{4}-[0-9]{2}-[0-9]{2};[0-9]+$/;

export function eliValido(eli: unknown): boolean {
  try {
    if (typeof eli !== "string") return false;
    if (!REGEX_ELI.test(eli)) return false;
    const parti = eli.split("/");
    if (parti.length !== 5) return false;
    const anno = Number(parti[3]);
    const numero = Number(parti[4]);
    if (!Number.isInteger(anno) || !Number.isInteger(numero)) return false;
    if (anno < ANNO_MIN || anno > ANNO_MAX) return false;
    if (numero <= 0 || numero > 100000) return false;
    if ((NUMERI_RISERVATI as readonly number[]).includes(numero)) return false;
    return true;
  } catch {
    return false;
  }
}

export function nirValido(nir: unknown): boolean {
  try {
    if (typeof nir !== "string") return false;
    if (!REGEX_NIR.test(nir)) return false;
    const dopoStato = nir.slice("urn:nir:stato:".length);
    const [slugEData, numeroStr] = dopoStato.split(";");
    if (!slugEData || !numeroStr) return false;
    const numero = Number(numeroStr);
    if (!Number.isInteger(numero) || numero <= 0 || numero > 100000) return false;
    if ((NUMERI_RISERVATI as readonly number[]).includes(numero)) return false;
    const matchData = slugEData.match(/:(\d{4})-(\d{2})-(\d{2})$/);
    if (!matchData) return false;
    const anno = Number(matchData[1]);
    const mese = Number(matchData[2]);
    const giorno = Number(matchData[3]);
    if (anno < ANNO_MIN || anno > ANNO_MAX) return false;
    if (mese < 1 || mese > 12) return false;
    if (giorno < 1 || giorno > 31) return false;
    const d = new Date(Date.UTC(anno, mese - 1, giorno));
    if (d.getUTCFullYear() !== anno || d.getUTCMonth() !== mese - 1 || d.getUTCDate() !== giorno) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function calcolaGulpease(testo: unknown): number | null {
  try {
    if (typeof testo !== "string") return null;
    const pulito = testo.trim();
    if (pulito.length < 20) return null;
    const frasi = pulito.split(/[.!?;]+/).filter((s) => s.trim().length > 0).length;
    const parole = pulito.split(/\s+/).filter(Boolean);
    if (parole.length < 10 || frasi === 0) return null;
    let lettere = 0;
    for (const p of parole) {
      const soloLettere = p.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
      lettere += soloLettere.length;
    }
    if (lettere === 0) return null;
    const valore = 89 + (300 * frasi - 10 * lettere) / parole.length;
    if (!Number.isFinite(valore)) return null;
    return Math.round(valore * 10) / 10;
  } catch {
    return null;
  }
}

export function contaParole(testo: unknown): number {
  try {
    if (typeof testo !== "string") return 0;
    return testo.split(/\s+/).filter(Boolean).length;
  } catch {
    return 0;
  }
}

/** FNV-1a 32 bit, deterministico. */
export function fnv1a(testo: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < testo.length; i++) {
    h ^= testo.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 deterministico. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scegli<T>(lista: readonly T[], rnd: () => number): T {
  const i = Math.floor(rnd() * lista.length) % lista.length;
  return lista[i] as T;
}

// ---------------------------------------------------------------------------
// Schede curate (metadati realistici, titoli veri o plausibili)
// ---------------------------------------------------------------------------

interface Scheda {
  tipo: TipoAtto;
  numero: number;
  anno: number;
  mese: number;
  giorno: number;
  titolo: string;
  sintesi: string;
  tema: string;
  dimostrativo: boolean;
  air: boolean;
  attuativiPrevisti: number;
  attuativiAdottati: number;
  fiducia: boolean;
  omnibus: boolean;
  rinvii: string[];
}

const SCHEDE: Scheda[] = [
  {
    tipo: "Legge",
    numero: 1,
    anno: 1948,
    mese: 1,
    giorno: 1,
    titolo: "Costituzione della Repubblica Italiana",
    sintesi:
      "Legge fondamentale dello Stato: principi, diritti e doveri dei cittadini, ordinamento della Repubblica, garanzie costituzionali e revisione.",
    tema: "istituzioni-democrazia",
    dimostrativo: false,
    air: false,
    attuativiPrevisti: 0,
    attuativiAdottati: 0,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 47/1948", "legge 241/1990"],
  },
  {
    tipo: "Decreto Legislativo",
    numero: 285,
    anno: 1992,
    mese: 4,
    giorno: 30,
    titolo: "Nuovo codice della strada",
    sintesi:
      "Disciplina organica della circolazione stradale: regole di comportamento, segnaletica, patenti, veicoli, sanzioni e sicurezza.",
    tema: "trasporti-sicurezza-stradale",
    dimostrativo: false,
    air: true,
    attuativiPrevisti: 12,
    attuativiAdottati: 12,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 241/1990", "decreto legislativo 165/2001"],
  },
  {
    tipo: "Legge",
    numero: 47,
    anno: 1948,
    mese: 2,
    giorno: 8,
    titolo: "Disposizioni sulla stampa",
    sintesi:
      "Registrazione delle testate, responsabilità del direttore e dell'editore, rettifica e norme penali a tutela della libertà di stampa.",
    tema: "diritti-liberta-stampa",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 1,
    attuativiAdottati: 1,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 645/1952"],
  },
  {
    tipo: "Legge",
    numero: 645,
    anno: 1952,
    mese: 6,
    giorno: 20,
    titolo: "Divieto di riorganizzazione del disciolto partito fascista (Legge Scelba)",
    sintesi:
      "Attuazione della XII disposizione transitoria della Costituzione: fattispecie di apologia e riorganizzazione, pene e misure di prevenzione.",
    tema: "istituzioni-democrazia",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 0,
    attuativiAdottati: 0,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 47/1948"],
  },
  {
    tipo: "Legge",
    numero: 75,
    anno: 1958,
    mese: 2,
    giorno: 20,
    titolo: "Abolizione della regolamentazione della prostituzione (Legge Merlin)",
    sintesi:
      "Chiusura delle case di tolleranza, reati di sfruttamento e favoreggiamento, misure sanitarie e di reinserimento sociale.",
    tema: "diritti-salute",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 2,
    attuativiAdottati: 2,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 180/1978"],
  },
  {
    tipo: "Legge",
    numero: 167,
    anno: 1962,
    mese: 4,
    giorno: 18,
    titolo: "Disposizioni per favorire l'acquisizione di aree per l'edilizia economica e popolare",
    sintesi:
      "Piani di zona, espropri per pubblica utilità, convenzioni con cooperative e limiti ai prezzi di cessione degli alloggi popolari.",
    tema: "casa-urbanistica",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 3,
    attuativiAdottati: 3,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 765/1967"],
  },
  {
    tipo: "Legge",
    numero: 765,
    anno: 1967,
    mese: 8,
    giorno: 6,
    titolo: "Modifiche alla legge urbanistica (Legge ponte)",
    sintesi:
      "Standard urbanistici minimi, licenze edilizie, lottizzazioni convenzionate e poteri sostitutivi in materia di pianificazione comunale.",
    tema: "casa-urbanistica",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 4,
    attuativiAdottati: 3,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 167/1962", "decreto del Presidente della Repubblica 380/2001"],
  },
  {
    tipo: "Legge",
    numero: 300,
    anno: 1970,
    mese: 5,
    giorno: 20,
    titolo: "Norme sulla tutela della libertà e dignità dei lavoratori (Statuto dei lavoratori)",
    sintesi:
      "Diritti sindacali in fabbrica, divieto di controllo a distanza, mansioni e trasferimenti, licenziamenti e repressione della condotta antisindacale.",
    tema: "lavoro-diritti",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 2,
    attuativiAdottati: 2,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 68/1999", "decreto legislativo 23/2015"],
  },
  {
    tipo: "Legge",
    numero: 898,
    anno: 1970,
    mese: 12,
    giorno: 1,
    titolo: "Disciplina dei casi di scioglimento del matrimonio",
    sintesi:
      "Introduzione del divorzio: presupposti, separazione triennale, assegno all'ex coniuge, affidamento dei figli e rito processuale.",
    tema: "famiglia-diritti",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 0,
    attuativiAdottati: 0,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 151/1975", "legge 54/2006"],
  },
  {
    tipo: "Legge",
    numero: 151,
    anno: 1975,
    mese: 5,
    giorno: 19,
    titolo: "Riforma del diritto di famiglia",
    sintesi:
      "Parità tra coniugi, comunione legale dei beni, potestà genitoriale condivisa, filiazione e protezione dei minori.",
    tema: "famiglia-diritti",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 1,
    attuativiAdottati: 1,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 898/1970", "legge 184/1983"],
  },
  {
    tipo: "Legge",
    numero: 354,
    anno: 1975,
    mese: 7,
    giorno: 26,
    titolo:
      "Norme sull'ordinamento penitenziario e sull'esecuzione delle misure privative della libertà",
    sintesi:
      "Trattamento rieducativo, lavoro dei detenuti, permessi premio, misure alternative e sorveglianza particolare.",
    tema: "giustizia-carcere",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 5,
    attuativiAdottati: 5,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 241/1990"],
  },
  {
    tipo: "Legge",
    numero: 180,
    anno: 1978,
    mese: 5,
    giorno: 13,
    titolo: "Accertamenti e trattamenti sanitari volontari e obbligatori (Legge Basaglia)",
    sintesi:
      "Chiusura dei manicomi, trattamenti sanitari obbligatori come extrema ratio, servizi territoriali e diritti dei pazienti psichiatrici.",
    tema: "salute-diritti",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 3,
    attuativiAdottati: 3,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 194/1978", "legge 219/2017"],
  },
  {
    tipo: "Legge",
    numero: 194,
    anno: 1978,
    mese: 5,
    giorno: 22,
    titolo:
      "Norme per la tutela sociale della maternità e sull'interruzione volontaria della gravidanza",
    sintesi:
      "Consultori, obiezione di coscienza, termini e procedure per l'interruzione volontaria, ruolo delle strutture pubbliche.",
    tema: "salute-diritti",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 2,
    attuativiAdottati: 2,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 180/1978"],
  },
  {
    tipo: "Legge",
    numero: 184,
    anno: 1983,
    mese: 5,
    giorno: 4,
    titolo: "Disciplina dell'adozione e dell'affidamento dei minori",
    sintesi:
      "Adozione legittimante, affidamento familiare, idoneità degli adottanti, tribunale per i minorenni e banche dati dei minori adottabili.",
    tema: "famiglia-minori",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 2,
    attuativiAdottati: 2,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 151/1975", "legge 54/2006"],
  },
  {
    tipo: "Legge",
    numero: 47,
    anno: 1985,
    mese: 2,
    giorno: 28,
    titolo:
      "Norme in materia di controllo dell'attività urbanistico-edilizia (primo condono edilizio)",
    sintesi:
      "Sanatoria delle opere abusive, oblazioni, vincoli paesaggistici e poteri di demolizione dei comuni.",
    tema: "casa-urbanistica",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 3,
    attuativiAdottati: 3,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 765/1967"],
  },
  {
    tipo: "Legge",
    numero: 49,
    anno: 1987,
    mese: 2,
    giorno: 26,
    titolo: "Nuova disciplina della cooperazione dell'Italia con i Paesi in via di sviluppo",
    sintesi:
      "Aiuti bilaterali e multilaterali, organizzazioni non governative, crediti d'aiuto e programmazione triennale degli interventi.",
    tema: "esteri-cooperazione",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 4,
    attuativiAdottati: 3,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 147/2013"],
  },
  {
    tipo: "Legge",
    numero: 39,
    anno: 1990,
    mese: 2,
    giorno: 28,
    titolo:
      "Norme urgenti in materia di asilo politico e ingresso degli extracomunitari (Legge Martelli)",
    sintesi:
      "Riconoscimento dello status di rifugiato, programmazione dei flussi, permessi di soggiorno e sanatoria per i lavoratori presenti.",
    tema: "immigrazione-asilo",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 5,
    attuativiAdottati: 4,
    fiducia: true,
    omnibus: false,
    rinvii: ["legge 189/2002"],
  },
  {
    tipo: "Legge",
    numero: 142,
    anno: 1990,
    mese: 6,
    giorno: 8,
    titolo: "Ordinamento delle autonomie locali",
    sintesi:
      "Comuni e province, statuti, sindaco e consiglio, servizi pubblici locali, controlli e finanza degli enti territoriali.",
    tema: "istituzioni-enti-locali",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 6,
    attuativiAdottati: 6,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 59/1997", "legge 56/2014"],
  },
  {
    tipo: "Legge",
    numero: 241,
    anno: 1990,
    mese: 8,
    giorno: 7,
    titolo: "Nuove norme in materia di procedimento amministrativo e di diritto di accesso",
    sintesi:
      "Responsabile del procedimento, termini di conclusione, partecipazione, motivazione, accesso agli atti e silenzio assenso.",
    tema: "pubblica-amministrazione",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 2,
    attuativiAdottati: 2,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 142/1990", "decreto legislativo 33/2013"],
  },
  {
    tipo: "Legge",
    numero: 109,
    anno: 1994,
    mese: 2,
    giorno: 11,
    titolo: "Legge quadro in materia di lavori pubblici (Legge Merloni)",
    sintesi:
      "Programmazione triennale, gare a evidenza pubblica, anomalia delle offerte, direzione lavori e collaudo delle opere.",
    tema: "appalti-opere-pubbliche",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 7,
    attuativiAdottati: 7,
    fiducia: false,
    omnibus: false,
    rinvii: ["decreto legislativo 50/2016"],
  },
  {
    tipo: "Legge",
    numero: 59,
    anno: 1997,
    mese: 3,
    giorno: 15,
    titolo: "Delega al Governo per il conferimento di funzioni alle regioni (Legge Bassanini)",
    sintesi:
      "Federalismo amministrativo, sussidiarietà, semplificazione, sportello unico e riordino degli uffici periferici dello Stato.",
    tema: "pubblica-amministrazione",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 9,
    attuativiAdottati: 8,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 127/1997", "legge 142/1990"],
  },
  {
    tipo: "Legge",
    numero: 127,
    anno: 1997,
    mese: 5,
    giorno: 15,
    titolo: "Misure urgenti per lo snellimento dell'attività amministrativa (Bassanini-bis)",
    sintesi:
      "Autocertificazione, firma digitale ante litteram, soppressione di certificati inutili e conferenze di servizi.",
    tema: "pubblica-amministrazione",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 6,
    attuativiAdottati: 6,
    fiducia: false,
    omnibus: true,
    rinvii: ["legge 59/1997", "legge 241/1990"],
  },
  {
    tipo: "Legge",
    numero: 68,
    anno: 1999,
    mese: 3,
    giorno: 12,
    titolo: "Norme per il diritto al lavoro dei disabili",
    sintesi:
      "Collocamento mirato, quote di riserva, convenzioni con le imprese, incentivi e fondo per l'occupazione dei disabili.",
    tema: "lavoro-disabilita",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 3,
    attuativiAdottati: 3,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 300/1970", "decreto legislativo 165/2001"],
  },
  {
    tipo: "Legge",
    numero: 53,
    anno: 2000,
    mese: 3,
    giorno: 8,
    titolo:
      "Disposizioni per il sostegno della maternità e della paternità e per il diritto alla cura",
    sintesi:
      "Congedi parentali, riposi giornalieri, congedi per malattia dei figli, voucher e coordinamento dei tempi delle città.",
    tema: "lavoro-famiglia",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 2,
    attuativiAdottati: 2,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 151/1975", "legge 107/2015"],
  },
  {
    tipo: "D.P.R.",
    numero: 445,
    anno: 2000,
    mese: 12,
    giorno: 28,
    titolo: "Testo unico delle disposizioni in materia di documentazione amministrativa",
    sintesi:
      "Autocertificazioni, dichiarazioni sostitutive, protocollo informatico, firme e validità giuridica dei documenti della pubblica amministrazione.",
    tema: "pubblica-amministrazione",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 4,
    attuativiAdottati: 4,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 241/1990", "decreto legislativo 82/2005"],
  },
  {
    tipo: "Legge Costituzionale",
    numero: 3,
    anno: 2001,
    mese: 10,
    giorno: 18,
    titolo: "Modifiche al titolo V della parte seconda della Costituzione",
    sintesi:
      "Ripartizione della potestà legislativa tra Stato e Regioni, sussidiarietà, federalismo fiscale in nuce e potere sostitutivo.",
    tema: "istituzioni-democrazia",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 5,
    attuativiAdottati: 4,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 59/1997", "legge 86/2024"],
  },
  {
    tipo: "D.P.R.",
    numero: 380,
    anno: 2001,
    mese: 6,
    giorno: 6,
    titolo: "Testo unico delle disposizioni in materia edilizia",
    sintesi:
      "Titoli abilitativi, permesso di costruire, SCIA, agibilità, vigilanza sulle costruzioni e sanzioni per gli abusi.",
    tema: "casa-urbanistica",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 5,
    attuativiAdottati: 5,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 765/1967", "legge 47/1985"],
  },
  {
    tipo: "Decreto Legislativo",
    numero: 165,
    anno: 2001,
    mese: 3,
    giorno: 30,
    titolo:
      "Norme generali sull'ordinamento del lavoro alle dipendenze delle amministrazioni pubbliche",
    sintesi:
      "Privatizzazione del pubblico impiego, dirigenza, concorsi, valutazione della performance e contrattazione collettiva nazionale.",
    tema: "pubblica-amministrazione",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 8,
    attuativiAdottati: 8,
    fiducia: false,
    omnibus: false,
    rinvii: ["decreto legislativo 150/2009", "decreto-legge 25/2025"],
  },
  {
    tipo: "Legge",
    numero: 189,
    anno: 2002,
    mese: 7,
    giorno: 30,
    titolo: "Modifica alla normativa in materia di immigrazione e di asilo (Bossi-Fini)",
    sintesi:
      "Contratto di soggiorno per lavoro, impronte, centri di permanenza, ricongiungimenti e contrasto all'immigrazione irregolare.",
    tema: "immigrazione-asilo",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 6,
    attuativiAdottati: 5,
    fiducia: true,
    omnibus: false,
    rinvii: ["legge 39/1990"],
  },
  {
    tipo: "Decreto Legislativo",
    numero: 196,
    anno: 2003,
    mese: 6,
    giorno: 30,
    titolo: "Codice in materia di protezione dei dati personali",
    sintesi:
      "Informativa e consenso, diritti dell'interessato, misure di sicurezza, Garante privacy e sanzioni per i trattamenti illeciti.",
    tema: "digitale-privacy",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 6,
    attuativiAdottati: 6,
    fiducia: false,
    omnibus: false,
    rinvii: ["decreto legislativo 101/2018", "decreto legislativo 82/2005"],
  },
  {
    tipo: "Decreto Legislativo",
    numero: 42,
    anno: 2004,
    mese: 1,
    giorno: 22,
    titolo: "Codice dei beni culturali e del paesaggio",
    sintesi:
      "Tutela e valorizzazione del patrimonio culturale, vincoli, autorizzazioni paesaggistiche, musei e agevolazioni per il mecenatismo.",
    tema: "cultura-paesaggio",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 7,
    attuativiAdottati: 7,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 765/1967"],
  },
  {
    tipo: "Decreto Legislativo",
    numero: 82,
    anno: 2005,
    mese: 3,
    giorno: 7,
    titolo: "Codice dell'amministrazione digitale",
    sintesi:
      "SPID e identità digitale, domicilio digitale, pagamenti elettronici, interoperabilità, open data e accessibilità dei servizi online.",
    tema: "digitale-pubblica-amministrazione",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 14,
    attuativiAdottati: 11,
    fiducia: false,
    omnibus: false,
    rinvii: ["decreto legislativo 33/2013", "decreto del Presidente della Repubblica 445/2000"],
  },
  {
    tipo: "Decreto Legislativo",
    numero: 206,
    anno: 2005,
    mese: 9,
    giorno: 6,
    titolo: "Codice del consumo",
    sintesi:
      "Diritti dei consumatori, pratiche commerciali scorrette, garanzie sui beni, contratti a distanza, class action e conciliazioni.",
    tema: "consumatori-mercato",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 3,
    attuativiAdottati: 3,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 241/1990"],
  },
  {
    tipo: "Legge",
    numero: 54,
    anno: 2006,
    mese: 2,
    giorno: 8,
    titolo: "Disposizioni in materia di separazione dei genitori e affidamento condiviso dei figli",
    sintesi:
      "Bigenitorialità come regola, tempi paritetici, assegno di mantenimento diretto, mediazione familiare e ascolto del minore.",
    tema: "famiglia-minori",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 1,
    attuativiAdottati: 1,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 898/1970", "legge 184/1983"],
  },
  {
    tipo: "Legge",
    numero: 248,
    anno: 2006,
    mese: 8,
    giorno: 4,
    titolo: "Conversione del decreto Bersani sulle liberalizzazioni",
    sintesi:
      "Farmaci nei supermercati, passaggi di proprietà auto, portabilità dei mutui, professioni e tutela della concorrenza.",
    tema: "consumatori-mercato",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 4,
    attuativiAdottati: 4,
    fiducia: true,
    omnibus: true,
    rinvii: ["decreto legislativo 206/2005"],
  },
  {
    tipo: "Legge",
    numero: 123,
    anno: 2007,
    mese: 8,
    giorno: 3,
    titolo: "Misure in tema di tutela della salute e della sicurezza sul lavoro (delega)",
    sintesi:
      "Delega per il testo unico sulla sicurezza, documento di valutazione dei rischi, appalti, tutele per i precari e coordinamento ispettivo.",
    tema: "lavoro-sicurezza",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 10,
    attuativiAdottati: 9,
    fiducia: false,
    omnibus: false,
    rinvii: ["decreto legislativo 81/2008"],
  },
  {
    tipo: "Decreto Legislativo",
    numero: 81,
    anno: 2008,
    mese: 4,
    giorno: 9,
    titolo: "Testo unico in materia di tutela della salute e della sicurezza nei luoghi di lavoro",
    sintesi:
      "Valutazione dei rischi, formazione obbligatoria, dispositivi di protezione, medici competenti, cantieri e sanzioni penali.",
    tema: "lavoro-sicurezza",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 15,
    attuativiAdottati: 13,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 123/2007", "legge 300/1970"],
  },
  {
    tipo: "Decreto-Legge",
    numero: 112,
    anno: 2008,
    mese: 6,
    giorno: 25,
    titolo:
      "Disposizioni urgenti per lo sviluppo economico e la stabilizzazione della finanza pubblica",
    sintesi:
      "Manovra d'estate: tagli ai ministeri, patto di stabilità interno, social card, efficienza della spesa e semplificazioni per le imprese.",
    tema: "fisco-finanza-pubblica",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 18,
    attuativiAdottati: 15,
    fiducia: true,
    omnibus: true,
    rinvii: ["legge 147/2013", "legge 196/2009"],
  },
  {
    tipo: "Legge",
    numero: 94,
    anno: 2009,
    mese: 7,
    giorno: 15,
    titolo: "Disposizioni in materia di sicurezza pubblica",
    sintesi:
      "Ronde cittadine, contrasto alle occupazioni, aggravanti per la clandestinità poi abrogate, videosorveglianza e poteri dei sindaci.",
    tema: "sicurezza-ordine-pubblico",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 5,
    attuativiAdottati: 4,
    fiducia: true,
    omnibus: false,
    rinvii: ["legge 189/2002"],
  },
  {
    tipo: "Decreto Legislativo",
    numero: 150,
    anno: 2009,
    mese: 10,
    giorno: 27,
    titolo:
      "Attuazione della delega in materia di ottimizzazione della produttività del lavoro pubblico (Riforma Brunetta)",
    sintesi:
      "Valutazione della performance, premi di risultato, dirigenti responsabili, trasparenza e procedimenti disciplinari accelerati.",
    tema: "pubblica-amministrazione",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 9,
    attuativiAdottati: 9,
    fiducia: false,
    omnibus: false,
    rinvii: ["decreto legislativo 165/2001", "decreto legislativo 33/2013"],
  },
  {
    tipo: "Decreto Legislativo",
    numero: 104,
    anno: 2010,
    mese: 7,
    giorno: 2,
    titolo: "Codice del processo amministrativo",
    sintesi:
      "Giurisdizione dei TAR e del Consiglio di Stato, rito abbreviato per gli appalti, motivi aggiunti, esecuzione del giudicato e spese.",
    tema: "giustizia-processo",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 2,
    attuativiAdottati: 2,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 241/1990", "decreto legislativo 50/2016"],
  },
  {
    tipo: "Legge",
    numero: 183,
    anno: 2010,
    mese: 11,
    giorno: 4,
    titolo:
      "Deleghe al Governo in materia di lavori usuranti e riorganizzazione degli enti (Collegato lavoro)",
    sintesi:
      "Arbitrato nelle controversie di lavoro, apprendistato, part-time, ispezioni e riordino di INPS e INAIL.",
    tema: "lavoro-diritti",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 7,
    attuativiAdottati: 6,
    fiducia: true,
    omnibus: true,
    rinvii: ["legge 300/1970", "decreto legislativo 23/2015"],
  },
  {
    tipo: "Decreto-Legge",
    numero: 201,
    anno: 2011,
    mese: 12,
    giorno: 6,
    titolo: "Disposizioni urgenti per la crescita e la stabilità (Salva Italia)",
    sintesi:
      "Riforma Fornero delle pensioni, IMU, liberalizzazioni, incentivi alle imprese e lotta all'evasione con nuovi limiti al contante.",
    tema: "fisco-pensioni",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 20,
    attuativiAdottati: 18,
    fiducia: true,
    omnibus: true,
    rinvii: ["legge 214/2011"],
  },
  {
    tipo: "Legge",
    numero: 214,
    anno: 2011,
    mese: 12,
    giorno: 22,
    titolo: "Conversione del decreto Salva Italia",
    sintesi:
      "Legge di conversione con modificazioni: pensioni, fisco municipale, concorrenza e misure per la crescita approvate con fiducia.",
    tema: "fisco-pensioni",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 4,
    attuativiAdottati: 4,
    fiducia: true,
    omnibus: true,
    rinvii: ["decreto-legge 201/2011"],
  },
  {
    tipo: "Legge",
    numero: 3,
    anno: 2012,
    mese: 1,
    giorno: 27,
    titolo: "Disposizioni in materia di usura e di composizione delle crisi da sovraindebitamento",
    sintesi:
      "Procedure per i debitori non fallibili, piano del consumatore, esdebitazione e organismi di composizione con omologa del tribunale.",
    tema: "giustizia-economia",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 2,
    attuativiAdottati: 2,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 241/1990"],
  },
  {
    tipo: "Decreto-Legge",
    numero: 83,
    anno: 2012,
    mese: 6,
    giorno: 22,
    titolo: "Misure urgenti per la crescita del Paese (Decreto sviluppo)",
    sintesi:
      "Credito d'imposta ricerca, srl semplificate, edilizia e project bond, zone a burocrazia zero e agenda digitale in embrione.",
    tema: "economia-imprese",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 16,
    attuativiAdottati: 12,
    fiducia: true,
    omnibus: true,
    rinvii: ["decreto legislativo 82/2005"],
  },
  {
    tipo: "Legge",
    numero: 190,
    anno: 2012,
    mese: 11,
    giorno: 6,
    titolo: "Disposizioni per la prevenzione e la repressione della corruzione (Legge Severino)",
    sintesi:
      "Autorità anticorruzione, piani triennali, trasparenza, inconferibilità, whistleblowing iniziale e nuove fattispecie di concussione.",
    tema: "pubblica-amministrazione",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 8,
    attuativiAdottati: 8,
    fiducia: false,
    omnibus: false,
    rinvii: ["decreto legislativo 33/2013", "decreto legislativo 165/2001"],
  },
  {
    tipo: "Decreto-Legge",
    numero: 76,
    anno: 2013,
    mese: 6,
    giorno: 28,
    titolo: "Interventi urgenti per l'occupazione giovanile e la competitività",
    sintesi:
      "Incentivi per le assunzioni a tempo indeterminato dei giovani, apprendistato, alternanza e sgravi per le start-up innovative.",
    tema: "lavoro-giovani",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 10,
    attuativiAdottati: 8,
    fiducia: true,
    omnibus: false,
    rinvii: ["decreto legislativo 23/2015"],
  },
  {
    tipo: "Decreto Legislativo",
    numero: 33,
    anno: 2013,
    mese: 3,
    giorno: 14,
    titolo: "Riordino della disciplina riguardante gli obblighi di pubblicità e trasparenza",
    sintesi:
      "Amministrazione trasparente, accesso civico, pubblicazione di bandi, consulenze, bilanci e dati sui titolari di incarichi.",
    tema: "pubblica-amministrazione",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 3,
    attuativiAdottati: 3,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 241/1990", "legge 190/2012"],
  },
  {
    tipo: "Legge",
    numero: 147,
    anno: 2013,
    mese: 12,
    giorno: 27,
    titolo: "Disposizioni per la formazione del bilancio annuale e pluriennale (Stabilità 2014)",
    sintesi:
      "Legge di stabilità: cuneo fiscale, TARI e TASI, crediti alle imprese, fondo per le non autosufficienze e tetti di spesa.",
    tema: "fisco-finanza-pubblica",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 22,
    attuativiAdottati: 19,
    fiducia: true,
    omnibus: true,
    rinvii: ["legge 208/2015", "legge 232/2016"],
  },
  {
    tipo: "Legge",
    numero: 56,
    anno: 2014,
    mese: 4,
    giorno: 7,
    titolo: "Disposizioni sulle città metropolitane e sulle province (Legge Delrio)",
    sintesi:
      "Aree vaste, sindaci metropolitani, unioni di comuni, funzioni fondamentali e riordino del personale delle province.",
    tema: "istituzioni-enti-locali",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 6,
    attuativiAdottati: 5,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 142/1990", "legge costituzionale 3/2001"],
  },
  {
    tipo: "D.P.R.",
    numero: 62,
    anno: 2013,
    mese: 4,
    giorno: 16,
    titolo: "Codice di comportamento dei dipendenti pubblici",
    sintesi:
      "Doveri di diligenza e lealtà, regali, conflitti di interesse, whistleblowing interno e responsabilità disciplinare dei dirigenti.",
    tema: "pubblica-amministrazione",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 1,
    attuativiAdottati: 1,
    fiducia: false,
    omnibus: false,
    rinvii: ["decreto legislativo 165/2001", "legge 190/2012"],
  },
  {
    tipo: "Decreto Legislativo",
    numero: 23,
    anno: 2015,
    mese: 3,
    giorno: 4,
    titolo: "Contratto di lavoro a tempo indeterminato a tutele crescenti (Jobs Act)",
    sintesi:
      "Nuovo regime dei licenziamenti con indennizzi parametrati all'anzianità, conciliazione agevolata e tutele per le piccole imprese.",
    tema: "lavoro-diritti",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 4,
    attuativiAdottati: 4,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 300/1970", "legge 183/2010"],
  },
  {
    tipo: "Legge",
    numero: 107,
    anno: 2015,
    mese: 7,
    giorno: 13,
    titolo: "Riforma del sistema nazionale di istruzione (Buona scuola)",
    sintesi:
      "Organico potenziato, alternanza scuola-lavoro, valutazione dei docenti, edilizia scolastica e autonomia degli istituti.",
    tema: "scuola-istruzione",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 12,
    attuativiAdottati: 10,
    fiducia: true,
    omnibus: false,
    rinvii: ["legge 53/2000"],
  },
  {
    tipo: "Legge",
    numero: 208,
    anno: 2015,
    mese: 12,
    giorno: 28,
    titolo: "Disposizioni per la formazione del bilancio annuale e pluriennale (Stabilità 2016)",
    sintesi:
      "Abolizione TASI prima casa, super-ammortamenti, canone Rai in bolletta, decontribuzione per i neoassunti e lotta alla povertà.",
    tema: "fisco-finanza-pubblica",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 24,
    attuativiAdottati: 20,
    fiducia: true,
    omnibus: true,
    rinvii: ["legge 147/2013", "legge 232/2016"],
  },
  {
    tipo: "Decreto Legislativo",
    numero: 50,
    anno: 2016,
    mese: 4,
    giorno: 18,
    titolo: "Codice dei contratti pubblici",
    sintesi:
      "Nuove soglie europee, qualificazione delle stazioni appaltanti, offerta economicamente più vantaggiosa, subappalto e partenariato.",
    tema: "appalti-opere-pubbliche",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 18,
    attuativiAdottati: 14,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 109/1994", "decreto legislativo 104/2010"],
  },
  {
    tipo: "Legge",
    numero: 76,
    anno: 2016,
    mese: 5,
    giorno: 20,
    titolo: "Regolamentazione delle unioni civili e delle convivenze (Legge Cirinnà)",
    sintesi:
      "Unioni civili tra persone dello stesso sesso, diritti successori, reversibilità, convivenze di fatto e patti di convivenza.",
    tema: "famiglia-diritti",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 2,
    attuativiAdottati: 2,
    fiducia: true,
    omnibus: false,
    rinvii: ["legge 151/1975", "legge 184/1983"],
  },
  {
    tipo: "Legge",
    numero: 232,
    anno: 2016,
    mese: 12,
    giorno: 11,
    titolo: "Bilancio di previsione dello Stato per l'anno finanziario 2017",
    sintesi:
      "Industria 4.0, APE sociale, equo compenso, terremoto Centro Italia, bonus cultura per i diciottenni e fondo povertà.",
    tema: "fisco-finanza-pubblica",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 26,
    attuativiAdottati: 22,
    fiducia: true,
    omnibus: true,
    rinvii: ["legge 208/2015", "legge 147/2013"],
  },
  {
    tipo: "Decreto-Legge",
    numero: 50,
    anno: 2017,
    mese: 4,
    giorno: 24,
    titolo: "Disposizioni urgenti in materia finanziaria (Manovrina)",
    sintesi:
      "Split payment allargato, rottamazione bis, voucher sostituiti dai contratti di prestazione occasionale, giochi e trasporto locale.",
    tema: "fisco-finanza-pubblica",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 14,
    attuativiAdottati: 12,
    fiducia: true,
    omnibus: true,
    rinvii: ["legge 232/2016"],
  },
  {
    tipo: "Legge",
    numero: 119,
    anno: 2017,
    mese: 7,
    giorno: 31,
    titolo: "Disposizioni in materia di prevenzione vaccinale (Decreto Lorenzin convertito)",
    sintesi:
      "Dieci vaccinazioni obbligatorie per l'iscrizione a scuola, anagrafe vaccinale, sanzioni e recupero dei non vaccinati tramite ASL.",
    tema: "salute-prevenzione",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 3,
    attuativiAdottati: 3,
    fiducia: true,
    omnibus: false,
    rinvii: ["legge 180/1978"],
  },
  {
    tipo: "Legge",
    numero: 219,
    anno: 2017,
    mese: 12,
    giorno: 22,
    titolo: "Norme in materia di consenso informato e di disposizioni anticipate di trattamento",
    sintesi:
      "Biotestamento, pianificazione condivisa delle cure, consenso informato scritto, fiduciario e registro comunale delle DAT.",
    tema: "salute-diritti",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 2,
    attuativiAdottati: 2,
    fiducia: false,
    omnibus: false,
    rinvii: ["legge 180/1978", "legge 194/1978"],
  },
  {
    tipo: "Decreto Legislativo",
    numero: 101,
    anno: 2018,
    mese: 8,
    giorno: 10,
    titolo:
      "Adeguamento della normativa nazionale al regolamento europeo sulla protezione dei dati",
    sintesi:
      " raccordo tra Codice privacy e GDPR, base giuridica per la PA, sanzioni graduate, minori e videosorveglianza.",
    tema: "digitale-privacy",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 4,
    attuativiAdottati: 4,
    fiducia: false,
    omnibus: false,
    rinvii: ["decreto legislativo 196/2003", "decreto legislativo 82/2005"],
  },
  {
    tipo: "Legge",
    numero: 145,
    anno: 2018,
    mese: 12,
    giorno: 30,
    titolo: "Bilancio di previsione dello Stato per l'anno finanziario 2019",
    sintesi:
      "Quota 100 per le pensioni, reddito di cittadinanza in rampa di lancio, flat tax partite IVA, pace fiscale e investimenti verdi.",
    tema: "fisco-finanza-pubblica",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 28,
    attuativiAdottati: 24,
    fiducia: true,
    omnibus: true,
    rinvii: ["decreto-legge 4/2019", "legge 232/2016"],
  },
  {
    tipo: "Decreto-Legge",
    numero: 4,
    anno: 2019,
    mese: 1,
    giorno: 28,
    titolo: "Disposizioni urgenti in materia di reddito di cittadinanza e di pensioni (Quota 100)",
    sintesi:
      "Requisiti ISEE, patto per il lavoro, navigator, offerta congrua, finestre di uscita anticipata e cumulo con i redditi.",
    tema: "lavoro-welfare",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 12,
    attuativiAdottati: 11,
    fiducia: true,
    omnibus: false,
    rinvii: ["legge 26/2019", "legge 145/2018"],
  },
  {
    tipo: "Legge",
    numero: 26,
    anno: 2019,
    mese: 3,
    giorno: 28,
    titolo: "Conversione del decreto su reddito di cittadinanza e quota 100",
    sintesi:
      "Legge di conversione con correttivi su scala di equivalenza, controlli INPS, dimissioni per i navigator e incentivi alle imprese.",
    tema: "lavoro-welfare",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 3,
    attuativiAdottati: 3,
    fiducia: true,
    omnibus: false,
    rinvii: ["decreto-legge 4/2019"],
  },
  {
    tipo: "Legge",
    numero: 160,
    anno: 2019,
    mese: 12,
    giorno: 27,
    titolo: "Bilancio di previsione dello Stato per l'anno finanziario 2020",
    sintesi:
      "Plastic tax e sugar tax rinviate, piano Transizione 4.0 in nuce, cuneo fiscale, famiglia, disabilità e fondo per il Sud.",
    tema: "fisco-finanza-pubblica",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 30,
    attuativiAdottati: 25,
    fiducia: true,
    omnibus: true,
    rinvii: ["legge 145/2018", "legge 178/2021"],
  },
  {
    tipo: "Decreto-Legge",
    numero: 18,
    anno: 2020,
    mese: 3,
    giorno: 17,
    titolo: "Misure di potenziamento del Servizio sanitario e di sostegno economico (Cura Italia)",
    sintesi:
      "Prima risposta al Covid: cassa integrazione in deroga, bonus 600 euro, sospensione mutui, straordinari sanitari e scuole chiuse.",
    tema: "salute-emergenza",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 25,
    attuativiAdottati: 23,
    fiducia: true,
    omnibus: true,
    rinvii: ["legge 27/2020", "decreto-legge 34/2020"],
  },
  {
    tipo: "Legge",
    numero: 27,
    anno: 2020,
    mese: 4,
    giorno: 24,
    titolo: "Conversione del decreto Cura Italia",
    sintesi:
      "Conversione con integrazioni su volontariato, terzo settore, giustizia sospesa, università a distanza e protezione civile.",
    tema: "salute-emergenza",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 4,
    attuativiAdottati: 4,
    fiducia: true,
    omnibus: true,
    rinvii: ["decreto-legge 18/2020"],
  },
  {
    tipo: "Decreto-Legge",
    numero: 34,
    anno: 2020,
    mese: 5,
    giorno: 19,
    titolo: "Misure urgenti in materia di salute e sostegno al lavoro (Rilancio)",
    sintesi:
      "Superbonus 110 per cento, ecobonus e sismabonus, IRAP cancellata per le piccole imprese, colf e braccianti regolarizzati.",
    tema: "economia-emergenza",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 32,
    attuativiAdottati: 28,
    fiducia: true,
    omnibus: true,
    rinvii: ["decreto-legge 18/2020", "legge 77/2020"],
  },
  {
    tipo: "Legge",
    numero: 77,
    anno: 2020,
    mese: 7,
    giorno: 17,
    titolo: "Conversione del decreto Rilancio",
    sintesi:
      "Conversione con modifiche: superbonus dettagliato, fondo perduto, estate ragazzi, bonus vacanze e trasporti scolastici.",
    tema: "economia-emergenza",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 5,
    attuativiAdottati: 5,
    fiducia: true,
    omnibus: true,
    rinvii: ["decreto-legge 34/2020"],
  },
  {
    tipo: "Decreto Legislativo",
    numero: 116,
    anno: 2020,
    mese: 9,
    giorno: 3,
    titolo: "Attuazione delle direttive europee sui rifiuti e sull'economia circolare",
    sintesi:
      "Responsabilità estesa del produttore, raccolta differenziata al 65 per cento, plastica monouso, sottoprodotti e tracciabilità.",
    tema: "ambiente-economia-circolare",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 9,
    attuativiAdottati: 7,
    fiducia: false,
    omnibus: false,
    rinvii: ["decreto legislativo 42/2004"],
  },
  {
    tipo: "Decreto-Legge",
    numero: 77,
    anno: 2021,
    mese: 5,
    giorno: 31,
    titolo: "Governance del Piano nazionale di ripresa e resilienza e semplificazioni",
    sintesi:
      "Cabina di regia PNRR, poteri sostitutivi, conferenza di servizi accelerata, appalti PNRR e silenzio assenso rafforzato.",
    tema: "pubblica-amministrazione",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 20,
    attuativiAdottati: 17,
    fiducia: true,
    omnibus: true,
    rinvii: ["decreto legislativo 50/2016", "legge 241/1990"],
  },
  {
    tipo: "Legge",
    numero: 234,
    anno: 2021,
    mese: 12,
    giorno: 30,
    titolo: "Bilancio di previsione dello Stato per l'anno finanziario 2022",
    sintesi:
      "Riforma degli ammortizzatori, assegno unico per i figli, taglio IRAP per le persone fisiche, superbonus prorogato e concorrenza.",
    tema: "fisco-finanza-pubblica",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 30,
    attuativiAdottati: 26,
    fiducia: true,
    omnibus: true,
    rinvii: ["legge 160/2019", "legge 197/2022"],
  },
  {
    tipo: "Legge Costituzionale",
    numero: 1,
    anno: 2022,
    mese: 2,
    giorno: 11,
    titolo: "Modifiche agli articoli 9 e 41 della Costituzione in materia di tutela dell'ambiente",
    sintesi:
      "L'ambiente, la biodiversità e gli animali entrano in Costituzione; l'iniziativa economica non deve recare danno all'ambiente.",
    tema: "istituzioni-ambiente",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 1,
    attuativiAdottati: 1,
    fiducia: false,
    omnibus: false,
    rinvii: ["decreto legislativo 116/2020"],
  },
  {
    tipo: "Legge",
    numero: 197,
    anno: 2022,
    mese: 12,
    giorno: 29,
    titolo: "Bilancio di previsione dello Stato per l'anno finanziario 2023",
    sintesi:
      "Tregua fiscale, pensioni con quota 103, assegno unico potenziato, taglio del cuneo, accise e reddito alimentare.",
    tema: "fisco-finanza-pubblica",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 28,
    attuativiAdottati: 24,
    fiducia: true,
    omnibus: true,
    rinvii: ["legge 234/2021", "legge 213/2023"],
  },
  {
    tipo: "Legge",
    numero: 213,
    anno: 2023,
    mese: 12,
    giorno: 30,
    titolo: "Bilancio di previsione dello Stato per l'anno finanziario 2024",
    sintesi:
      "Cuneo confermato, IRPEF a tre aliquote, pensioni anticipate riviste, mutui prima casa, Ponte sullo Stretto e fondo per i migranti.",
    tema: "fisco-finanza-pubblica",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 27,
    attuativiAdottati: 22,
    fiducia: true,
    omnibus: true,
    rinvii: ["legge 197/2022", "legge 207/2024"],
  },
  {
    tipo: "Decreto-Legge",
    numero: 19,
    anno: 2024,
    mese: 3,
    giorno: 2,
    titolo:
      "Ulteriori disposizioni urgenti per l'attuazione del Piano nazionale di ripresa e resilienza",
    sintesi:
      "Quarta rata PNRR, transizione 5.0, crediti per le imprese energivore, sanzioni per i ritardi e cabina per le materie prime.",
    tema: "economia-pnrr",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 16,
    attuativiAdottati: 12,
    fiducia: true,
    omnibus: true,
    rinvii: ["decreto-legge 77/2021", "decreto legislativo 50/2016"],
  },
  {
    tipo: "Legge",
    numero: 86,
    anno: 2024,
    mese: 6,
    giorno: 26,
    titolo:
      "Disposizioni per l'attuazione dell'autonomia differenziata delle Regioni a statuto ordinario",
    sintesi:
      "Livelli essenziali delle prestazioni, intese Stato-Regioni, materie devolvibili, perequazione e clausola di salvaguardia per il Sud.",
    tema: "istituzioni-enti-locali",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 11,
    attuativiAdottati: 3,
    fiducia: true,
    omnibus: false,
    rinvii: ["legge costituzionale 3/2001", "legge 56/2014"],
  },
  {
    tipo: "Legge",
    numero: 207,
    anno: 2024,
    mese: 12,
    giorno: 30,
    titolo: "Bilancio di previsione dello Stato per l'anno finanziario 2025",
    sintesi:
      "Cuneo strutturale, IRPEF stabile, bonus nuovi nati, mutui giovani coppie, sanità con fondo record e rottamazione quater.",
    tema: "fisco-finanza-pubblica",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 26,
    attuativiAdottati: 9,
    fiducia: true,
    omnibus: true,
    rinvii: ["legge 213/2023"],
  },
  {
    tipo: "Decreto-Legge",
    numero: 25,
    anno: 2025,
    mese: 3,
    giorno: 14,
    titolo:
      "Disposizioni urgenti in materia di reclutamento e funzionalità delle pubbliche amministrazioni",
    sintesi:
      "Concorsi unici, mobilità volontaria, stabilizzazioni PNRR, lavoro agile strutturato e formazione digitale obbligatoria per i dirigenti.",
    tema: "pubblica-amministrazione",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 12,
    attuativiAdottati: 5,
    fiducia: true,
    omnibus: false,
    rinvii: ["decreto legislativo 165/2001", "decreto legislativo 150/2009"],
  },
  {
    tipo: "Regolamento",
    numero: 17,
    anno: 2026,
    mese: 1,
    giorno: 20,
    titolo: "Regolamento per la trasparenza degli atti normativi pubblicati in formato aperto",
    sintesi:
      "Metadati obbligatori, identificatori ELI e NIR, formati aperti, scadenze di pubblicazione e monitoraggio della qualità redazionale.",
    tema: "digitale-trasparenza",
    dimostrativo: true,
    air: true,
    attuativiPrevisti: 3,
    attuativiAdottati: 1,
    fiducia: false,
    omnibus: false,
    rinvii: ["decreto legislativo 33/2013", "decreto legislativo 82/2005"],
  },
  {
    tipo: "Legge",
    numero: 178,
    anno: 2020,
    mese: 12,
    giorno: 30,
    titolo: "Bilancio di previsione dello Stato per l'anno finanziario 2021",
    sintesi:
      "Fondo per il cashback, esonero contributivo per i giovani, superbonus al 110, cig Covid prorogata e ristori per le partite IVA.",
    tema: "fisco-finanza-pubblica",
    dimostrativo: true,
    air: false,
    attuativiPrevisti: 29,
    attuativiAdottati: 26,
    fiducia: true,
    omnibus: true,
    rinvii: ["legge 160/2019", "legge 234/2021"],
  },
];

// ---------------------------------------------------------------------------
// Generatore deterministico del testo (300-800 parole, con rinvii)
// ---------------------------------------------------------------------------

const INCIPIT_PER_TIPO: Record<TipoAtto, string> = {
  Legge:
    "La Camera dei deputati ed il Senato della Repubblica hanno approvato. Il Presidente della Repubblica promulga la seguente legge",
  "Legge Costituzionale":
    "La Camera dei deputati ed il Senato della Repubblica hanno approvato a doppia deliberazione a maggioranza assoluta. Il Presidente della Repubblica promulga la seguente legge costituzionale",
  "Decreto-Legge":
    "Il Presidente della Repubblica, visti gli articoli 77 e 87 della Costituzione, ritenuta la straordinaria necessità ed urgenza, emana il seguente decreto-legge",
  "Decreto Legislativo":
    "Il Presidente della Repubblica, visto l'articolo 76 della Costituzione e la legge di delegazione, emana il seguente decreto legislativo",
  "D.P.R.":
    "Il Presidente della Repubblica, visto l'articolo 87 della Costituzione e udito il parere del Consiglio di Stato, emana il seguente decreto",
  Regolamento:
    "Il Ministro competente, visto l'articolo 17 della legge 400 del 1988 e sentito il Consiglio di Stato, adotta il seguente regolamento",
};

const CHIUSURE_SETTORIALI: Record<string, string> = {
  "fisco-finanza-pubblica":
    "La copertura finanziaria è assicurata a valere sul fondo per gli interventi strutturali, senza nuovi oneri a carico della finanza pubblica oltre quelli quantificati nella relazione tecnica.",
  salute:
    "Le regioni adeguano i piani sanitari entro centoventi giorni, sentita la Conferenza Stato-Regioni e garantendo i livelli essenziali di assistenza.",
  lavoro:
    "Le parti sociali sono sentite prima dell'adozione dei decreti attuativi e l'efficacia è monitorata con una relazione annuale al Parlamento.",
  default:
    "Le amministrazioni competenti provvedono con le risorse umane e strumentali disponibili, assicurando il monitoraggio annuale degli effetti.",
};

function chiaviTema(tema: string): string {
  const k = Object.keys(CHIUSURE_SETTORIALI).find((c) => tema.startsWith(c));
  return k ?? "default";
}

function costruisciTesto(scheda: Scheda, eli: string): string {
  const seed = fnv1a(
    `simple-law-corpus-v1:${scheda.tema}:${scheda.tipo}:${scheda.anno}:${scheda.numero}`,
  );
  const rnd = mulberry32(seed);
  const incipit = INCIPIT_PER_TIPO[scheda.tipo];
  const rinviiTestuali = scheda.rinvii.length > 0 ? scheda.rinvii.join("; ") : "legge 241/1990";
  const primoRinvio = scheda.rinvii[0] ?? "legge 241/1990";
  const secondoRinvio = scheda.rinvii[1] ?? "legge 300/1970";

  const aggettivi = [
    "puntuale",
    "proporzionata",
    "graduale",
    "verificabile",
    "trasparente",
    "sostenibile",
  ] as const;
  const strumenti = [
    "decreto del Ministro competente",
    "provvedimento del direttore dell'Agenzia",
    "intesa in Conferenza unificata",
    "linee guida adottate con decreto interministeriale",
  ] as const;
  const garanzie = [
    "il contraddittorio con gli interessati",
    "la pubblicazione dei dati in formato aperto",
    "il parere delle commissioni parlamentari",
    "la valutazione di impatto della regolazione",
  ] as const;

  const agg1 = scegli(aggettivi, rnd);
  const agg2 = scegli(aggettivi, rnd);
  const str1 = scegli(strumenti, rnd);
  const str2 = scegli(strumenti, rnd);
  const gar1 = scegli(garanzie, rnd);
  const gar2 = scegli(garanzie, rnd);
  const chiusura = CHIUSURE_SETTORIALI[chiaviTema(scheda.tema)] ?? CHIUSURE_SETTORIALI["default"];

  const airPeriodo = scheda.air
    ? "L'analisi di impatto della regolazione ha stimato oneri contenuti per le piccole imprese e benefici misurabili per i cittadini, con indicatori rivisti ogni due anni."
    : "La relazione illustrativa documenta la necessità dell'intervento con dati comparabili e una ricognizione delle alternative scartate.";
  const attuativiPeriodo =
    scheda.attuativiPrevisti > 0
      ? `Sono previsti ${scheda.attuativiPrevisti} provvedimenti attuativi, di cui ${scheda.attuativiAdottati} già adottati alla data di consolidamento del presente testo dimostrativo.`
      : "La disciplina è immediatamente applicabile e non richiede provvedimenti attuativi ulteriori.";
  const fiduciaPeriodo = scheda.fiducia
    ? "Il Governo ha posto la questione di fiducia sull'approvazione, data la coerenza complessiva del disegno di riforma."
    : "L'esame parlamentare si è svolto con il procedimento ordinario, con audizioni e ciclo di emendamenti pubblicati nei resoconti.";
  const omnibusPeriodo = scheda.omnibus
    ? "Il provvedimento raccoglie disposizioni eterogenee ma accomunate dalla finalità di semplificazione e di accelerazione degli investimenti."
    : "Il testo mantiene un oggetto omogeneo e circoscritto, per favorire la leggibilità e la certezza applicativa.";

  const paragrafi = [
    `${incipit}: ${scheda.titolo} (${eli}). Relazione illustrativa. ${scheda.sintesi} ${airPeriodo} ${attuativiPeriodo} ${fiduciaPeriodo} ${omnibusPeriodo}`,
    `Art. 1 (Finalità e ambito di applicazione). 1. La presente disciplina persegue una regolazione ${agg1} della materia, nel rispetto dei principi di legalità, buon andamento e tutela dei diritti. 2. Si applica alle amministrazioni statali, agli enti territoriali e, per quanto compatibile, ai soggetti privati che svolgono funzioni di interesse generale. 3. Restano ferme le disposizioni di cui ${primoRinvio}, che si applicano in quanto compatibili e non abrogate espressamente.`,
    `Art. 2 (Definizioni e principi). 1. Ai fini della presente disciplina si intende per amministrazione competente l'ufficio individuato con ${str1}, sentite le regioni. 2. L'azione amministrativa è ${agg2} e orientata al risultato, con obbligo di motivazione rafforzata per gli atti che incidono su diritti soggettivi. 3. È garantito ${gar1}, con termini certi e rimedi effettivi in caso di inerzia.`,
    `Art. 3 (Disciplina di settore e rinvii). 1. Le modalità operative sono definite con ${str2} entro novanta giorni dall'entrata in vigore, previo parere del Consiglio di Stato. 2. Per i profili procedimentali si rinvia a ${primoRinvio} e, per i profili sanzionatori e di tutela, a ${secondoRinvio}, nonché ai rinvii puntuali indicati nei commi seguenti: ${rinviiTestuali}. 3. Le controversie sono devolute alla giurisdizione competente secondo i criteri ordinari, con rito abbreviato quando ricorrono ragioni di urgenza documentate. 4. I dati raccolti sono pubblicati in forma anonima e aggregata, nel rispetto della protezione dei dati personali.`,
    `Art. 4 (Attuazione, monitoraggio e valutazione). 1. ${attuativiPeriodo} I termini per l'adozione sono perentori e la mancata adozione è comunicata alle Camere con motivazione. 2. È garantita ${gar2} e il monitoraggio avviene con indicatori pubblici, comprensibili e aggiornati ogni anno. 3. Ogni tre anni il Governo trasmette al Parlamento una relazione sugli effetti, con proposte di manutenzione normativa.`,
    `Art. 5 (Disposizioni finanziarie, transitorie e finali). 1. ${chiusura} 2. Le disposizioni si applicano ai procedimenti avviati dopo l'entrata in vigore; quelli pendenti restano regolati dalla disciplina previgente salvo opzione motivata per la nuova. 3. La presente disciplina entra in vigore il quindicesimo giorno successivo alla pubblicazione nella Gazzetta Ufficiale. È fatto obbligo a chiunque spetti di osservarla e di farla osservare.`,
  ];

  let testo = paragrafi.join("\n\n");
  let parole = contaParole(testo);
  if (parole < 320) {
    testo +=
      "\n\nArt. 6 (Clausola di salvaguardia). 1. Le regioni a statuto speciale provvedono secondo i rispettivi statuti e norme di attuazione. 2. Dall'applicazione non derivano discriminazioni territoriali e i livelli essenziali restano garantiti su tutto il territorio nazionale con verifica annuale.";
    parole = contaParole(testo);
  }
  if (parole > 780) {
    const frasi = testo.split(/(?<=[.!?])\s+/);
    let accumulato = "";
    for (const f of frasi) {
      const candidato = accumulato ? `${accumulato} ${f}` : f;
      if (contaParole(candidato) > 760) break;
      accumulato = candidato;
    }
    testo = accumulato;
  }
  return testo;
}

// ---------------------------------------------------------------------------
// Costruzione dell'elenco (derivato, deterministico)
// ---------------------------------------------------------------------------

function schedaVersoAtto(scheda: Scheda): AttoEspanso {
  const eli = costruisciEli(scheda.tipo, scheda.anno, scheda.numero);
  const nir = costruisciNir(scheda.tipo, scheda.anno, scheda.mese, scheda.giorno, scheda.numero);
  const dataEmanazione = `${scheda.anno}-${dueCifre(scheda.mese)}-${dueCifre(scheda.giorno)}`;
  const testo = costruisciTesto(scheda, eli);
  const rinviiEli = scheda.rinvii.map((r) => {
    const m = r.match(/(\d+)\/(\d{4})/);
    if (!m) return "/eli/legge/1990/241";
    return `/eli/legge/${m[2]}/${m[1]}`;
  });
  return {
    eli,
    nir,
    tipo: scheda.tipo,
    numero: scheda.numero,
    anno: scheda.anno,
    dataEmanazione,
    titolo: scheda.titolo,
    sintesi: scheda.sintesi,
    testo,
    tema: scheda.tema,
    dimostrativo: scheda.dimostrativo,
    air: scheda.air,
    attuativiPrevisti: scheda.attuativiPrevisti,
    attuativiAdottati: scheda.attuativiAdottati,
    fiducia: scheda.fiducia,
    omnibus: scheda.omnibus,
    rinviiEli,
  };
}

export const ATTI_ESPANSI: AttoEspanso[] = SCHEDE.map(schedaVersoAtto);

export const TOTALE_ATTI = ATTI_ESPANSI.length;
export const TOTALE_DIMOSTRATIVI = ATTI_ESPANSI.filter((a) => a.dimostrativo).length;
export const TOTALE_RIFERIMENTO = ATTI_ESPANSI.filter((a) => !a.dimostrativo).length;

// ---------------------------------------------------------------------------
// Accesso dati never-throw
// ---------------------------------------------------------------------------

export function provaListaAtti(): Risultato<AttoEspanso[]> {
  try {
    return { ok: true, valore: [...ATTI_ESPANSI] };
  } catch {
    return { ok: false, errore: "Impossibile leggere l'elenco degli atti espansi." };
  }
}

export function provaCercaPerEli(eli: unknown): Risultato<AttoEspanso | null> {
  try {
    if (typeof eli !== "string" || eli.trim().length === 0) {
      return { ok: false, errore: "Identificatore ELI non valido: valore assente." };
    }
    const normalizzato = eli.trim();
    const trovato = ATTI_ESPANSI.find((a) => a.eli === normalizzato) ?? null;
    return { ok: true, valore: trovato };
  } catch {
    return { ok: false, errore: "Ricerca per ELI non riuscita per un errore interno." };
  }
}

export function provaFiltraPerTema(tema: unknown): Risultato<AttoEspanso[]> {
  try {
    if (typeof tema !== "string" || tema.trim().length === 0) {
      return { ok: false, errore: "Tema non valido: indicare una stringa non vuota." };
    }
    const t = tema.trim().toLowerCase();
    const filtrati = ATTI_ESPANSI.filter((a) => a.tema.toLowerCase().includes(t));
    return { ok: true, valore: filtrati };
  } catch {
    return { ok: false, errore: "Filtro per tema non riuscito per un errore interno." };
  }
}

export function provaContaAtti(): Risultato<{
  totale: number;
  dimostrativi: number;
  riferimento: number;
}> {
  try {
    return {
      ok: true,
      valore: {
        totale: TOTALE_ATTI,
        dimostrativi: TOTALE_DIMOSTRATIVI,
        riferimento: TOTALE_RIFERIMENTO,
      },
    };
  } catch {
    return { ok: false, errore: "Conteggio degli atti non riuscito." };
  }
}

export function provaVerificaIntegrita(): Risultato<string[]> {
  try {
    const problemi: string[] = [];
    const vistiEli = new Set<string>();
    const vistiNir = new Set<string>();
    for (const a of ATTI_ESPANSI) {
      if (!eliValido(a.eli)) problemi.push(`ELI non valido: ${a.eli}`);
      if (!nirValido(a.nir)) problemi.push(`NIR non valido: ${a.nir}`);
      if (vistiEli.has(a.eli)) problemi.push(`ELI duplicato: ${a.eli}`);
      if (vistiNir.has(a.nir)) problemi.push(`NIR duplicato: ${a.nir}`);
      vistiEli.add(a.eli);
      vistiNir.add(a.nir);
      const parole = contaParole(a.testo);
      if (parole < 300 || parole > 800)
        problemi.push(`Testo fuori intervallo (300-800 parole): ${a.eli} ha ${parole} parole`);
      if (calcolaGulpease(a.testo) === null) problemi.push(`Gulpease non calcolabile: ${a.eli}`);
      if (a.attuativiAdottati > a.attuativiPrevisti) {
        problemi.push(`Attuativi incoerenti: ${a.eli}`);
      }
    }
    return { ok: true, valore: problemi };
  } catch {
    return { ok: false, errore: "Verifica di integrità non riuscita." };
  }
}
