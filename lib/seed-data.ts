/**
 * Dati seed inclusi nel bundle: l'app funziona anche senza DATABASE_URL.
 *
 * I primi due atti richiesti (DL 133/2026 e DL 139/2026) sono modellati sui
 * comunicati del Consiglio dei ministri; gli altri sono esempi plausibili a
 * scopo dimostrativo. Nessun dato e' presentato come ufficiale.
 */

import { buildFonti } from "./fonti";
import type { AirStato, AttuativiInput } from "./quality";
import { calcGulpease } from "./readability";

export interface Fonti {
  normattiva?: string;
  gazzetta?: string;
  camera?: string;
  senato?: string;
  governo?: string;
}

/** Atto normativo come esposto dalle API (DB o seed). */
export interface LawRecord {
  eli: string;
  nir: string;
  tipo: string;
  numero: string;
  dataEmanazione: string;
  titolo: string;
  sintesi: string;
  stato: string;
  gulpease: number | null;
  fonti: Fonti | null;
  /**
   * Metadati usati per costruire i link alle fonti (persistiti nel blob
   * `extra`). Presenti solo quando verificati: nessun codice viene inventato.
   */
  codiceRedazionale?: string;
  dataGU?: string;
  numeroGU?: string;
  legislatura?: string;
  cameraId?: string;
  senatoDid?: string;
  /** Campi arricchiti disponibili solo nel fallback seed. */
  air?: AirStato;
  attuativi?: AttuativiInput;
  fiducia?: boolean;
  omnibus?: boolean;
  /** Estratto del testo usato per leggibilita', qualita' e semplificazione. */
  testo?: string;
  /**
   * `true` per gli atti di esempio a scopo dimostrativo (oltre i due atti di
   * riferimento DL 133/2026 e DL 139/2026). La UI mostra un contrassegno.
   */
  dimostrativo?: boolean;
}

export interface MinisterRecord {
  slug: string;
  nome: string;
  dicastero: string;
  partito: string | null;
  competenze: string[];
  provvedimenti: string[];
}

export interface CdmItem {
  id: string;
  data: string;
  numero: string;
  titolo: string;
  sintesi: string;
  url: string;
}

type LawSeedInput = Omit<LawRecord, "gulpease">;

function conGulpease(law: LawSeedInput): LawRecord {
  const testo = law.testo ?? law.sintesi;
  return { ...law, gulpease: calcGulpease(testo).indice };
}

const TESTO_DL133 = [
  "Disposizioni urgenti in materia di energia e di riconversione industriale dei siti produttivi strategici.",
  "Al fine di garantire la sicurezza degli approvvigionamenti energetici, il Governo adotta misure per la riconversione degli impianti alimentati a gasolio.",
  "Le amministrazioni competenti provvedono, entro sessanta giorni dalla data di entrata in vigore del presente decreto, all'adozione dei decreti attuativi previsti dall'articolo 3.",
  "Per la riconversione del sito di ILVA di Taranto e' autorizzato un programma straordinario di investimenti, secondo quanto previsto dall'articolo 5, comma 2.",
  "Il Commissario straordinario riferisce semestralmente al Presidente del Consiglio dei ministri sullo stato di avanzamento degli interventi.",
].join(" ");

const TESTO_DL139 = [
  "Disposizioni urgenti in materia di accise sui carburanti e di trasparenza dei prezzi alla pompa.",
  "In ragione dell'aumento dei prezzi dei prodotti energetici, il Governo interviene per contenere l'impatto sui consumatori.",
  "Le disposizioni di cui all'articolo 2 si applicano a decorrere dal giorno successivo alla pubblicazione nella Gazzetta Ufficiale.",
  "L'Autorita' competente verifica il rispetto degli obblighi di comunicazione dei prezzi, come previsto dall'articolo 4, comma 1.",
].join(" ");

const TESTO_L124 = [
  "Legge annuale per il mercato e la concorrenza.",
  "La presente legge reca disposizioni per la promozione della concorrenza e per l'adeguamento della regolazione alle esigenze dei consumatori.",
  "Le autorita' indipendenti adottano i provvedimenti necessari entro i termini previsti dall'articolo 7.",
  "Sono previste misure in materia di servizi pubblici locali e di digitalizzazione dei mercati, secondo quanto disposto dagli articoli 9 e 10.",
  "Il Governo riferisce annualmente al Parlamento sullo stato di attuazione degli interventi.",
].join(" ");

const TESTO_DLGS36 = [
  "Decreto legislativo recante attuazione della strategia per la digitalizzazione della pubblica amministrazione.",
  "Le pubbliche amministrazioni adeguano i propri procedimenti alle disposizioni del presente decreto.",
  "I decreti di natura non regolamentare previsti dall'articolo 6 sono adottati entro novanta giorni.",
  "Le regioni e gli enti locali provvedono all'attuazione secondo le rispettive competenze, in coerenza con l'articolo 117 della Costituzione.",
].join(" ");

