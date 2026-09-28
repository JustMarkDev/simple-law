/**
 * Dati elettorali reali per pagine e API (server-only).
 *
 * Legge gli envelope in `data/reali/elezioni-*.json` (file per
 * consultazione, solo aggregati: nazionale + liste + regioni/
 * circoscrizioni con per-lista, comuni solo affluenza, mai righe
 * candidato/nominativi) con cache in modulo per percorso. Solo codice
 * server: usa `node:fs`/`node:path` via accesso pigro (nessun import
 * statico `node:`, cosi' un import accidentale dal client non rompe il
 * bundle). Tutte le funzioni sono never-throw: file assente, oltre 1 MB
 * o invalido -> valori vuoti, mai eccezioni. Una consultazione il cui
 * file e' assente risulta semplicemente assente dal registry, mai throw.
 *
 * Onesta' dati: il loader estrae SOLO chiavi aggregate in whitelist
 * (`provenance`, `elezione`, `liste`, `regioni`, `circoscrizioni`,
 * `collegiU`, `comuni`, `metodologia`, `avvertenze`). Anche se il file
 * contenesse righe candidato/nominativi (`COGNOME`, `NOME`,
 * `DATANASCITA`, `PREFERENZE`, ...), queste chiavi non vengono mai lette
 * ne' propagate. Mai numeri inventati: i campi assenti o invalidi
 * invalidano il file (vuoto), non vengono stimati.
 */

/* ---------------------------------------------------------------------------
 * Tipi (contratto multi-consultazione: europee-2024 + politiche-2022).
 * ------------------------------------------------------------------------- */

/** Identificativi REST delle consultazioni supportate. */
export type IdElezione =
  | "europee-2024"
  | "politiche-2022-camera"
  | "politiche-2022-senato";

/** Voce del registry: metadati statici per ogni consultazione. */
export interface VoceRegistroElezione {
  id: IdElezione;
  tipo: string;
  data: string;
  file: string;
  titolo: string;
}

export interface ProvenanceElezioni {
  fonte?: string;
  url?: string;
  recuperatoIl?: string;
  licenza?: string;
}

export interface ElezioneSintesi {
  tipo: string;
  data: string;
  e: number;
  v: number;
  b: number;
  k: number;
  a: number;
}

export interface ListaRisultato {
  n: string;
  v: number;
  p: number;
}

export interface RegioneRisultato {
  r: string;
  e: number;
  v: number;
  b: number;
  k: number;
  a: number;
  liste: ListaRisultato[];
}

export interface ComuneRisultato {
  c: string;
  p: string;
  r: string;
  e: number;
  v: number;
  a: number;
}

/** Circoscrizione / regione con per-lista (politiche: chiave `circoscrizioni`). */
export interface CircoscrizioneRisultato {
  r: string;
  e: number;
  v: number;
  b: number;
  k: number;
  a: number;
  liste: ListaRisultato[];
}

/** Collegio uninominale (solo affluenza, mai nominativi). */
export interface CollegioURisultato {
  n: string;
  e: number;
  v: number;
}

export interface Europee2024 {
  provenance: ProvenanceElezioni;
  elezione: ElezioneSintesi;
  liste: ListaRisultato[];
  regioni: RegioneRisultato[];
  /** Presente per le politiche 2022 (specchio aggregato di `regioni`). */
  circoscrizioni?: CircoscrizioneRisultato[];
  /** Presente per le politiche 2022 (solo affluenza per collegio U). */
  collegiU?: CollegioURisultato[];
  comuni: ComuneRisultato[];
  metodologia: string;
  avvertenze: string;
}

/** Alias generico multi-consultazione (stesso envelope, mai nominativi). */
export type DatiElezioni = Europee2024;

/** TipoElezione dell'envelope (direttiva W2 §7). */
export type TipoElezione = IdElezione;

/** Esito mai-throw per i chiamanti che vogliono il motivo del vuoto. */
export type Result<T> = { ok: true; dati: T } | { ok: false; errore: string };

/* ---------------------------------------------------------------------------
 * Costanti pubbliche (riusate dalle API per licenza/disclaimer).
 * ------------------------------------------------------------------------- */

/** Percorso relativo (da cwd) del file unico v1. */
export const PERCORSO_EUROPEE_2024 = "data/reali/elezioni-europee-2024.json";

/** Identificativo REST della consultazione v1. */
export const ID_EUROPEE_2024 = "europee-2024" as const;

/** Identificativi REST delle politiche 2022 (file di W1, se presenti). */
export const ID_POLITICHE_2022_CAMERA = "politiche-2022-camera" as const;
export const ID_POLITICHE_2022_SENATO = "politiche-2022-senato" as const;

/** Percorsi relativi (da cwd) dei file politiche 2022 (W1). */
export const PERCORSO_POLITICHE_2022_CAMERA =
  "data/reali/elezioni-politiche-2022-camera.json";
export const PERCORSO_POLITICHE_2022_SENATO =
  "data/reali/elezioni-politiche-2022-senato.json";

/** Default per retrocompatibilita' (`?id=` assente -> europee-2024). */
export const DEFAULT_ID_ELEZIONE: IdElezione = ID_EUROPEE_2024;

/**
 * Registry statico delle consultazioni (metadati, mai numeri reali).
 * La disponibilita' effettiva dipende dal file su disco: file assente
 * o invalido -> consultazione assente, mai throw.
 */
