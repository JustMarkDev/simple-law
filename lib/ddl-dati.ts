/**
 * Dati DDL/atti (Senato + Camera, legislatura 19) per pagine e API.
 *
 * Legge `data/reali/parlamento-ddl.json` (DDL Senato) e
 * `data/reali/camera-atti.json` (atti Camera) con cache in modulo.
 * Solo codice server: usa `node:fs`/`node:path` via accesso pigro (nessun
 * import statico `node:`, cosi' un import accidentale dal client non rompe
 * il bundle). Tutte le funzioni sono never-throw: file assenti o invalidi
 * -> array vuoti, mai eccezioni verso pagine o route.
 *
 * Onesta' dati (regole ferree):
 *  - `statoDdl_raw` e' mostrato grezzo, MAI mappato a stati propri
 *    (in_vigore/abrogato valgono solo per le leggi con fine-vigenza
 *    esplicita, mai per i DDL che per definizione NON sono in vigore);
 *  - nessun campo inventato: ogni record contiene solo quanto osservato
 *    nelle risposte SPARQL (lista + `SELECT ?p ?o` di dettaglio);
 *  - scheda Camera solo da `dcterms:isReferencedBy` osservato, mai costruita.
 */

export type FonteDdl = "senato" | "camera";

/** Ramo osservato sul DDL Senato (`S`/`C` come nei dati `osr:ramo`). */
export type Ramo = "S" | "C";

export interface DdlSenato {
  uri: string;
  idDdl: string;
  idFase?: string;
  titolo: string;
  numeroFase?: string;
  numeroFaseCompatto: string;
  fase?: string;
  ramo: string;
  statoDdl_raw: string;
  dataPresentazione: string;
  dataStatoDdl?: string;
  descrIniziativa?: string;
  testoNIR?: string;
  legislatura: 19;
}

export interface AttoCamera {
  uri: string;
  slug: string;
  tipo: string;
  numero: string;
  titolo?: string;
  label?: string;
  scheda?: string;
}

/** Voce unificata per UI/API: `disegnoDiLegge` e' sempre vero (badge). */
export interface VoceDdl {
  fonte: FonteDdl;
  uri: string;
  titolo: string;
  /** Solo Senato osservato; per la Camera vale `C` (proviene dalla Camera). */
  ramo: Ramo;
  /** Fase osservata (es. `S.2046`), solo Senato. */
  fase?: string;
  /** Stato iter grezzo Senato (es. `assegnato (no esame)`), mai mappato. */
  statoIter?: string;
  /** Numero osservato: compatto Senato / identifier Camera. */
  numero: string;
  /** Scheda ufficiale osservata (solo Camera via `isReferencedBy`). */
  scheda?: string;
  /** Sempre `true`: ogni elemento e' un disegno di legge, non in vigore. */
  disegnoDiLegge: true;
}

export interface ProvenienzaDdl {
  fonte?: string;
  recuperatoIl?: string;
  licenza?: string;
}

export interface ProvenanceDdl {
  senato?: ProvenienzaDdl | null;
  camera?: ProvenienzaDdl | null;
}

/* ---------------------------------------------------------------------------
 * Normalizzazione e helper puri (mai throw).
 * ------------------------------------------------------------------------- */

/** Minuscole, NFD senza diacritici, spazi compattati. Non lancia mai. */
export function normalizzaDdl(value: unknown): string {
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

function urlHttp(value: unknown): string {
  const s = stringaPulita(value);
  return /^https?:\/\//i.test(s) ? s : "";
}

/**
 * Ramo osservato (`S`/`C`, case-insensitive); `""` se assente o ignoto.
 * Non lancia mai.
 */
export function normalizzaRamo(value: unknown): "" | Ramo {
  try {
    const s = stringaPulita(value).toUpperCase();
    return s === "S" || s === "C" ? s : "";
  } catch {
    return "";
  }
}

/**
 * Unifica un DDL Senato in `VoceDdl` (solo campi osservati). Non lancia mai.
 * Restituisce `null` se mancano uri/titolo/numero osservati.
 */
export function voceDaDdlSenato(voce: unknown): VoceDdl | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const uri = urlHttp(o["uri"]);
    const titolo = stringaPulita(o["titolo"]);
    const numero = stringaPulita(o["numeroFaseCompatto"]);
    if (!uri || !titolo || !numero) return null;
    const ramo = normalizzaRamo(o["ramo"]);
    if (ramo === "") return null;
    const risultato: VoceDdl = {
      fonte: "senato",
      uri,
      titolo,
      ramo,
      numero,
      disegnoDiLegge: true,
    };
    const fase = stringaPulita(o["fase"]);
    if (fase) risultato.fase = fase;
    const stato = stringaPulita(o["statoDdl_raw"]);
    if (stato) risultato.statoIter = stato;
    return risultato;
  } catch {
    return null;
  }
}

/**
 * Unifica un atto Camera in `VoceDdl`. Il ramo e' `C` per costruzione
 * documentata (gli atti provengono dalla Camera); titolo preferito da
 * `titolo` (`dc:title`), fallback a `label`. Non lancia mai.
 * Restituisce `null` se mancano uri/titolo/numero osservati.
 */
