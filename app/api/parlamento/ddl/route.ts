/**
 * GET /api/parlamento/ddl?q=&fase=&ramo=&page=&per=
 * Disegni di legge (Senato) + atti (Camera), legislatura 19, dai dati reali.
 * Mai 500: in caso di errore restituisce l'elenco vuoto.
 * Ogni voce e' marcata `disegnoDiLegge: true` (non in vigore / iter in corso,
 * mai confondibile con le leggi); `statoIter` e' mostrato grezzo (raw).
 */

import { NextResponse } from "next/server";
import {
  cercaDdl,
  filtraPerFase,
  filtraPerRamo,
  paginaDdl,
  tuttiDdl,
  type VoceDdl,
} from "@/lib/ddl-dati";

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
    const fase = (searchParams.get("fase") ?? "").slice(0, 20);
    const ramo = (searchParams.get("ramo") ?? "").slice(0, 5);
    const page = intero(searchParams.get("page"), 1, 1, 10000);
    // Allineato a `paginaDdl` in lib/ddl-dati.ts (10|20|50, default 20):
    // la risposta riporta il `per` effettivo, mai uno diverso dal paginato.
    const perRichiesto = intero(searchParams.get("per"), 20, 1, 50);
    const per = [10, 20, 50].includes(perRichiesto) ? perRichiesto : 20;

    let base: VoceDdl[] = [];
    try {
      base = await tuttiDdl();
    } catch {
      base = [];
    }
    let filtrati = filtraPerRamo(base, ramo);
    filtrati = filtraPerFase(filtrati, fase.trim());
    filtrati = cercaDdl(filtrati, q);
    const totale = filtrati.length;
    const items = paginaDdl(filtrati, page, per);
    return NextResponse.json({ items, total: totale, page, per, count: totale });
  } catch {
    return NextResponse.json({ items: [], total: 0, page: 1, per: 20, count: 0 });
  }
}
