/**
 * Atti UE 2026 (EUR-Lex CELLAR) per pagine e API.
 *
 * Legge `data/reali/eurlex-2026.json` (fase-1: metadati, nessun testo
 * integrale) con cache in modulo. Solo codice server: usa `node:fs` /
 * `node:path` via accesso pigro (nessun import statico `node:`, cosi' un
 * import accidentale dal client non rompe il bundle). Tutte le funzioni
 * sono never-throw: file assenti o invalidi -> array vuoti / null, mai
 * eccezioni verso pagine o route.
 *
 * Onesta' dati (regole ferree):
 *  - CELEX/titolo/data/tipo/link solo dal file (mai costruiti qui, tranne
 *    l'URL EUR-Lex `?uri=CELEX:` gia' verificato in ingest);
 *  - `inVigore` e' il booleano CELLAR osservato, mai mappato a stati
 *    nazionali (in_vigore/abrogato valgono solo per le leggi italiane);
 *  - i regolamenti sono direttamente applicabili in Italia, le direttive
 *    richiedono recepimento nazionale: nota generica, mai affermazioni su
 *    recepimenti specifici (non presenti nei dati);
 *  - i titoli fase-1 sono in inglese (`titoloLingua: "en"`), mai tradotti
 *    qui: la UI lo dichiara.
 */

export type TipoAttoUe = "REG" | "DIR" | "DIR_IMPL" | "DIR_DEL";

export interface AttoUe {
  celex: string;
  eli: string;
  titolo: string;
  titoloLingua: string;
  data: string;
  tipo: TipoAttoUe;
  eurlexUrl: string;
  inVigore: boolean | null;
  entrataInVigore?: string;
  fineValidita?: string;
}

export interface ProvenienzaEurlex {
  fonte?: string;
  url?: string;
  recuperatoIl?: string;
  licenza?: string;
  universo2026?: number;
  reg2025_2026?: number;
  dir2024_2026?: number;
}

/* ---------------------------------------------------------------------------
 * Normalizzazione e helper puri (mai throw).
 * ------------------------------------------------------------------------- */

/** Minuscole, NFD senza diacritici, spazi compattati. Non lancia mai. */
export function normalizzaEurlex(value: unknown): string {
  try {
    if (typeof value !== "string") return "";
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .replace(/\s+/g, " ");
  } catch {
    return "";
  }
}

