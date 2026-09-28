/**
 * GET /api/elezioni/[id] — dettaglio aggregato di una consultazione.
 * v1: solo `europee-2024` (nazionale + regioni con per-lista, mai righe
 * candidato/nominativi). Query: `top` (1..15, default 15), `lista`
 * (contains sul nome lista, max 80 ch, applicato anche al per-lista
 * regionale). Id sconosciuto -> 404. Mai 500.
 */

import { NextResponse } from "next/server";
import {
  caricaEuropee2024,
  DISCLAIMER_AGGREGATI,
  ID_EUROPEE_2024,
  LICENZA_ELEZIONI,
  normalizza,
  topListe,
  type ListaRisultato,
} from "@/lib/elezioni-dati";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function intero(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function filtraListe(
  liste: readonly ListaRisultato[],
  filtro: string,
): ListaRisultato[] {
  try {
    if (!filtro) return liste.map((l) => ({ ...l }));
    return liste
      .filter((l) => normalizza(l?.n).includes(filtro))
      .map((l) => ({ ...l }));
  } catch {
    return [];
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const chiave = (id ?? "").trim().toLowerCase();
    if (chiave !== ID_EUROPEE_2024) {
      return NextResponse.json(
        {
          error: "Consultazione non trovata",
          licenza: LICENZA_ELEZIONI,
          disclaimerAggregati: DISCLAIMER_AGGREGATI,
        },
        { status: 404 },
      );
    }
    let dati = null;
    try {
      dati = await caricaEuropee2024();
    } catch {
      dati = null;
    }
    if (!dati) {
      return NextResponse.json({
        dati: null,
        licenza: LICENZA_ELEZIONI,
        disclaimerAggregati: DISCLAIMER_AGGREGATI,
        provenance: {},
      });
    }
    const { searchParams } = new URL(request.url);
    const top = intero(searchParams.get("top"), 15, 1, 15);
    const filtroLista = normalizza(
      (searchParams.get("lista") ?? "").slice(0, 80),
    );
    // topListe accetta max 10: per top>10 si ordina e si tronca qui.
    const ordinate = topListe(dati.liste, 10);
    const resto =
      top > 10
        ? [...dati.liste]
            .map((l) => ({ ...l }))
            .sort((a, b) => b.v - a.v)
            .slice(10, top)
        : [];
    const nazionali = filtraListe([...ordinate, ...resto], filtroLista).slice(
      0,
      top,
    );
    const nomi =
      filtroLista.length >= 2
        ? new Set(nazionali.map((l) => normalizza(l.n)))
        : null;
    const regioni = dati.regioni.map((r) => ({
      r: r.r,
      e: r.e,
      v: r.v,
      b: r.b,
      k: r.k,
      a: r.a,
      liste: nomi
        ? r.liste
            .filter((l) => nomi.has(normalizza(l.n)))
            .map((l) => ({ ...l }))
        : r.liste.map((l) => ({ ...l })),
    }));
    return NextResponse.json({
      dati: {
        id: ID_EUROPEE_2024,
        elezione: { ...dati.elezione },
        liste: nazionali,
        regioni,
        metodologia: dati.metodologia,
        avvertenze: dati.avvertenze,
      },
      licenza: LICENZA_ELEZIONI,
      disclaimerAggregati: DISCLAIMER_AGGREGATI,
      provenance: { ...dati.provenance },
    });
  } catch {
    return NextResponse.json({
      dati: null,
      licenza: LICENZA_ELEZIONI,
      disclaimerAggregati: DISCLAIMER_AGGREGATI,
      provenance: {},
    });
  }
}
