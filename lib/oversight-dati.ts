/**
 * Dati oversight per le pagine di controllo (solo server).
 *
 * Legge gli envelope reali prodotti da W1/W2 senza mai inventare nulla:
 * - `data/reali/anac-contratti-2025.json` (contratti pubblici ANAC/BDNCP 2025);
 * - `data/reali/ga-provvedimenti-2026.json` (provvedimenti CdS + TAR 2026).
 *
 * Solo codice server: usa `node:fs`/`node:path` via accesso pigro (nessun
 * import statico `node:`, cosi' un import accidentale dal client non rompe
 * il bundle). Tutte le funzioni sono never-throw: file assenti, oltre 1 MB
 * o invalidi -> array vuoti / null, mai eccezioni verso pagine o route.
 *
 * Onesta' dati (regole ferree):
 * - ocid/CIG/oggetti/importi/date/URL solo dal file, mai costruiti qui;
 * - i contratti pubblici e i provvedimenti di giustizia amministrativa
 *   NON sono leggi: nessun campo `stato`/vigenza viene mai derivato;
 * - importi mostrati solo come valori osservati, mai come "spesa certa";
 * - campi assenti o malformati -> omessi, mai ricostruiti.
 */

export interface StazioneAppaltante {
  denominazione: string;
  cf?: string;
}

export interface ContrattoPubblico {
  ocid: string;
  /** CIG assente quando la voce reale non ne riporta uno valido: mai inventato. */
  cig?: string;
  stazioneAppaltante: StazioneAppaltante;
  oggetto: string;
  importo?: number;
  valuta?: string;
  dataAward?: string;
  fornitore?: string;
  schedaBDNCP?: string;
  risorsaBulk?: string;
}

export type GiudiceGA = "cds" | "tar" | "cga";

export interface ProvvedimentoGA {
  /** Numero/anno assenti quando la voce reale non li riporta: mai inventati. */
  numero?: string;
  anno?: string;
  giudice: GiudiceGA;
  sezione?: string;
  data?: string;
  oggetto: string;
  schedaUrl: string;
  pdfUrl?: string;
  ecli?: string;
}

export interface ProvenienzaOversight {
  fonte?: string;
  url?: string;
  recuperatoIl?: string;
  licenza?: string;
  paginaDati?: string;
}

/** Documento CNEL (osservazione/proposta: solo metadati + link, mai testo). */
export interface DocumentoCnel {
  id: string;
  titolo: string;
  data?: string;
  url: string;
  tipo?: string;
}

/** Percorsi relativi (da cwd) degli envelope reali di W1/W2. */
export const PERCORSO_ANAC = "data/reali/oversight-anac-2025.json";
export const PERCORSO_GA = "data/reali/oversight-ga-2026.json";
/** Documenti CNEL (osservazioni e proposte, solo metadati + link). */
export const PERCORSO_CNEL = "data/reali/oversight-cnel-2026.json";

/** Dimensione massima accettata del JSON (oltre -> vuoto, mai parziali). */
export const MAX_JSON_BYTES = 1048576;

/** Disclaimer fisso: i contenuti di controllo non sono leggi. */
export const DISCLAIMER_CONTROLLO =
  "Contratti pubblici e provvedimenti di giustizia amministrativa: documenti di controllo, non sono leggi in vigore. Importi e date sono solo valori osservati nelle fonti ufficiali.";

/* ---------------------------------------------------------------------------
 * Normalizzazione e helper puri (mai throw).
 * ------------------------------------------------------------------------- */

/** Minuscole, NFD senza diacritici, spazi compattati. Non lancia mai. */
export function normalizzaOversight(value: unknown): string {
  try {
    if (typeof value !== "string") return "";
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/\s+/g, " ");
  } catch {
    return "";
  }
}

