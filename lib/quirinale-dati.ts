/**
 * Comunicati e atti del Quirinale per pagine e API (solo server).
 *
 * Legge `data/reali/quirinale-comunicati.json` e
 * `data/reali/quirinale-atti.json` con cache in modulo. Solo codice server:
 * usa `node:fs`/`node:path` via accesso pigro (nessun import statico `node:`,
 * cosi' un import accidentale dal client non rompe il bundle).
 *
 * Onesta' dei dati (mai inventare):
 * - comunicati e atti del Quirinale NON sono leggi: nessun campo
 *   `stato`/vigenza/numero viene mai derivato; nelle UI va mostrato il badge
 *   «non-legge»;
 * - date solo ISO valide dal file, URL solo `https://www.quirinale.it/...`;
 * - titoli piu' corti di 10 caratteri o voci senza data+titolo+url: scartate.
 *
 * Tutte le funzioni sono never-throw: file assenti o invalidi -> array
 * vuoti / oggetti vuoti, mai eccezioni verso pagine o route.
 */

export interface ComunicatoQuirinale {
  id: string;
  tipo: "comunicato-quirinale";
  titolo: string;
  data: string;
  sintesi: string;
  url: string;
}

export interface AttoQuirinale {
  id: string;
  tipo: "atto-quirinale";
  titolo: string;
  sottotipo: string;
  descrizione: string;
  data: string;
  url: string;
}

export interface ProvenienzaQuirinale {
  fonte?: string;
  url?: string;
  recuperatoIl?: string;
  licenza?: string;
}

/** Minuscole, senza diacritici, spazi compattati. Non lancia mai. */
export function normalizza(value: unknown): string {
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

function urlQuirinaleAmmesso(value: unknown): string {
  try {
    const s = stringaPulita(value);
    if (!s) return "";
    const parsed = new URL(s);
    if (parsed.protocol !== "https:") return "";
    if (parsed.hostname.toLowerCase() !== "www.quirinale.it") return "";
    if (!/^\/(it\/comunicato\/[A-Za-z0-9-]+|elementi\/\d+)\/?$/i.test(parsed.pathname)) return "";
    return s;
  } catch {
    return "";
  }
}

function isoValida(value: unknown): string {
  try {
    const s = stringaPulita(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? "" : s;
  } catch {
    return "";
  }
}

/** Normalizza una voce grezza in `ComunicatoQuirinale` o `null`. Non lancia mai. */
export function aComunicato(voce: unknown): ComunicatoQuirinale | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const titolo = stringaPulita(o["titolo"]);
    if (titolo.length < 10) return null;
    const url = urlQuirinaleAmmesso(o["url"] ?? o["id"]);
    if (!url) return null;
    const data = isoValida(o["data"]);
    if (!data) return null;
    return {
      id: url,
      tipo: "comunicato-quirinale",
      titolo,
      data,
      sintesi: stringaPulita(o["sintesi"]).slice(0, 600),
      url,
    };
  } catch {
    return null;
  }
}

/** Normalizza una voce grezza in `AttoQuirinale` o `null`. Non lancia mai. */
export function aAttoQuirinale(voce: unknown): AttoQuirinale | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const titolo = stringaPulita(o["titolo"]);
    if (titolo.length < 10) return null;
    const url = urlQuirinaleAmmesso(o["url"] ?? o["id"]);
    if (!url) return null;
    const data = isoValida(o["data"]);
    if (!data) return null;
    return {
      id: url,
      tipo: "atto-quirinale",
      titolo,
      sottotipo: stringaPulita(o["sottotipo"]).slice(0, 200),
      descrizione: stringaPulita(o["descrizione"]).slice(0, 600),
      data,
      url,
    };
  } catch {
    return null;
  }
}

/**
 * Ricerca per titolo/descrizione/sottotipo (max 100 char, min 2 dopo
 * normalizzazione). Sotto i 2 caratteri restituisce copia invariata.
 * Non lancia mai.
 */
export function cercaQuirinale<
  T extends { titolo: string; sintesi?: string; descrizione?: string; sottotipo?: string },