export const REGISTRY_ELEZIONI: readonly VoceRegistroElezione[] = [
  {
    id: "europee-2024",
    tipo: "europee",
    data: "2024-06-09",
    file: PERCORSO_EUROPEE_2024,
    titolo: "Elezioni europee 2024",
  },
  {
    id: "politiche-2022-camera",
    tipo: "politiche-camera",
    data: "2022-09-25",
    file: PERCORSO_POLITICHE_2022_CAMERA,
    titolo: "Elezioni politiche 2022 — Camera",
  },
  {
    id: "politiche-2022-senato",
    tipo: "politiche-senato",
    data: "2022-09-25",
    file: PERCORSO_POLITICHE_2022_SENATO,
    titolo: "Elezioni politiche 2022 — Senato",
  },
];

/** Licenza dichiarata: open-data ministeriale da confermare. */
export const LICENZA_ELEZIONI =
  "Dati ufficiali Ministero dell'Interno DAIT (Eligendo Open Data); riuso open-data ministeriale da confermare, pagina info_opendata senza stringa di licenza CC-BY.";

/** Disclaimer aggregati, da mostrare in ogni render/API. */
export const DISCLAIMER_AGGREGATI =
  "Solo dati aggregati per liste, regioni e comuni. Nessun nominativo, nessuna riga candidato integrale. Seggi non disponibili nel file di origine.";

/** Tetto righe per la ricerca comuni (contains, v1 senza per-lista comunale). */
export const MAX_COMUNI_RICERCA = 100;

/** Dimensione massima accettata del JSON (oltre -> vuoto, mai parziali). */
export const MAX_JSON_BYTES = 1048576;

/* ---------------------------------------------------------------------------
 * Helper puri (mai lanciano).
 * ------------------------------------------------------------------------- */

/** Minuscole, NFD senza diacritici, spazi compattati. Non lancia mai. */
export function normalizza(value: unknown): string {
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

function stringa(value: unknown, max: number): string {
  try {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, max);
  } catch {
    return "";
  }
}

function interoNonNegativo(value: unknown): number | null {
  try {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const n = Math.floor(value);
    return n >= 0 ? n : null;
  } catch {
    return null;
  }
}

