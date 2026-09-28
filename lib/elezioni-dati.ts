/**
 * Dati elettorali reali per pagine e API (server-only).
 *
 * Legge `data/reali/elezioni-europee-2024.json` (file unico v1, solo
 * aggregati: nazionale + regioni con per-lista, comuni solo affluenza)
 * con cache in modulo. Solo codice server: usa `node:fs`/`node:path` via
 * accesso pigro (nessun import statico `node:`, cosi' un import accidentale
 * dal client non rompe il bundle). Tutte le funzioni sono never-throw:
 * file assente, oltre 1 MB o invalido -> valori vuoti, mai eccezioni.
 *
 * Onesta' dati: il loader estrae SOLO chiavi aggregate in whitelist
 * (`provenance`, `elezione`, `liste`, `regioni`, `comuni`, `metodologia`,
 * `avvertenze`). Anche se il file contenesse righe candidato/nominativi
 * (`COGNOME`, `NOME`, `DATANASCITA`, `PREFERENZE`, ...), queste chiavi non
 * vengono mai lette ne' propagate. Mai numeri inventati: i campi assenti o
 * invalidi invalidano il file (vuoto), non vengono stimati.
 */

/* ---------------------------------------------------------------------------
 * Tipi (contratto v1 del giudice, file unico europee-2024).
 * ------------------------------------------------------------------------- */

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

export interface Europee2024 {
  provenance: ProvenanceElezioni;
  elezione: ElezioneSintesi;
  liste: ListaRisultato[];
  regioni: RegioneRisultato[];
  comuni: ComuneRisultato[];
  metodologia: string;
  avvertenze: string;
}

/** Esito mai-throw per i chiamanti che vogliono il motivo del vuoto. */
export type Result<T> = { ok: true; dati: T } | { ok: false; errore: string };

/* ---------------------------------------------------------------------------
 * Costanti pubbliche (riusate dalle API per licenza/disclaimer).
 * ------------------------------------------------------------------------- */

/** Percorso relativo (da cwd) del file unico v1. */
export const PERCORSO_EUROPEE_2024 = "data/reali/elezioni-europee-2024.json";

/** Identificativo REST della consultazione v1. */
export const ID_EUROPEE_2024 = "europee-2024";

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

let stato: StatoCache | null = null;

/** Azzera la cache in modulo (utile nei test). Non lancia mai. */
export function azzeraCache(): void {
  try {
    stato = null;
  } catch {
    // mai lanciare
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

function aElezione(value: unknown): ElezioneSintesi | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const o = value as Record<string, unknown>;
    const tipo = stringa(o["tipo"], 32);
    const data = stringa(o["data"], 16);
    const e = interoNonNegativo(o["e"]);
    const v = interoNonNegativo(o["v"]);
    const b = interoNonNegativo(o["b"]);
    const k = interoNonNegativo(o["k"]);
    const a = percentuale(o["a"]);
    if (!tipo || !data || e === null || v === null || b === null || k === null)
      return null;
    if (a === null) return null;
    return { tipo, data, e, v, b, k, a };
  } catch {
    return null;
  }
}

function costruisciStato(): StatoCache {
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
    const ass = mod.join(base, PERCORSO_EUROPEE_2024);
    if (!mod.existsSync(ass))
      return { dati: null, errore: "file assente: " + PERCORSO_EUROPEE_2024 };
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
    const regioniGrezze = o["regioni"];
    const comuniGrezzi = o["comuni"];
    if (!Array.isArray(regioniGrezze) || regioniGrezze.length > 64)
      return { dati: null, errore: "regioni invalide" };
    if (!Array.isArray(comuniGrezzi) || comuniGrezzi.length > 20000)
      return { dati: null, errore: "comuni invalidi" };
    const regioni: RegioneRisultato[] = [];
    for (const voce of regioniGrezze) {
      const regione = aRegione(voce);
      if (!regione) return { dati: null, errore: "regione invalida" };
      regioni.push(regione);
    }
    const comuni: ComuneRisultato[] = [];
    for (const voce of comuniGrezzi) {
      const comune = aComune(voce);
      if (!comune) return { dati: null, errore: "comune invalido" };
      comuni.push(comune);
    }
    const dati: Europee2024 = {
      provenance: aProvenance(o["provenance"]),
      elezione,
      liste,
      regioni,
      comuni,
      metodologia: stringa(o["metodologia"], 600),
      avvertenze: stringa(o["avvertenze"], 600),
    };
    return { dati, errore: "" };
  } catch {
    return { dati: null, errore: "errore imprevisto" };
  }
}

function statoCorrente(): StatoCache {
  try {
    if (!stato) stato = costruisciStato();
    return stato;
  } catch {
    return { dati: null, errore: "errore imprevisto" };
  }
}

function copiaDati(dati: Europee2024): Europee2024 {
  return {
    provenance: { ...dati.provenance },
    elezione: { ...dati.elezione },
    liste: dati.liste.map((l) => ({ ...l })),
    regioni: dati.regioni.map((r) => ({ ...r, liste: r.liste.map((l) => ({ ...l })) })),
    comuni: dati.comuni.map((c) => ({ ...c })),
    metodologia: dati.metodologia,
    avvertenze: dati.avvertenze,
  };
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
