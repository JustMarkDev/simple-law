/**
 * Accesso ai dati con fallback automatico al seed.
 *
 * Regola d'oro: nessuna funzione lancia errori. Se `DATABASE_URL` manca, o la
 * query fallisce, si restituiscono i dati seed. Cosi' l'app funziona sempre,
 * anche in anteprima Vercel senza database collegato.
 */

import { Prisma, PrismaClient } from "@prisma/client";
import type { Law as PrismaLaw, Minister as PrismaMinister } from "@prisma/client";
import { normalizeEli, parseNIR } from "./nir";
import { parseAnno, parseQualita, parseQuery, parseTipo } from "./validation";
import { getSeedLaws, getSeedMinisters } from "./sources";
import { buildStats } from "./stats";
import type { CorpusStats, StatLaw } from "./stats";
import type { AirStato, AttuativiInput } from "./quality";
import type { SimplifiedLaw } from "./simplify";
import type { Fonti, LawRecord, MinisterRecord } from "./seed-data";

/**
 * Campi aggiuntivi memorizzati nel blob `extra` di `Law` e opzionali su
 * `LawRecord`. Sono tutti pass-through: nessuna migrazione di schema.
 */
export interface SyncExtra {
  /** Codice redazionale della Gazzetta Ufficiale (es. `26G00155`). */
  codiceRedazionale?: string;
  /** Data di pubblicazione in Gazzetta (`YYYY-MM-DD`). */
  dataGU?: string;
  /** Numero della Gazzetta Ufficiale. */
  numeroGU?: string;
  /** Identificativo del dossier Camera, se disponibile. */
  cameraId?: string;
  /** Identificativo del dossier Senato, se disponibile. */
  senatoDid?: string;
  /** URN NIR di origine, quando diverso da `nir`. */
  urn?: string;
  /** Sorgente dell'ingest (es. `normattiva.storico`). */
  source?: string;
  /** Timestamp ISO dell'ultimo ingest. */
  syncedAt?: string;
  /** Semplificazione gia' calcolata al momento dell'ingest. */
  semplificata?: SimplifiedLaw;
  /** Punteggio di qualita' complessivo (0-100). */
  qualita?: number;
}

/** `LawRecord` arricchito con i campi extra pass-through. */
export type LawRecordExtra = LawRecord & SyncExtra;

interface PrismaGlobal {
  __simpleLawPrisma?: PrismaClient | null;
}

const prismaGlobal = globalThis as unknown as PrismaGlobal;

/**
 * Restituisce il client Prisma, oppure `null` se `DATABASE_URL` non e' configurato
 * o l'inizializzazione fallisce. Il client viene riusato tra le invocazioni.
 */
export function getPrisma(): PrismaClient | null {
  if (prismaGlobal.__simpleLawPrisma !== undefined) return prismaGlobal.__simpleLawPrisma;

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    prismaGlobal.__simpleLawPrisma = null;
    return null;
  }

  try {
    prismaGlobal.__simpleLawPrisma = new PrismaClient();
  } catch {
    prismaGlobal.__simpleLawPrisma = null;
  }
  return prismaGlobal.__simpleLawPrisma;
}

