/**
 * Dati parlamentari reali per le pagine (server-only).
 *
 * Legge `data/reali/camera-deputati.json` e `data/reali/senato-senatori.json`
 * con cache in modulo. Solo codice server: usa `node:fs`/`node:path` via
 * accesso pigro (nessun import statico `node:`, cosi' un import accidentale
 * dal client non rompe il bundle). Tutte le funzioni sono never-throw:
 * file assenti o invalidi -> array vuoti, mai eccezioni verso le pagine.
 *
 * Semantiche pure identiche al contratto congelato in
 * tests/parlamento.test.ts (normalizza/trovaParlamentare/pagina/
 * filtraPerGruppo/cercaMembri/contaPerGruppo).
 */

export type Camera = "camera" | "senato";

export interface Membro {
  camera: Camera;
  slug: string;
  nome: string;
  gruppo?: string;
  collegio?: string;
  foto?: string;
  urlScheda?: string;
}

export interface ConteggioGruppo {
  nome: string;
  componenti: number;
}

export interface Provenienza {
  fonte?: string;
  recuperatoIl?: string;
  licenza?: string;
}

export interface ProvenanceParlamento {
  camera?: Provenienza | null;
  senato?: Provenienza | null;
}

/* ---------------------------------------------------------------------------
 * Normalizzazione e match (puri, sync: `await` resta valido per i chiamanti).
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

function stringaPulita(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function urlHttp(value: unknown): string {
  const s = stringaPulita(value);
  return /^https?:\/\//i.test(s) ? s : "";
}

/**
 * Match ministro -> parlamentare: esatto sul normalizzato, uno solo -> link,
 * zero o >=2 (doppia camera/omonimi) -> null. Mai lancia.
 */
export function trovaParlamentare(
  nomeMinistro: unknown,
  membri: readonly Membro[],
): Membro | null {
  try {
    if (typeof nomeMinistro !== "string") return null;
    if (!Array.isArray(membri)) return null;
    const chiave = normalizza(nomeMinistro);
    if (!chiave) return null;
    const trovati = membri.filter((m) => normalizza(m?.nome) === chiave);
    return trovati.length === 1 ? (trovati[0] as Membro) : null;
  } catch {
    return null;
  }
}

/** Filtro per gruppo con match esatto. Non lancia mai. */
export function filtraPerGruppo(membri: readonly Membro[], gruppo: string): Membro[] {
  try {
    if (!Array.isArray(membri) || typeof gruppo !== "string" || !gruppo) return [];
    return membri.filter((m) => m?.gruppo === gruppo);
  } catch {
    return [];
  }
}

/**
 * Ricerca per nome (max 100 char, min 2 dopo normalizzazione).
 * Sotto i 2 caratteri restituisce copia invariata. Non lancia mai.
 */
export function cercaMembri(membri: readonly Membro[], q: unknown): Membro[] {
  try {
    if (!Array.isArray(membri)) return [];
    const grezza = typeof q === "string" ? q.slice(0, 100) : "";
    const normalizzata = normalizza(grezza);
    if (normalizzata.length < 2) return [...membri];
    return membri.filter((m) => normalizza(m?.nome).includes(normalizzata));
  } catch {
    return [];
  }
}

/**
 * Paginazione: `per` ammessi 12|24 (default 24), `page` >= 1 (default 1).
 * Non lancia mai.
 */
export function pagina<T>(elementi: readonly T[], page: unknown, per: unknown): T[] {
  try {
    const elenco = Array.isArray(elementi) ? elementi : [];
    const p = typeof page === "number" && Number.isFinite(page) ? Math.floor(page) : 1;
    const numeroPagina = p >= 1 ? p : 1;
    const n = typeof per === "number" && Number.isFinite(per) ? Math.floor(per) : 24;
    const perPagina = n === 12 || n === 24 ? n : 24;
    const inizio = (numeroPagina - 1) * perPagina;
    return elenco.slice(inizio, inizio + perPagina);
  } catch {
    return [];
  }
}

/**
 * Conteggi per gruppo (esclude voci senza gruppo), ordinati per componenti
 * desc e nome asc (it). Non lancia mai.
 */
export function contaPerGruppo(membri: readonly Membro[]): ConteggioGruppo[] {
  try {
    if (!Array.isArray(membri)) return [];
    const conteggi = new Map<string, number>();
    for (const m of membri) {
      const gruppo = typeof m?.gruppo === "string" ? m.gruppo.trim() : "";
      if (!gruppo) continue;
      conteggi.set(gruppo, (conteggi.get(gruppo) ?? 0) + 1);
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
        return { existsSync: fs.existsSync, readFileSync: fs.readFileSync, join: path.join };
      }
    }
  } catch {
    // nessun modulo node disponibile: fallback vuoto
  }
  return null;
}

const PERCORSO_CAMERA = "data/reali/camera-deputati.json";
const PERCORSO_SENATO = "data/reali/senato-senatori.json";

