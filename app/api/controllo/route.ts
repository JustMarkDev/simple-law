/**
 * GET /api/controllo?tipo=contratti|ga&q=&ente=&giudice=&page=&per=
 * Hub oversight: contratti pubblici ANAC 2025 + provvedimenti GA 2026.
 * Mai 500: in caso di errore restituisce elenchi vuoti con provenance.
 * Documenti di controllo, MAI leggi: nessun campo stato/vigenza.
 */

import { NextResponse } from "next/server";
import {
  cercaContratti,
  cercaProvvedimenti,
  DISCLAIMER_CONTROLLO,
  filtraPerEnte,
  filtraPerGiudice,
  leggiProvenanceAnac,
  leggiProvenanceGA,
  paginaOversight,
  tuttiContratti,
  tuttiProvvedimentiGA,
} from "@/lib/oversight-dati";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PER_AMMESSI = [10, 20, 50] as const;
const TIPI_AMMESSI = ["contratti", "ga"] as const;

function intero(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export async function GET(request: Request) {
  try {
    let params: URLSearchParams;
    try {
      params = new URL(request.url).searchParams;
    } catch {
      return NextResponse.json({
        tipo: "contratti",
        items: [],
        total: 0,
        page: 1,
        per: 20,
        count: 0,
        provenance: {},
        disclaimer: DISCLAIMER_CONTROLLO,
      });
    }
    const tipoGrezzo = (params.get("tipo") ?? "contratti")
      .trim()
      .toLowerCase()
      .slice(0, 20);
    const tipo = (TIPI_AMMESSI as readonly string[]).includes(tipoGrezzo)
      ? tipoGrezzo
      : "contratti";
    const q = (params.get("q") ?? "").slice(0, 100);
    const page = intero(params.get("page"), 1, 1, 1000);
    const perGrezzo = intero(params.get("per"), 20, 1, 50);
    const per = (PER_AMMESSI as readonly number[]).includes(perGrezzo)
      ? perGrezzo
      : 20;

    if (tipo === "ga") {
      const giudice = (params.get("giudice") ?? "").slice(0, 20);
      let base = await tuttiProvvedimentiGA();
      base = filtraPerGiudice(base, giudice);
      const filtrati = cercaProvvedimenti(base, q);
      const totale = filtrati.length;
      const items = paginaOversight(filtrati, page, per);
      let provenance: unknown = {};
      try {
        provenance = await leggiProvenanceGA();
      } catch {
        provenance = {};
      }
      return NextResponse.json({
        tipo: "ga",
        items,
        total: totale,
        page,
        per,
        count: totale,
        provenance,
        disclaimer: DISCLAIMER_CONTROLLO,
      });
    }

    const ente = (params.get("ente") ?? "").slice(0, 100);
    let base = await tuttiContratti();
    base = filtraPerEnte(base, ente);
    const filtrati = cercaContratti(base, q);
    const totale = filtrati.length;
    const items = paginaOversight(filtrati, page, per);
    let provenance: unknown = {};
    try {
      provenance = await leggiProvenanceAnac();
    } catch {
      provenance = {};
    }
    return NextResponse.json({
      tipo: "contratti",
      items,
      total: totale,
      page,
      per,
      count: totale,
      provenance,
      disclaimer: DISCLAIMER_CONTROLLO,
    });
  } catch {
    return NextResponse.json({
      tipo: "contratti",
      items: [],
      total: 0,
      page: 1,
      per: 20,
      count: 0,
      provenance: {},
      disclaimer: DISCLAIMER_CONTROLLO,
    });
  }
}
