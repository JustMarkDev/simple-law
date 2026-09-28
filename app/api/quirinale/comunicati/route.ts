/**
 * GET /api/quirinale/comunicati?q=&page=&per=
 * Comunicati del Quirinale (non-leggi). Mai 500: errore -> elenco vuoto.
 */

import { NextResponse } from "next/server";
import {
  cercaQuirinale,
  leggiProvenanceQuirinale,
  tuttiComunicatiQuirinale,
} from "@/lib/quirinale-dati";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PER_AMMESSI = [10, 20, 25] as const;

function intero(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").slice(0, 100);
    const page = intero(searchParams.get("page"), 1, 1, 100);
    const perGrezzo = intero(searchParams.get("per"), 20, 1, 25);
    const per = (PER_AMMESSI as readonly number[]).includes(perGrezzo) ? perGrezzo : 20;
    const base = await tuttiComunicatiQuirinale();
    const filtrati = cercaQuirinale(base, q);
    const totale = filtrati.length;
    const items = filtrati.slice((page - 1) * per, page * per);
    let provenance: unknown = {};
    try {
      provenance = await leggiProvenanceQuirinale();
    } catch {
      provenance = {};
    }
    return NextResponse.json({ items, total: totale, page, per, count: totale, provenance });
  } catch {
    return NextResponse.json({ items: [], total: 0, page: 1, per: 20, count: 0, provenance: {} });
  }
}
