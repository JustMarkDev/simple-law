/**
 * GET /api/elezioni/referendum-2025 — quesiti SI/NO del referendum 8-9 giugno
 * 2025 (aggregati DAIT, mai nominativi). Query: `q` (cerca comune, max 100
 * ch, min 2), `regione` (match esatto, max 80 ch), `page` (1..10000),
 * `per` (1..100, default 20), `sort` (`a_asc`|`a_desc`). File assente ->
 * 404. Mai 500, mai stack leak.
 */

import { NextResponse } from "next/server";
import {
  caricaReferendum2025,
  cercaComuneReferendum,
  DISCLAIMER_AGGREGATI,
  LICENZA_ELEZIONI,
  normalizza,
  pagina,
  type ComuneReferendum,
} from "@/lib/elezioni-dati";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function intero(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function ordina(comuni: ComuneReferendum[], sort: string): ComuneReferendum[] {
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").slice(0, 100);
    const regione = (searchParams.get("regione") ?? "").slice(0, 80);
    const page = intero(searchParams.get("page"), 1, 1, 10000);
    const per = intero(searchParams.get("per"), 20, 1, 100);
    const sortRaw = (searchParams.get("sort") ?? "").trim().toLowerCase();
    const sort = sortRaw === "a_asc" || sortRaw === "a_desc" ? sortRaw : "a_desc";

    let dati = null;
    try {
      dati = await caricaReferendum2025();
    } catch {
      dati = null;
    }
    if (!dati) {
      return errore404("Dati non disponibili per questa consultazione");
    }

    let comuni = q.trim().length >= 2 ? cercaComuneReferendum(dati.comuni, q) : [...dati.comuni];
    const regioneNorm = normalizza(regione);
    if (regioneNorm) {
      comuni = comuni.filter((c) => normalizza(c.r) === regioneNorm);
    }
    comuni = ordina(comuni, sort);
    const totale = comuni.length;
    const items = pagina(comuni, page, per);
    return NextResponse.json({
      elezione: dati.elezione,
      quesiti: dati.quesiti,
      regioni: dati.regioni,
      comuni: { items, total: totale, page, per, count: items.length },
      metodologia: dati.metodologia,
      avvertenze: dati.avvertenze,
      licenza: LICENZA_ELEZIONI,
      disclaimerAggregati: DISCLAIMER_AGGREGATI,
    });
  } catch {
    return NextResponse.json({
      elezione: null,
      quesiti: [],
      regioni: [],
      comuni: { items: [], total: 0, page: 1, per: 20, count: 0 },
      metodologia: "",
      avvertenze: "",
      licenza: LICENZA_ELEZIONI,
      disclaimerAggregati: DISCLAIMER_AGGREGATI,
    });
  }
}