function stringaPulita(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function urlAmmesso(value: unknown): string {
  try {
    const s = stringaPulita(value);
    if (!s) return "";
    const parsed = new URL(s);
    const host = parsed.hostname.toLowerCase();
    // ELI canonico (http) + EUR-Lex (https): nient'altro.
    if (parsed.protocol === "http:" && host === "data.europa.eu") return s;
    if (parsed.protocol === "https:" && host === "eur-lex.europa.eu") return s;
    return "";
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

function tipoValido(value: unknown): TipoAttoUe | "" {
  try {
    const s = stringaPulita(value);
    return s === "REG" || s === "DIR" || s === "DIR_IMPL" || s === "DIR_DEL" ? s : "";
  } catch {
    return "";
  }
}

/**
 * Etichetta italiana del tipo (generica, senza affermazioni su recepimenti
 * specifici). Non lancia mai.
 */
export function etichettaTipo(tipo: unknown): string {
  try {
    const t = tipoValido(tipo);
    if (t === "REG") return "Regolamento UE";
    if (t === "DIR") return "Direttiva UE";
    if (t === "DIR_IMPL") return "Direttiva di esecuzione UE";
    if (t === "DIR_DEL") return "Direttiva delegata UE";
    return "Atto UE";
  } catch {
    return "Atto UE";
  }
}

/**
 * Nota generica di applicabilità (diritto UE, non un recepimento specifico).
 * Non lancia mai.
 */
export function notaApplicabilita(tipo: unknown): string {
  try {
    if (tipoValido(tipo) === "REG") return "Direttamente applicabile in Italia";
    return "Richiede recepimento nazionale";
  } catch {
    return "";
  }
}

/**
 * Normalizza una voce grezza in `AttoUe` o `null` (manca un campo
 * verificato: CELEX genuino, titolo, data, tipo, URL ammessi). Non lancia mai.
 */
export function aAttoUe(voce: unknown): AttoUe | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const celex = stringaPulita(o["celex"]);
    if (!/^3\d{4}[RL]\d{1,4}$/.test(celex) || celex.includes("(")) return null;
    const titolo = stringaPulita(o["titolo"]);
    if (titolo.length < 10) return null;
    const data = isoValida(o["data"]);
    if (!data) return null;
    const tipo = tipoValido(o["tipo"]);
    if (!tipo) return null;
    const eli = urlAmmesso(o["eli"]);
    const eurlexUrl = urlAmmesso(o["eurlexUrl"]);
    if (!eli || !eurlexUrl) return null;
    const atto: AttoUe = {
      celex,
      eli,
      titolo: titolo.slice(0, 2000),
      titoloLingua: stringaPulita(o["titoloLingua"]) || "en",
      data,
      tipo,
      eurlexUrl,
      inVigore:
        o["inVigore"] === true ? true : o["inVigore"] === false ? false : null,
    };
    const entrata = isoValida(o["entrataInVigore"]);
    if (entrata) atto.entrataInVigore = entrata;
    const fine = isoValida(o["fineValidita"]);
    if (fine) atto.fineValidita = fine;
    return atto;
  } catch {
    return null;
  }
}

/**
 * Ricerca sul titolo/CELEX (max 100 char, min 2 dopo normalizzazione).
 * Sotto i 2 caratteri restituisce copia invariata. Non lancia mai.
 */
export function cercaAttiUe(atti: readonly AttoUe[], q: unknown): AttoUe[] {
  try {
    if (!Array.isArray(atti)) return [];
    const grezza = typeof q === "string" ? q.slice(0, 100) : "";
    const n = normalizzaEurlex(grezza);
    if (n.length < 2) return [...atti];
    return atti.filter((a) => {
      try {
        return (
          normalizzaEurlex(a?.titolo).includes(n) ||
          normalizzaEurlex(a?.celex).includes(n)
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
 * Filtro per tipo (`REG`/`DIR`/`DIR_IMPL`/`DIR_DEL`; ignoto -> invariato).
 * `DIR_TUTTE` raggruppa la famiglia direttive. Non lancia mai.
 */
export function filtraPerTipoUe(atti: readonly AttoUe[], tipo: unknown): AttoUe[] {
  try {
    if (!Array.isArray(atti)) return [];
    const chiave = stringaPulita(tipo).toUpperCase();
    if (chiave === "DIR_TUTTE") {
      return atti.filter(
        (a) => a?.tipo === "DIR" || a?.tipo === "DIR_IMPL" || a?.tipo === "DIR_DEL",
      );
    }
    const t = tipoValido(chiave);
    if (!t) return [...atti];
    return atti.filter((a) => a?.tipo === t);
  } catch {
    return [];
  }
}

/**
 * Paginazione: `per` ammessi 10|20|50 (default 20), `page` >= 1.
 * Non lancia mai.
 */
export function paginaUe<T>(elementi: readonly T[], page: unknown, per: unknown): T[] {
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

/** Conteggi per tipo, ordinati per componenti desc e nome asc. */
export function contaPerTipoUe(
  atti: readonly AttoUe[],
): { nome: string; componenti: number }[] {
  try {
    if (!Array.isArray(atti)) return [];
    const conteggi = new Map<string, number>();
    for (const a of atti) {
      const t = typeof a?.tipo === "string" ? a.tipo.trim() : "";
      if (!t) continue;
      conteggi.set(t, (conteggi.get(t) ?? 0) + 1);
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
        return { existsSync: fs.existsSync, readFileSync: fs.readFileSync, join: path.join };
      }
    }
  } catch {
    // nessun modulo node disponibile: fallback vuoto
  }
  return null;
}

const PERCORSO = "data/reali/eurlex-2026.json";

const cache: { atti: AttoUe[] | null; provenance: ProvenienzaEurlex | null } = {
  atti: null,
  provenance: null,
};

/** Azzera la cache in modulo (utile nei test). Non lancia mai. */
export function azzeraCacheEurlex(): void {
  try {
    cache.atti = null;
    cache.provenance = null;
  } catch {
    // mai lanciare
  }
}

function leggiJson(): unknown | null {
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
    const ass = mod.join(base, PERCORSO);
    if (!mod.existsSync(ass)) return null;
    const raw = mod.readFileSync(ass, "utf8");
    if (!raw || raw.length > 2_000_000) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function provenanceDi(grezzo: unknown): ProvenienzaEurlex | null {
  try {
    if (!grezzo || typeof grezzo !== "object" || Array.isArray(grezzo)) return null;
    const o = grezzo as Record<string, unknown>;
    const prov = o["provenance"];
    if (!prov || typeof prov !== "object" || Array.isArray(prov)) return null;
    const p = prov as Record<string, unknown>;
    const out: ProvenienzaEurlex = {};
    for (const campo of ["fonte", "url", "recuperatoIl", "licenza"] as const) {
      const v = stringaPulita(p[campo]);
      if (v) out[campo] = v;
    }
    const universo = o["universo"];
    if (universo && typeof universo === "object" && !Array.isArray(universo)) {
      const u = universo as Record<string, unknown>;
      for (const campo of ["universo2026", "reg2025_2026", "dir2024_2026"] as const) {
        const v = u[campo];
        if (typeof v === "number" && Number.isFinite(v) && v > 0) out[campo] = Math.floor(v);
      }
    }
    return out;
  } catch {
    return null;
  }
}

function carica(): { atti: AttoUe[]; provenance: ProvenienzaEurlex | null } {
  try {
    const grezzo = leggiJson();
    if (!grezzo || typeof grezzo !== "object" || Array.isArray(grezzo)) {
      return { atti: [], provenance: null };
    }
    const o = grezzo as Record<string, unknown>;
    const lista = Array.isArray(o["atti"]) ? (o["atti"] as unknown[]) : [];
    const atti: AttoUe[] = [];
    const visti = new Set<string>();
    for (const voce of lista.slice(0, 100)) {
      const a = aAttoUe(voce);
      if (a && !visti.has(a.celex)) {
        visti.add(a.celex);
        atti.push(a);
      }
    }
    atti.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : a.celex < b.celex ? -1 : 1));
    return { atti, provenance: provenanceDi(grezzo) };
  } catch {
    return { atti: [], provenance: null };
  }
}

/** Tutti gli atti UE (copia difensiva, mai throw). */
export async function tuttiAttiUe(): Promise<AttoUe[]> {
  try {
    if (!cache.atti) {
      const { atti, provenance } = carica();
      cache.atti = atti;
      cache.provenance = provenance;
    }
    return (cache.atti ?? []).map((a) => ({ ...a }));
  } catch {
    return [];
  }
}

/** Provenance del file reale. Mai throw. */
export async function leggiProvenanceEurlex(): Promise<ProvenienzaEurlex> {
  try {
    await tuttiAttiUe();
    return { ...(cache.provenance ?? {}) };
  } catch {
    return {};
  }
}

/** Singolo atto per CELEX (mai throw, null se assente o malformato). */
export async function trovaAttoUe(celex: unknown): Promise<AttoUe | null> {
  try {
    const c = typeof celex === "string" ? celex.trim().toUpperCase() : "";
    if (!/^3\d{4}[RL]\d{1,4}$/.test(c)) return null;
    const tutti = await tuttiAttiUe();
    return tutti.find((a) => a.celex === c) ?? null;
  } catch {
    return null;
  }
}