const TESTO_L8 = [
  "Disposizioni in materia di sicurezza informatica e di protezione delle infrastrutture critiche.",
  "La presente legge disciplina gli obblighi di notifica degli incidenti informatici a carico dei soggetti pubblici e privati.",
  "L'Agenzia competente adotta le linee guida entro centoventi giorni dalla data di entrata in vigore, ai sensi dell'articolo 4.",
  "I soggetti interessati si adeguano alle prescrizioni entro i termini stabiliti dall'articolo 5, comma 3.",
].join(" ");

export const SEED_LAWS: LawRecord[] = [
  conGulpease({
    eli: "/eli/id/2026/07/27/26G00155/sg",
    nir: "urn:nir:stato:decreto.legge:2026-07-27;133",
    tipo: "decreto.legge",
    numero: "133",
    dataEmanazione: "2026-07-27",
    titolo:
      "Disposizioni urgenti in materia di energia e di riconversione industriale dei siti produttivi strategici",
    sintesi:
      "Il decreto interviene su due fronti: incentiva la riconversione degli impianti alimentati a gasolio e avvia un programma straordinario per il sito industriale di ILVA a Taranto.",
    stato: "in_vigore",
    codiceRedazionale: "26G00155",
    dataGU: "2026-07-27",
    numeroGU: "172",
    fonti: buildFonti({
      tipo: "decreto.legge",
      numero: "133",
      dataEmanazione: "2026-07-27",
      codiceRedazionale: "26G00155",
      dataGU: "2026-07-27",
      numeroGU: "172",
    }),
    air: "semplificata",
    attuativi: { daAdottare: 2, adottati: 0, scaduti: 0 },
    fiducia: false,
    omnibus: false,
    testo: TESTO_DL133,
  }),
  conGulpease({
    eli: "/eli/id/2026/08/05/26G00162/sg",
    nir: "urn:nir:stato:decreto.legge:2026-08-05;139",
    tipo: "decreto.legge",
    numero: "139",
    dataEmanazione: "2026-08-05",
    titolo: "Disposizioni urgenti in materia di accise sui carburanti e di trasparenza dei prezzi",
    sintesi:
      "Il decreto interviene sui carburanti: riduce la pressione delle accise e impone maggiore trasparenza sui prezzi esposti alla pompa.",
    stato: "in_vigore",
    // Codice redazionale verificato su Normattiva/GU (DL 139/2026 = 26G00162,
    // GU n. 180 del 2026-08-05): i link alle fonti sono costruiti da dati veri.
    codiceRedazionale: "26G00162",
    dataGU: "2026-08-05",
    numeroGU: "180",
    fonti: buildFonti({
      tipo: "decreto.legge",
      numero: "139",
      dataEmanazione: "2026-08-05",
      codiceRedazionale: "26G00162",
      dataGU: "2026-08-05",
      numeroGU: "180",
    }),
    air: "esente",
    attuativi: { daAdottare: 1, adottati: 0, scaduti: 0 },
    fiducia: false,
    omnibus: false,
    testo: TESTO_DL139,
  }),
  conGulpease({
    eli: "/eli/id/2025/12/19/25G00134/sg",
    nir: "urn:nir:stato:legge:2025-12-19;124",
    tipo: "legge",
    numero: "124",
    dataEmanazione: "2025-12-19",
    titolo: "Legge annuale per il mercato e la concorrenza",
    sintesi:
      "La legge annuale sulla concorrenza introduce misure per aprire i mercati, semplificare la regolazione dei servizi pubblici locali e favorire la digitalizzazione.",
    stato: "in_vigore",
    fonti: buildFonti({
      tipo: "legge",
      numero: "124",
      dataEmanazione: "2025-12-19",
    }),
    air: "presente",
    attuativi: { daAdottare: 1, adottati: 2, scaduti: 0 },
    fiducia: false,
    omnibus: true,
    testo: TESTO_L124,
    dimostrativo: true,
  }),
  conGulpease({
    eli: "/eli/id/2026/03/12/26G00091/sg",
    nir: "urn:nir:stato:decreto.legislativo:2026-03-12;36",
    tipo: "decreto.legislativo",
    numero: "36",
    dataEmanazione: "2026-03-12",
    titolo:
      "Decreto legislativo recante attuazione della strategia per la digitalizzazione della pubblica amministrazione",
    sintesi:
      "Il decreto legislativo attua la delega sulla digitalizzazione della PA, con obblighi di adeguamento dei procedimenti e termini certi per i decreti attuativi.",
    stato: "in_vigore",
    fonti: buildFonti({
      tipo: "decreto.legislativo",
      numero: "36",
      dataEmanazione: "2026-03-12",
    }),
    air: "presente",
    attuativi: { daAdottare: 3, adottati: 1, scaduti: 1 },
    fiducia: false,
    omnibus: false,
    testo: TESTO_DLGS36,
    dimostrativo: true,
  }),
  conGulpease({
    eli: "/eli/id/2026/02/10/26G00044/sg",
    nir: "urn:nir:stato:legge:2026-02-10;8",
    tipo: "legge",
    numero: "8",
    dataEmanazione: "2026-02-10",
    titolo: "Disposizioni in materia di sicurezza informatica e di protezione delle infrastrutture critiche",
    sintesi:
      "La legge introduce obblighi di notifica degli incidenti informatici e linee guida vincolanti per la protezione delle infrastrutture critiche.",
    stato: "in_vigore",
    fonti: buildFonti({
      tipo: "legge",
      numero: "8",
      dataEmanazione: "2026-02-10",
    }),
    air: "assente",
    attuativi: { daAdottare: 2, adottati: 1, scaduti: 0 },
    fiducia: false,
    omnibus: false,
    testo: TESTO_L8,
    dimostrativo: true,
  }),
];

