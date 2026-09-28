/**
 * GET /api/consulta?q=&tipologia=&page=&per=
 * Pronunce della Corte Costituzionale (anno 2001, open data).
 * Mai 500: in caso di errore restituisce l'elenco vuoto.
 */

import { NextResponse } from "next/server";
import {
  cercaPronunce,
  filtraPerTipologia,
  leggiProvenanceConsulta,
  pagina,
  tuttePronunce,
} from "@/lib/consulta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PER_AMMESSI = [10, 20, 50] as const;

function intero(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").slice(0, 100);
    const tipologia = (searchParams.get("tipologia") ?? "").slice(0, 4).toUpperCase();
    const page = intero(searchParams.get("page"), 1, 1, 1000);
    const perGrezzo = intero(searchParams.get("per"), 20, 1, 50);
    const per = (PER_AMMESSI as readonly number[]).includes(perGrezzo) ? perGrezzo : 20;
    let base = await tuttePronunce();
    if (tipologia) base = filtraPerTipologia(base, tipologia);
    const filtrate = cercaPronunce(base, q);
    const totale = filtrate.length;
    const items = pagina(filtrate, page, per);
    let provenance: unknown = {};
    try {
      provenance = await leggiProvenanceConsulta();
    } catch {
      provenance = {};
    }
    return NextResponse.json({ items, total: totale, page, per, count: totale, provenance });
  } catch {
    return NextResponse.json({ items: [], total: 0, page: 1, per: 20, count: 0, provenance: {} });
  }
}
