/**
 * Sondaggi nazionali (voto di partito) da Wikipedia via MediaWiki API.
 *
 * Legge l'envelope in `data/reali/sondaggi-nazionali.json` (solo sezione
 * "Party vote" nazionale, ultimi N record con provenance CC BY-SA 4.0)
 * con cache in modulo per percorso. Solo codice server: usa `node:fs` /
 * `node:path` via accesso pigro (nessun import statico `node:`, cosi' un
 * import accidentale dal client non rompe il bundle). Tutte le funzioni
 * sono never-throw: file assente, oltre 1 MB o invalido -> valori vuoti,
 * mai eccezioni, mai numeri inventati.
 *
 * Onesta' dati: sono sondaggi (stime con margine di errore), MAI risultati
 * elettorali e MAI leggi. Il loader estrae SOLO le chiavi del contratto
 * (`provenance`, `sezione`, `ambito`, `criteri`, `sondaggi`, `metodologia`,
 * `avvertenze`, `attribuzione`) e per record SOLO i campi del giudice.
 */

export interface SondaggioNazionale {
  istituto: string;
  fieldwork_da: string;
  fieldwork_a: string;
  campione_n: number | null;
  fdi: number;
  pd: number;
  m5s: number;
  lega: number | null;
  fi: number | null;
  azione: number | null;
  iv: number | null;
  avs: number | null;
  piu_europa: number | null;
  nm: number | null;
  fn: number | null;
  altri: number | null;
  lead: number | null;
  csx: number | null;
  cdx: number | null;
  url_fonte: string;
  revid_wiki: number;
  estratto_il: string;
}

export interface ProvenanceSondaggi {
  fonte?: string;
  url?: string;
  voce?: string;
  pageid?: number;
  revid?: number;
  estratto_il?: string;
  licenza?: string;
  licenza_url?: string;
}

export interface EnvelopeSondaggi {
  provenance: ProvenanceSondaggi;
  sezione: string;
  ambito: string;
  sondaggi: SondaggioNazionale[];
  metodologia: string;
  avvertenze: string;
  attribuzione: string;
}

export type Result<T> = { ok: true; dati: T } | { ok: false; errore: string };

/** Percorso relativo (da cwd) del file sondaggi. */
export const PERCORSO_SONDAGGI = "data/reali/sondaggi-nazionali.json";

/** Licenza dichiarata (verificata live via rightsinfo). */
export const LICENZA_SONDAGGI = "CC BY-SA 4.0";

/** Istituti esclusi (aggregatori di secondo livello). */
export const AGGREGATORI_ESCLUSI = [
  "politpro",
  "bidimedia",
  "cassandra",
  "youtrend",
  "europe elects",
] as const;

/** Dimensione massima accettata del JSON (oltre -> vuoto, mai parziali). */
export const MAX_JSON_BYTES = 1048576;

/** Refresh consigliato: non piu' di una volta a settimana. */
export const REFRESH_CONSIGLIATO_GIORNI = 7;

/* ---------------------------------------------------------------------------
 * Helper puri (mai lanciano).
 * ------------------------------------------------------------------------- */

function stringa(value: unknown, max: number): string {
  try {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, max);
  } catch {
    return "";
  }
}

function percentuale(value: unknown): number | null {
  try {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    if (value < 0 || value > 100) return null;
    return Math.round(value * 10) / 10;
  } catch {
    return null;
  }
}

function interoONullo(value: unknown): number | null {
  try {
    if (value === null || value === undefined) return null;
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const n = Math.floor(value);
    return n >= 0 ? n : null;
  } catch {
    return null;
  }
}

function dataIso(value: unknown): string | null {
  try {
    if (typeof value !== "string") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
    return value.trim();
  } catch {
    return null;
  }
}

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

/**
 * Valida un record sondaggio (mai lancia, null se invalido, mai inventa).
 * Richiede: istituto, fieldwork ISO, fdi/pd/m5s, url https, revid, estratto.
 */