function stringaPulita(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function httpsUrl(value: unknown): string {
  try {
    const s = stringaPulita(value);
    if (!s) return "";
    const parsed = new URL(s);
    if (parsed.protocol !== "https:") return "";
    return s;
  } catch {
    return "";
  }
}

function isoValida(value: unknown): string {
  try {
    const s = stringaPulita(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? "" : s;
  } catch {
    return "";
  }
}

function importoValido(value: unknown): number | null {
  try {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    if (value < 0) return null;
    return value;
  } catch {
    return null;
  }
}

function ecliGaValido(value: unknown): string {
  const s = stringaPulita(value);
  return /^ECLI:IT:\S+$/.test(s) ? s.slice(0, 200) : "";
}

/** Normalizza il giudice GA in `cds` | `tar` | `cga`, altrimenti "". */
export function normalizzaGiudiceGA(value: unknown): GiudiceGA | "" {
  try {
    let s = "";
    if (typeof value === "string") {
      s = value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      const o = value as Record<string, unknown>;
      const candidato = o["tipo"] ?? o["codice"] ?? o["nome"] ?? o["giudice"] ?? "";
      s = typeof candidato === "string" ? candidato : "";
    }
    // Via i punti: "T.a.r. per ..." -> "tar per ..." (match stabile).
    const n = normalizzaOversight(s).replace(/\./g, "");
    if (n.includes("consiglio di stato") || n === "cds" || n.startsWith("cds")) return "cds";
    // Consiglio di giustizia amministrativa per la Regione Siciliana:
    // giudice d'appello siciliano, distinto da CdS e TAR.
    if (n.includes("consiglio di giustizia amministrativa")) return "cga";
    if (n === "tar" || n.startsWith("tar ")) return "tar";
    if (n === "cga" || n.startsWith("cga ")) return "cga";
    return "";
  } catch {
    return "";
  }
}

/** Etichetta leggibile del giudice (forma breve per badge). Non lancia mai. */
export function etichettaGiudiceGA(g: GiudiceGA, breve = false): string {
  try {
    if (g === "cds") return breve ? "CdS" : "Consiglio di Stato";
    if (g === "cga") return breve ? "CGA" : "CGA Sicilia";
    return breve ? "TAR" : "TAR";
  } catch {
    return "";
  }
}

/**
 * Normalizza una voce grezza in `ContrattoPubblico` o `null`. Prova prima
 * la forma ricca OCDS, poi la forma Voce semplice dei file reali. Mai
 * `stato`/vigenza: non sono leggi. Non lancia mai.
 */
export function aContratto(voce: unknown): ContrattoPubblico | null {
  try {
    const ricco = aContrattoRicco(voce);
    if (ricco) return ricco;
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    return aContrattoDaVoce(voce as Record<string, unknown>);
  } catch {
    return null;
  }
}

function aContrattoRicco(voce: unknown): ContrattoPubblico | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const ocid = stringaPulita(o["ocid"]).slice(0, 200);
    if (!ocid) return null;
    const cig = stringaPulita(o["cig"]).toUpperCase();
    if (!/^[A-Z0-9]{7,12}$/.test(cig)) return null;

    const saGrezza = o["stazioneAppaltante"] ?? o["sa"] ?? o["stazione"];
    let denominazione = "";
    let cf = "";
    if (typeof saGrezza === "string") {
      denominazione = stringaPulita(saGrezza).slice(0, 300);
      const cfAlt = stringaPulita(o["cfSA"] ?? o["cf"]);
      if (/^[A-Za-z0-9]{11,16}$/.test(cfAlt)) cf = cfAlt;
    } else if (saGrezza && typeof saGrezza === "object" && !Array.isArray(saGrezza)) {
      const sa = saGrezza as Record<string, unknown>;
      denominazione = stringaPulita(sa["denominazione"]).slice(0, 300);
      const cfGrezzo = stringaPulita(sa["cf"]);
      if (/^[A-Za-z0-9]{11,16}$/.test(cfGrezzo)) cf = cfGrezzo;
    }
    if (!denominazione) return null;

    const oggettoRaw = stringaPulita(o["oggetto"] ?? o["descrizione"]);
    if (oggettoRaw.length < 5) return null;

    const contratto: ContrattoPubblico = {
      ocid,
      cig,
      stazioneAppaltante: cf ? { denominazione, cf } : { denominazione },
      oggetto: oggettoRaw.slice(0, 2000),
    };
    const importo = importoValido(o["importo"]) ?? importoValido(o["valore"]);
    if (importo !== null) contratto.importo = importo;
    const valuta = stringaPulita(o["valuta"]).toUpperCase();
    if (/^[A-Z]{3}$/.test(valuta)) contratto.valuta = valuta;
    const dataAward = isoValida(o["dataAward"] ?? o["data"] ?? o["awardDate"]);
    if (dataAward) contratto.dataAward = dataAward;
    const fornitore = stringaPulita(o["fornitore"] ?? o["aggiudicatario"]).slice(0, 300);
    if (fornitore) contratto.fornitore = fornitore;
    const scheda = httpsUrl(o["schedaBDNCP"] ?? o["scheda"] ?? o["urlScheda"]);
    if (scheda) contratto.schedaBDNCP = scheda.slice(0, 500);
    const bulk = httpsUrl(o["risorsaBulk"] ?? o["url"]);
    if (bulk) contratto.risorsaBulk = bulk.slice(0, 500);
    return contratto;
  } catch {
    return null;
  }
}

