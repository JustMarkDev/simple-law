/**
 * Dati finanziamenti ai partiti politici per pagine e API (solo server).
 *
 * Legge l'envelope reale prodotto da
 * `scripts/ingest-reale-finanziamenti.ts`
 * (`data/reali/finanziamenti-erogazioni-2024-2026.json`): solo aggregati
 * beneficiario×anno (n_erogazioni, totale_euro), zero nominativi eroganti.
 *
 * Solo codice server: usa `node:fs`/`node:path` via accesso pigro (nessun
 * import statico `node:`, cosi' un import accidentale dal client non rompe
 * il bundle). Tutte le funzioni sono never-throw: file assente, oltre 1 MB
 * o invalido -> array vuoti / null, mai eccezioni verso pagine o route.
 *
 * Onesta' dati (regole ferree):
 * - beneficiario/anno/n_erogazioni/totale_euro/fonte_pdf/lastModified solo
 *   dal file, mai costruiti qui;
 * - i finanziamenti NON sono leggi: nessun campo `stato`/vigenza;
 * - totali mostrati solo come somme delle erogazioni comunicate, mai come
 *   "spesa certa" o bilanci dei partiti (l'elenco copre solo le erogazioni
 *   sopra soglia trasmesse alla Camera);
 * - campi assenti o malformati -> omessi, mai ricostruiti.
 */

export interface ErogazionePartito {
  beneficiario: string;
  anno: number;
  n_erogazioni: number;
  totale_euro: number;
  fonte_pdf: string;
  lastModified: string;
}

export interface ProvenienzaFinanziamenti {
  fonte?: string;
  url?: string;
  recuperatoIl?: string;
  licenza?: string;
  hub?: string;
  relazioni?: string;
}

/** Percorso relativo (da cwd) dell'envelope reale. */
export const PERCORSO_FINANZIAMENTI = "data/reali/finanziamenti-erogazioni-2024-2026.json";

/** Dimensione massima accettata del JSON (oltre -> vuoto, mai parziali). */
export const MAX_JSON_BYTES = 1048576;

/** Licenza obbligatoria da direttiva REALI-14 (solo riuso non commerciale). */
export const LICENZA_FINANZIAMENTI = "camera.it — solo riuso non commerciale con citazione fonte";

/** Disclaimer fisso: i finanziamenti non sono leggi ne' bilanci. */
export const DISCLAIMER_FINANZIAMENTI =
  "Erogazioni sopra soglia comunicate alla Camera (art. 5 DL 149/2013): somme delle comunicazioni pubblicate, non bilanci dei partiti e non sono leggi in vigore.";

/* ---------------------------------------------------------------------------
 * Normalizzazione e helper puri (mai throw).
 * ------------------------------------------------------------------------- */

/** Minuscole, NFD senza diacritici, spazi compattati. Non lancia mai. */
export function normalizzaFinanziamenti(value: unknown): string {
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

function annoValido(value: unknown): number | null {
  try {
    if (typeof value !== "number" || !Number.isInteger(value)) return null;
    if (value < 2000 || value > 2100) return null;
    return value;
  } catch {
    return null;
  }
}

function conteggioValido(value: unknown): number | null {
  try {
    if (typeof value !== "number" || !Number.isInteger(value)) return null;
    if (value < 1 || value > 1_000_000) return null;
    return value;
  } catch {
    return null;
  }
}

function importoValido(value: unknown): number | null {
  try {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    if (Math.abs(value) > 1_000_000_000) return null;
    return Math.round(value * 100) / 100;
  } catch {
    return null;
  }
}

/**
 * Normalizza una voce grezza in `ErogazionePartito` o `null` (mancano
 * beneficiario, anno, conteggio, totale o URL https del PDF). Mai throw.
 */
export function aErogazione(voce: unknown): ErogazionePartito | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const beneficiario = stringaPulita(o["beneficiario"]).slice(0, 300);
    if (beneficiario.length < 2) return null;
    const anno = annoValido(o["anno"]);
    if (anno === null) return null;
    const n = conteggioValido(o["n_erogazioni"]);
    if (n === null) return null;
    const totale = importoValido(o["totale_euro"]);
    if (totale === null) return null;
    const fonte_pdf = httpsUrl(o["fonte_pdf"]);
    if (!fonte_pdf) return null;
    const lastModified = stringaPulita(o["lastModified"]).slice(0, 120);
    if (!lastModified) return null;
    return { beneficiario, anno, n_erogazioni: n, totale_euro: totale, fonte_pdf, lastModified };
  } catch {
    return null;
  }
}

/**
 * Ricerca per beneficiario (max 100 char, min 2 dopo normalizzazione).
 * Sotto i 2 caratteri: copia invariata. Non lancia mai.
 */