/** Azzera il singleton (utile nei test). Non lancia. */
export function resetPrisma(): void {
  const client = prismaGlobal.__simpleLawPrisma;
  if (client) {
    void client.$disconnect().catch(() => undefined);
  }
  prismaGlobal.__simpleLawPrisma = undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapFondi(value: unknown): Fonti | null {
  if (!isRecord(value)) return null;
  const fonti: Fonti = {};
  for (const chiave of ["normattiva", "gazzetta", "camera", "senato", "governo"] as const) {
    const v = value[chiave];
    if (typeof v === "string" && v) fonti[chiave] = v;
  }
  return Object.keys(fonti).length > 0 ? fonti : null;
}

const AIR_VALORI: readonly string[] = ["presente", "esente", "semplificata", "assente"];

function stringhe(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function recordDiStringhe(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((v) => typeof v === "string");
}

function coloreStato(value: unknown): value is SimplifiedLaw["statoLavora"]["colore"] {
  return value === "verde" || value === "giallo" || value === "rosso";
}

/** Valida il blob `semplificata` salvato in `extra` (forma di `SimplifiedLaw`). */
export function parseSemplificata(value: unknown): SimplifiedLaw | undefined {
  if (!isRecord(value)) return undefined;
  const stato = value.statoLavora;
  const proContro = value.proContro;
  if (typeof value.in10Secondi !== "string") return undefined;
  if (!recordDiStringhe(value.perTe)) return undefined;
  if (!stringhe(value.cosaFare)) return undefined;
  if (
    !isRecord(stato) ||
    !coloreStato(stato.colore) ||
    typeof stato.motivo !== "string"
  ) {
    return undefined;
  }
  if (
    !isRecord(proContro) ||
    !stringhe(proContro.pro) ||
    !stringhe(proContro.contro)
  ) {
    return undefined;
  }
  if (typeof value.gulpease !== "number" || !Number.isFinite(value.gulpease)) {
    return undefined;
  }
  return {
    in10Secondi: value.in10Secondi,
    perTe: value.perTe,
    cosaFare: value.cosaFare,
    statoLavora: { colore: stato.colore, motivo: stato.motivo },
    proContro: { pro: proContro.pro, contro: proContro.contro },
    gulpease: value.gulpease,
  };
}

function stringaExtra(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Legge i campi arricchiti (air, attuativi, testo, semplificata, ...) dal blob `extra`. Non lancia. */
function mapExtra(value: unknown): Partial<LawRecordExtra> {
  if (!isRecord(value)) return {};
  const extra: Partial<LawRecordExtra> = {};
  if (typeof value.air === "string" && AIR_VALORI.includes(value.air)) {
    extra.air = value.air as AirStato;
  }
  const att = value.attuativi;
  if (
    isRecord(att) &&
    typeof att.daAdottare === "number" &&
    typeof att.adottati === "number" &&
    typeof att.scaduti === "number"
  ) {
    const attuativi: AttuativiInput = {
      daAdottare: att.daAdottare,
      adottati: att.adottati,
      scaduti: att.scaduti,
    };
    extra.attuativi = attuativi;
  }
  if (typeof value.testo === "string" && value.testo) extra.testo = value.testo;
  if (typeof value.fiducia === "boolean") extra.fiducia = value.fiducia;
  if (typeof value.omnibus === "boolean") extra.omnibus = value.omnibus;
  if (typeof value.dimostrativo === "boolean") extra.dimostrativo = value.dimostrativo;

  const codiceRedazionale = stringaExtra(value.codiceRedazionale);
  if (codiceRedazionale) extra.codiceRedazionale = codiceRedazionale;
  const dataGU = stringaExtra(value.dataGU);
  if (dataGU) extra.dataGU = dataGU;
  const numeroGU = stringaExtra(value.numeroGU);
  if (numeroGU) extra.numeroGU = numeroGU;
  const cameraId = stringaExtra(value.cameraId);
  if (cameraId) extra.cameraId = cameraId;
  const senatoDid = stringaExtra(value.senatoDid);
  if (senatoDid) extra.senatoDid = senatoDid;
  const urn = stringaExtra(value.urn);
  if (urn) extra.urn = urn;
  const source = stringaExtra(value.source);
  if (source) extra.source = source;
  const syncedAt = stringaExtra(value.syncedAt);
  if (syncedAt) extra.syncedAt = syncedAt;
  if (typeof value.qualita === "number" && Number.isFinite(value.qualita)) {
    const q = parseQualita(value.qualita);
    if (q !== undefined) extra.qualita = q;
  }
  const semplificata = parseSemplificata(value.semplificata);
  if (semplificata) extra.semplificata = semplificata;

  return extra;
}

/** Converte una riga DB in LawRecord, inclusi i campi arricchiti. Esportata per i test. */
export function mapLaw(row: PrismaLaw): LawRecordExtra {
  return {
    eli: row.eli,
    nir: row.nir,
    tipo: row.tipo,
    numero: row.numero,
    dataEmanazione: row.dataEmanazione.toISOString().slice(0, 10),
    titolo: row.titolo,
    sintesi: row.sintesi,
    stato: row.stato,
    gulpease: row.gulpease ?? null,
    fonti: mapFondi(row.fonti),
    ...mapExtra(row.extra),
  };
}

function mapMinister(row: PrismaMinister, provvedimenti: Map<string, string[]>): MinisterRecord {
  return {
    slug: row.slug,
    nome: row.nome,
    dicastero: row.dicastero,
    partito: row.partito ?? null,
    competenze: row.competenze ?? [],
    provvedimenti: provvedimenti.get(row.slug) ?? [],
  };
}

/** Legge tutte le norme dal DB; se il DB manca o e' vuoto, usa il seed. */
export async function getLawsFromDBorSeed(): Promise<LawRecordExtra[]> {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.law.findMany({ orderBy: { dataEmanazione: "desc" } });
      if (rows.length > 0) return rows.map(mapLaw);
    } catch {
      // fallback al seed
    }
  }
  return getSeedLaws();
}

function candidatiEli(eli: string): string[] {
  const grezzo = (eli ?? "").trim();
  if (!grezzo) return [];
  const path = normalizeEli(grezzo);
  const base = new Set<string>([grezzo, path]);
  if (!path.endsWith("/")) base.add(`${path}/`);
  if (!path.startsWith("/")) base.add(`/${path}`);
  const candidati = new Set<string>();
  for (const voce of base) {
    if (!voce) continue;
    candidati.add(voce);
    candidati.add(voce.toLowerCase());
  }
  return [...candidati];
}

/**
 * Cerca una norma per ELI o NIR. Cerca prima nel DB, poi nel seed.
 * Il confronto ELI e' case-insensitive. Restituisce `null` se non trovata.
 */
export async function getLawByEli(eli: string): Promise<LawRecordExtra | null> {
  const grezzo = (eli ?? "").trim();
  if (!grezzo || grezzo.length > 500) return null;
  const candidati = candidatiEli(grezzo);
  if (candidati.length === 0) return null;
  const nirParts = parseNIR(grezzo);

  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.law.findFirst({
        where: {
          OR: [
            ...candidati.map((candidato) => ({
              eli: { equals: candidato, mode: "insensitive" as const },
            })),
            { eli: { in: candidati } },
            { nir: grezzo },
            ...(nirParts ? [{ nir: candidati[0] ?? grezzo }] : []),
          ],
        },
      });
      if (row) return mapLaw(row);
    } catch {
      // fallback al seed
    }
  }

  const pathCercato = normalizeEli(grezzo).toLowerCase();
  const candidatiLower = new Set(candidati.map((candidato) => candidato.toLowerCase()));
  const leggi = getSeedLaws();
  return (
    leggi.find((law) => candidatiLower.has(law.eli.toLowerCase())) ??
    leggi.find((law) => law.nir === grezzo) ??
    leggi.find((law) => normalizeEli(law.eli).toLowerCase() === pathCercato) ??
    null
  );
}

