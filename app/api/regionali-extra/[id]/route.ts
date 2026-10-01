/**
 * GET /api/regionali-extra/[id] - dettaglio aggregato di una regionale-extra.
 * Consultazioni: `regionali-2024-liguria`, `regionali-2025-calabria`
 * (regione con per-lista, comuni solo affluenza, mai righe
 * candidato/nominativi; voti del presidente scartati in ingest).
 * Query: `top` (1..15, default 15), `lista` (contains sul nome lista,
 * max 80 ch, applicato anche al per-lista regionale), `q` (contains su
 * comune/circoscrizione, max 100 ch, min 2, max 100 righe), `page`
 * (1..10000), `per` (1..100, default 20), `sort` (`a_asc`|`a_desc`),
 * `id` (alias convalidato: se presente deve coincidere con il path,
 * altrimenti 404). Id sconosciuto o file assente -> 404. Mai 500,
 * mai stack leak.
 */

import { NextResponse } from "next/server";
import {
  caricaRegionaleExtra,
  cercaComuneExtra,
  DISCLAIMER_AGGREGATI_EXTRA,
  LICENZA_REGIONALI_EXTRA,
  normalizzaExtra,
  normalizzaIdRegionaleExtra,
  paginaExtra,
  topListeExtra,
  type ComuneRisultatoExtra,
  type ListaRisultatoExtra,
} from "@/lib/regionali-extra-dati";

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

function filtraListe(liste: readonly ListaRisultatoExtra[], filtro: string): ListaRisultatoExtra[] {
  try {
    if (!filtro) return liste.map((l) => ({ ...l }));
    return liste.filter((l) => normalizzaExtra(l?.n).includes(filtro)).map((l) => ({ ...l }));
  } catch {
    return [];
  }
}

function ordinaComuni(comuni: ComuneRisultatoExtra[], sort: string): ComuneRisultatoExtra[] {
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
      licenza: LICENZA_REGIONALI_EXTRA,
      disclaimerAggregati: DISCLAIMER_AGGREGATI_EXTRA,
    },
    { status: 404 },
  );
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const chiave = normalizzaIdRegionaleExtra(id);
    if (!chiave) {
      return errore404("Consultazione non trovata");
    }
    const { searchParams } = new URL(request.url);
    const alias = searchParams.get("id");
    if (alias !== null && alias !== "") {
      const aliasChiave = normalizzaIdRegionaleExtra(alias);
      if (!aliasChiave || aliasChiave !== chiave) {
        return errore404("Consultazione non trovata");
      }
    }
    let dati = null;
    try {
      dati = await caricaRegionaleExtra(chiave);
    } catch {
      dati = null;
    }
    if (!dati) {
      return errore404("Dati non disponibili per questa consultazione");
    }
    const top = intero(searchParams.get("top"), 15, 1, 15);
    const filtroLista = normalizzaExtra((searchParams.get("lista") ?? "").slice(0, 80));
    // topListeExtra accetta max 10: per top>10 si ordina e si tronca qui.
    const ordinate = topListeExtra(dati.liste, 10);
    const resto =
      top > 10
        ? [...dati.liste]
            .map((l) => ({ ...l }))
            .sort((a, b) => b.v - a.v)
            .slice(10, top)
        : [];
    const nazionali = filtraListe([...ordinate, ...resto], filtroLista).slice(0, top);
    const nomi =
      filtroLista.length >= 2 ? new Set(nazionali.map((l) => normalizzaExtra(l.n))) : null;
    const regioni = dati.regioni.map((r) => ({
      r: r.r,
      e: r.e,
      v: r.v,
      b: r.b,
      k: r.k,
      a: r.a,
      liste: nomi
        ? r.liste.filter((l) => nomi.has(normalizzaExtra(l.n))).map((l) => ({ ...l }))
        : r.liste.map((l) => ({ ...l })),
    }));
    const q = (searchParams.get("q") ?? "").slice(0, 100);
    const page = intero(searchParams.get("page"), 1, 1, 10000);
    const per = intero(searchParams.get("per"), 20, 1, 100);
    const sortRaw = (searchParams.get("sort") ?? "").trim().toLowerCase();
    const sort = sortRaw === "a_asc" || sortRaw === "a_desc" ? sortRaw : "";
    let comuniFiltrati: ComuneRisultatoExtra[];
    try {
      comuniFiltrati =
        normalizzaExtra(q).length >= 2
          ? cercaComuneExtra(dati.comuni, q)
          : dati.comuni.map((c) => ({ ...c }));
      comuniFiltrati = ordinaComuni(comuniFiltrati, sort);
    } catch {
      comuniFiltrati = [];
    }
    const totaleComuni = comuniFiltrati.length;
    const comuni = paginaExtra(comuniFiltrati, page, per);
    return NextResponse.json({
      dati: {
        id: chiave,
        elezione: { ...dati.elezione },
        liste: nazionali,
        regioni,
        comuni: { items: comuni, total: totaleComuni, page, per, count: comuni.length },
        metodologia: dati.metodologia,
        avvertenze: dati.avvertenze,
      },
      licenza: LICENZA_REGIONALI_EXTRA,
      disclaimerAggregati: DISCLAIMER_AGGREGATI_EXTRA,
      provenance: { ...dati.provenance },
    });
  } catch {
    return NextResponse.json({
      dati: null,
      licenza: LICENZA_REGIONALI_EXTRA,
      disclaimerAggregati: DISCLAIMER_AGGREGATI_EXTRA,
      provenance: {},
    });
  }
}
