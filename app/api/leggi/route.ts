import { NextResponse } from "next/server";
import { QUERY_CAP_MASSIMO, listLaws, queryLaws, sortLaws } from "@/lib/db";
import type { LawRecordExtra, LawSort } from "@/lib/db";
import { rankAndFilter } from "@/lib/search-rank";
import {
  coloreSemaforoRecord,
  personaRilevanteRecord,
} from "@/lib/filtri-leggi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SORTS: readonly LawSort[] = [
  "data_desc",
  "data_asc",
  "titolo_asc",
  "gulpease_desc",
  "qualita_desc",
];

function intero(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sortValido(value: string | null): LawSort {
  const grezzo = (value ?? "").trim() as LawSort;
  return SORTS.includes(grezzo) ? grezzo : "data_desc";
}

/** `true` se `sort` chiede l'ordinamento per rilevanza (`rilevanza` o alias `relevance`). */
function chiedeRilevanza(value: string | null): boolean {
  const grezzo = (value ?? "").trim().toLowerCase();
  return grezzo === "rilevanza" || grezzo === "relevance";
}

/** Filtro `stato`: stringa breve, confronto esatto case-insensitive. */
function parseStato(value: string | null): string {
  return (value ?? "").trim().slice(0, 80);
}

/* ---------------------------------------------------------------------------
 * Semaforo e persona: unica fonte di verita' `lib/filtri-leggi.ts`
 * (stesse semantiche di pagine e data layer). Puro, never-throw.
 * ------------------------------------------------------------------------- */

/**
 * Filtro `persona`: derivata condivisa (non colonna DB). Normalizza con
 * `trim+lower+slice(0,60)` e allowlist `guida|lavoro|impresa|studio|tutti|""`;
 * valori fuori allowlist diventano `""` (filtro ignorato, mai errore).
 */
function parsePersona(value: string | null): string {
  const p = (value ?? "").trim().toLowerCase().slice(0, 60);
  if (p === "" || p === "tutti") return p;
  if (p === "guida" || p === "lavoro" || p === "impresa" || p === "studio") return p;
  return "";
}

/** Filtro `minGulpease`: intero 0-100, `undefined` se assente o invalido. */
function parseMinGulpease(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return undefined;
  if (n <= 0) return 0;
  return Math.min(100, n);
}

/**
 * Post-filtri in-memory di fase 1 (`stato`, `minGulpease`, `persona`).
 * `stato` accetta sia lo stato record esatto (`in_vigore`, case-insensitive)
 * sia il colore del semaforo (`verde`/`giallo`/`rosso`, stessa regola di
 * `coloreSemaforoRecord`). `persona` usa `personaRilevanteRecord` su
 * `{numero,titolo,sintesi}` (mai scansione dell'intero record).
 * Non lancia: in caso di errore restituisce la lista invariata.
 */
function filtraAggiuntivi(
  items: LawRecordExtra[],
  filtro: { stato: string; minGulpease: number | undefined; persona: string },
): LawRecordExtra[] {
  try {
    const { stato, minGulpease, persona } = filtro;
    const statoNorm = stato.toLowerCase();
    return items.filter((item) => {
      try {
        if (statoNorm) {
          const s = typeof item.stato === "string" ? item.stato.toLowerCase() : "";
          if (statoNorm === "verde" || statoNorm === "giallo" || statoNorm === "rosso") {
            if (coloreSemaforoRecord(item) !== statoNorm) return false;
          } else if (s !== statoNorm) {
            return false;
          }
        }
        if (minGulpease !== undefined) {
          const g = typeof item.gulpease === "number" ? item.gulpease : null;
          if (g === null || !Number.isFinite(g) || g < minGulpease) return false;
        }
        if (persona && persona !== "tutti") {
          if (
            !personaRilevanteRecord(
              { numero: item.numero, titolo: item.titolo, sintesi: item.sintesi },
              persona,
            )
          ) {
            return false;
          }
        }
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return items;
  }
}

/**
 * GET /api/leggi
 * Filtri: `q` (max 200, ranking se >=2 caratteri), `tipo`, `anno`,
 * `stato` (stato record esatto come `in_vigore`, oppure colore del semaforo
 * `verde`/`giallo`/`rosso`), `minGulpease` (0-100),
 * `persona` (derivata condivisa `guida|lavoro|impresa|studio|tutti`, mai ignorata).
 * Paginazione: `page`, `per` (alias `limit`).
 * Ordinamento: `sort` (data_desc|data_asc|titolo_asc|gulpease_desc|qualita_desc
 *   |rilevanza, alias `relevance`). Con `q` presente il default e' `rilevanza`
 *   (BM25-lite titolo^3>sintesi^2>numero>tipo + bonus frase esatta tra virgolette);
 *   con query <2 caratteri si usa il fallback ILIKE del DB senza ranking.
 * Restituisce `{items,total,page,per}` (piu' `count` per retrocompatibilita'
 * e `sort` effettivo).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const perGrezzo = searchParams.get("per") ?? searchParams.get("limit");
    const q = (searchParams.get("q") ?? "").slice(0, 200);
    const tipo = (searchParams.get("tipo") ?? "").slice(0, 80);
    const anno = searchParams.get("anno") ?? "";
    const stato = parseStato(searchParams.get("stato"));
    const persona = parsePersona(searchParams.get("persona"));
    const minGulpease = parseMinGulpease(searchParams.get("minGulpease"));
    const page = intero(searchParams.get("page"), 1, 1, 10000);
    const per = intero(perGrezzo, 20, 1, 200);
    const sortParam = searchParams.get("sort");
    const haNuoviFiltri = stato !== "" || persona !== "" || minGulpease !== undefined;
    const rilevanzaRichiesta = chiedeRilevanza(sortParam);
    const sortEsplicito = (sortParam ?? "").trim() !== "";
    // Default: con `q` (>=2 char) ordina per rilevanza, altrimenti per data.
    const usaRilevanza =
      q.trim().length >= 2 && (rilevanzaRichiesta || !sortEsplicito);

    if (usaRilevanza || haNuoviFiltri) {
      // Finestra di ricerca/ranking esatta fino a QUERY_CAP_MASSIMO (copre
      // il corpus massimo + margine: totali mai troncati in silenzio).
      // Pre-filtra sul DB per `tipo`/`anno` (e `persona` quando supportata
      // da `lib/db`), poi filtri in-memory con le semantiche condivise,
      // ranking BM25-lite e paginazione.
      // `persona` e' sempre riapplicata in memoria: mai ignorata.
      const sortLegacy = rilevanzaRichiesta || !sortEsplicito ? "data_desc" : sortValido(sortParam);
      const conPersona = { persona } as Partial<Parameters<typeof queryLaws>[0]>;
      const base = usaRilevanza
        ? await queryLaws({ tipo, anno, ...conPersona }, QUERY_CAP_MASSIMO)
        : await queryLaws({ q, tipo, anno, ...conPersona }, QUERY_CAP_MASSIMO);
      const filtrate = filtraAggiuntivi(base, { stato, minGulpease, persona });
      const ordinate = usaRilevanza ? rankAndFilter(filtrate, q) : sortLaws(filtrate, sortLegacy);
      const inizio = (page - 1) * per;
      const items = ordinate.slice(inizio, inizio + per);
      const sortEffettivo = usaRilevanza ? "rilevanza" : sortLegacy;
      return NextResponse.json(
        {
          items,
          total: ordinate.length,
          page,
          per,
          count: ordinate.length,
          sort: sortEffettivo,
        },
        { headers: { "X-Total-Count": String(ordinate.length) } },
      );
    }

    const legacy = sortValido(searchParams.get("sort"));
    const result = await listLaws({ q, tipo, anno, page, per, sort: legacy });

    return NextResponse.json(
      { ...result, count: result.total, sort: legacy },
      { headers: { "X-Total-Count": String(result.total) } },
    );
  } catch {
    return NextResponse.json(
      { items: [], total: 0, page: 1, per: 20, count: 0, sort: "data_desc" },
      { headers: { "X-Total-Count": "0" } },
    );
  }
}