/** Elenca i ministri dal DB (con provvedimenti dal seed); fallback al seed. */
export async function listMinisters(): Promise<MinisterRecord[]> {
  const prisma = getPrisma();
  const provvedimenti = new Map(getSeedMinisters().map((m) => [m.slug, m.provvedimenti]));
  if (prisma) {
    try {
      const rows = await prisma.minister.findMany({ orderBy: { dicastero: "asc" } });
      if (rows.length > 0) return rows.map((row) => mapMinister(row, provvedimenti));
    } catch {
      // fallback al seed
    }
  }
  return getSeedMinisters();
}

/** Recupera un singolo ministro per slug; `null` se non trovato. */
export async function getMinisterBySlug(slug: string): Promise<MinisterRecord | null> {
  const cercato = (slug ?? "").trim().toLowerCase();
  if (!cercato) return null;
  const ministri = await listMinisters();
  return ministri.find((m) => m.slug.toLowerCase() === cercato) ?? null;
}

/** Prepara i dati per l'upsert Prisma, inclusi i campi arricchiti in `extra`. Esportata per i test. */
export function toPrismaData(law: LawRecordExtra) {
  const data = new Date(`${law.dataEmanazione}T00:00:00Z`);
  const extra: Record<string, unknown> = {};
  if (law.air !== undefined) extra.air = law.air;
  if (law.attuativi !== undefined) extra.attuativi = law.attuativi;
  if (law.testo !== undefined) extra.testo = law.testo;
  if (law.fiducia !== undefined) extra.fiducia = law.fiducia;
  if (law.omnibus !== undefined) extra.omnibus = law.omnibus;
  if (law.dimostrativo !== undefined) extra.dimostrativo = law.dimostrativo;

  const stringheExtra: readonly (keyof SyncExtra)[] = [
    "codiceRedazionale",
    "dataGU",
    "numeroGU",
    "cameraId",
    "senatoDid",
    "urn",
    "source",
    "syncedAt",
  ];
  for (const chiave of stringheExtra) {
    const valore = law[chiave];
    if (typeof valore === "string" && valore) extra[chiave] = valore;
  }
  if (law.qualita !== undefined) extra.qualita = law.qualita;
  if (law.semplificata !== undefined) extra.semplificata = law.semplificata;

  return {
    nir: law.nir,
    tipo: law.tipo,
    numero: law.numero,
    dataEmanazione: Number.isNaN(data.getTime()) ? new Date(0) : data,
    titolo: law.titolo,
    sintesi: law.sintesi,
    stato: law.stato,
    gulpease: law.gulpease,
    fonti: law.fonti ? (law.fonti as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
    extra:
      Object.keys(extra).length > 0
        ? (extra as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
  };
}

/** Salva/aggiorna un elenco di norme. Restituisce quante ne ha scritte (0 senza DB).
 * Deduplica per ELI e procede in sequenza per non sovraccaricare il pool;
 * il singolo errore non interrompe l'ingest (contratto never-throw). */
export async function persistLaws(laws: LawRecordExtra[]): Promise<number> {
  const prisma = getPrisma();
  if (!prisma || laws.length === 0) return 0;
  const visti = new Set<string>();
  const coda = laws.filter((law) => {
    const chiave = (law.eli ?? "").trim();
    if (!chiave || chiave.length > 500 || visti.has(chiave)) return false;
    visti.add(chiave);
    return true;
  });
  let scritti = 0;
  for (const law of coda) {
    try {
      const data = toPrismaData(law);
      await prisma.law.upsert({
        where: { eli: law.eli },
        create: { eli: law.eli, ...data },
        update: data,
      });
      scritti += 1;
    } catch {
      // salta la singola norma senza interrompere l'ingest
    }
  }
  return scritti;
}

/* ---------------------------------------------------------------------------
 * Query, paginazione e statistiche.
 * ------------------------------------------------------------------------- */

export type LawSort =
  | "data_desc"
  | "data_asc"
  | "titolo_asc"
  | "gulpease_desc"
  | "qualita_desc";

export interface LawFilters {
  q?: string;
  tipo?: string;
  anno?: string | number;
}

export interface ListLawsParams extends LawFilters {
  page?: number;
  per?: number;
  sort?: LawSort;
}

export interface ListLawsResult {
  items: LawRecordExtra[];
  total: number;
  page: number;
  per: number;
}

export const MAX_PER_PAGE = 200;

interface FiltriNormalizzati {
  q: string;
  tipo: string;
  anno: string;
}

function normalizzaFiltri(filters: LawFilters): FiltriNormalizzati {
  return {
    q: parseQuery(filters.q ?? "").toLowerCase(),
    tipo: parseTipo(filters.tipo ?? ""),
    anno: parseAnno(filters.anno),
  };
}

function testiRicerca(law: LawRecordExtra): string[] {
  return (["titolo", "sintesi", "numero", "tipo", "nir", "eli"] as const)
    .map((campo) => law[campo])
    .filter((campo): campo is string => typeof campo === "string")
    .map((campo) => campo.toLowerCase());
}

/** Verifica se una norma soddisfa `q`, `tipo` e `anno`. Pura. */
export function matchesFilters(law: LawRecordExtra, filters: LawFilters): boolean {
  const { q, tipo, anno } = normalizzaFiltri(filters);
  if (tipo && !law.tipo.toLowerCase().includes(tipo)) return false;
  if (anno && !law.dataEmanazione.startsWith(anno)) return false;
  if (q && !testiRicerca(law).some((campo) => campo.includes(q))) return false;
  return true;
}

/** Ordina una lista di norme secondo `sort`. Pura (restituisce una copia). */
export function sortLaws(items: LawRecordExtra[], sort: LawSort = "data_desc"): LawRecordExtra[] {
  const copia = [...items];
  switch (sort) {
    case "data_asc":
      copia.sort(
        (a, b) => a.dataEmanazione.localeCompare(b.dataEmanazione) || a.eli.localeCompare(b.eli),
      );
      break;
    case "titolo_asc":
      copia.sort((a, b) => a.titolo.localeCompare(b.titolo, "it") || a.eli.localeCompare(b.eli));
      break;
    case "gulpease_desc":
      copia.sort(
        (a, b) => (b.gulpease ?? -1) - (a.gulpease ?? -1) || a.eli.localeCompare(b.eli),
      );
      break;
    case "qualita_desc":
      copia.sort((a, b) => (b.qualita ?? -1) - (a.qualita ?? -1) || a.eli.localeCompare(b.eli));
      break;
    case "data_desc":
    default:
      copia.sort(
        (a, b) => b.dataEmanazione.localeCompare(a.dataEmanazione) || a.eli.localeCompare(b.eli),
      );
  }
  return copia;
}

function wherePrisma(filters: LawFilters): Prisma.LawWhereInput {
  const { q, tipo, anno } = normalizzaFiltri(filters);
  const where: Prisma.LawWhereInput = {};
  if (tipo) where.tipo = { contains: tipo, mode: "insensitive" };
  if (anno) {
    where.dataEmanazione = {
      gte: new Date(`${anno}-01-01T00:00:00.000Z`),
      lt: new Date(`${Number(anno) + 1}-01-01T00:00:00.000Z`),
    };
  }
  if (q) {
    where.OR = [
      { titolo: { contains: q, mode: "insensitive" } },
      { sintesi: { contains: q, mode: "insensitive" } },
      { numero: { contains: q, mode: "insensitive" } },
      { tipo: { contains: q, mode: "insensitive" } },
      { nir: { contains: q, mode: "insensitive" } },
      { eli: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

function orderByPrisma(sort: LawSort): Prisma.LawOrderByWithRelationInput[] {
  switch (sort) {
    case "data_asc":
      return [{ dataEmanazione: "asc" }, { eli: "asc" }];
    case "titolo_asc":
      return [{ titolo: "asc" }, { eli: "asc" }];
    case "gulpease_desc":
      return [{ gulpease: "desc" }, { eli: "asc" }];
    case "data_desc":
    default:
      return [{ dataEmanazione: "desc" }, { eli: "asc" }];
  }
}

/** Carica l'intero corpus dal DB (se popolato) oppure dal seed. Non lancia. */
async function caricaBase(): Promise<LawRecordExtra[]> {
  return getLawsFromDBorSeed();
}

/**
 * Elenca le norme con filtri, ordinamento e paginazione. Usa il DB quando
 * disponibile e popolato; altrimenti filtra il seed in memoria. Non lancia.
 */
export async function listLaws(params: ListLawsParams = {}): Promise<ListLawsResult> {
  const page = Math.min(10000, Math.max(1, Math.floor(params.page ?? 1) || 1));
  const perRichiesti = Math.floor(params.per ?? 20) || 20;
  const per = Math.min(MAX_PER_PAGE, Math.max(1, perRichiesti));
  const sort = params.sort ?? "data_desc";

  // La qualita' vive nel blob JSON: per ordinarla servono tutti i record.
  if (sort !== "qualita_desc") {
    const prisma = getPrisma();
    if (prisma) {
      try {
        const totaleDb = await prisma.law.count();
        if (totaleDb > 0) {
          const where = wherePrisma(params);
          const [total, rows] = await Promise.all([
            prisma.law.count({ where }),
            prisma.law.findMany({
              where,
              orderBy: orderByPrisma(sort),
              skip: (page - 1) * per,
              take: per,
            }),
          ]);
          return { items: rows.map(mapLaw), total, page, per };
        }
      } catch {
        // fallback al seed
      }
    }
  }

  const laws = await caricaBase();
  const filtrate = sortLaws(
    laws.filter((law) => matchesFilters(law, params)),
    sort,
  );
  const inizio = (page - 1) * per;
  return { items: filtrate.slice(inizio, inizio + per), total: filtrate.length, page, per };
}

/** Conta le norme che soddisfano i filtri. Non lancia. */
export async function countLaws(filters: LawFilters = {}): Promise<number> {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const where = wherePrisma(filters);
      const isVuoto = Object.keys(where).length === 0;
      const totaleDb = await prisma.law.count();
      if (totaleDb > 0) {
        if (isVuoto) return totaleDb;
        return await prisma.law.count({ where });
      }
    } catch {
      // fallback al seed
    }
  }
  return getSeedLaws().filter((law) => matchesFilters(law, filters)).length;
}

/**
 * Restituisce tutte le norme filtrate (ordinate per data) fino a `limit`.
 * Pensata per l'export: non applica la paginazione della lista.
 * Usa il DB con filtri server-side quando disponibile (evita full-scan),
 * altrimenti filtra il seed in memoria. Non lancia mai.
 */
export async function queryLaws(
  filters: LawFilters = {},
  limit = 5000,
): Promise<LawRecordExtra[]> {
  const cap = Math.min(5000, Math.max(1, Math.floor(limit) || 5000));
  const prisma = getPrisma();
  if (prisma) {
    try {
      const totaleDb = await prisma.law.count();
      if (totaleDb > 0) {
        const rows = await prisma.law.findMany({
          where: wherePrisma(filters),
          orderBy: [{ dataEmanazione: "desc" }, { eli: "asc" }],
          take: cap,
        });
        return rows.map(mapLaw);
      }
    } catch {
      // fallback al seed sotto
    }
  }
  const laws = await caricaBase();
  return sortLaws(
    laws.filter((law) => matchesFilters(law, filters)),
    "data_desc",
  ).slice(0, cap);
}

/** Aggregati del corpus (per anno, tipo, Gulpease, attuativi, AIR, qualita'). Non lancia. */
export async function getStats(): Promise<CorpusStats> {
  const laws = await getLawsFromDBorSeed();
  return buildStats(laws as StatLaw[]);
}

export interface IngestRunInput {
  source: string;
  status: "ok" | "error" | "skipped";
  detail?: string;
  startedAt?: Date;
}

/** Registra una esecuzione di ingest. Restituisce `false` senza DB. */
export async function recordIngestRun(input: IngestRunInput): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) return false;
  try {
    await prisma.ingestRun.create({
      data: {
        source: input.source,
        status: input.status,
        detail: input.detail ?? null,
        startedAt: input.startedAt ?? new Date(),
        finishedAt: new Date(),
      },
    });
    return true;
  } catch {
    return false;
  }
}