>(voci: readonly T[], q: unknown): T[] {
  try {
    if (!Array.isArray(voci)) return [];
    const grezza = typeof q === "string" ? q.slice(0, 100) : "";
    const n = normalizza(grezza);
    if (n.length < 2) return [...voci];
    return voci.filter((v) => {
      try {
        return (
          normalizza(v.titolo).includes(n) ||
          normalizza(v.sintesi ?? "").includes(n) ||
          normalizza(v.descrizione ?? "").includes(n) ||
          normalizza(v.sottotipo ?? "").includes(n)
        );
      } catch {
        return false;
      }
    });
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

const PERCORSO_COMUNICATI = "data/reali/quirinale-comunicati.json";
const PERCORSO_ATTI = "data/reali/quirinale-atti.json";

const cache: {
  comunicati: ComunicatoQuirinale[] | null;
  atti: AttoQuirinale[] | null;
  provenance: ProvenienzaQuirinale | null;
} = { comunicati: null, atti: null, provenance: null };

/** Azzera la cache in modulo (utile nei test). Non lancia mai. */
export function azzeraCacheQuirinale(): void {
  try {
    cache.comunicati = null;
    cache.atti = null;
    cache.provenance = null;
  } catch {
    // mai lanciare
  }
}

function leggiJson(percorso: string): unknown | null {
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
    if (!raw || raw.length > 2_000_000) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function provenanceDi(grezzo: unknown): ProvenienzaQuirinale | null {
  try {
    if (!grezzo || typeof grezzo !== "object" || Array.isArray(grezzo)) return null;
    const prov = (grezzo as Record<string, unknown>)["provenance"];
    if (!prov || typeof prov !== "object" || Array.isArray(prov)) return null;
    const p = prov as Record<string, unknown>;
    const out: ProvenienzaQuirinale = {};
    for (const campo of ["fonte", "url", "recuperatoIl", "licenza"] as const) {
      const v = stringaPulita(p[campo]);
      if (v) out[campo] = v;
    }
    return out;
  } catch {
    return null;
  }
}

function ordinaRecenti<T extends { data: string }>(voci: T[]): T[] {
  try {
    return [...voci].sort((a, b) => (b.data < a.data ? -1 : b.data > a.data ? 1 : 0));
  } catch {
    return voci;
  }
}

/** Tutti i comunicati (copia difensiva, mai throw). */
export async function tuttiComunicatiQuirinale(): Promise<ComunicatoQuirinale[]> {
  try {
    if (!cache.comunicati) {
      const grezzo = leggiJson(PERCORSO_COMUNICATI);
      const lista =
        grezzo &&
        typeof grezzo === "object" &&
        !Array.isArray(grezzo) &&
        Array.isArray((grezzo as Record<string, unknown>)["comunicati"])
          ? ((grezzo as Record<string, unknown>)["comunicati"] as unknown[])
          : [];
      const voci: ComunicatoQuirinale[] = [];
      const visti = new Set<string>();
      for (const voce of lista.slice(0, 25)) {
        const c = aComunicato(voce);
        if (c && !visti.has(c.url)) {
          visti.add(c.url);
          voci.push(c);
        }
      }
      cache.comunicati = ordinaRecenti(voci);
      if (!cache.provenance) cache.provenance = provenanceDi(grezzo);
    }
    return (cache.comunicati ?? []).map((c) => ({ ...c }));
  } catch {
    return [];
  }
}

/** Tutti gli atti (copia difensiva, mai throw). */
export async function tuttiAttiQuirinale(): Promise<AttoQuirinale[]> {
  try {
    if (!cache.atti) {
      const grezzo = leggiJson(PERCORSO_ATTI);
      const lista =
        grezzo &&
        typeof grezzo === "object" &&
        !Array.isArray(grezzo) &&
        Array.isArray((grezzo as Record<string, unknown>)["atti"])
          ? ((grezzo as Record<string, unknown>)["atti"] as unknown[])
          : [];
      const voci: AttoQuirinale[] = [];
      const visti = new Set<string>();
      for (const voce of lista.slice(0, 25)) {
        const a = aAttoQuirinale(voce);
        if (a && !visti.has(a.url)) {
          visti.add(a.url);
          voci.push(a);
        }
      }
      cache.atti = ordinaRecenti(voci);
    }
    return (cache.atti ?? []).map((a) => ({ ...a }));
  } catch {
    return [];
  }
}

/** Provenance del file comunicati. Mai throw. */
export async function leggiProvenanceQuirinale(): Promise<ProvenienzaQuirinale> {
  try {
    await tuttiComunicatiQuirinale();
    return { ...(cache.provenance ?? {}) };
  } catch {
    return {};
  }
}
