/**
 * Pronunce della Corte Costituzionale per le pagine (solo server).
 *
 * Legge `data/reali/consulta-pronunce-2001.json` con cache in modulo. Solo
 * codice server: usa `node:fs`/`node:path` via accesso pigro (nessun import
 * statico `node:`, cosi' un import accidentale dal client non rompe il
 * bundle). Tutte le funzioni sono never-throw: file assenti o invalidi ->
 * array vuoti / null, mai eccezioni verso pagine o route.
 *
 * Mai inventare: date solo ISO valide dal file, `tipologia` solo raw, ECLI
 * solo se `ECLI:IT:COST:AAAA:N`, scheda solo https verso
 * `www.cortecostituzionale.it`. Le pronunce non sono leggi: nessun campo
 * `stato`/vigenza viene mai derivato.
 */

export interface Pronuncia {
  numero: string;
  anno: string;
  dataDecisione?: string;
  dataDeposito?: string;
  tipologia?: string;
  presidente?: string;
  redattore?: string;
  relatore?: string;
  epigrafe?: string;
  dispositivo?: string;
  testo_troncato?: true;
  ecli?: string;
  scheda: string;
}

export interface ProvenienzaConsulta {
  fonte?: string;
  url?: string;
  recuperatoIl?: string;
  licenza?: string;
  anno?: string;
  totaleAnno?: number;
}

/** Minuscole, NFD senza diacritici, spazi compattati. Non lancia mai. */
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

function urlHttpsAmmesso(value: unknown): string {
  try {
    const s = stringaPulita(value);
    if (!s) return "";
    const parsed = new URL(s);
    if (parsed.protocol !== "https:") return "";
    if (parsed.hostname.toLowerCase() !== "www.cortecostituzionale.it") return "";
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
    return Number.isNaN(d.getTime()) ? "" : s;
  } catch {
    return "";
  }
}

function ecliValido(value: unknown): string {
  const s = stringaPulita(value);
  return /^ECLI:IT:COST:\d{4}:\d+$/.test(s) ? s : "";
}

/** Normalizza una voce grezza in `Pronuncia` o `null`. Non lancia mai. */
export function aPronuncia(voce: unknown): Pronuncia | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const numero = stringaPulita(o["numero"]);
    const anno = stringaPulita(o["anno"]);
    if (!/^\d+$/.test(numero) || !/^\d{4}$/.test(anno)) return null;
    const scheda = urlHttpsAmmesso(o["scheda"]);
    if (!scheda) return null;
    const p: Pronuncia = { numero: String(Number.parseInt(numero, 10)), anno, scheda };
    const dec = isoValida(o["dataDecisione"]);
    if (dec) p.dataDecisione = dec;
    const dep = isoValida(o["dataDeposito"]);
    if (dep) p.dataDeposito = dep;
    const tipo = stringaPulita(o["tipologia"]).toUpperCase().slice(0, 4);
    if (tipo) p.tipologia = tipo;
    for (const campo of ["presidente", "redattore", "relatore"] as const) {
      const v = stringaPulita(o[campo]).slice(0, 200);
      if (v) p[campo] = v;
    }
    for (const campo of ["epigrafe", "dispositivo"] as const) {
      const v = stringaPulita(o[campo]).slice(0, 4000);
      if (v) p[campo] = v;
    }
    if (o["testo_troncato"] === true) p.testo_troncato = true;
    const ecli = ecliValido(o["ecli"]);
    if (ecli) p.ecli = ecli;
    return p;
  } catch {
    return null;
  }
}

/**
 * Ricerca per numero/ECLI/presidente/relatore/epigrafe (max 100 char, min 2
 * dopo normalizzazione). Sotto i 2 caratteri restituisce copia invariata.
 * Non lancia mai.
 */
