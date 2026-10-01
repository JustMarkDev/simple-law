/**
 * Glossario della terminologia politico-istituzionale italiana.
 * Tutte le definizioni sono in italiano e pensate per il pubblico generale.
 */

export const GLOSSARIO: Record<string, string> = {
  DDL: "Disegno di legge: proposta di legge presentata al Parlamento, che deve essere approvata da Camera e Senato.",
  DL: "Decreto-legge: provvedimento urgente del Governo che entra subito in vigore e deve essere convertito in legge entro 60 giorni.",
  "D.LGS":
    "Decreto legislativo: atto del Governo emanato su delega del Parlamento per attuare o riordinare la materia.",
  "D.P.R":
    "Decreto del Presidente della Repubblica: atto formale del Presidente della Repubblica su proposta del Governo.",
  "D.P.C.M":
    "Decreto del Presidente del Consiglio dei ministri: atto regolamentare adottato dal Presidente del Consiglio.",
  DPCM: "Decreto del Presidente del Consiglio dei ministri: atto regolamentare adottato dal Presidente del Consiglio.",
  DPR: "Decreto del Presidente della Repubblica: atto formale firmato dal Capo dello Stato su proposta del Governo.",
  AIR: "Analisi di impatto della regolamentazione: documento che valuta costi, benefici ed effetti di una proposta normativa.",
  VIR: "Verifica di impatto della regolamentazione: controllo successivo sugli effetti prodotti da una norma gia' in vigore.",
  NUVIR:
    "Nucleo per la verifica e l'impatto della regolamentazione: struttura del Governo che svolge le verifiche sull'impatto delle norme.",
  GU: "Gazzetta Ufficiale: fonte ufficiale di pubblicazione delle leggi e degli atti normativi italiani.",
  CdM: "Consiglio dei ministri: organo collegiale del Governo presieduto dal Presidente del Consiglio.",
  ELI: "European Legislation Identifier: sistema di identificazione univoca (URI) di leggi e atti normativi.",
  NIR: "Numero Identificativo della Regolamentazione: codice URN stabile che identifica una norma italiana.",
  URN: "Uniform Resource Name: identificatore persistente di una risorsa, usato dal sistema NIR.",
  SPARQL:
    "Linguaggio di interrogazione dei dati aperti RDF, usato per consultare banche dati pubbliche come quelle parlamentari.",
  DAGL: "Dipartimento per gli affari giuridici e legislativi: struttura di Palazzo Chigi che coordina l'attivita' normativa del Governo.",
  MEF: "Ministero dell'Economia e delle Finanze: dicastero competente su bilancio, fisco e finanza pubblica.",
  ISTAT:
    "Istituto nazionale di statistica: ente pubblico che produce le statistiche ufficiali del Paese.",
  SENATO: "Senato della Repubblica: una delle due camere del Parlamento italiano.",
  CAMERA: "Camera dei deputati: una delle due camere del Parlamento italiano.",
  CUP: "Comitato interministeriale per la programmazione economica e lo sviluppo sostenibile: comitato che approva investimenti pubblici strategici.",
  CONSOB:
    "Commissione nazionale per le societa' e la borsa: autorita' di vigilanza sui mercati finanziari.",
  AGCOM: "Autorita' per le garanzie nelle comunicazioni: regola telecomunicazioni, media e posta.",
  ARERA:
    "Autorita' di regolazione per energia, reti e ambiente: vigila su energia, gas, acqua e rifiuti.",
  PNRR: "Piano Nazionale di Ripresa e Resilienza: programma di investimenti finanziati dall'Unione europea.",
  SOGLIA:
    "Soglia di rilevanza: valore oltre il quale scatta un obbligo o un controllo previsto dalla norma.",
  OMISSIS: "Parti di un documento non pubblicate per tutela della riservatezza o della sicurezza.",
};

/** Sigle con espansione breve usata da `espandiSigle`. */
const SIGLE_BREVI: Record<string, string> = {
  DDL: "disegno di legge",
  DL: "decreto-legge",
  "D.LGS": "decreto legislativo",
  "D.P.R": "decreto del Presidente della Repubblica",
  "D.P.C.M": "decreto del Presidente del Consiglio dei ministri",
  DPR: "decreto del Presidente della Repubblica",
  DPCM: "decreto del Presidente del Consiglio dei ministri",
  AIR: "analisi di impatto della regolamentazione",
  VIR: "verifica di impatto della regolamentazione",
  NUVIR: "Nucleo per la verifica e l'impatto della regolamentazione",
  GU: "Gazzetta Ufficiale",
  CdM: "Consiglio dei ministri",
  ELI: "European Legislation Identifier",
  NIR: "Numero Identificativo della Regolamentazione",
  URN: "Uniform Resource Name",
  SPARQL: "linguaggio di interrogazione dei dati aperti",
  DAGL: "Dipartimento per gli affari giuridici e legislativi",
  MEF: "Ministero dell'Economia e delle Finanze",
  ISTAT: "Istituto nazionale di statistica",
  PNRR: "Piano Nazionale di Ripresa e Resilienza",
};

const INDICE_GLOSSARIO = new Map<string, string>();
for (const [chiave, valore] of Object.entries(GLOSSARIO)) {
  INDICE_GLOSSARIO.set(chiave.toUpperCase(), valore);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Solo le sigle con espansione breve vengono usate da `espandiSigle`:
// evita di "espandere" parole comuni presenti solo nel glossario.
const SIGLE_ORDINATE = Object.keys(SIGLE_BREVI).sort((a, b) => b.length - a.length);

const SIGLE_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${SIGLE_ORDINATE.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])(?!\\s*\\()`,
  "giu",
);

/** Restituisce la definizione di una sigla/termine, o un messaggio di fallback. */
export function gloss(term: string): string {
  if (!term) return "Nessun termine specificato.";
  const trovata = INDICE_GLOSSARIO.get(term.trim().toUpperCase());
  if (trovata) return trovata;
  return `Definizione non disponibile per "${term.trim()}".`;
}

/** Indica se il termine e' presente nel glossario. */
export function isGlossed(term: string): boolean {
  return INDICE_GLOSSARIO.has(term.trim().toUpperCase());
}

function espansioneBreve(originale: string): string {
  const chiave = originale.toUpperCase();
  const breve = SIGLE_BREVI[chiave] ?? SIGLE_BREVI[originale];
  if (breve) return breve;
  const definizione = INDICE_GLOSSARIO.get(chiave) ?? "";
  const primaFrase = definizione.split(":")[0]?.split(".")[0]?.trim();
  return primaFrase && primaFrase.length > 0 ? primaFrase : definizione;
}

/**
 * Espande le sigle note nel testo, es. "Il DDL" -> "Il DDL (disegno di legge)".
 * Le sigle gia' seguite da una parentesi non vengono toccate.
 */
export function espandiSigle(testo: string): string {
  if (!testo) return testo;
  return testo.replace(SIGLE_RE, (match) => `${match} (${espansioneBreve(match)})`);
}
