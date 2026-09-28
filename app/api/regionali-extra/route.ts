/**
 * GET /api/regionali-extra — catalogo delle regionali-extra con aggregati reali.
 * Query opzionale `?id=` (default: tutte; senza `id` elenca le regionali-extra
 * disponibili). Id non valido -> 404. Mai 500: in caso di errore restituisce
 * l'elenco vuoto con licenza, disclaimer e provenance.
 */

import { NextResponse } from "next/server";
import {
  DISCLAIMER_AGGREGATI_EXTRA,
  elencaRegionaliExtra,
  leggiProvenanceRegionaleExtra,
  LICENZA_REGIONALI_EXTRA,
  normalizzaIdRegionaleExtra,
} from "@/lib/regionali-extra-dati";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    let filtro: string | null = null;
    try {
      filtro = new URL(request.url).searchParams.get("id");
    } catch {
      filtro = null;
    }
    if (filtro !== null && filtro !== "") {
      const valido = normalizzaIdRegionaleExtra(filtro);
      if (!valido) {
        return NextResponse.json(
          {
            error: "Consultazione non trovata",
            licenza: LICENZA_REGIONALI_EXTRA,
            disclaimerAggregati: DISCLAIMER_AGGREGATI_EXTRA,
          },
          { status: 404 },
        );
      }
      let voci: Awaited<ReturnType<typeof elencaRegionaliExtra>> = [];
      let provenance: unknown = {};
      try {
        voci = (await elencaRegionaliExtra()).filter((v) => v.id === valido);
      } catch {
        voci = [];
      }
      try {
        provenance = await leggiProvenanceRegionaleExtra(valido);
      } catch {
        provenance = {};
      }
      return NextResponse.json({
        dati: voci,
        licenza: LICENZA_REGIONALI_EXTRA,
        disclaimerAggregati: DISCLAIMER_AGGREGATI_EXTRA,
        provenance,
      });
    }
    let voci: Awaited<ReturnType<typeof elencaRegionaliExtra>> = [];
    try {
      voci = await elencaRegionaliExtra();
    } catch {
      voci = [];
    }
    let provenance: unknown = {};
    try {
      const prima = voci[0];
      provenance = prima
        ? await leggiProvenanceRegionaleExtra(prima.id)
        : {};
    } catch {
      provenance = {};
    }
    return NextResponse.json({
      dati: voci,
      licenza: LICENZA_REGIONALI_EXTRA,
      disclaimerAggregati: DISCLAIMER_AGGREGATI_EXTRA,
      provenance,
    });
  } catch {
    return NextResponse.json({
      dati: [],
      licenza: LICENZA_REGIONALI_EXTRA,
      disclaimerAggregati: DISCLAIMER_AGGREGATI_EXTRA,
      provenance: {},
    });
  }
}
