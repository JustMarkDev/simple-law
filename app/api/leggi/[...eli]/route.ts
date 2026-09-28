import { NextResponse } from "next/server";
import { getLawByEli } from "@/lib/db";
import { scoreQuality } from "@/lib/quality";
import { simplifyLaw } from "@/lib/simplify";
import { normalizeLaw } from "@/components/seed-fallback";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ eli: string[] }>;
}

/**
 * GET /api/leggi/eli/id/2026/... (l'ELI contiene slash: catch-all) -> dettaglio.
 * Se l'atto e' stato sincronizzato, usa la semplificazione e la qualita'
 * memorizzate in `extra`; altrimenti le calcola al volo dall'euristica.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { eli } = await context.params;
    const path = (eli ?? []).join("/");
    const { searchParams } = new URL(request.url);
    const chiave = (searchParams.get("eli") ?? path).slice(0, 500);

    const law = await getLawByEli(chiave);
    if (!law) {
      return NextResponse.json({ error: "Norma non trovata" }, { status: 404 });
    }

    const testo = law.testo ?? `${law.titolo}. ${law.sintesi}`;
    const attuativi = law.attuativi ?? { daAdottare: 0, adottati: 0, scaduti: 0 };

    const derivata = simplifyLaw({
      titolo: law.titolo,
      testo,
      eli: law.eli,
      air: law.air,
      attuativi,
    });
    // Parita' con la UI: la semplificazione memorizzata prevale, ma le chiavi
    // `perTe` mancanti vengono riempite dalla versione derivata.
    const simplified = law.semplificata
      ? {
          ...derivata,
          ...law.semplificata,
          perTe: { ...derivata.perTe, ...law.semplificata.perTe },
        }
      : derivata;

    const qualitaCalcolata = scoreQuality({
      testo,
      attuativi,
      air: law.air ?? "assente",
      fiducia: law.fiducia ?? false,
      omnibus: law.omnibus ?? false,
    });
    const quality =
      typeof law.qualita === "number" && Number.isFinite(law.qualita)
        ? { ...qualitaCalcolata, totale: Math.round(law.qualita) }
        : qualitaCalcolata;

    return NextResponse.json({
      law,
      /** Forma normalizzata per la UI (semaforo, 5 riquadri, persone). */
      ui: normalizeLaw(law),
      simplified,
      quality,
      fonti: law.fonti,
      memorizzata: Boolean(law.semplificata),
    });
  } catch {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }
}
