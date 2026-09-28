import { NextResponse } from "next/server";
import { getStats } from "@/lib/db";
import { ECONOMIA_AGGIORNATO_AL, ECONOMIA_SNAPSHOT } from "@/lib/stats";
import type { CorpusStats } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface EconomiaPayload {
  aggiornatoAl: string;
  nota: string;
  indicatori: typeof ECONOMIA_SNAPSHOT;
}

function economia(): EconomiaPayload {
  return {
    aggiornatoAl: ECONOMIA_AGGIORNATO_AL,
    nota: "Valori illustrativi, non aggiornati automaticamente: non sono un dato ufficiale.",
    indicatori: ECONOMIA_SNAPSHOT,
  };
}

/**
 * GET /api/statistiche
 * Aggregati del corpus normativo (per anno, tipo, Gulpease, attuativi, AIR,
 * qualita') + snapshot economico curato con fonte e periodo.
 * Risponde sempre 200.
 */
export async function GET() {
  const generatoIl = new Date().toISOString();
  try {
    const corpus: CorpusStats = await getStats();
    return NextResponse.json({ corpus, economia: economia(), generatoIl });
  } catch {
    return NextResponse.json({ corpus: null, economia: economia(), generatoIl });
  }
}