function percentuale(value: unknown): number | null {
  try {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return value >= 0 && value <= 100 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Ricerca comuni per nome (contains, anche su provincia): query troncata a
 * 100 caratteri, minimo 2 dopo normalizzazione, al massimo 100 righe.
 * Sotto i 2 caratteri restituisce array vuoto. Non lancia mai.
 */
export function cercaComune(
  comuni: readonly ComuneRisultato[],
  q: unknown,
): ComuneRisultato[] {
  try {
    if (!Array.isArray(comuni)) return [];
    const grezza = typeof q === "string" ? q.slice(0, 100) : "";
    const chiave = normalizza(grezza);
    if (chiave.length < 2) return [];
    const out: ComuneRisultato[] = [];
    for (const c of comuni) {
      if (out.length >= MAX_COMUNI_RICERCA) break;
      if (!c || typeof c !== "object") continue;
      const nome = normalizza((c as ComuneRisultato).c);
      const prov = normalizza((c as ComuneRisultato).p);
      if (nome.includes(chiave) || prov.includes(chiave)) out.push({ ...c });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Prime `n` liste per voti desc (clamp 1..10, default 10 su input invalido).
 * Non muta l'array di ingresso. Non lancia mai.
 */
export function topListe(
  liste: readonly ListaRisultato[],
  n: unknown,
): ListaRisultato[] {
  try {
    if (!Array.isArray(liste)) return [];
    let limite = 10;
    if (typeof n === "number" && Number.isFinite(n)) limite = Math.floor(n);
    if (limite < 1) limite = 1;
    if (limite > 10) limite = 10;
    return [...liste]
      .filter(
        (l): l is ListaRisultato => !!l && typeof l === "object",
      )
      .map((l) => ({ ...l }))
      .sort((a, b) => b.v - a.v)
      .slice(0, limite);
  } catch {
    return [];
  }
}

/**
 * Affluenza in percentuale a 1 decimale (0..100). Input invalidi o
 * elettori <= 0 -> 0. Non lancia mai.
 */
export function affluenza(elettori: unknown, votanti: unknown): number {
  try {
    if (typeof elettori !== "number" || typeof votanti !== "number") return 0;
    if (!Number.isFinite(elettori) || !Number.isFinite(votanti)) return 0;
    if (elettori <= 0 || votanti < 0) return 0;
    const p = (votanti / elettori) * 100;
    if (!Number.isFinite(p)) return 0;
    return Math.round(Math.min(100, Math.max(0, p)) * 10) / 10;
  } catch {
    return 0;
  }
}

/** Alias con nome esplicito per i comuni (stessa semantica di affluenza). */
export function affluenzaComune(elettori: unknown, votanti: unknown): number {
  return affluenza(elettori, votanti);
}

/**
 * Trova una regione per nome (match esatto sul normalizzato, max 80 ch).
 * Restituisce una copia difensiva o null. Non lancia mai.
 */
export function regioneDi(
  regioni: readonly RegioneRisultato[],
  nome: unknown,
): RegioneRisultato | null {
  try {
    if (!Array.isArray(regioni) || typeof nome !== "string") return null;
    const chiave = normalizza(nome.slice(0, 80));
    if (!chiave) return null;
    const trovata = regioni.find(
      (r) => !!r && typeof r === "object" && normalizza(r.r) === chiave,
    );
    if (!trovata) return null;
    return { ...trovata, liste: [...trovata.liste] };
  } catch {
    return null;
  }
}

/**
 * Paginazione generica: `page` >= 1 (default 1), `per` 1..100 (default 20).
 * Non lancia mai.
 */
export function pagina<T>(
  elementi: readonly T[],
  page: unknown,
  per: unknown,
): T[] {
  try {
    const elenco = Array.isArray(elementi) ? elementi : [];
    const p =
      typeof page === "number" && Number.isFinite(page)
        ? Math.floor(page)
        : 1;
    const numeroPagina = p >= 1 ? p : 1;
    const n =
      typeof per === "number" && Number.isFinite(per) ? Math.floor(per) : 20;
    const perPagina = n >= 1 && n <= 100 ? n : 20;
    const inizio = (numeroPagina - 1) * perPagina;
    if (inizio >= elenco.length) return [];
    return elenco.slice(inizio, inizio + perPagina);
  } catch {
    return [];
  }
}

/* ---------------------------------------------------------------------------
 * Caricamento da disco (solo server, con cache). Whitelist stretta:
 * vengono estratte solo le chiavi aggregate del contratto v1.
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
    const g = globalThis as unknown & {
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

interface StatoCache {
  dati: Europee2024 | null;
  errore: string;
}

const cachePerPercorso = new Map<string, StatoCache>();

/** Azzera la cache in modulo (utile nei test). Non lancia mai. */
export function azzeraCache(): void {
  try {
    cachePerPercorso.clear();
  } catch {
    // mai lanciare
  }
}

/* ---------------------------------------------------------------------------
 * Helper id / registry (puri, mai lanciano).
 * ------------------------------------------------------------------------- */

/** Normalizza un id consultazione (trim, minuscole, max 64 ch). */
export function normalizzaIdElezione(value: unknown): IdElezione | null {
  try {
    if (typeof value !== "string") return null;
    const chiave = value.trim().toLowerCase().slice(0, 64);
    if (
      chiave === "europee-2024" ||
      chiave === "politiche-2022-camera" ||
      chiave === "politiche-2022-senato"
    )
      return chiave;
    return null;
  } catch {
    return null;
  }
}

/** True se `value` e' un id consultazione noto. Non lancia mai. */
export function isIdElezione(value: unknown): value is IdElezione {
  try {
    return normalizzaIdElezione(value) !== null;
  } catch {
    return false;
  }
}

/** Voce di registry per id noto, altrimenti null. Non lancia mai. */
export function voceRegistroElezione(
  id: unknown,
): VoceRegistroElezione | null {
  try {
    const chiave = normalizzaIdElezione(id);
    if (!chiave) return null;
    const voce = REGISTRY_ELEZIONI.find((v) => v.id === chiave);
    return voce ? { ...voce } : null;
  } catch {
    return null;
  }
}

function aProvenance(value: unknown): ProvenanceElezioni {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const o = value as Record<string, unknown>;
    const out: ProvenanceElezioni = {};
    const fonte = stringa(o["fonte"], 160);
    if (fonte) out.fonte = fonte;
    const url = stringa(o["url"], 300);
    if (/^https?:\/\//i.test(url)) out.url = url;
    const recuperatoIl = stringa(o["recuperatoIl"], 32);
    if (recuperatoIl) out.recuperatoIl = recuperatoIl;
    const licenza = stringa(o["licenza"], 300);
    if (licenza) out.licenza = licenza;
    return out;
  } catch {
    return {};
  }
}

function aLista(voce: unknown): ListaRisultato | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const n = stringa(o["n"], 120);
    const v = interoNonNegativo(o["v"]);
    if (!n || v === null) return null;
    const p = percentuale(o["p"]);
    return { n, v, p: p ?? 0 };
  } catch {
    return null;
  }
}

function aListe(value: unknown, max: number): ListaRisultato[] | null {
  try {
    if (!Array.isArray(value) || value.length > max) return null;
    const out: ListaRisultato[] = [];
    for (const voce of value) {
      const lista = aLista(voce);
      if (!lista) return null;
      out.push(lista);
    }
    return out;
  } catch {
    return null;
  }
}

function aRegione(voce: unknown): RegioneRisultato | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const r = stringa(o["r"], 80);
    const e = interoNonNegativo(o["e"]);
    const v = interoNonNegativo(o["v"]);
    const b = interoNonNegativo(o["b"]);
    const k = interoNonNegativo(o["k"]);
    const a = percentuale(o["a"]);
    const liste = aListe(o["liste"], 64);
    if (!r || e === null || v === null || b === null || k === null) return null;
    if (a === null || liste === null) return null;
    return { r, e, v, b, k, a, liste };
  } catch {
    return null;
  }
}

function aComune(voce: unknown): ComuneRisultato | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    // Solo aggregati comunali (mai per-lista, mai nominativi): ogni altra
    // chiave presente nella voce viene ignorata, non propagata.
    const c = stringa(o["c"], 80);
    const p = stringa(o["p"], 80);
    const r = stringa(o["r"], 80);
    const e = interoNonNegativo(o["e"]);
    const v = interoNonNegativo(o["v"]);
    const a = percentuale(o["a"]);
    if (!c || !p || !r || e === null || v === null || a === null) return null;
    return { c, p, r, e, v, a };
  } catch {
    return null;
  }
}

function aCircoscrizione(voce: unknown): CircoscrizioneRisultato | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const r = stringa(o["r"], 80);
    const e = interoNonNegativo(o["e"]);
    const v = interoNonNegativo(o["v"]);
    // Politiche W1: solo {r,e,v,liste}; b/k/a opzionali (default 0 / derivata).
    const bRaw = interoNonNegativo(o["b"]);
    const kRaw = interoNonNegativo(o["k"]);
    const aRaw = percentuale(o["a"]);
    const liste = aListe(o["liste"], 64);
    if (!r || e === null || v === null || liste === null) return null;
    const b = bRaw ?? 0;
    const k = kRaw ?? 0;
    const a =
      aRaw ?? (e > 0 ? Math.round((v / e) * 100 * 10) / 10 : 0);
    if (!(a >= 0 && a <= 100)) return null;
    return { r, e, v, b, k, a, liste };
  } catch {
    return null;
  }
}

