import { NextResponse } from "next/server";
import { listLaws } from "@/lib/db";
import type { LawSort } from "@/lib/db";

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

/**
 * GET /api/leggi
 * Filtri: `q`, `tipo`, `anno`. Paginazione: `page`, `per` (alias `limit`).
 * Ordinamento: `sort` (data_desc|data_asc|titolo_asc|gulpease_desc|qualita_desc).
 * Restituisce `{items,total,page,per}` (piu' `count` per retrocompatibilita').
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const perGrezzo = searchParams.get("per") ?? searchParams.get("limit");

    const result = await listLaws({
      q: (searchParams.get("q") ?? "").slice(0, 200),
      tipo: (searchParams.get("tipo") ?? "").slice(0, 80),
      anno: searchParams.get("anno") ?? "",
      page: intero(searchParams.get("page"), 1, 1, 10000),
      per: intero(perGrezzo, 20, 1, 200),
      sort: sortValido(searchParams.get("sort")),
    });

    return NextResponse.json({ ...result, count: result.total });
  } catch {
    return NextResponse.json({ items: [], total: 0, page: 1, per: 20, count: 0 });
  }
}