export function cercaErogazioni(
  voci: readonly ErogazionePartito[],
  q: unknown,
): ErogazionePartito[] {
  try {
    if (!Array.isArray(voci)) return [];
    const grezza = typeof q === "string" ? q.slice(0, 100) : "";
    const n = normalizzaFinanziamenti(grezza);
    if (n.length < 2) return [...voci];
    return voci.filter((v) => {
      try {
        return normalizzaFinanziamenti(v?.beneficiario).includes(n);
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/**
 * Filtro per anno (numero intero 2000-2100; valore ignoto -> invariata).
 * Non lancia mai.
 */
export function filtraPerAnno(
  voci: readonly ErogazionePartito[],
  anno: unknown,
): ErogazionePartito[] {
  try {
    if (!Array.isArray(voci)) return [];
    const a = typeof anno === "number" ? anno : Number.parseInt(String(anno ?? ""), 10);
    if (!Number.isInteger(a) || a < 2000 || a > 2100) return [...voci];
    return voci.filter((v) => v?.anno === a);
  } catch {
    return [];
  }
}

/**
 * Ordinamento: `totale_desc` (default), `totale_asc`, `anno_desc`,
 * `nome_asc`. Valore ignoto -> `totale_desc`. Non lancia mai.
 */
export function ordinaErogazioni(
  voci: readonly ErogazionePartito[],
  ord: unknown,
): ErogazionePartito[] {
  try {
    const copia = Array.isArray(voci) ? [...voci] : [];
    const criterio = typeof ord === "string" ? ord.trim().toLowerCase().slice(0, 20) : "";
    if (criterio === "totale_asc") {
      copia.sort((a, b) => a.totale_euro - b.totale_euro);
    } else if (criterio === "anno_desc") {
      copia.sort((a, b) => b.anno - a.anno || b.totale_euro - a.totale_euro);
    } else if (criterio === "nome_asc") {
      copia.sort((a, b) => a.beneficiario.localeCompare(b.beneficiario, "it"));
    } else {
      copia.sort((a, b) => b.totale_euro - a.totale_euro);
    }
    return copia;
  } catch {
    return [];
  }
}

/**
 * Paginazione: `per` ammessi 10|20|50 (default 20), `page` >= 1 (default 1).
 * Non lancia mai.
 */
export function paginaFinanziamenti<T>(elementi: readonly T[], page: unknown, per: unknown): T[] {
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

export interface SintesiFinanziamenti {
  coppie: number;
  coppieDisponibili: boolean;
  anni: number[];
}

/**
 * Sintesi per la pagina (conteggi reali, mai inventati; file assente ->
 * 0 e `disponibile: false`). Mai throw.
 */
export async function sintesiFinanziamenti(): Promise<SintesiFinanziamenti> {
  try {
    const voci = await tutteErogazioni();
    const anni = [...new Set(voci.map((v) => v.anno))].sort((a, b) => b - a);
    return { coppie: voci.length, coppieDisponibili: voci.length > 0, anni };
  } catch {
    return { coppie: 0, coppieDisponibili: false, anni: [] };
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
  voci: ErogazionePartito[] | null;
  provenance: ProvenienzaFinanziamenti | null;
} = { voci: null, provenance: null };

/** Azzera la cache in modulo (utile nei test). Non lancia mai. */
export function azzeraCacheFinanziamenti(): void {
  try {
    cache.voci = null;
    cache.provenance = null;
  } catch {
    // mai lanciare
  }
}

function leggiEnvelope(): unknown | null {
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
    const ass = mod.join(base, PERCORSO_FINANZIAMENTI);
    if (!mod.existsSync(ass)) return null;
    const raw = mod.readFileSync(ass, "utf8");
    if (!raw || raw.length > MAX_JSON_BYTES) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function provenanceDi(grezzo: unknown): ProvenienzaFinanziamenti | null {
  try {
    if (!grezzo || typeof grezzo !== "object" || Array.isArray(grezzo)) return null;
    const o = grezzo as Record<string, unknown>;
    const prov = o["provenance"];
    if (!prov || typeof prov !== "object" || Array.isArray(prov)) return null;
    const p = prov as Record<string, unknown>;
    const out: ProvenienzaFinanziamenti = {};
    for (const campo of ["fonte", "url", "recuperatoIl", "licenza", "hub", "relazioni"] as const) {
      const v = stringaPulita(p[campo]);
      if (v) out[campo] = v.slice(0, 500);
    }
    return out;
  } catch {
    return null;
  }
}

function carica(): { voci: ErogazionePartito[]; provenance: ProvenienzaFinanziamenti | null } {
  try {
    const grezzo = leggiEnvelope();
    if (!grezzo) return { voci: [], provenance: null };
    const o = grezzo as Record<string, unknown>;
    const lista = Array.isArray(o["erogazioni"]) ? (o["erogazioni"] as unknown[]) : [];
    const voci: ErogazionePartito[] = [];
    const visti = new Set<string>();
    for (const voce of lista.slice(0, 50)) {
      const e = aErogazione(voce);
      if (!e) continue;
      const chiave = `${e.beneficiario}|||${e.anno}`;
      if (visti.has(chiave)) continue;
      visti.add(chiave);
      voci.push(e);
    }
    return { voci, provenance: provenanceDi(grezzo) };
  } catch {
    return { voci: [], provenance: null };
  }
}

/** Tutte le erogazioni aggregate (copia difensiva, mai throw). */
export async function tutteErogazioni(): Promise<ErogazionePartito[]> {
  try {
    if (!cache.voci) {
      const { voci, provenance } = carica();
      cache.voci = voci;
      cache.provenance = provenance;
    }
    return (cache.voci ?? []).map((v) => ({ ...v }));
  } catch {
    return [];
  }
}

/** Provenance del file reale. Mai throw. */
export async function leggiProvenanceFinanziamenti(): Promise<ProvenienzaFinanziamenti> {
  try {
    await tutteErogazioni();
    return { ...(cache.provenance ?? {}) };
  } catch {
    return {};
  }
}