/**
 * Forma Voce semplice dei file reali (`{id,titolo,data,url,ente,numero}`):
 * id e' l'OCID, numero il CIG (solo se valido), ente la stazione, titolo
 * l'oggetto, data l'award, url la risorsa bulk. Mai inventare: campi
 * assenti o invalidi restano assenti.
 */
function aContrattoDaVoce(o: Record<string, unknown>): ContrattoPubblico | null {
  try {
    const ocid = stringaPulita(o["id"]).slice(0, 200);
    if (!ocid) return null;
    const denominazione = stringaPulita(o["ente"]).slice(0, 300);
    if (!denominazione) return null;
    const oggettoRaw = stringaPulita(o["titolo"] ?? o["oggetto"]);
    if (oggettoRaw.length < 5) return null;
    const contratto: ContrattoPubblico = {
      ocid,
      stazioneAppaltante: { denominazione },
      oggetto: oggettoRaw.slice(0, 2000),
    };
    const cig = stringaPulita(o["numero"] ?? o["cig"]).toUpperCase();
    if (/^[A-Z0-9]{7,12}$/.test(cig)) contratto.cig = cig;
    const dataAward = isoValida(o["data"]);
    if (dataAward) contratto.dataAward = dataAward;
    const bulk = httpsUrl(o["url"]);
    if (bulk) contratto.risorsaBulk = bulk.slice(0, 500);
    return contratto;
  } catch {
    return null;
  }
}

/**
 * Normalizza una voce grezza in `ProvvedimentoGA` o `null`. Prova prima la
 * forma ricca (numero/anno/giudice espliciti), poi la forma Voce semplice
 * dei file reali (giudice dall'ente, sezione dopo la virgola, numero/anno
 * solo se espliciti e validi: mai inventati). Mai `stato`/vigenza: non
 * sono leggi. Non lancia mai.
 */
