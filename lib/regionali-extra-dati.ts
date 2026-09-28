/**
 * Dati elettorali regionali-extra: Liguria 2024 + Calabria 2025 (server-only).
 *
 * Legge gli envelope in `data/reali/elezioni-regionali-2024-liguria.json` e
 * `data/reali/elezioni-regionali-2025-calabria.json` (solo aggregati:
 * regione con per-lista + comuni con sola affluenza, mai righe
 * candidato/nominativi) con cache in modulo per percorso. Solo codice
 * server: usa `node:fs`/`node:path` via accesso pigro (nessun import
 * statico `node:`, cosi' un import accidentale dal client non rompe il
 * bundle). Tutte le funzioni sono never-throw: file assente, oltre 1 MB
 * o invalido -> valori vuoti, mai eccezioni.
 *
 * Onesta' dati: il loader estrae SOLO chiavi aggregate in whitelist
 * (`provenance`, `elezione`, `liste`, `regioni`, `comuni`, `metodologia`,
 * `avvertenze`). Anche se il file contenesse righe candidato/nominativi,
 * queste chiavi non vengono mai lette ne' propagate. Mai numeri inventati:
 * i campi assenti o invalidi invalidano il file (vuoto), non vengono stimati.
 *
 * Nota tracciati: in Calabria la colonna CIRCOSCRIZIONE del file DAIT
 * contiene la circoscrizione elettorale (NORD/CENTRO/SUD), non la provincia;
 * il valore e' riportato verbatim nella chiave `p` dei comuni, come in
 * ingest. In Liguria contiene la provincia (GENOVA/SAVONA/LA SPEZIA/IMPERIA).
 */

/** Identificativi REST delle regionali-extra. */
export type IdRegionaleExtra =
  | "regionali-2024-liguria"
  | "regionali-2025-calabria"
  | "regionali-2024-emilia-romagna";

/** Voce del registry: metadati statici, mai numeri reali. */
export interface VoceRegistroRegionaleExtra {
  id: IdRegionaleExtra;
  tipo: string;
  data: string;
  file: string;
  titolo: string;
}

export interface ProvenanceRegionaleExtra {
  fonte?: string;
  url?: string;
  recuperatoIl?: string;
  licenza?: string;
}

export interface ElezioneSintesiExtra {
  tipo: string;
  data: string;
  e: number;
  v: number;
  b: number;
  k: number;
  a: number;
}

export interface ListaRisultatoExtra {
  n: string;
  v: number;
  p: number;
}

export interface RegioneRisultatoExtra {
  r: string;
  e: number;
  v: number;
  b: number;
  k: number;
  a: number;
  liste: ListaRisultatoExtra[];
}

export interface ComuneRisultatoExtra {
  c: string;
  p: string;
  r: string;
  e: number;
  v: number;
  a: number;
}

export interface DatiRegionaleExtra {
  provenance: ProvenanceRegionaleExtra;
  elezione: ElezioneSintesiExtra;
  liste: ListaRisultatoExtra[];
  regioni: RegioneRisultatoExtra[];
  comuni: ComuneRisultatoExtra[];
  metodologia: string;
  avvertenze: string;
}

/** Esito mai-throw per i chiamanti che vogliono il motivo del vuoto. */
export type ResultExtra<T> = { ok: true; dati: T } | { ok: false; errore: string };

/** Percorsi relativi (da cwd) dei file regionali-extra. */
export const PERCORSO_LIGURIA_2024 =
  "data/reali/elezioni-regionali-2024-liguria.json";
export const PERCORSO_CALABRIA_2025 =
  "data/reali/elezioni-regionali-2025-calabria.json";

/** Identificativi REST delle regionali-extra. */
export const ID_LIGURIA_2024 = "regionali-2024-liguria" as const;
export const ID_CALABRIA_2025 = "regionali-2025-calabria" as const;
export const ID_EMILIA_ROMAGNA_2024 = "regionali-2024-emilia-romagna" as const;

/** Percorso relativo (da cwd) del file Emilia-Romagna 2024. */
export const PERCORSO_EMILIA_ROMAGNA_2024 =
  "data/reali/elezioni-regionali-2024-emilia-romagna.json";

/**
 * Registry statico delle regionali-extra (metadati, mai numeri reali).
 * La disponibilita' effettiva dipende dal file su disco: file assente
 * o invalido -> consultazione assente, mai throw.
 */
