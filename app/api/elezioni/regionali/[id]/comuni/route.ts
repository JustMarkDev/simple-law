/**
 * GET /api/elezioni/regionali/[id]/comuni - affluenza comunale di una
 * regionale (solo aggregati, mai per-lista comunale, mai nominativi).
 * Query: `q` (contains su comune/provincia, max 100 ch, min 2, max 100
 * righe totali con filtro), `regione` (match esatto, max 80 ch), `page`
 * (1..10000), `per` (1..100, default 20), `sort` (`a_asc`|`a_desc`),
 * `id` (alias convalidato: se presente deve coincidere con il path,
 * altrimenti 404). Id sconosciuto o file assente -> 404. Mai 500,
 * mai stack leak.
 */

import { NextResponse } from "next/server";
import {
  caricaRegionale,
  cercaComune,
  DISCLAIMER_AGGREGATI,
  LICENZA_ELEZIONI,
  normalizza,
  normalizzaIdRegionale,
  pagina,
  type ComuneRisultato,
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

function ordina(
  comuni: ComuneRisultato[],
  sort: string,
): ComuneRisultato[] {
  try {
    if (sort === "a_asc")
      return [...comuni].sort((a, b) => a.a - b.a || a.c.localeCompare(b.c, "it"));
    if (sort === "a_desc")
      return [...comuni].sort((a, b) => b.a - a.a || a.c.localeCompare(b.c, "it"));
    return [...comuni];
  } catch {
    return [...comuni];
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
    const q = (searchParams.get("q") ?? "").slice(0, 100);
    const regione = normalizza((searchParams.get("regione") ?? "").slice(0, 80));
    const page = intero(searchParams.get("page"), 1, 1, 10000);
    const per = intero(searchParams.get("per"), 20, 1, 100);
    const sortRaw = (searchParams.get("sort") ?? "").trim().toLowerCase();
    const sort = sortRaw === "a_asc" || sortRaw === "a_desc" ? sortRaw : "";

    let base: ComuneRisultato[] = [];
    let provenance: unknown = {};
    let assente = false;
    try {
      const dati = await caricaRegionale(chiave);
      if (dati) {
        base = dati.comuni;
        provenance = { ...dati.provenance };
      } else {
        assente = true;
      }
    } catch {
      assente = true;
    }
    if (assente) {
      return errore404("Dati non disponibili per questa consultazione");
    }

    let filtrati: ComuneRisultato[];
    try {
      filtrati =
        normalizza(q).length >= 2
          ? cercaComune(base, q)
          : base.map((c) => ({ ...c }));
      if (regione.length >= 2)
        filtrati = filtrati.filter((c) => normalizza(c?.r) === regione);
      filtrati = ordina(filtrati, sort);
    } catch {
      filtrati = [];
    }
    const totale = filtrati.length;
    const items = pagina(filtrati, page, per);
    return NextResponse.json({
      dati: { items, total: totale, page, per, count: totale },
      licenza: LICENZA_ELEZIONI,
      disclaimerAggregati: DISCLAIMER_AGGREGATI,
      provenance,
    });
  } catch {
    return NextResponse.json({
      dati: { items: [], total: 0, page: 1, per: 20, count: 0 },
      licenza: LICENZA_ELEZIONI,
      disclaimerAggregati: DISCLAIMER_AGGREGATI,
      provenance: {},
    });
  }
}
