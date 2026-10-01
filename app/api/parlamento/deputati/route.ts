/**
 * GET /api/parlamento/deputati?q=&gruppo=&page=&per=
 * Mai 500: in caso di errore restituisce l'elenco vuoto.
 */

import { NextResponse } from "next/server";
import { cercaMembri, filtraPerGruppo, pagina, tuttiDeputati } from "@/lib/parlamento-dati";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function intero(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").slice(0, 100);
    const gruppo = (searchParams.get("gruppo") ?? "").slice(0, 80);
    const page = intero(searchParams.get("page"), 1, 1, 10000);
    const per = intero(searchParams.get("per"), 24, 1, 100);

    let base = await tuttiDeputati();
    base = gruppo ? filtraPerGruppo(base, gruppo) : base;
    const filtrati = cercaMembri(base, q);
    const totale = filtrati.length;
    const items = pagina(filtrati, page, per);
    return NextResponse.json({ items, total: totale, page, per, count: totale });
  } catch {
    return NextResponse.json({ items: [], total: 0, page: 1, per: 24, count: 0 });
  }
}