function aCollegioU(voce: unknown): CollegioURisultato | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const n = stringa(o["n"], 120);
    const e = interoNonNegativo(o["e"]);
    const v = interoNonNegativo(o["v"]);
    if (!n || e === null || v === null) return null;
    return { n, e, v };
  } catch {
    return null;
  }
}

function aElezione(value: unknown): ElezioneSintesi | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const o = value as Record<string, unknown>;
    // Europee: {tipo,...}; politiche W1: {id:"politiche-2022-camera|senato",...}.
    const tipo =
      stringa(o["tipo"], 64) || stringa(o["id"], 64);
    const data = stringa(o["data"], 16);
    const e = interoNonNegativo(o["e"]);
    const v = interoNonNegativo(o["v"]);
    const bRaw = interoNonNegativo(o["b"]);
    const kRaw = interoNonNegativo(o["k"]);
    const aRaw = percentuale(o["a"]);
    if (!tipo || !data || e === null || v === null) return null;
    const b = bRaw ?? 0;
    const k = kRaw ?? 0;
    const a =
      aRaw ?? (e > 0 ? Math.round((v / e) * 100 * 10) / 10 : 0);
    if (!(a >= 0 && a <= 100)) return null;
    return { tipo, data, e, v, b, k, a };
  } catch {
    return null;
  }
}

function costruisciStatoPerPercorso(percorso: string): StatoCache {
  try {
    const mod = moduliNode();
    if (!mod) return { dati: null, errore: "ambiente non server" };
    let base = "";
    try {
      base =
        typeof process !== "undefined" && process.cwd ? process.cwd() : "";
    } catch {
      return { dati: null, errore: "cwd non disponibile" };
    }
    if (!base) return { dati: null, errore: "cwd non disponibile" };
    const ass = mod.join(base, percorso);
    if (!mod.existsSync(ass))
      return { dati: null, errore: "file assente: " + percorso };
    let raw = "";
    try {
      raw = mod.readFileSync(ass, "utf8");
    } catch {
      return { dati: null, errore: "file non leggibile" };
    }
    if (!raw || raw.length > MAX_JSON_BYTES)
      return { dati: null, errore: "file assente o oltre 1MB" };
    let grezzo: unknown = null;
    try {
      grezzo = JSON.parse(raw) as unknown;
    } catch {
      return { dati: null, errore: "JSON invalido" };
    }
    if (!grezzo || typeof grezzo !== "object" || Array.isArray(grezzo))
      return { dati: null, errore: "envelope invalido" };
    const o = grezzo as Record<string, unknown>;
    const elezione = aElezione(o["elezione"]);
    const liste = aListe(o["liste"], 64);
    if (!elezione || !liste)
      return { dati: null, errore: "elezione o liste invalidi" };
    // Regioni (europee) oppure circoscrizioni (politiche W1): almeno una
    // delle due chiavi deve essere presente e valida.
    const regioniGrezze = o["regioni"];
    const circoscrizioniGrezze = o["circoscrizioni"];
    const comuniGrezzi = o["comuni"];
    if (!Array.isArray(comuniGrezzi) || comuniGrezzi.length > 20000)
      return { dati: null, errore: "comuni invalidi" };
    let circoscrizioni: CircoscrizioneRisultato[] | undefined;
    const regioni: RegioneRisultato[] = [];
    if (Array.isArray(regioniGrezze)) {
      if (regioniGrezze.length > 64)
        return { dati: null, errore: "regioni invalide" };
      for (const voce of regioniGrezze) {
        // Tollerante politiche: b/k/a possono mancare nelle voci regione.
        const blanda = aCircoscrizione(voce);
        if (!blanda) return { dati: null, errore: "regione invalida" };
        // Europee richiede b/k/a espliciti: se assenti nel file, la forma
        // rigida resta garantita dal controllo di presenza chiavi.
        const rigida = aRegione(voce);
        regioni.push(
          rigida ?? {
            r: blanda.r,
            e: blanda.e,
            v: blanda.v,
            b: blanda.b,
            k: blanda.k,
            a: blanda.a,
            liste: blanda.liste,
          },
        );
      }
    } else if (Array.isArray(circoscrizioniGrezze)) {
      if (circoscrizioniGrezze.length > 64)
        return { dati: null, errore: "circoscrizioni invalide" };
      circoscrizioni = [];
      for (const voce of circoscrizioniGrezze) {
        // Tollerante: voci senza affluenza pubblicata (es. VdA nei merge
        // DAIT) si saltano invece di invalidare l'intera consultazione
        // (documentato in avvertenze; i voti restano nei totali nazionali).
        const c = aCircoscrizione(voce);
        if (!c) continue;
        circoscrizioni.push(c);
        regioni.push({
          r: c.r,
          e: c.e,
          v: c.v,
          b: c.b,
          k: c.k,
          a: c.a,
          liste: c.liste,
        });
      }
      if (circoscrizioni.length === 0)
        return { dati: null, errore: "circoscrizioni invalide" };
    } else {
      return { dati: null, errore: "regioni invalide" };
    }
    // Collegi uninominali (solo politiche, opzionali, solo affluenza).
    let collegiU: CollegioURisultato[] | undefined;
    if (o["collegiU"] !== undefined) {
      const grezzi = o["collegiU"];
      if (!Array.isArray(grezzi) || grezzi.length > 512)
        return { dati: null, errore: "collegi invalidi" };
      collegiU = [];
      for (const voce of grezzi) {
        const c = aCollegioU(voce);
        if (!c) continue;
        collegiU.push(c);
      }
    }
    const comuni: ComuneRisultato[] = [];
    for (const voce of comuniGrezzi) {
      const comune = aComune(voce);
      if (!comune) continue;
      comuni.push(comune);
    }
    if (comuni.length === 0) return { dati: null, errore: "comuni invalidi" };
    const dati: Europee2024 = {
      provenance: aProvenance(o["provenance"]),
      elezione,
      liste,
      regioni,
      comuni,
      metodologia: stringa(o["metodologia"], 600),
      avvertenze: stringa(o["avvertenze"], 600),
    };
    if (circoscrizioni) dati.circoscrizioni = circoscrizioni;
    if (collegiU) dati.collegiU = collegiU;
    return { dati, errore: "" };
  } catch {
    return { dati: null, errore: "errore imprevisto" };
  }
}

