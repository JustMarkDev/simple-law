/**
 * GET /api/eurlex?q=&tipo=&page=&per=
 * Atti UE 2026 da EUR-Lex CELLAR (fase-1: metadati, titoli in inglese).
 * Mai 500: in caso di errore restituisce l'elenco vuoto.
 */

import { NextResponse } from "next/server";
import {
  cercaAttiUe,
  filtraPerTipoUe,
  leggiProvenanceEurlex,
  paginaUe,
  tuttiAttiUe,
} from "@/lib/eurlex-dati";

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
    const tipo = (searchParams.get("tipo") ?? "").slice(0, 10);
    const page = intero(searchParams.get("page"), 1, 1, 1000);
    const perGrezzo = intero(searchParams.get("per"), 20, 1, 50);
    const per = (PER_AMMESSI as readonly number[]).includes(perGrezzo) ? perGrezzo : 20;
    const base = filtraPerTipoUe(await tuttiAttiUe(), tipo);
    const filtrati = cercaAttiUe(base, q);
    const totale = filtrati.length;
    const items = paginaUe(filtrati, page, per);
    let provenance: unknown = {};
    try {
      provenance = await leggiProvenanceEurlex();
    } catch {
      provenance = {};
    }
    return NextResponse.json({ items, total: totale, page, per, count: totale, provenance });
  } catch {
    return NextResponse.json({ items: [], total: 0, page: 1, per: 20, count: 0, provenance: {} });
  }
}