export function aProvvedimentoGA(voce: unknown): ProvvedimentoGA | null {
  try {
    const ricco = aProvvedimentoGARicco(voce);
    if (ricco) return ricco;
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const giudice = normalizzaGiudiceGA(o["giudice"] ?? o["ente"]);
    if (!giudice) return null;
    const schedaUrl = httpsUrl(o["schedaUrl"] ?? o["scheda"] ?? o["url"]);
    if (!schedaUrl) return null;
    const oggettoRaw = stringaPulita(o["oggetto"] ?? o["titolo"] ?? o["epigrafe"]);
    if (oggettoRaw.length < 5) return null;
    const p: ProvvedimentoGA = {
      giudice,
      oggetto: oggettoRaw.slice(0, 2000),
      schedaUrl: schedaUrl.slice(0, 500),
    };
    const numero = stringaPulita(o["numero"]);
    if (/^\d+$/.test(numero)) p.numero = String(Number.parseInt(numero, 10));
    const anno = stringaPulita(o["anno"]);
    if (/^\d{4}$/.test(anno)) p.anno = anno;
    // Sezione dalla parte dopo la virgola dell'ente ("Consiglio di Stato,
    // Adunanza plenaria") o dal campo esplicito.
    const ente = stringaPulita(o["ente"]);
    const dopoVirgola = ente.includes(",") ? ente.split(",").slice(1).join(",").trim() : "";
    const sezione = stringaPulita(o["sezione"] ?? dopoVirgola).slice(0, 120);
    if (sezione) p.sezione = sezione;
    const data = isoValida(o["data"]);
    if (data) p.data = data;
    return p;
  } catch {
    return null;
  }
}

function aProvvedimentoGARicco(voce: unknown): ProvvedimentoGA | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const numero = stringaPulita(o["numero"]);
    if (!/^\d+$/.test(numero)) return null;
    const anno = stringaPulita(o["anno"]);
    if (!/^\d{4}$/.test(anno)) return null;
    const giudice = normalizzaGiudiceGA(o["giudice"]);
    if (!giudice) return null;
    const schedaUrl = httpsUrl(o["schedaUrl"] ?? o["scheda"] ?? o["url"]);
    if (!schedaUrl) return null;
    const oggettoRaw = stringaPulita(o["oggetto"] ?? o["titolo"] ?? o["epigrafe"]);
    if (oggettoRaw.length < 5) return null;

    const p: ProvvedimentoGA = {
      numero: String(Number.parseInt(numero, 10)),
      anno,
      giudice,
      oggetto: oggettoRaw.slice(0, 2000),
      schedaUrl: schedaUrl.slice(0, 500),
    };
    const sezioneRaw =
      typeof o["giudice"] === "object" && o["giudice"] !== null && !Array.isArray(o["giudice"])
        ? stringaPulita((o["giudice"] as Record<string, unknown>)["sezione"])
        : "";
    const sezione = stringaPulita(o["sezione"] ?? sezioneRaw).slice(0, 120);
    if (sezione) p.sezione = sezione;
    const data = isoValida(o["data"]);
    if (data) p.data = data;
    const pdf = httpsUrl(o["pdfUrl"] ?? o["pdf"]);
    if (pdf) p.pdfUrl = pdf.slice(0, 500);
    const ecli = ecliGaValido(o["ecli"]);
    if (ecli) p.ecli = ecli;
    return p;
  } catch {
    return null;
  }
}

/**
 * Ricerca contratti per ocid/CIG/oggetto/stazione/fornitore (max 100 char,
 * min 2 dopo normalizzazione). Sotto i 2 caratteri: copia invariata.
 * Non lancia mai.
 */
