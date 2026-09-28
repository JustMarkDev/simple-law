/**
 * GET /api/elezioni/regionali/[id] — dettaglio aggregato di una regionale.
 * Consultazioni: `regionali-2025-toscana`, `regionali-2024-umbria`
 * (nazionale di regione + regione con per-lista, comuni solo affluenza,
 * mai righe candidato/nominativi; voti del presidente scartati in ingest).
 * Query: `top` (1..15, default 15), `lista` (contains sul nome lista,
 * max 80 ch, applicato anche al per-lista regionale), `id` (alias
 * convalidato: se presente deve coincidere con il path, altrimenti 404).
 * Id sconosciuto o file assente -> 404. Mai 500, mai stack leak.
 */

import { NextResponse } from "next/server";
import {
  caricaRegionale,
  DISCLAIMER_AGGREGATI,
  LICENZA_ELEZIONI,
  normalizza,
  normalizzaIdRegionale,
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

function errore404(messaggio: string) {
  return NextResponse.json(
    {
      error: messaggio,
      licenza: LICENZA_ELEZIONI,
      disclaimerAggregati: DISCLAIMER_AGGREGATI,
    },
    { status: 404 },
  );
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const chiave = normalizzaIdRegionale(id);
    if (!chiave) {
      return errore404("Consultazione non trovata");
    }
    const { searchParams } = new URL(request.url);
    const alias = searchParams.get("id");
    if (alias !== null && alias !== "") {
      const aliasChiave = normalizzaIdRegionale(alias);
      if (!aliasChiave || aliasChiave !== chiave) {
        return errore404("Consultazione non trovata");
      }
    }
    let dati = null;
    try {
      dati = await caricaRegionale(chiave);
    } catch {
      dati = null;
    }
    if (!dati) {
      return errore404("Dati non disponibili per questa consultazione");
    }
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
        id: chiave,
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
