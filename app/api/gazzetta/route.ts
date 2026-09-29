/**
 * GET /api/gazzetta - ultima Gazzetta Ufficiale (solo metadati + link).
 * Mai 500: in caso di errore restituisce payload vuoto.
 */

import { NextResponse } from "next/server";
import { caricaGazzettaUltima } from "@/lib/gazzetta-dati";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const dati = await caricaGazzettaUltima();
    if (!dati) {
      return NextResponse.json({
        testata: "",
        serie: "",
        numero: "",
        data: "",
        atti: [],
        total: 0,
        provenance: {},
      });
    }
    return NextResponse.json({ ...dati, total: dati.atti.length });
  } catch {
    return NextResponse.json({
      testata: "",
      serie: "",
      numero: "",
      data: "",
      atti: [],
      total: 0,
      provenance: {},
    });
  }
}
