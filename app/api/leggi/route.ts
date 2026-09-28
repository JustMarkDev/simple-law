import { NextResponse } from "next/server";
import { listLaws, queryLaws, sortLaws } from "@/lib/db";
import type { LawRecordExtra, LawSort } from "@/lib/db";
import { normalizeIT, rankAndFilter } from "@/lib/search-rank";

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

/** Filtro `persona`: stringa breve usata come match testuale in-memory. */
function parsePersona(value: string | null): string {
  return (value ?? "").trim().slice(0, 80);
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
 * Non lancia: in caso di errore restituisce la lista invariata.
 */
function filtraAggiuntivi(
  items: LawRecordExtra[],
  filtro: { stato: string; minGulpease: number | undefined; persona: string },
): LawRecordExtra[] {
  try {
    const { stato, minGulpease, persona } = filtro;
    const statoNorm = stato.toLowerCase();
    const personaNorm = normalizeIT(persona);
    return items.filter((item) => {
      try {
        if (statoNorm) {
          const s = typeof item.stato === "string" ? item.stato.toLowerCase() : "";
          if (s !== statoNorm) return false;
        }
        if (minGulpease !== undefined) {
          const g = typeof item.gulpease === "number" ? item.gulpease : null;
          if (g === null || !Number.isFinite(g) || g < minGulpease) return false;
        }
        if (personaNorm) {
          const extra: string = (() => {
            try {
              return JSON.stringify(item).slice(0, 4000);
            } catch {
              return "";
            }
          })();
          const testo = normalizeIT(
            `${item.titolo ?? ""} ${item.sintesi ?? ""} ${item.tipo ?? ""} ${item.numero ?? ""} ${extra}`,
          );
          if (!testo.includes(personaNorm)) return false;
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
 * `stato` (match esatto, es. `in vigore`), `minGulpease` (0-100),
 * `persona` (match testuale in-memory, es. `famiglie`).
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
      // Percorso bounded (max 5000): pre-filtra sul DB per `tipo`/`anno`,
      // poi filtri in-memory, ranking BM25-lite e paginazione.
      const sortLegacy = rilevanzaRichiesta || !sortEsplicito ? "data_desc" : sortValido(sortParam);
      const base = usaRilevanza
        ? await queryLaws({ tipo, anno }, 5000)
        : await queryLaws({ q, tipo, anno }, 5000);
      const filtrate = filtraAggiuntivi(base, { stato, minGulpease, persona });
      const ordinate = usaRilevanza ? rankAndFilter(filtrate, q) : sortLaws(filtrate, sortLegacy);
      const inizio = (page - 1) * per;
      const items = ordinate.slice(inizio, inizio + per);
      const sortEffettivo = usaRilevanza ? "rilevanza" : sortLegacy;
      return NextResponse.json({
        items,
        total: ordinate.length,
        page,
        per,
        count: ordinate.length,
        sort: sortEffettivo,
      });
    }

    const legacy = sortValido(searchParams.get("sort"));
    const result = await listLaws({ q, tipo, anno, page, per, sort: legacy });

    return NextResponse.json({ ...result, count: result.total, sort: legacy });
  } catch {
    return NextResponse.json({ items: [], total: 0, page: 1, per: 20, count: 0, sort: "data_desc" });
  }
}