function statoPerPercorso(percorso: string): StatoCache {
  try {
    const cached = cachePerPercorso.get(percorso);
    if (cached) return cached;
    const costruito = costruisciStatoPerPercorso(percorso);
    try {
      cachePerPercorso.set(percorso, costruito);
    } catch {
      // cache best-effort: mai lanciare
    }
    return costruito;
  } catch {
    return { dati: null, errore: "errore imprevisto" };
  }
}

function statoCorrente(): StatoCache {
  try {
    return statoPerPercorso(PERCORSO_EUROPEE_2024);
  } catch {
    return { dati: null, errore: "errore imprevisto" };
  }
}

function statoPerId(id: unknown): { voce: VoceRegistroElezione | null; stato: StatoCache } {
  try {
    const voce = voceRegistroElezione(id);
    if (!voce)
      return { voce: null, stato: { dati: null, errore: "consultazione non trovata" } };
    return { voce, stato: statoPerPercorso(voce.file) };
  } catch {
    return { voce: null, stato: { dati: null, errore: "errore imprevisto" } };
  }
}

function copiaDati(dati: Europee2024): Europee2024 {
  const out: Europee2024 = {
    provenance: { ...dati.provenance },
    elezione: { ...dati.elezione },
    liste: dati.liste.map((l) => ({ ...l })),
    regioni: dati.regioni.map((r) => ({ ...r, liste: r.liste.map((l) => ({ ...l })) })),
    comuni: dati.comuni.map((c) => ({ ...c })),
    metodologia: dati.metodologia,
    avvertenze: dati.avvertenze,
  };
  if (dati.circoscrizioni)
    out.circoscrizioni = dati.circoscrizioni.map((c) => ({
      ...c,
      liste: c.liste.map((l) => ({ ...l })),
    }));
  if (dati.collegiU) out.collegiU = dati.collegiU.map((c) => ({ ...c }));
  return out;
}

/* ---------------------------------------------------------------------------
 * Loader generici per-id (never-throw) + retrocompatibili europee-2024.
 * ------------------------------------------------------------------------- */

export interface SintesiConsultazione {
  id: IdElezione;
  tipo: string;
  data: string;
  titolo: string;
  disponibile: boolean;
  elettori: number;
  votanti: number;
  affluenza: number;
  totaleListe: number;
  totaleRegioni: number;
  totaleComuni: number;
  totaleCircoscrizioni?: number;
  totaleCollegiU?: number;
}

/**
 * Carica l'envelope di una consultazione (copia difensiva) o null se
 * id ignoto, file assente, oltre 1MB o invalido. Mai lancia.
 */
export async function caricaElezione(
  id: unknown,
): Promise<DatiElezioni | null> {
  try {
    const { stato } = statoPerId(id);
    return stato.dati ? copiaDati(stato.dati) : null;
  } catch {
    return null;
  }
}

/** Variante Result per-id con motivo del vuoto in italiano (mai lancia). */
export async function caricaElezioneResult(
  id: unknown,
): Promise<Result<DatiElezioni>> {
  try {
    const { voce, stato } = statoPerId(id);
    if (!voce) return { ok: false, errore: "consultazione non trovata" };
    if (!stato.dati)
      return { ok: false, errore: stato.errore || "dati non disponibili" };
    return { ok: true, dati: copiaDati(stato.dati) };
  } catch {
    return { ok: false, errore: "errore imprevisto" };
  }
}

/**
 * Elenca le consultazioni con file presente e valido (file assente o
 * invalido -> voce omessa, mai throw). Mai lancia, mai numeri inventati.
 */