export function voceDaAttoCamera(voce: unknown): VoceDdl | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const uri = urlHttp(o["uri"]);
    const numero = stringaPulita(o["numero"]);
    const titolo = stringaPulita(o["titolo"]) || stringaPulita(o["label"]);
    if (!uri || !titolo || !numero) return null;
    const risultato: VoceDdl = {
      fonte: "camera",
      uri,
      titolo,
      ramo: "C",
      numero,
      disegnoDiLegge: true,
    };
    const scheda = urlHttp(o["scheda"]);
    if (scheda) risultato.scheda = scheda;
    return risultato;
  } catch {
    return null;
  }
}

/**
 * Filtro per fase Senato (match esatto su `fase`, es. `S.2046`; gli atti
 * Camera non hanno fase e vengono esclusi quando il filtro e' attivo).
 * Non lancia mai.
 */
export function filtraPerFase(voci: readonly VoceDdl[], fase: string): VoceDdl[] {
  try {
    if (!Array.isArray(voci) || typeof fase !== "string" || !fase.trim()) return [...voci];
    const chiave = fase.trim();
    return voci.filter((v) => v?.fase === chiave);
  } catch {
    return [];
  }
}

/**
 * Filtro per ramo (`S`/`C`, case-insensitive; valore ignoto -> invariato).
 * Gli atti Camera contano come ramo `C`. Non lancia mai.
 */
export function filtraPerRamo(voci: readonly VoceDdl[], ramo: unknown): VoceDdl[] {
  try {
    if (!Array.isArray(voci)) return [];
    const chiave = normalizzaRamo(ramo);
    if (!chiave) return [...voci];
    return voci.filter((v) => v?.ramo === chiave);
  } catch {
    return [];
  }
}

/**
 * Ricerca su titolo (max 100 char, min 2 dopo normalizzazione).
 * Sotto i 2 caratteri restituisce copia invariata. Non lancia mai.
 */
export function cercaDdl(voci: readonly VoceDdl[], q: unknown): VoceDdl[] {
  try {
    if (!Array.isArray(voci)) return [];
    const grezza = typeof q === "string" ? q.slice(0, 100) : "";
    const normalizzata = normalizzaDdl(grezza);
    if (normalizzata.length < 2) return [...voci];
    return voci.filter((v) => normalizzaDdl(v?.titolo).includes(normalizzata));
  } catch {
    return [];
  }
}

/**
 * Paginazione: `per` ammessi 10|20|50 (default 20), `page` >= 1.
 * Non lancia mai.
 */
export function paginaDdl<T>(elementi: readonly T[], page: unknown, per: unknown): T[] {
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

/**
 * Fasi distinte osservate (solo Senato), ordinate. Non lancia mai.
 */
export function fasiDistinte(voci: readonly VoceDdl[]): string[] {
  try {
    if (!Array.isArray(voci)) return [];
    const fasi = new Set<string>();
    for (const v of voci) {
      if (typeof v?.fase === "string" && v.fase.trim()) fasi.add(v.fase.trim());
    }
    return [...fasi].sort((a, b) => a.localeCompare(b, "it"));
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

const PERCORSO_SENATO = "data/reali/parlamento-ddl.json";
const PERCORSO_CAMERA = "data/reali/camera-atti.json";

interface CacheDdl {
  voci: VoceDdl[] | null;
  provenance: ProvenanceDdl | null;
}

const cache: CacheDdl = { voci: null, provenance: null };

/** Azzera la cache in modulo (utile nei test). Non lancia mai. */
export function azzeraCacheDdl(): void {
  try {
    cache.voci = null;
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

function provenanceDi(grezzo: unknown): ProvenienzaDdl | null {
  try {
    if (!grezzo || typeof grezzo !== "object" || Array.isArray(grezzo)) return null;
    const prov = (grezzo as Record<string, unknown>)["provenance"];
    if (!prov || typeof prov !== "object" || Array.isArray(prov)) return null;
    const p = prov as Record<string, unknown>;
    const out: ProvenienzaDdl = {};
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

function caricaTutto(): { voci: VoceDdl[]; provenance: ProvenanceDdl } {
  const grezzoSenato = leggiJson(PERCORSO_SENATO);
  const grezzoCamera = leggiJson(PERCORSO_CAMERA);
  const voci: VoceDdl[] = [];
  for (const record of estraiLista(grezzoSenato, ["ddl", "voci", "dati", "items"])) {
    const voce = voceDaDdlSenato(record);
    if (voce) voci.push(voce);
  }
  for (const record of estraiLista(grezzoCamera, ["atti", "voci", "dati", "items"])) {
    const voce = voceDaAttoCamera(record);
    if (voce) voci.push(voce);
  }
  return {
    voci,
    provenance: { senato: provenanceDi(grezzoSenato), camera: provenanceDi(grezzoCamera) },
  };
}

/** Tutte le voci DDL/atti (Senato poi Camera; copia difensiva, mai throw). */
export async function tuttiDdl(): Promise<VoceDdl[]> {
  try {
    if (!cache.voci) {
      const { voci, provenance } = caricaTutto();
      cache.voci = voci;
      cache.provenance = provenance;
    }
    return (cache.voci ?? []).map((v) => ({ ...v }));
  } catch {
    return [];
  }
}

/** Provenance dei file reali. Mai throw. */
export async function leggiProvenanceDdl(): Promise<ProvenanceDdl> {
  try {
    await tuttiDdl();
    return { ...(cache.provenance ?? {}) };
  } catch {
    return {};
  }
}