export const REGISTRY_REGIONALI_EXTRA: readonly VoceRegistroRegionaleExtra[] = [
  {
    id: "regionali-2024-liguria",
    tipo: "regionali",
    data: "2024-10-27",
    file: PERCORSO_LIGURIA_2024,
    titolo: "Elezioni regionali 2024 — Liguria",
  },
  {
    id: "regionali-2025-calabria",
    tipo: "regionali",
    data: "2025-10-05",
    file: PERCORSO_CALABRIA_2025,
    titolo: "Elezioni regionali 2025 — Calabria",
  },
  {
    id: "regionali-2024-emilia-romagna",
    tipo: "regionali",
    data: "2024-11-17",
    file: PERCORSO_EMILIA_ROMAGNA_2024,
    titolo: "Elezioni regionali 2024 — Emilia-Romagna",
  },
];

/** Licenza dichiarata: open-data ministeriale da confermare. */
export const LICENZA_REGIONALI_EXTRA =
  "Dati ufficiali Ministero dell'Interno DAIT (Eligendo Open Data); riuso open-data ministeriale da confermare, pagina info_opendata senza stringa di licenza CC-BY.";

/** Disclaimer aggregati, da mostrare in ogni render/API. */
export const DISCLAIMER_AGGREGATI_EXTRA =
  "Solo dati aggregati per liste, regione e comuni. Nessun nominativo, nessuna riga candidato integrale. Seggi non disponibili nel file di origine.";

/** Tetto righe per la ricerca comuni (contains, senza per-lista comunale). */
export const MAX_COMUNI_RICERCA_EXTRA = 100;

/** Dimensione massima accettata del JSON (oltre -> vuoto, mai parziali). */
export const MAX_JSON_BYTES_EXTRA = 1048576;

/* ---------------------------------------------------------------------------
 * Helper puri (mai lanciano).
 * ------------------------------------------------------------------------- */