export function aSondaggio(voce: unknown): SondaggioNazionale | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const istituto = stringa(o["istituto"], 80);
    const da = dataIso(o["fieldwork_da"]);
    const a = dataIso(o["fieldwork_a"]);
    const fdi = percentuale(o["fdi"]);
    const pd = percentuale(o["pd"]);
    const m5s = percentuale(o["m5s"]);
    const url = stringa(o["url_fonte"], 500);
    const revidRaw = o["revid_wiki"];
    const revid = typeof revidRaw === "number" && Number.isSafeInteger(revidRaw) ? revidRaw : NaN;
    const estratto = dataIso(o["estratto_il"]);
    if (!istituto || istituto.length < 2) return null;
    if (!da || !a) return null;
    if (fdi === null || pd === null || m5s === null) return null;
    if (!/^https?:\/\//i.test(url)) return null;
    if (!Number.isSafeInteger(revid)) return null;
    if (!estratto) return null;
    const campioneRaw = o["campione_n"];
    const campione =
      campioneRaw === null || campioneRaw === undefined ? null : interoONullo(campioneRaw);
    if (campioneRaw !== null && campioneRaw !== undefined && campione === null) {
      // campione presente ma invalido -> invalida il record (mai stimare)
      if (typeof campioneRaw === "number") return null;
    }
    return {
      istituto,
      fieldwork_da: da,
      fieldwork_a: a,
      campione_n: campione,
      fdi,
      pd,
      m5s,
      lega: percentuale(o["lega"]),
      fi: percentuale(o["fi"]),
      azione: percentuale(o["azione"]),
      iv: percentuale(o["iv"]),
      avs: percentuale(o["avs"]),
      piu_europa: percentuale(o["piu_europa"]),
      nm: percentuale(o["nm"]),
      fn: percentuale(o["fn"]),
      altri: percentuale(o["altri"]),
      lead: percentuale(o["lead"]),
      csx: percentuale(o["csx"]),
      cdx: percentuale(o["cdx"]),
      url_fonte: url,
      revid_wiki: revid,
      estratto_il: estratto,
    };
  } catch {
    return null;
  }
}