export function cercaContratti(
  contratti: readonly ContrattoPubblico[],
  q: unknown,
): ContrattoPubblico[] {
  try {
    if (!Array.isArray(contratti)) return [];
    const grezza = typeof q === "string" ? q.slice(0, 100) : "";
    const n = normalizzaOversight(grezza);
    if (n.length < 2) return [...contratti];
    return contratti.filter((c) => {
      try {
        return (
          normalizzaOversight(c?.ocid).includes(n) ||
          normalizzaOversight(c?.cig).includes(n) ||
          normalizzaOversight(c?.oggetto).includes(n) ||
          normalizzaOversight(c?.stazioneAppaltante?.denominazione).includes(n) ||
          normalizzaOversight(c?.fornitore ?? "").includes(n)
        );
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/**
 * Filtro per stazione appaltante (contains sul normalizzato, max 100 char,
 * min 2). Sotto i 2 caratteri: copia invariata. Non lancia mai.
 */
export function filtraPerEnte(
  contratti: readonly ContrattoPubblico[],
  ente: unknown,
): ContrattoPubblico[] {
  try {
    if (!Array.isArray(contratti)) return [];
    const grezza = typeof ente === "string" ? ente.slice(0, 100) : "";
    const n = normalizzaOversight(grezza);
    if (n.length < 2) return [...contratti];
    return contratti.filter((c) => {
      try {
        return normalizzaOversight(c?.stazioneAppaltante?.denominazione).includes(n);
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/**
 * Ricerca provvedimenti GA per numero/oggetto/sezione (max 100 char, min 2
 * dopo normalizzazione). Sotto i 2 caratteri: copia invariata. Non lancia mai.
 */
export function cercaProvvedimenti(
  provvedimenti: readonly ProvvedimentoGA[],
  q: unknown,
): ProvvedimentoGA[] {
  try {
    if (!Array.isArray(provvedimenti)) return [];
    const grezza = typeof q === "string" ? q.slice(0, 100) : "";
    const n = normalizzaOversight(grezza);
    if (n.length < 2) return [...provvedimenti];
    return provvedimenti.filter((p) => {
      try {
        return (
          normalizzaOversight(p?.numero).includes(n) ||
          normalizzaOversight(p?.oggetto).includes(n) ||
          normalizzaOversight(p?.sezione ?? "").includes(n) ||
          normalizzaOversight(p?.ecli ?? "").includes(n)
        );
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/**
 * Filtro per giudice (`cds` | `tar`; valore ignoto -> copia invariata).
 * Non lancia mai.
 */
export function filtraPerGiudice(
  provvedimenti: readonly ProvvedimentoGA[],
  giudice: unknown,
): ProvvedimentoGA[] {
  try {
    if (!Array.isArray(provvedimenti)) return [];
    const g = normalizzaGiudiceGA(giudice);
    if (!g) return [...provvedimenti];
    return provvedimenti.filter((p) => p?.giudice === g);
  } catch {
    return [];
  }
}

/**
 * Paginazione: `per` ammessi 10|20|50 (default 20), `page` >= 1 (default 1).
 * Non lancia mai.
 */
export function paginaOversight<T>(elementi: readonly T[], page: unknown, per: unknown): T[] {
  try {
    const elenco = Array.isArray(elementi) ? elementi : [];
    const p = typeof page === "number" && Number.isFinite(page) ? Math.floor(page) : 1;
    const numeroPagina = p >= 1 ? p : 1;
    const n = typeof per === "number" && Number.isFinite(per) ? Math.floor(per) : 20;
    const perPagina = n === 10 || n === 20 || n === 50 ? n : 20;
    const inizio = (numeroPagina - 1) * perPagina;
    return elenco.slice(inizio, inizio + perPagina);
  } catch {
    return [];
  }
}

/** Conteggi per giudice, ordinati per componenti desc e nome asc. */
export function contaPerGiudice(
  provvedimenti: readonly ProvvedimentoGA[],
): { nome: string; componenti: number }[] {
  try {
    if (!Array.isArray(provvedimenti)) return [];
    const conteggi = new Map<string, number>();
    for (const p of provvedimenti) {
      const g = typeof p?.giudice === "string" ? p.giudice.trim() : "";
      if (!g) continue;
      conteggi.set(g, (conteggi.get(g) ?? 0) + 1);
    }
    return [...conteggi.entries()]
      .map(([nome, componenti]) => ({ nome, componenti }))
      .sort((a, b) => b.componenti - a.componenti || a.nome.localeCompare(b.nome, "it"));
  } catch {
    return [];
  }
}

/* ---------------------------------------------------------------------------
 * Caricamento da disco (solo server, con cache).
 * ------------------------------------------------------------------------- */

interface ModuliNode {
  existsSync(p: string): boolean;
  readFileSync(p: string, enc: string): string;
  join(...p: string[]): string;
}

function moduliNode(): ModuliNode | null {
  try {
    if (typeof process === "undefined") return null;
    if (typeof window !== "undefined") return null;
    const g = globalThis as unknown as {
      process?: { getBuiltinModule?: (m: string) => unknown };
    };
    const proc = g.process;
    if (proc && typeof proc.getBuiltinModule === "function") {
      const fs = proc.getBuiltinModule("node:fs") as {
        existsSync(p: string): boolean;
        readFileSync(p: string, enc: string): string;
      };
      const path = proc.getBuiltinModule("node:path") as {
        join(...p: string[]): string;
      };
      if (fs && path && typeof fs.readFileSync === "function") {
        return {
          existsSync: fs.existsSync,
          readFileSync: fs.readFileSync,
          join: path.join,
        };
      }
    }
  } catch {
    // nessun modulo node disponibile: fallback vuoto
  }
  return null;
}

const cache: {
  contratti: ContrattoPubblico[] | null;
  provenanceAnac: ProvenienzaOversight | null;
  provvedimenti: ProvvedimentoGA[] | null;
  provenanceGa: ProvenienzaOversight | null;
  documentiCnel: DocumentoCnel[] | null;
  provenanceCnel: ProvenienzaOversight | null;
} = {
  contratti: null,
  provenanceAnac: null,
  provvedimenti: null,
  provenanceGa: null,
  documentiCnel: null,
  provenanceCnel: null,
};

/** Azzera la cache in modulo (utile nei test). Non lancia mai. */
export function azzeraCacheOversight(): void {
  try {
    cache.contratti = null;
    cache.provenanceAnac = null;
    cache.provvedimenti = null;
    cache.provenanceGa = null;
    cache.documentiCnel = null;
    cache.provenanceCnel = null;
  } catch {
    // mai lanciare
  }
}

function leggiEnvelope(percorso: string): unknown | null {
  try {
    const mod = moduliNode();
    if (!mod) return null;
    let base = "";
    try {
      base = typeof process !== "undefined" && process.cwd ? process.cwd() : "";
    } catch {
      return null;
    }
    if (!base) return null;
    const ass = mod.join(base, percorso);
    if (!mod.existsSync(ass)) return null;
    const raw = mod.readFileSync(ass, "utf8");
    if (!raw || raw.length > MAX_JSON_BYTES) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function provenanceDi(grezzo: unknown): ProvenienzaOversight | null {
  try {
    if (!grezzo || typeof grezzo !== "object" || Array.isArray(grezzo)) return null;
    const o = grezzo as Record<string, unknown>;
    const prov = o["provenance"];
    if (!prov || typeof prov !== "object" || Array.isArray(prov)) return null;
    const p = prov as Record<string, unknown>;
    const out: ProvenienzaOversight = {};
    for (const campo of ["fonte", "url", "recuperatoIl", "licenza", "paginaDati"] as const) {
      const v = stringaPulita(p[campo]);
      if (v) out[campo] = v.slice(0, 500);
    }
    return out;
  } catch {
    return null;
  }
}

function listaDi(grezzo: unknown, chiavi: string[]): unknown[] {
  try {
    if (!grezzo || typeof grezzo !== "object" || Array.isArray(grezzo)) return [];
    const o = grezzo as Record<string, unknown>;
    for (const chiave of chiavi) {
      const lista = o[chiave];
      if (Array.isArray(lista)) return lista;
    }
    return [];
  } catch {
    return [];
  }
}

function caricaContratti(): {
  contratti: ContrattoPubblico[];
  provenance: ProvenienzaOversight | null;
} {
  try {
    const grezzo = leggiEnvelope(PERCORSO_ANAC);
    if (!grezzo) return { contratti: [], provenance: null };
    const lista = listaDi(grezzo, ["voci", "contratti", "releases", "items"]);
    const contratti: ContrattoPubblico[] = [];
    const visti = new Set<string>();
    for (const voce of lista.slice(0, 100)) {
      const c = aContratto(voce);
      if (!c) continue;
      const chiave = c.ocid || c.cig || c.oggetto;
      if (!chiave || visti.has(chiave)) continue;
      visti.add(chiave);
      contratti.push(c);
    }
    return { contratti, provenance: provenanceDi(grezzo) };
  } catch {
    return { contratti: [], provenance: null };
  }
}

function caricaProvvedimenti(): {
  provvedimenti: ProvvedimentoGA[];
  provenance: ProvenienzaOversight | null;
} {
  try {
    const grezzo = leggiEnvelope(PERCORSO_GA);
    if (!grezzo) return { provvedimenti: [], provenance: null };
    const lista = listaDi(grezzo, ["voci", "provvedimenti", "atti", "pronunce", "items"]);
    const provvedimenti: ProvvedimentoGA[] = [];
    const visti = new Set<string>();
    for (const voce of lista.slice(0, 100)) {
      const p = aProvvedimentoGA(voce);
      if (!p) continue;
      const chiave = p.numero && p.anno ? `${p.anno}/${p.giudice}/${p.numero}` : p.schedaUrl;
      if (!chiave || visti.has(chiave)) continue;
      visti.add(chiave);
      provvedimenti.push(p);
    }
    provvedimenti.sort((a, b) =>
      (a.anno ?? "") !== (b.anno ?? "")
        ? (b.anno ?? "").localeCompare(a.anno ?? "")
        : Number(a.numero ?? 0) - Number(b.numero ?? 0),
    );
    return { provvedimenti, provenance: provenanceDi(grezzo) };
  } catch {
    return { provvedimenti: [], provenance: null };
  }
}

/** Tutti i contratti ANAC (copia difensiva, mai throw). */
export async function tuttiContratti(): Promise<ContrattoPubblico[]> {
  try {
    if (!cache.contratti) {
      const { contratti, provenance } = caricaContratti();
      cache.contratti = contratti;
      cache.provenanceAnac = provenance;
    }
    return (cache.contratti ?? []).map((c) => ({
      ...c,
      stazioneAppaltante: { ...c.stazioneAppaltante },
    }));
  } catch {
    return [];
  }
}

/** Provenance ANAC del file reale. Mai throw. */
export async function leggiProvenanceAnac(): Promise<ProvenienzaOversight> {
  try {
    await tuttiContratti();
    return { ...(cache.provenanceAnac ?? {}) };
  } catch {
    return {};
  }
}

/** Tutti i provvedimenti GA (copia difensiva, mai throw). */
export async function tuttiProvvedimentiGA(): Promise<ProvvedimentoGA[]> {
  try {
    if (!cache.provvedimenti) {
      const { provvedimenti, provenance } = caricaProvvedimenti();
      cache.provvedimenti = provvedimenti;
      cache.provenanceGa = provenance;
    }
    return (cache.provvedimenti ?? []).map((p) => ({ ...p }));
  } catch {
    return [];
  }
}

/** Provenance GA del file reale. Mai throw. */
export async function leggiProvenanceGA(): Promise<ProvenienzaOversight> {
  try {
    await tuttiProvvedimentiGA();
    return { ...(cache.provenanceGa ?? {}) };
  } catch {
    return {};
  }
}

/**
 * Normalizza un documento CNEL in `DocumentoCnel` o `null` (mancano id,
 * titolo o URL https). Mai testo integrale: solo metadati + link.
 * Non lancia mai.
 */
export function aDocumentoCnel(voce: unknown): DocumentoCnel | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const id = stringaPulita(o["id"]);
    const titolo = stringaPulita(o["titolo"]);
    const url = httpsUrl(o["url"]);
    if (!id || !titolo || titolo.length < 5 || !url) return null;
    const doc: DocumentoCnel = {
      id: id.slice(0, 500),
      titolo: titolo.slice(0, 2000),
      url: url.slice(0, 500),
    };
    const data = isoValida(o["data"]);
    if (data) doc.data = data;
    const tipo = stringaPulita(o["tipo"]).slice(0, 120);
    if (tipo) doc.tipo = tipo;
    return doc;
  } catch {
    return null;
  }
}

function caricaDocumentiCnel(): {
  documenti: DocumentoCnel[];
  provenance: ProvenienzaOversight | null;
} {
  try {
    const grezzo = leggiEnvelope(PERCORSO_CNEL);
    if (!grezzo) return { documenti: [], provenance: null };
    const lista = listaDi(grezzo, ["voci", "documenti", "items"]);
    const documenti: DocumentoCnel[] = [];
    const visti = new Set<string>();
    for (const voce of lista.slice(0, 100)) {
      const d = aDocumentoCnel(voce);
      if (!d) continue;
      if (visti.has(d.id)) continue;
      visti.add(d.id);
      documenti.push(d);
    }
    return { documenti, provenance: provenanceDi(grezzo) };
  } catch {
    return { documenti: [], provenance: null };
  }
}

/** Tutti i documenti CNEL (copia difensiva, mai throw). */
export async function tuttiDocumentiCnel(): Promise<DocumentoCnel[]> {
  try {
    if (!cache.documentiCnel) {
      const { documenti, provenance } = caricaDocumentiCnel();
      cache.documentiCnel = documenti;
      cache.provenanceCnel = provenance;
    }
    return (cache.documentiCnel ?? []).map((d) => ({ ...d }));
  } catch {
    return [];
  }
}

/** Provenance CNEL del file reale. Mai throw. */
export async function leggiProvenanceCnel(): Promise<ProvenienzaOversight> {
  try {
    await tuttiDocumentiCnel();
    return { ...(cache.provenanceCnel ?? {}) };
  } catch {
    return {};
  }
}

/**
 * Ricerca documenti CNEL per titolo (max 100 char, min 2 dopo
 * normalizzazione). Sotto i 2 caratteri: copia invariata. Non lancia mai.
 */
export function cercaDocumentiCnel(
  documenti: readonly DocumentoCnel[],
  q: unknown,
): DocumentoCnel[] {
  try {
    if (!Array.isArray(documenti)) return [];
    const grezza = typeof q === "string" ? q.slice(0, 100) : "";
    const n = normalizzaOversight(grezza);
    if (n.length < 2) return [...documenti];
    return documenti.filter((d) => {
      try {
        return (
          normalizzaOversight(d?.titolo).includes(n) ||
          normalizzaOversight(d?.tipo ?? "").includes(n)
        );
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

export interface SintesiControllo {
  contratti: number;
  contrattiDisponibili: boolean;
  provvedimenti: number;
  provvedimentiDisponibili: boolean;
  documentiCnel: number;
  documentiCnelDisponibili: boolean;
}

/**
 * Sintesi per l'hub di controllo (conteggi reali, mai inventati; file
 * assente -> 0 e `disponibile: false`). Mai throw.
 */
export async function sintesiControllo(): Promise<SintesiControllo> {
  try {
    const [contratti, provvedimenti, documentiCnel] = await Promise.all([
      tuttiContratti(),
      tuttiProvvedimentiGA(),
      tuttiDocumentiCnel(),
    ]);
    return {
      contratti: contratti.length,
      contrattiDisponibili: contratti.length > 0,
      provvedimenti: provvedimenti.length,
      provvedimentiDisponibili: provvedimenti.length > 0,
      documentiCnel: documentiCnel.length,
      documentiCnelDisponibili: documentiCnel.length > 0,
    };
  } catch {
    return {
      contratti: 0,
      contrattiDisponibili: false,
      provvedimenti: 0,
      provvedimentiDisponibili: false,
      documentiCnel: 0,
      documentiCnelDisponibili: false,
    };
  }
}