/** Minuscole, NFD senza diacritici, spazi compattati. Non lancia mai. */
export function normalizzaExtra(value: unknown): string {
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
 * Ricerca comuni per nome (contains, anche su circoscrizione/provincia):
 * query troncata a 100 caratteri, minimo 2 dopo normalizzazione, al massimo
 * 100 righe. Sotto i 2 caratteri restituisce array vuoto. Non lancia mai.
 */
export function cercaComuneExtra(
  comuni: readonly ComuneRisultatoExtra[],
  q: unknown,
): ComuneRisultatoExtra[] {
  try {
    if (!Array.isArray(comuni)) return [];
    const grezza = typeof q === "string" ? q.slice(0, 100) : "";
    const chiave = normalizzaExtra(grezza);
    if (chiave.length < 2) return [];
    const out: ComuneRisultatoExtra[] = [];
    for (const c of comuni) {
      if (out.length >= MAX_COMUNI_RICERCA_EXTRA) break;
      if (!c || typeof c !== "object") continue;
      const nome = normalizzaExtra((c as ComuneRisultatoExtra).c);
      const prov = normalizzaExtra((c as ComuneRisultatoExtra).p);
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
export function topListeExtra(
  liste: readonly ListaRisultatoExtra[],
  n: unknown,
): ListaRisultatoExtra[] {
  try {
    if (!Array.isArray(liste)) return [];
    let limite = 10;
    if (typeof n === "number" && Number.isFinite(n)) limite = Math.floor(n);
    if (limite < 1) limite = 1;
    if (limite > 10) limite = 10;
    return [...liste]
      .filter(
        (l): l is ListaRisultatoExtra => !!l && typeof l === "object",
      )
      .map((l) => ({ ...l }))
      .sort((a, b) => b.v - a.v)
      .slice(0, limite);
  } catch {
    return [];
  }
}

/**
 * Paginazione generica: `page` >= 1 (default 1), `per` 1..100 (default 20).
 * Non lancia mai.
 */
export function paginaExtra<T>(
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

/** Normalizza un id regionale-extra (trim, minuscole, max 64 ch). */
export function normalizzaIdRegionaleExtra(value: unknown): IdRegionaleExtra | null {
  try {
    if (typeof value !== "string") return null;
    const chiave = value.trim().toLowerCase().slice(0, 64);
    if (
      chiave === "regionali-2024-liguria" ||
      chiave === "regionali-2025-calabria" ||
      chiave === "regionali-2024-emilia-romagna"
    )
      return chiave;
    return null;
  } catch {
    return null;
  }
}

/** True se `value` e' un id regionale-extra noto. Non lancia mai. */
export function isIdRegionaleExtra(value: unknown): value is IdRegionaleExtra {
  try {
    return normalizzaIdRegionaleExtra(value) !== null;
  } catch {
    return false;
  }
}

/** Voce di registry per id noto, altrimenti null. Non lancia mai. */
export function voceRegistroRegionaleExtra(
  id: unknown,
): VoceRegistroRegionaleExtra | null {
  try {
    const chiave = normalizzaIdRegionaleExtra(id);
    if (!chiave) return null;
    const voce = REGISTRY_REGIONALI_EXTRA.find((v) => v.id === chiave);
    return voce ? { ...voce } : null;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
 * Caricamento da disco (solo server, con cache). Whitelist stretta:
 * vengono estratte solo le chiavi aggregate del contratto.
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
  dati: DatiRegionaleExtra | null;
  errore: string;
}

const cachePerPercorso = new Map<string, StatoCache>();

/** Azzera la cache in modulo (utile nei test). Non lancia mai. */
export function azzeraCacheExtra(): void {
  try {
    cachePerPercorso.clear();
  } catch {
    // mai lanciare
  }
}

function aProvenance(value: unknown): ProvenanceRegionaleExtra {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const o = value as Record<string, unknown>;
    const out: ProvenanceRegionaleExtra = {};
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

function aLista(voce: unknown): ListaRisultatoExtra | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const n = stringa(o["n"], 160);
    const v = interoNonNegativo(o["v"]);
    if (!n || v === null) return null;
    const p = percentuale(o["p"]);
    return { n, v, p: p ?? 0 };
  } catch {
    return null;
  }
}

function aListe(value: unknown, max: number): ListaRisultatoExtra[] | null {
  try {
    if (!Array.isArray(value) || value.length > max) return null;
    const out: ListaRisultatoExtra[] = [];
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

function aRegione(voce: unknown): RegioneRisultatoExtra | null {
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

function aComune(voce: unknown): ComuneRisultatoExtra | null {
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

function aElezione(value: unknown): ElezioneSintesiExtra | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const o = value as Record<string, unknown>;
    const tipo = stringa(o["tipo"], 64);
    const data = stringa(o["data"], 16);
    const e = interoNonNegativo(o["e"]);
    const v = interoNonNegativo(o["v"]);
    const b = interoNonNegativo(o["b"]);
    const k = interoNonNegativo(o["k"]);
    const a = percentuale(o["a"]);
    if (!tipo || !data || e === null || v === null) return null;
    if (b === null || k === null || a === null) return null;
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
    if (!raw || raw.length > MAX_JSON_BYTES_EXTRA)
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
    if (!Array.isArray(regioniGrezze) || regioniGrezze.length < 1 || regioniGrezze.length > 64)
      return { dati: null, errore: "regioni invalide" };
    if (!Array.isArray(comuniGrezzi) || comuniGrezzi.length > 20000)
      return { dati: null, errore: "comuni invalidi" };
    const regioni: RegioneRisultatoExtra[] = [];
    for (const voce of regioniGrezze) {
      const r = aRegione(voce);
      if (!r) return { dati: null, errore: "regione invalida" };
      regioni.push(r);
    }
    const comuni: ComuneRisultatoExtra[] = [];
    for (const voce of comuniGrezzi) {
      const comune = aComune(voce);
      if (!comune) continue;
      comuni.push(comune);
    }
    if (comuni.length === 0) return { dati: null, errore: "comuni invalidi" };
    const dati: DatiRegionaleExtra = {
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

function copiaDati(dati: DatiRegionaleExtra): DatiRegionaleExtra {
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

export interface SintesiRegionaleExtra {
  id: IdRegionaleExtra;
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
 * Carica l'envelope di una regionale-extra (copia difensiva) o null se
 * id ignoto, file assente, oltre 1MB o invalido. Mai lancia.
 */
export async function caricaRegionaleExtra(
  id: unknown,
): Promise<DatiRegionaleExtra | null> {
  try {
    const voce = voceRegistroRegionaleExtra(id);
    if (!voce) return null;
    const stato = statoPerPercorso(voce.file);
    return stato.dati ? copiaDati(stato.dati) : null;
  } catch {
    return null;
  }
}

/** Variante Result per-id con motivo del vuoto in italiano (mai lancia). */
export async function caricaRegionaleExtraResult(
  id: unknown,
): Promise<ResultExtra<DatiRegionaleExtra>> {
  try {
    const voce = voceRegistroRegionaleExtra(id);
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
 * Elenca le regionali-extra con file presente e valido (file assente o
 * invalido -> voce omessa, mai throw). Mai lancia, mai numeri inventati.
 */
export async function elencaRegionaliExtra(): Promise<SintesiRegionaleExtra[]> {
  try {
    const out: SintesiRegionaleExtra[] = [];
    for (const voce of REGISTRY_REGIONALI_EXTRA) {
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

/** Provenance per-id (vuota se id ignoto o file assente). Mai lancia. */
export async function leggiProvenanceRegionaleExtra(
  id: unknown,
): Promise<ProvenanceRegionaleExtra> {
  try {
    const voce = voceRegistroRegionaleExtra(id);
    if (!voce) return {};
    const stato = statoPerPercorso(voce.file);
    return stato.dati ? { ...stato.dati.provenance } : {};
  } catch {
    return {};
  }
}