function aProvenance(value: unknown): ProvenanceSondaggi {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const o = value as Record<string, unknown>;
    const out: ProvenanceSondaggi = {};
    const fonte = stringa(o["fonte"], 200);
    if (fonte) out.fonte = fonte;
    const url = stringa(o["url"], 300);
    if (/^https?:\/\//i.test(url)) out.url = url;
    const voce = stringa(o["voce"], 200);
    if (voce) out.voce = voce;
    const pageid = o["pageid"];
    if (typeof pageid === "number" && Number.isSafeInteger(pageid)) out.pageid = pageid;
    const revid = o["revid"];
    if (typeof revid === "number" && Number.isSafeInteger(revid)) out.revid = revid;
    const estratto = dataIso(o["estratto_il"]);
    if (estratto) out.estratto_il = estratto;
    const licenza = stringa(o["licenza"], 60);
    if (licenza) out.licenza = licenza;
    const licenzaUrl = stringa(o["licenza_url"], 300);
    if (/^https?:\/\//i.test(licenzaUrl)) out.licenza_url = licenzaUrl;
    return out;
  } catch {
    return {};
  }
}

/**
 * Valida l'envelope grezzo (mai lancia, null se invalido).
 * Max 60 record; sezione Party vote; licenza CC BY-SA 4.0.
 */
export function validaEnvelope(grezzo: unknown): EnvelopeSondaggi | null {
  try {
    if (!grezzo || typeof grezzo !== "object" || Array.isArray(grezzo)) return null;
    const o = grezzo as Record<string, unknown>;
    const sezione = stringa(o["sezione"], 40);
    if (sezione !== "Party vote") return null;
    const grezzi = o["sondaggi"];
    if (!Array.isArray(grezzi) || grezzi.length === 0 || grezzi.length > 60) return null;
    const sondaggi: SondaggioNazionale[] = [];
    for (const g of grezzi) {
      const s = aSondaggio(g);
      if (!s) return null;
      sondaggi.push(s);
    }
    return {
      provenance: aProvenance(o["provenance"]),
      sezione,
      ambito: stringa(o["ambito"], 40) || "nazionale",
      sondaggi,
      metodologia: stringa(o["metodologia"], 1200),
      avvertenze: stringa(o["avvertenze"], 1200),
      attribuzione: stringa(o["attribuzione"], 600),
    };
  } catch {
    return null;
  }
}

/**
 * Media di un partito sugli ultimi `n` sondaggi (1 decimale).
 * Sigle: fdi, pd, m5s, lega, fi, azione, iv, avs, piu_europa, nm, fn.
 * Null se nessun valore. Non lancia mai.
 */
export function mediaPartito(
  sondaggi: readonly SondaggioNazionale[],
  sigla: unknown,
  n: unknown,
): number | null {
  try {
    if (!Array.isArray(sondaggi)) return null;
    const chiave = stringa(sigla, 16).toLowerCase();
    const ammesse = [
      "fdi",
      "pd",
      "m5s",
      "lega",
      "fi",
      "azione",
      "iv",
      "avs",
      "piu_europa",
      "nm",
      "fn",
    ];
    if (!ammesse.includes(chiave)) return null;
    let limite = 10;
    if (typeof n === "number" && Number.isFinite(n)) limite = Math.floor(n);
    if (limite < 1) limite = 1;
    if (limite > 60) limite = 60;
    const valori: number[] = [];
    for (const s of sondaggi.slice(0, limite)) {
      const v = (s as unknown as Record<string, unknown>)[chiave];
      if (typeof v === "number" && Number.isFinite(v)) valori.push(v);
    }
    if (valori.length === 0) return null;
    const media = valori.reduce((a, b) => a + b, 0) / valori.length;
    return Math.round(media * 10) / 10;
  } catch {
    return null;
  }
}

/**
 * Cerca per istituto (contains sul normalizzato, max 100 ch, min 2).
 * Max 60 righe. Non lancia mai.
 */
export function cercaPerIstituto(
  sondaggi: readonly SondaggioNazionale[],
  q: unknown,
): SondaggioNazionale[] {
  try {
    if (!Array.isArray(sondaggi)) return [];
    const grezza = typeof q === "string" ? q.slice(0, 100) : "";
    const chiave = normalizza(grezza);
    if (chiave.length < 2) return [];
    return sondaggi
      .filter((s) => normalizza(s?.istituto).includes(chiave))
      .slice(0, 60)
      .map((s) => ({ ...s }));
  } catch {
    return [];
  }
}

/* ---------------------------------------------------------------------------
 * Caricamento da disco (solo server, con cache). Whitelist stretta.
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

let cache: EnvelopeSondaggi | null | undefined;

/** Azzera la cache in modulo (utile nei test). Non lancia mai. */
export function azzeraCache(): void {
  try {
    cache = undefined;
  } catch {
    // mai lanciare
  }
}

function caricaTutti(): EnvelopeSondaggi | null {
  try {
    if (cache !== undefined) return cache;
    const mod = moduliNode();
    if (!mod) {
      cache = null;
      return null;
    }
    let base = "";
    try {
      base = typeof process !== "undefined" && process.cwd ? process.cwd() : "";
    } catch {
      cache = null;
      return null;
    }
    if (!base) {
      cache = null;
      return null;
    }
    const ass = mod.join(base, PERCORSO_SONDAGGI);
    if (!mod.existsSync(ass)) {
      cache = null;
      return null;
    }
    const raw = mod.readFileSync(ass, "utf8");
    if (!raw || raw.length > MAX_JSON_BYTES) {
      cache = null;
      return null;
    }
    const dati = validaEnvelope(JSON.parse(raw) as unknown);
    cache = dati;
    return dati;
  } catch {
    return null;
  }
}

/**
 * Carica l'envelope sondaggi (copia difensiva) o null se assente,
 * oltre 1MB o invalido. Mai lancia, mai numeri inventati.
 */
export async function caricaSondaggi(): Promise<EnvelopeSondaggi | null> {
  try {
    const dati = caricaTutti();
    if (!dati) return null;
    return {
      ...dati,
      provenance: { ...dati.provenance },
      sondaggi: dati.sondaggi.map((s) => ({ ...s })),
    };
  } catch {
    return null;
  }
}

/** Variante Result con motivo del vuoto in italiano (mai lancia). */
export async function caricaSondaggiResult(): Promise<Result<EnvelopeSondaggi>> {
  try {
    const dati = await caricaSondaggi();
    if (!dati) return { ok: false, errore: "dati sondaggi non disponibili" };
    return { ok: true, dati };
  } catch {
    return { ok: false, errore: "errore imprevisto" };
  }
}

/** Provenance del file reale (vuota se assente). Mai lancia. */
export async function leggiProvenanceSondaggi(): Promise<ProvenanceSondaggi> {
  try {
    const dati = caricaTutti();
    return dati ? { ...dati.provenance } : {};
  } catch {
    return {};
  }
}