export async function elencaConsultazioni(): Promise<SintesiConsultazione[]> {
  try {
    const out: SintesiConsultazione[] = [];
    for (const voce of REGISTRY_ELEZIONI) {
      try {
        const s = statoPerPercorso(voce.file);
        if (!s.dati) continue;
        const d = s.dati;
        out.push({
          id: voce.id,
          tipo: d.elezione.tipo || voce.tipo,
          data: d.elezione.data || voce.data,
          titolo: voce.titolo,
          disponibile: true,
          elettori: d.elezione.e,
          votanti: d.elezione.v,
          affluenza: d.elezione.a,
          totaleListe: d.liste.length,
          totaleRegioni: d.regioni.length,
          totaleComuni: d.comuni.length,
          totaleCircoscrizioni: d.circoscrizioni
            ? d.circoscrizioni.length
            : d.regioni.length,
          totaleCollegiU: d.collegiU ? d.collegiU.length : 0,
        });
      } catch {
        continue;
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Provenance per-id (vuota se id ignoto o file assente). Mai lancia. */
export async function leggiProvenanceElezione(
  id: unknown,
): Promise<ProvenanceElezioni> {
  try {
    const { stato } = statoPerId(id);
    return stato.dati ? { ...stato.dati.provenance } : {};
  } catch {
    return {};
  }
}

/**
 * Carica l'envelope Europee 2024 (copia difensiva) o null se assente /
 * oltre 1MB / invalido. Mai lancia, mai numeri inventati.
 */
export async function caricaEuropee2024(): Promise<Europee2024 | null> {
  try {
    const s = statoCorrente();
    return s.dati ? copiaDati(s.dati) : null;
  } catch {
    return null;
  }
}

/**
 * Variante Result con motivo del vuoto in italiano (mai lancia).
 */
export async function caricaEuropee2024Result(): Promise<Result<Europee2024>> {
  try {
    const s = statoCorrente();
    if (!s.dati)
      return { ok: false, errore: s.errore || "dati non disponibili" };
    return { ok: true, dati: copiaDati(s.dati) };
  } catch {
    return { ok: false, errore: "errore imprevisto" };
  }
}

/** Provenance del file reale (vuota se assente). Mai lancia. */
export async function leggiProvenanceElezioni(): Promise<ProvenanceElezioni> {
  try {
    const s = statoCorrente();
    return s.dati ? { ...s.dati.provenance } : {};
  } catch {
    return {};
  }
}

/* ---------------------------------------------------------------------------
 * Referendum 2025 (quesiti SI/NO). Sezione aggiuntiva, mai tocca i loader
 * europee/politiche sopra. I numeri nel file possono arrivare come stringhe:
 * coercizione esplicita, mai `interoNonNegativo` diretto.
 * ------------------------------------------------------------------------- */

/** Percorso relativo (da cwd) del file referendum 2025. */
export const PERCORSO_REFERENDUM_2025 = "data/reali/referendum-2025.json";

/** Identificativo REST del referendum 2025. */
export const ID_REFERENDUM_2025 = "referendum-2025" as const;

export interface QuesitoRisultato {
  q: number;
  titolo: string;
  si: number;
  no: number;
  validi: number;
  bianche: number;
  p_si: number;
}

export interface RegioneReferendum {
  r: string;
  e: number;
  v: number;
  a: number;
  quesiti: { q: number; si: number; no: number }[];
}

export interface ComuneReferendum {
  c: string;
  p: string;
  r: string;
  e: number;
  v: number;
  a: number;
}

export interface Referendum2025 {
  provenance: ProvenanceElezioni;
  elezione: { tipo: string; data: string; e: number; v: number; b: number; a: number };
  quesiti: QuesitoRisultato[];
  regioni: RegioneReferendum[];
  comuni: ComuneReferendum[];
  metodologia: string;
  avvertenze: string;
}

/** Coercizione numerica tollerante (stringhe DAIT incluse). Non lancia mai. */
function numeroQualsiasi(value: unknown): number | null {
  try {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value.replace(/\s+/g, ""));
      if (Number.isFinite(n)) return n;
    }
    return null;
  } catch {
    return null;
  }
}

function aQuesito(voce: unknown): QuesitoRisultato | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const qRaw = numeroQualsiasi(o["q"]);
    const titolo = stringa(o["titolo"], 200);
    const si = numeroQualsiasi(o["si"]);
    const no = numeroQualsiasi(o["no"]);
    if (qRaw === null || !titolo || si === null || no === null) return null;
    const validi = numeroQualsiasi(o["validi"]) ?? si + no;
    const bianche = numeroQualsiasi(o["bianche"]) ?? 0;
    const pSi = numeroQualsiasi(o["p_si"]);
    return {
      q: Math.floor(qRaw),
      titolo,
      si: Math.floor(si),
      no: Math.floor(no),
      validi: Math.floor(validi),
      bianche: Math.floor(bianche),
      p_si: pSi ?? (validi > 0 ? Math.round((si / validi) * 100 * 10) / 10 : 0),
    };
  } catch {
    return null;
  }
}

function aQuesitoRegione(voce: unknown): { q: number; si: number; no: number } | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const q = numeroQualsiasi(o["q"]);
    const si = numeroQualsiasi(o["si"]);
    const no = numeroQualsiasi(o["no"]);
    if (q === null || si === null || no === null) return null;
    return { q: Math.floor(q), si: Math.floor(si), no: Math.floor(no) };
  } catch {
    return null;
  }
}

function aRegioneReferendum(voce: unknown): RegioneReferendum | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const r = stringa(o["r"], 80);
    const e = numeroQualsiasi(o["e"]);
    const v = numeroQualsiasi(o["v"]);
    const a = numeroQualsiasi(o["a"]);
    if (!r || e === null || v === null || a === null) return null;
    const quesiti: { q: number; si: number; no: number }[] = [];
    if (Array.isArray(o["quesiti"])) {
      for (const qv of o["quesiti"]) {
        const q = aQuesitoRegione(qv);
        if (q) quesiti.push(q);
      }
    }
    return { r, e: Math.floor(e), v: Math.floor(v), a, quesiti };
  } catch {
    return null;
  }
}

function aComuneReferendum(voce: unknown): ComuneReferendum | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const c = stringa(o["c"], 80);
    const p = stringa(o["p"], 80);
    const r = stringa(o["r"], 80);
    const e = numeroQualsiasi(o["e"]);
    const v = numeroQualsiasi(o["v"]);
    const a = numeroQualsiasi(o["a"]);
    if (!c || !p || !r || e === null || v === null || a === null) return null;
    return { c, p, r, e: Math.floor(e), v: Math.floor(v), a };
  } catch {
    return null;
  }
}

let cacheReferendum: Referendum2025 | null | undefined;

/** Azzera la cache referendum (utile nei test). Non lancia mai. */
export function azzeraCacheReferendum(): void {
  try {
    cacheReferendum = undefined;
  } catch {
    // mai lanciare
  }
}

/**
 * Carica il referendum 2025 (copia difensiva) o null se assente, oltre
 * 1MB o invalido. Mai lancia, mai numeri inventati.
 */
