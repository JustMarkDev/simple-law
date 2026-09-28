/**
 * GET /api/elezioni/regionali — catalogo delle regionali con aggregati reali.
 * Query opzionale `?id=` (default: tutte; senza `id` elenca le regionali
 * disponibili). Id non valido -> 404. Mai 500: in caso di errore restituisce
 * l'elenco vuoto con licenza, disclaimer e provenance.
 */

import { NextResponse } from "next/server";
import {
  DISCLAIMER_AGGREGATI,
  elencaRegionali,
  leggiProvenanceRegionale,
  LICENZA_ELEZIONI,
  normalizzaIdRegionale,
} from "@/lib/elezioni-dati";

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
      const valido = normalizzaIdRegionale(filtro);
      if (!valido) {
        return NextResponse.json(
          {
            error: "Consultazione non trovata",
            licenza: LICENZA_ELEZIONI,
            disclaimerAggregati: DISCLAIMER_AGGREGATI,
          },
          { status: 404 },
        );
      }
      let voci: Awaited<ReturnType<typeof elencaRegionali>> = [];
      let provenance: unknown = {};
      try {
        voci = (await elencaRegionali()).filter((v) => v.id === valido);
      } catch {
        voci = [];
      }
      try {
        provenance = await leggiProvenanceRegionale(valido);
      } catch {
        provenance = {};
      }
      return NextResponse.json({
        dati: voci,
        licenza: LICENZA_ELEZIONI,
        disclaimerAggregati: DISCLAIMER_AGGREGATI,
        provenance,
      });
    }
    let voci: Awaited<ReturnType<typeof elencaRegionali>> = [];
    try {
      voci = await elencaRegionali();
    } catch {
      voci = [];
    }
    let provenance: unknown = {};
    try {
      const prima = voci[0];
      provenance = prima
        ? await leggiProvenanceRegionale(prima.id)
        : {};
    } catch {
      provenance = {};
    }
    return NextResponse.json({
      dati: voci,
      licenza: LICENZA_ELEZIONI,
      disclaimerAggregati: DISCLAIMER_AGGREGATI,
      provenance,
    });
  } catch {
    return NextResponse.json({
      dati: [],
      licenza: LICENZA_ELEZIONI,
      disclaimerAggregati: DISCLAIMER_AGGREGATI,
      provenance: {},
    });
  }
}