interface CacheDati {
  deputati: Membro[] | null;
  senatori: Membro[] | null;
  provenance: ProvenanceParlamento | null;
}

const cache: CacheDati = { deputati: null, senatori: null, provenance: null };

/** Azzera la cache in modulo (utile nei test). Non lancia mai. */
export function azzeraCacheParlamento(): void {
  try {
    cache.deputati = null;
    cache.senatori = null;
    cache.provenance = null;
  } catch {
    // mai lanciare
  }
}

function leggiJson(percorsoRelativo: string): unknown | null {
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
    const ass = mod.join(base, percorsoRelativo);
    if (!mod.existsSync(ass)) return null;
    const raw = mod.readFileSync(ass, "utf8");
    if (!raw || raw.length > 2_000_000) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function estraiLista(grezzo: unknown, chiavi: readonly string[]): unknown[] {
  try {
    if (Array.isArray(grezzo)) return grezzo;
    if (grezzo && typeof grezzo === "object") {
      const o = grezzo as Record<string, unknown>;
      for (const chiave of chiavi) {
        if (Array.isArray(o[chiave])) return o[chiave] as unknown[];
      }
    }
    return [];
  } catch {
    return [];
  }
}

function aMembro(voce: unknown, camera: Camera): Membro | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const slug = stringaPulita(o["slug"]);
    const nome = stringaPulita(o["nome"]);
    if (!slug || !nome) return null;
    const membro: Membro = { camera, slug, nome };
    const gruppo = stringaPulita(o["gruppo"]);
    if (gruppo) membro.gruppo = gruppo;
    const collegio = stringaPulita(o["collegio"]);
    if (collegio) membro.collegio = collegio;
    const foto = urlHttp(o["foto"]);
    if (foto) membro.foto = foto;
    const scheda = urlHttp(o["urlScheda"]);
    if (scheda) membro.urlScheda = scheda;
    return membro;
  } catch {
    return null;
  }
}

function provenanceDi(grezzo: unknown): Provenienza | null {
  try {
    if (!grezzo || typeof grezzo !== "object" || Array.isArray(grezzo)) return null;
    const prov = (grezzo as Record<string, unknown>)["provenance"];
    if (!prov || typeof prov !== "object" || Array.isArray(prov)) return null;
    const p = prov as Record<string, unknown>;
    const out: Provenienza = {};
    const fonte = stringaPulita(p["fonte"]);
    if (fonte) out.fonte = fonte;
    const recuperatoIl = stringaPulita(p["recuperatoIl"]);
    if (recuperatoIl) out.recuperatoIl = recuperatoIl;
    const licenza = stringaPulita(p["licenza"]);
    if (licenza) out.licenza = licenza;
    return out;
  } catch {
    return null;
  }
}

function caricaCamera(): { membri: Membro[]; provenance: Provenienza | null } {
  const grezzo = leggiJson(PERCORSO_CAMERA);
  const voci = estraiLista(grezzo, ["deputati", "voci", "dati", "items"]);
  const membri: Membro[] = [];
  for (const voce of voci) {
    const membro = aMembro(voce, "camera");
    if (membro) membri.push(membro);
  }
  return { membri, provenance: provenanceDi(grezzo) };
}

function caricaSenato(): { membri: Membro[]; provenance: Provenienza | null } {
  const grezzo = leggiJson(PERCORSO_SENATO);
  const voci = estraiLista(grezzo, ["senatori", "voci", "dati", "items"]);
  const membri: Membro[] = [];
  for (const voce of voci) {
    const membro = aMembro(voce, "senato");
    if (membro) membri.push(membro);
  }
  return { membri, provenance: provenanceDi(grezzo) };
}

/** Tutti i deputati (copia difensiva, mai throw). */
export async function tuttiDeputati(): Promise<Membro[]> {
  try {
    if (!cache.deputati) {
      const { membri, provenance } = caricaCamera();
      cache.deputati = membri;
      cache.provenance = { ...(cache.provenance ?? {}), camera: provenance };
    }
    return (cache.deputati ?? []).map((m) => ({ ...m }));
  } catch {
    return [];
  }
}

/** Tutti i senatori (copia difensiva, mai throw). */
export async function tuttiSenatori(): Promise<Membro[]> {
  try {
    if (!cache.senatori) {
      const { membri, provenance } = caricaSenato();
      cache.senatori = membri;
      cache.provenance = { ...(cache.provenance ?? {}), senato: provenance };
    }
    return (cache.senatori ?? []).map((m) => ({ ...m }));
  } catch {
    return [];
  }
}

/** Provenance dei file reali (camere presenti). Mai throw. */
export async function leggiProvenance(): Promise<ProvenanceParlamento> {
  try {
    await Promise.all([tuttiDeputati(), tuttiSenatori()]);
    return { ...(cache.provenance ?? {}) };
  } catch {
    return {};
  }
}
