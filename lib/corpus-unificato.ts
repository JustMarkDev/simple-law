/**
 * Corpus unificato — client+server, mai `node:fs`, never-throw.
 *
 * Unico punto di verità per il corpus grande servito senza database:
 * mapping puro da `AttoEspanso` (lib/seed-data-espansa.ts) a `LawRecord`
 * (lib/seed-data.ts, la forma consumata da `normalizeLaw`, `mapLaw`,
 * `toPrismaData`) + generazione deterministica di varianti + cache singleton.
 *
 * Ordine di merge (in `getSeedLaws` di lib/sources.ts): i 5 seed di
 * lib/seed-data.ts restano sempre i primi e vincono la dedup per ELI.
 *
 * SSR-safe: zero import da `node:`. Non importare mai `sources` da qui
 * (anti-ciclo: `sources` importa questo modulo).
 */

import {
  ATTI_ESPANSI,
  NUMERI_RISERVATI,
  fnv1a,
  mulberry32,
  type AttoEspanso,
} from "./seed-data-espansa";
import { buildFonti } from "./fonti";
import { calcGulpease } from "./readability";
import type { LawRecord } from "./seed-data";

export const CORPUS_TOTALE_DEFAULT = 5000;
export const CORPUS_TOTALE_MIN = 77;
export const CORPUS_TOTALE_MAX = 20000;
export const CORPUS_SEED_DEFAULT = "simple-law-v1";

// ---------------------------------------------------------------------------
// Mapping puro AttoEspanso -> LawRecord (mai lancia).
// ---------------------------------------------------------------------------

const TIPO_ESPANSO_A_LAW: Record<string, string> = {
  Legge: "legge",
  "Legge Costituzionale": "legge.costituzionale",
  "Decreto-Legge": "decreto.legge",
  "Decreto Legislativo": "decreto.legislativo",
  "D.P.R.": "decreto.presidente.repubblica",
  Regolamento: "regolamento",
};