export async function caricaReferendum2025(): Promise<Referendum2025 | null> {
  try {
    if (cacheReferendum !== undefined) {
      return cacheReferendum ? structuredCloneLike(cacheReferendum) : null;
    }
    const mod = moduliNode();
    if (!mod) {
      cacheReferendum = null;
      return null;
    }
    let base = "";
    try {
      base = typeof process !== "undefined" && process.cwd ? process.cwd() : "";
    } catch {
      cacheReferendum = null;
      return null;
    }
    if (!base) {
      cacheReferendum = null;
      return null;
    }
    const ass = mod.join(base, PERCORSO_REFERENDUM_2025);
    if (!mod.existsSync(ass)) {
      cacheReferendum = null;
      return null;
    }
    const raw = mod.readFileSync(ass, "utf8");
    if (!raw || raw.length > MAX_JSON_BYTES) {
      cacheReferendum = null;
      return null;
    }
    const dati = validaReferendum(JSON.parse(raw) as unknown);
    cacheReferendum = dati;
    return dati ? structuredCloneLike(dati) : null;
  } catch {
    return null;
  }
}

/** Variante Result con motivo del vuoto (mai lancia). */
export async function caricaReferendum2025Result(): Promise<Result<Referendum2025>> {
  try {
    const dati = await caricaReferendum2025();
    if (!dati) return { ok: false, errore: "dati referendum non disponibili" };
    return { ok: true, dati };
  } catch {
    return { ok: false, errore: "errore imprevisto" };
  }
}

function structuredCloneLike(dati: Referendum2025): Referendum2025 {
  return {
    provenance: { ...dati.provenance },
    elezione: { ...dati.elezione },
    quesiti: dati.quesiti.map((q) => ({ ...q })),
    regioni: dati.regioni.map((r) => ({ ...r, quesiti: r.quesiti.map((q) => ({ ...q })) })),
    comuni: dati.comuni.map((c) => ({ ...c })),
    metodologia: dati.metodologia,
    avvertenze: dati.avvertenze,
  };
}

function validaReferendum(grezzo: unknown): Referendum2025 | null {
  try {
    if (!grezzo || typeof grezzo !== "object" || Array.isArray(grezzo)) return null;
    const o = grezzo as Record<string, unknown>;
    const elRaw = o["elezione"];
    if (!elRaw || typeof elRaw !== "object" || Array.isArray(elRaw)) return null;
    const el = elRaw as Record<string, unknown>;
    const e = numeroQualsiasi(el["e"]);
    const v = numeroQualsiasi(el["v"]);
    const a = numeroQualsiasi(el["a"]);
    if (e === null || v === null || a === null) return null;
    if (!Array.isArray(o["quesiti"]) || o["quesiti"].length === 0) return null;
    if (!Array.isArray(o["regioni"])) return null;
    if (!Array.isArray(o["comuni"]) || o["comuni"].length > 20000) return null;
    const quesiti: QuesitoRisultato[] = [];
    for (const qv of o["quesiti"] as unknown[]) {
      const q = aQuesito(qv);
      if (!q) return null;
      quesiti.push(q);
    }
    const regioni: RegioneReferendum[] = [];
    for (const rv of o["regioni"] as unknown[]) {
      const r = aRegioneReferendum(rv);
      if (!r) return null;
      regioni.push(r);
    }
    const comuni: ComuneReferendum[] = [];
    for (const cv of o["comuni"] as unknown[]) {
      const c = aComuneReferendum(cv);
      if (!c) return null;
      comuni.push(c);
    }
    return {
      provenance: aProvenanceReferendum(o["provenance"]),
      elezione: {
        tipo: stringa(el["tipo"], 32) || "referendum",
        data: stringa(el["data"], 16),
        e: Math.floor(e),
        v: Math.floor(v),
        b: Math.floor(numeroQualsiasi(el["b"]) ?? 0),
        a,
      },
      quesiti,
      regioni,
      comuni,
      metodologia: stringa(o["metodologia"], 600),
      avvertenze: stringa(o["avvertenze"], 600),
    };
  } catch {
    return null;
  }
}

function aProvenanceReferendum(value: unknown): ProvenanceElezioni {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const o = value as Record<string, unknown>;
    const out: ProvenanceElezioni = {};
    const fonte = stringa(o["fonte"], 160);
    if (fonte) out.fonte = fonte;
    const url = stringa(o["url"], 300);
    if (/^https?:\/\//i.test(url)) out.url = url;
    const recuperatoIl = stringa(o["recuperatoIl"], 32);
    if (recuperatoIl) out.recuperatoIl = recuperatoIl;
    const licenza = stringa(o["licenza"], 300);
    if (licenza) out.licenza = licenza;
    return out;
  } catch {
    return {};
  }
}

/**
 * Ricerca comuni del referendum per nome (contains, anche su provincia):
 * stessi bound di cercaComune (100 ch, min 2, max 100 righe). Non lancia mai.
 */
export function cercaComuneReferendum(
  comuni: readonly ComuneReferendum[],
  q: unknown,
): ComuneReferendum[] {
  try {
    if (!Array.isArray(comuni)) return [];
    const grezza = typeof q === "string" ? q.slice(0, 100) : "";
    const chiave = normalizza(grezza);
    if (chiave.length < 2) return [];
    return comuni
      .filter((c) => normalizza(`${c?.c ?? ""} ${c?.p ?? ""} ${c?.r ?? ""}`).includes(chiave))
      .slice(0, 100);
  } catch {
    return [];
  }
}

/* ---------------------------------------------------------------------------
 * Regionali 2024-2025 (Toscana 2025-10-12 + Umbria 2024-11-17). Sezione
 * aggiuntiva, mai tocca registry/loader europee/politiche/referendum sopra.
 * Stesso envelope aggregato di DatiElezioni (`regioni` con per-lista,
 * `comuni` solo affluenza e/v/a, mai per-lista comunale, mai nominativi):
 * i voti del presidente del tracciato DAIT sono scartati in ingest, mai
 * emessi. File assente o invalido -> consultazione assente, mai throw.
 * ------------------------------------------------------------------------- */

