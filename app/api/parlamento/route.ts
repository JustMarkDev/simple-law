/**
 * GET /api/parlamento?q=&camera=&gruppo=&page=&per=
 * Elenco unificato di deputati e senatori (legislatura 19) dai dati reali.
 * Mai 500: in caso di errore restituisce l'elenco vuoto.
 */

import { NextResponse } from "next/server";
import {
  cercaMembri,
  filtraPerGruppo,
  pagina,
  tuttiDeputati,
  tuttiSenatori,
  type Membro,
} from "@/lib/parlamento-dati";

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
    const cameraParam = (searchParams.get("camera") ?? "").trim().toLowerCase();
    const gruppo = (searchParams.get("gruppo") ?? "").slice(0, 80);
    const page = intero(searchParams.get("page"), 1, 1, 10000);
    const per = intero(searchParams.get("per"), 24, 1, 100);

    let base: Membro[] = [];
    try {
      const [deputati, senatori] = await Promise.all([tuttiDeputati(), tuttiSenatori()]);
      if (cameraParam === "camera") base = deputati;
      else if (cameraParam === "senato") base = senatori;
      else base = [...deputati, ...senatori];
    } catch {
      base = [];
    }
    let filtrati = gruppo ? filtraPerGruppo(base, gruppo) : [...base];
    filtrati = cercaMembri(filtrati, q);
    const totale = filtrati.length;
    const items = pagina(filtrati, page, per);
    return NextResponse.json({ items, total: totale, page, per, count: totale });
  } catch {
    return NextResponse.json({ items: [], total: 0, page: 1, per: 24, count: 0 });
  }
}