function dueCifre(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function gulpeaseDi(testo: string, sintesi: string): number | null {
  try {
    const indice = calcGulpease(testo || sintesi).indice;
    return Number.isFinite(indice) ? indice : null;
  } catch {
    return null;
  }
}

function recordFallback(): LawRecord {
  const sintesi = "Record dimostrativo non disponibile.";
  return {
    eli: "/eli/legge/1948/1",
    nir: "urn:nir:stato:legge:1948-01-01;1",
    tipo: "legge",
    numero: "1",
    dataEmanazione: "1948-01-01",
    titolo: "Record dimostrativo non disponibile",
    sintesi,
    stato: "in_vigore",
    gulpease: null,
    fonti: { governo: "https://www.governo.it/it/archivio-consiglio-dei-ministri" },
    air: "assente",
    attuativi: { daAdottare: 0, adottati: 0, scaduti: 0 },
    fiducia: false,
    omnibus: false,
    testo: sintesi,
    dimostrativo: true,
  };
}

/**
 * Mapping puro atto espanso -> `LawRecord` (forma di lib/seed-data.ts).
 * Never-throw: in caso di errore restituisce un record fallback dimostrativo.
 */
export function attoEspansoToLawRecord(atto: AttoEspanso): LawRecord {
  try {
    if (!atto || typeof atto !== "object") return recordFallback();
    const tipo = TIPO_ESPANSO_A_LAW[(atto as AttoEspanso).tipo] ?? "legge";
    const numero = String((atto as AttoEspanso).numero ?? "0");
    const dataEmanazione =
      typeof (atto as AttoEspanso).dataEmanazione === "string" ? (atto as AttoEspanso).dataEmanazione : "";
    const titolo = typeof atto.titolo === "string" ? atto.titolo : "";
    const sintesi = typeof atto.sintesi === "string" ? atto.sintesi : "";
    const testo = typeof atto.testo === "string" && atto.testo ? atto.testo : sintesi;
    const previsti = Number((atto as AttoEspanso).attuativiPrevisti ?? 0);
    const adottatiRaw = Number((atto as AttoEspanso).attuativiAdottati ?? 0);
    const adottati = Number.isFinite(adottatiRaw) && adottatiRaw > 0 ? Math.floor(adottatiRaw) : 0;
    const previstiSafe = Number.isFinite(previsti) && previsti > 0 ? Math.floor(previsti) : 0;
    const daAdottare = Math.max(0, previstiSafe - adottati);
    return {
      eli: typeof atto.eli === "string" && atto.eli ? atto.eli : "/eli/legge/1948/1",
      nir: typeof atto.nir === "string" ? atto.nir : "",
      tipo,
      numero,
      dataEmanazione,
      titolo,
      sintesi,
      stato: "in_vigore",
      gulpease: gulpeaseDi(testo, sintesi),
      fonti: buildFonti({ tipo, numero, dataEmanazione }),
      air: (atto as AttoEspanso).air === true ? "presente" : "assente",
      attuativi: { daAdottare, adottati, scaduti: 0 },
      fiducia: atto.fiducia === true,
      omnibus: atto.omnibus === true,
      testo,
      // Solo gli atti di riferimento marcati esplicitamente `false` sono
      // non-dimostrativi; qualsiasi input parziale resta dimostrativo.
      dimostrativo: atto.dimostrativo !== false,
    };
  } catch {
    return recordFallback();
  }
}

// ---------------------------------------------------------------------------
// Env + cache singleton (SSR-safe).
// ---------------------------------------------------------------------------

function leggiTotaleDaEnv(): number {
  try {
    let raw: unknown = undefined;
    if (typeof process !== "undefined" && (process as { env?: Record<string, string | undefined> })?.env) {
      raw = (process as { env: Record<string, string | undefined> }).env["CORPUS_TOTALE"];
    }
    if (raw === undefined || raw === null || raw === "") return CORPUS_TOTALE_DEFAULT;
    const n = typeof raw === "number" ? Math.floor(raw) : Number.parseInt(String(raw), 10);
    if (!Number.isFinite(n)) return CORPUS_TOTALE_DEFAULT;
    if (n < CORPUS_TOTALE_MIN) return CORPUS_TOTALE_MIN;
    if (n > CORPUS_TOTALE_MAX) return CORPUS_TOTALE_MAX;
    return Math.floor(n);
  } catch {
    return CORPUS_TOTALE_DEFAULT;
  }
}

function leggiSemeDaEnv(): string {
  try {
    let raw: unknown = undefined;
    if (typeof process !== "undefined" && (process as { env?: Record<string, string | undefined> })?.env) {
      raw = (process as { env: Record<string, string | undefined> }).env["CORPUS_SEED"];
    }
    if (typeof raw !== "string") return CORPUS_SEED_DEFAULT;
    const pulito = raw.trim().slice(0, 80);
    return pulito.length > 0 ? pulito : CORPUS_SEED_DEFAULT;
  } catch {
    return CORPUS_SEED_DEFAULT;
  }
}

function normalizzaTotale(totale: unknown): number {
  const n = typeof totale === "number" ? Math.floor(totale) : Number.parseInt(String(totale), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > CORPUS_TOTALE_MAX) return CORPUS_TOTALE_MAX;
  return Math.floor(n);
}

function normalizzaSeme(seme: unknown): string {
  if (typeof seme !== "string") return CORPUS_SEED_DEFAULT;
  const pulito = seme.trim().slice(0, 80);
  return pulito.length > 0 ? pulito : CORPUS_SEED_DEFAULT;
}

type CacheGlobale = { __simpleLawCorpusUnificato?: Map<string, LawRecord[]> };

function ottieniCache(): Map<string, LawRecord[]> {
  try {
    const g = globalThis as unknown as CacheGlobale;
    if (!g.__simpleLawCorpusUnificato) g.__simpleLawCorpusUnificato = new Map<string, LawRecord[]>();
    return g.__simpleLawCorpusUnificato;
  } catch {
    return new Map<string, LawRecord[]>();
  }
}

function clonaRecord(r: LawRecord): LawRecord {
  return {
    ...r,
    fonti: r.fonti ? { ...r.fonti } : null,
    attuativi: r.attuativi ? { ...r.attuativi } : undefined,
  };
}

function clonaDifensiva(lista: LawRecord[]): LawRecord[] {
  return lista.map(clonaRecord);
}

function estraiSlugEli(eli: string): string {
  try {
    const parti = eli.split("/");
    if (parti.length === 5 && parti[2].length > 0) return parti[2];
    return "legge";
  } catch {
    return "legge";
  }
}

// ---------------------------------------------------------------------------
// Generazione deterministica: 72 curati + varianti fino a `totale`.
// ---------------------------------------------------------------------------

/**
 * Genera il corpus unificato in modo deterministico: prima i 72 atti curati
 * mappati, poi varianti inline fino a `totale`. Never-throw (-> []).
 * Le varianti riusano titolo/testo del modello con ELI/NIR unici; i numeri
 * riservati (8, 36, 124, 133, 139) non sono mai usati nelle varianti.
 */
export function generaCorpusUnificato(totale: number, seme: string): LawRecord[] {
  try {
    const t = normalizzaTotale(totale);
    const s = normalizzaSeme(seme);
    if (t <= 0) return [];
    const chiave = `${t}:${s}`;
    const cache = ottieniCache();
    const inCache = cache.get(chiave);
    if (inCache) return clonaDifensiva(inCache);

    const base = ATTI_ESPANSI.map(attoEspansoToLawRecord);
    if (t <= base.length) {
      const ridotto = base.slice(0, t);
      cache.set(chiave, ridotto);
      return clonaDifensiva(ridotto);
    }

    const risultato: LawRecord[] = [...base];
    const visti = new Set<string>(base.map((r) => r.eli.trim().toLowerCase()));
    const riservati = new Set<number>(NUMERI_RISERVATI as readonly number[] as number[]);

    const rnd = mulberry32(fnv1a(`simple-law-corpus:${s}`));
    const limiteTentativi = t * 12 + 2000;
    let tentativi = 0;
    while (risultato.length < t && tentativi < limiteTentativi) {
      tentativi += 1;
      const indice = Math.floor(rnd() * ATTI_ESPANSI.length) % ATTI_ESPANSI.length;
      const modello = ATTI_ESPANSI[indice] as AttoEspanso;
      const modelloRecord = base[indice] as LawRecord;
      const anno = 1948 + Math.floor(rnd() * (2026 - 1948 + 1));
      const numeroNum = 1000 + Math.floor(rnd() * 19000);
      if (riservati.has(numeroNum)) continue;
      const slugEli = estraiSlugEli(modello.eli);
      const eli = `/eli/${slugEli}/${anno}/${numeroNum}`;
      const chiaveEli = eli.toLowerCase();
      if (visti.has(chiaveEli)) continue;
      const mese = 1 + Math.floor(rnd() * 12);
      const giorno = 1 + Math.floor(rnd() * 28);
      const dataEmanazione = `${anno}-${dueCifre(mese)}-${dueCifre(giorno)}`;
      // NIR in forma punteggiata (convenzione seed-data: `decreto.legge`).
      const slugNir = slugEli.replace(/-/g, ".");
      const nir = `urn:nir:stato:${slugNir}:${dataEmanazione};${numeroNum}`;
      const numero = String(numeroNum);
      const titolo = `${modello.titolo} — Variante ${risultato.length + 1}`;
      const testo =
        `${modello.testo}\n\n[Variante dimostrativa ${risultato.length + 1} del corpus "${s}", derivata da ${modello.eli}.]`;
      const variante: LawRecord = {
        ...clonaRecord(modelloRecord),
        eli,
        nir,
        numero,
        dataEmanazione,
        titolo,
        stato: "in_vigore",
        gulpease: gulpeaseDi(testo, modelloRecord.sintesi),
        fonti: buildFonti({ tipo: modelloRecord.tipo, numero, dataEmanazione }),
        testo,
        dimostrativo: true,
      };
      visti.add(chiaveEli);
      risultato.push(variante);
    }

    const finale = risultato.slice(0, t);
    cache.set(chiave, finale);
    return clonaDifensiva(finale);
  } catch {
    return [];
  }
}

/** Corpus da env `CORPUS_TOTALE`/`CORPUS_SEED`. Never-throw (-> []). */
export function getCorpusUnificato(): LawRecord[] {
  try {
    return generaCorpusUnificato(leggiTotaleDaEnv(), leggiSemeDaEnv());
  } catch {
    return [];
  }
}

/** Numero di record del corpus corrente. Never-throw (-> 0). */
export function contaCorpus(totale?: number, seme?: string): number {
  try {
    if (totale !== undefined || seme !== undefined) {
      const t = totale === undefined ? leggiTotaleDaEnv() : normalizzaTotale(totale);
      const s = seme === undefined ? leggiSemeDaEnv() : normalizzaSeme(seme);
      return generaCorpusUnificato(t, s).length;
    }
    return getCorpusUnificato().length;
  } catch {
    return 0;
  }
}

/** Svuota la cache singleton (utile nei test). Never-throw. */
export function svuotaCacheCorpus(): void {
  try {
    ottieniCache().clear();
  } catch {
    // mai lanciare
  }
}
