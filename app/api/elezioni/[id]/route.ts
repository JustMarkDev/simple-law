/**
 * GET /api/elezioni/[id] — dettaglio aggregato di una consultazione.
 * Consultazioni: `europee-2024`, `politiche-2022-camera`,
 * `politiche-2022-senato` (nazionale + regioni/circoscrizioni con
 * per-lista, mai righe candidato/nominativi). Query: `top` (1..15,
 * default 15), `lista` (contains sul nome lista, max 80 ch, applicato
 * anche al per-lista regionale), `id` (alias convalidato: se presente
 * deve coincidere con il path, altrimenti 404). Id sconosciuto o file
 * assente -> 404. Mai 500, mai stack leak.
 */

import { NextResponse } from "next/server";
import {
  caricaElezione,
  DISCLAIMER_AGGREGATI,
  LICENZA_ELEZIONI,
  normalizza,
  normalizzaIdElezione,
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
    const chiave = normalizzaIdElezione(id);
    if (!chiave) {
      return errore404("Consultazione non trovata");
    }
    const { searchParams } = new URL(request.url);
    const alias = searchParams.get("id");
    if (alias !== null && alias !== "") {
      const aliasChiave = normalizzaIdElezione(alias);
      if (!aliasChiave || aliasChiave !== chiave) {
        return errore404("Consultazione non trovata");
      }
    }
    let dati = null;
    try {
      dati = await caricaElezione(chiave);
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
    const corpo: Record<string, unknown> = {
      id: chiave,
      elezione: { ...dati.elezione },
      liste: nazionali,
      regioni,
      metodologia: dati.metodologia,
      avvertenze: dati.avvertenze,
    };
    if (dati.circoscrizioni) {
      corpo["circoscrizioni"] = dati.circoscrizioni.map((c) => ({
        r: c.r,
        e: c.e,
        v: c.v,
        liste: nomi
          ? c.liste
              .filter((l) => nomi.has(normalizza(l.n)))
              .map((l) => ({ ...l }))
          : c.liste.map((l) => ({ ...l })),
      }));
    }
    if (dati.collegiU) {
      corpo["collegiU"] = dati.collegiU.map((c) => ({ ...c }));
    }
    return NextResponse.json({
      dati: corpo,
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