export const SEED_MINISTERS: MinisterRecord[] = [
  {
    slug: "meloni",
    nome: "Giorgia Meloni",
    dicastero: "Presidenza del Consiglio dei ministri",
    partito: "Fratelli d'Italia",
    competenze: ["indirizzo politico", "coordinamento del Governo", "rapporti con l'Unione europea"],
    provvedimenti: ["decreto-legge 133/2026", "decreto-legge 139/2026"],
  },
  {
    slug: "giorgetti",
    nome: "Giancarlo Giorgetti",
    dicastero: "Ministero dell'Economia e delle Finanze",
    partito: "Lega",
    competenze: ["bilancio", "fiscalita'", "finanza pubblica", "debito pubblico"],
    provvedimenti: ["legge 124/2025", "decreto-legge 139/2026"],
  },
  {
    slug: "piantedosi",
    nome: "Matteo Piantedosi",
    dicastero: "Ministero dell'Interno",
    partito: null,
    competenze: ["ordine pubblico", "sicurezza", "immigrazione", "protezione civile"],
    provvedimenti: ["decreto-legge 133/2026"],
  },
  {
    slug: "nordio",
    nome: "Carlo Nordio",
    dicastero: "Ministero della Giustizia",
    partito: "Fratelli d'Italia",
    competenze: ["giustizia penale", "giustizia civile", "ordinamento giudiziario"],
    provvedimenti: ["legge 124/2025"],
  },
  {
    slug: "urso",
    nome: "Adolfo Urso",
    dicastero: "Ministero delle Imprese e del Made in Italy",
    partito: "Fratelli d'Italia",
    competenze: ["imprese", "industria", "commercio", "made in Italy", "energia"],
    provvedimenti: ["decreto-legge 133/2026", "legge 124/2025"],
  },
  {
    slug: "calderone",
    nome: "Marina Elvira Calderone",
    dicastero: "Ministero del Lavoro e delle Politiche Sociali",
    partito: "Fratelli d'Italia",
    competenze: ["lavoro", "occupazione", "previdenza", "politiche sociali"],
    provvedimenti: ["legge 124/2025"],
  },
  {
    slug: "valditara",
    nome: "Giuseppe Valditara",
    dicastero: "Ministero dell'Istruzione e del Merito",
    partito: "Lega",
    competenze: ["istruzione", "scuola", "universita'", "ricerca"],
    provvedimenti: ["decreto-legge 133/2026"],
  },
  {
    slug: "schillaci",
    nome: "Orazio Schillaci",
    dicastero: "Ministero della Salute",
    partito: "Fratelli d'Italia",
    competenze: ["sanita' pubblica", "prevenzione", "spesa sanitaria"],
    provvedimenti: ["decreto-legge 133/2026"],
  },
];

export const SEED_CDM: CdmItem[] = [
  {
    id: "cdm-183-2026",
    data: "2026-07-27",
    numero: "183",
    titolo:
      "Comunicato stampa del Consiglio dei ministri n. 183 - energia e riconversione industriale",
    sintesi:
      "Il Consiglio dei ministri approva un decreto-legge su energia e riconversione dei siti produttivi strategici, con misure per ILVA di Taranto.",
    url: "https://www.governo.it/it/archivio-consiglio-dei-ministri",
  },
  {
    id: "cdm-184-2026",
    data: "2026-08-05",
    numero: "184",
    titolo: "Comunicato stampa del Consiglio dei ministri n. 184 - carburanti",
    sintesi:
      "Approvato un decreto-legge in materia di accise sui carburanti e trasparenza dei prezzi alla pompa.",
    url: "https://www.governo.it/it/archivio-consiglio-dei-ministri",
  },
  {
    id: "cdm-182-2026",
    data: "2026-07-10",
    numero: "182",
    titolo: "Comunicato stampa del Consiglio dei ministri n. 182 - digitalizzazione PA",
    sintesi: "Via libera a un decreto legislativo di attuazione sulla digitalizzazione della PA.",
    url: "https://www.governo.it/it/archivio-consiglio-dei-ministri",
  },
];