/** Percorsi relativi (da cwd) dei file regionali (W1, se presenti). */
export const PERCORSO_REGIONALI_TOSCANA_2025 =
  "data/reali/elezioni-regionali-2025-toscana.json";
export const PERCORSO_REGIONALI_UMBRIA_2024 =
  "data/reali/elezioni-regionali-2024-umbria.json";

/** Identificativi REST delle regionali. */
export const ID_REGIONALI_TOSCANA_2025 = "regionali-2025-toscana" as const;
export const ID_REGIONALI_UMBRIA_2024 = "regionali-2024-umbria" as const;

/** Identificativi REST delle regionali (unione dedicata, mai in IdElezione). */
export type IdRegionale =
  | typeof ID_REGIONALI_TOSCANA_2025
  | typeof ID_REGIONALI_UMBRIA_2024;

/** Voce del registry regionali: metadati statici, mai numeri reali. */
export interface VoceRegistroRegionale {
  id: IdRegionale;
  tipo: string;
  data: string;
  file: string;
  titolo: string;
}

/**
 * Registry statico delle regionali (metadati, mai numeri reali).
 * La disponibilita' effettiva dipende dal file su disco: file assente
 * o invalido -> consultazione assente, mai throw.
 */
export const REGISTRY_REGIONALI: readonly VoceRegistroRegionale[] = [
  {
    id: "regionali-2025-toscana",
    tipo: "regionali",
    data: "2025-10-12",
    file: PERCORSO_REGIONALI_TOSCANA_2025,
    titolo: "Elezioni regionali 2025 — Toscana",
  },
  {
    id: "regionali-2024-umbria",
    tipo: "regionali",
    data: "2024-11-17",
    file: PERCORSO_REGIONALI_UMBRIA_2024,
    titolo: "Elezioni regionali 2024 — Umbria",
  },
];

/** Normalizza un id regionale (trim, minuscole, max 64 ch). */
export function normalizzaIdRegionale(value: unknown): IdRegionale | null {
  try {
    if (typeof value !== "string") return null;
    const chiave = value.trim().toLowerCase().slice(0, 64);
    if (
      chiave === "regionali-2025-toscana" ||
      chiave === "regionali-2024-umbria"
    )
      return chiave;
    return null;
  } catch {
    return null;
  }
}

/** True se `value` e' un id regionale noto. Non lancia mai. */
export function isIdRegionale(value: unknown): value is IdRegionale {
  try {
    return normalizzaIdRegionale(value) !== null;
  } catch {
    return false;
  }
}

/** Voce di registry regionale per id noto, altrimenti null. Non lancia mai. */
export function voceRegistroRegionale(
  id: unknown,
): VoceRegistroRegionale | null {
  try {
    const chiave = normalizzaIdRegionale(id);
    if (!chiave) return null;
    const voce = REGISTRY_REGIONALI.find((v) => v.id === chiave);
    return voce ? { ...voce } : null;
  } catch {
    return null;
  }
}

export interface SintesiRegionale {
  id: IdRegionale;
  tipo: string;
  data: string;
  titolo: string;
  disponibile: boolean;
  elettori: number;
  votanti: number;
  affluenza: number;
  totaleListe: number;
  totaleRegioni: number;
  totaleComuni: number;
}

/**
 * Carica l'envelope di una regionale (copia difensiva) o null se
 * id ignoto, file assente, oltre 1MB o invalido. Mai lancia.
 */
export async function caricaRegionale(
  id: unknown,
): Promise<DatiElezioni | null> {
  try {
    const voce = voceRegistroRegionale(id);
    if (!voce) return null;
    const stato = statoPerPercorso(voce.file);
    return stato.dati ? copiaDati(stato.dati) : null;
  } catch {
    return null;
  }
}

/** Variante Result per-id regionale con motivo del vuoto in italiano (mai lancia). */
export async function caricaRegionaleResult(
  id: unknown,
): Promise<Result<DatiElezioni>> {
  try {
    const voce = voceRegistroRegionale(id);
    if (!voce) return { ok: false, errore: "consultazione non trovata" };
    const stato = statoPerPercorso(voce.file);
    if (!stato.dati)
      return { ok: false, errore: stato.errore || "dati non disponibili" };
    return { ok: true, dati: copiaDati(stato.dati) };
  } catch {
    return { ok: false, errore: "errore imprevisto" };
  }
}

/**
 * Elenca le regionali con file presente e valido (file assente o
 * invalido -> voce omessa, mai throw). Mai lancia, mai numeri inventati.
 */
export async function elencaRegionali(): Promise<SintesiRegionale[]> {
  try {
    const out: SintesiRegionale[] = [];
    for (const voce of REGISTRY_REGIONALI) {
      try {
        const s = statoPerPercorso(voce.file);
        if (!s.dati) continue;
        const d = s.dati;
        out.push({
          id: voce.id,
          tipo: d.elezione.tipo || voce.tipo,
          data: d.elezione.data || voce.data,
          titolo: voce.titolo,
          disponibile: true,
          elettori: d.elezione.e,
          votanti: d.elezione.v,
          affluenza: d.elezione.a,
          totaleListe: d.liste.length,
          totaleRegioni: d.regioni.length,
          totaleComuni: d.comuni.length,
        });
      } catch {
        continue;
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Provenance per-id regionale (vuota se id ignoto o file assente). Mai lancia. */
export async function leggiProvenanceRegionale(
  id: unknown,
): Promise<ProvenanceElezioni> {
  try {
    const voce = voceRegistroRegionale(id);
    if (!voce) return {};
    const stato = statoPerPercorso(voce.file);
    return stato.dati ? { ...stato.dati.provenance } : {};
  } catch {
    return {};
  }
}
