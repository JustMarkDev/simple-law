/**
 * GET /api/elezioni — catalogo delle consultazioni con aggregati reali.
 * Mai 500: in caso di errore restituisce l'elenco vuoto con
 * licenza, disclaimer e provenance.
 */

import { NextResponse } from "next/server";
import {
  caricaEuropee2024,
  DISCLAIMER_AGGREGATI,
  ID_EUROPEE_2024,
  LICENZA_ELEZIONI,
} from "@/lib/elezioni-dati";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    let voceEuropee: {
      id: string;
      tipo: string;
      data: string;
      disponibile: boolean;
      elettori: number;
      votanti: number;
      affluenza: number;
      totaleListe: number;
      totaleRegioni: number;
      totaleComuni: number;
    } | null = null;
    let provenance: unknown = {};
    try {
      const dati = await caricaEuropee2024();
      if (dati) {
        provenance = { ...dati.provenance };
        voceEuropee = {
          id: ID_EUROPEE_2024,
          tipo: dati.elezione.tipo,
          data: dati.elezione.data,
          disponibile: true,
          elettori: dati.elezione.e,
          votanti: dati.elezione.v,
          affluenza: dati.elezione.a,
          totaleListe: dati.liste.length,
          totaleRegioni: dati.regioni.length,
          totaleComuni: dati.comuni.length,
        };
      }
    } catch {
      voceEuropee = null;
      provenance = {};
    }
    const voci = voceEuropee ? [voceEuropee] : [];
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
