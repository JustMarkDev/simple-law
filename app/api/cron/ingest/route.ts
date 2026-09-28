import { NextResponse } from "next/server";
import { getPrisma, persistLaws, recordIngestRun } from "@/lib/db";
import { fetchGovernoComunicati, getSeedLaws } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/ingest (Vercel Cron)
 * Recupera i comunicati del Governo e persiste le norme in DB quando presente.
 * Restituisce sempre HTTP 200 per non far fallire il cron, tranne 401 quando
 * CRON_SECRET e' configurato e l'header Authorization manca o e' errato.
 */
export async function GET(request: Request) {
  const segreto = process.env.CRON_SECRET?.trim();
  if (segreto) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${segreto}`) {
      return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
  }
  const startedAt = new Date();
  try {
    const comunicati = await fetchGovernoComunicati(20);
    const leggi = getSeedLaws();
    const scritti = await persistLaws(leggi);

    await recordIngestRun({
      source: "governo+seed",
      status: "ok",
      detail: `comunicati=${comunicati.length}; leggiPerse=${scritti}; db=${getPrisma() ? "on" : "off"}`,
      startedAt,
    });

    return NextResponse.json({
      ok: true,
      comunicati: comunicati.length,
      leggiPerse: scritti,
      db: Boolean(getPrisma()),
      time: new Date().toISOString(),
    });
  } catch (error) {
    const dettaglio = error instanceof Error ? error.message : "Errore sconosciuto";
    await recordIngestRun({ source: "governo+seed", status: "error", detail: dettaglio, startedAt });
    return NextResponse.json({ ok: false, error: dettaglio, db: Boolean(getPrisma()) });
  }
}
