/**
 * GET /api/parlamento/gruppi?camera=
 * Conteggi dei gruppi calcolati dai membri reali (Camera: 13 gruppi;
 * Senato: conteggi correnti per gruppo; le denominazioni storiche con
 * inizio/fine restano nel file data/reali/senato-gruppi.json).
 * Mai 500: in caso di errore restituisce elenchi vuoti.
 */

import { NextResponse } from "next/server";
import { contaPerGruppo, tuttiDeputati, tuttiSenatori } from "@/lib/parlamento-dati";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cameraParam = (searchParams.get("camera") ?? "").trim().toLowerCase();
    const [deputati, senatori] = await Promise.all([tuttiDeputati(), tuttiSenatori()]);
    const camera = contaPerGruppo(deputati);
    const senato = contaPerGruppo(senatori);
    if (cameraParam === "camera") return NextResponse.json({ camera, senato: [] });
    if (cameraParam === "senato") return NextResponse.json({ camera: [], senato });
    return NextResponse.json({ camera, senato });
  } catch {
    return NextResponse.json({ camera: [], senato: [] });
  }
}