export function cercaPronunce(pronunce: readonly Pronuncia[], q: unknown): Pronuncia[] {
  try {
    if (!Array.isArray(pronunce)) return [];
    const grezza = typeof q === "string" ? q.slice(0, 100) : "";
    const n = normalizza(grezza);
    if (n.length < 2) return [...pronunce];
    return pronunce.filter((p) => {
      try {
        return (
          normalizza(p.numero).includes(n) ||
          normalizza(p.ecli ?? "").includes(n) ||
          normalizza(p.presidente ?? "").includes(n) ||
          normalizza(p.relatore ?? "").includes(n) ||
          normalizza(p.redattore ?? "").includes(n) ||
          normalizza(p.epigrafe ?? "").includes(n)
        );
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/** Filtro per tipologia raw (`S`/`O`). Non lancia mai. */
export function filtraPerTipologia(pronunce: readonly Pronuncia[], tipologia: string): Pronuncia[] {
  try {
    if (!Array.isArray(pronunce) || typeof tipologia !== "string" || !tipologia) return [];
    const t = tipologia.trim().toUpperCase();
    return pronunce.filter((p) => p?.tipologia === t);
  } catch {
    return [];
  }
}

/**
 * Paginazione: `per` ammessi 10|20|50 (default 20), `page` >= 1 (default 1).
 * Non lancia mai.
 */
export function pagina<T>(elementi: readonly T[], page: unknown, per: unknown): T[] {
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

/** Conteggi per tipologia raw, ordinati per componenti desc e nome asc. */
export function contaPerTipologia(
  pronunce: readonly Pronuncia[],
): { nome: string; componenti: number }[] {
  try {
    if (!Array.isArray(pronunce)) return [];
    const conteggi = new Map<string, number>();
    for (const p of pronunce) {
      const t = typeof p?.tipologia === "string" ? p.tipologia.trim() : "";
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

const PERCORSO = "data/reali/consulta-pronunce-2001.json";

const cache: { pronunce: Pronuncia[] | null; provenance: ProvenienzaConsulta | null } = {
  pronunce: null,
  provenance: null,
};

/** Azzera la cache in modulo (utile nei test). Non lancia mai. */
export function azzeraCacheConsulta(): void {
  try {
    cache.pronunce = null;
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

function provenanceDi(grezzo: unknown): ProvenienzaConsulta | null {
  try {
    if (!grezzo || typeof grezzo !== "object" || Array.isArray(grezzo)) return null;
    const o = grezzo as Record<string, unknown>;
    const prov = o["provenance"];
    if (!prov || typeof prov !== "object" || Array.isArray(prov)) return null;
    const p = prov as Record<string, unknown>;
    const out: ProvenienzaConsulta = {};
    for (const campo of ["fonte", "url", "recuperatoIl", "licenza"] as const) {
      const v = stringaPulita(p[campo]);
      if (v) out[campo] = v;
    }
    const anno = stringaPulita(o["anno"]);
    if (anno) out.anno = anno;
    const tot = o["totaleAnno"];
    if (typeof tot === "number" && Number.isFinite(tot) && tot > 0)
      out.totaleAnno = Math.floor(tot);
    return out;
  } catch {
    return null;
  }
}

function carica(): { pronunce: Pronuncia[]; provenance: ProvenienzaConsulta | null } {
  try {
    const grezzo = leggiJson();
    if (!grezzo || typeof grezzo !== "object" || Array.isArray(grezzo)) {
      return { pronunce: [], provenance: null };
    }
    const o = grezzo as Record<string, unknown>;
    const lista = Array.isArray(o["pronunce"]) ? (o["pronunce"] as unknown[]) : [];
    const pronunce: Pronuncia[] = [];
    for (const voce of lista.slice(0, 100)) {
      const p = aPronuncia(voce);
      if (p) pronunce.push(p);
    }
    pronunce.sort((a, b) => Number(a.numero) - Number(b.numero));
    return { pronunce, provenance: provenanceDi(grezzo) };
  } catch {
    return { pronunce: [], provenance: null };
  }
}

/** Tutte le pronunce (copia difensiva, mai throw). */
export async function tuttePronunce(): Promise<Pronuncia[]> {
  try {
    if (!cache.pronunce) {
      const { pronunce, provenance } = carica();
      cache.pronunce = pronunce;
      cache.provenance = provenance;
    }
    return (cache.pronunce ?? []).map((p) => ({ ...p }));
  } catch {
    return [];
  }
}

/** Provenance del file reale. Mai throw. */
export async function leggiProvenanceConsulta(): Promise<ProvenienzaConsulta> {
  try {
    await tuttePronunce();
    return { ...(cache.provenance ?? {}) };
  } catch {
    return {};
  }
}

/** Singola pronuncia per anno+numero (mai throw, null se assente). */
export async function trovaPronuncia(anno: unknown, numero: unknown): Promise<Pronuncia | null> {
  try {
    const a = typeof anno === "string" ? anno.trim() : "";
    const n = typeof numero === "string" ? String(Number.parseInt(numero, 10)) : "";
    if (!/^\d{4}$/.test(a) || !/^\d+$/.test(n)) return null;
    const tutte = await tuttePronunce();
    return tutte.find((p) => p.anno === a && p.numero === n) ?? null;
  } catch {
    return null;
  }
}
