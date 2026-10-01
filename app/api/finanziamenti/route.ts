/**
 * GET /api/finanziamenti?q=&anno=&ord=&page=&per=
 * Erogazioni ai partiti politici 2024-2026 (solo aggregati beneficiario×anno,
 * zero nominativi). Mai 500: in caso di errore restituisce elenco vuoto con
 * provenance. I finanziamenti NON sono leggi: nessun campo stato/vigenza.
 */

import { NextResponse } from "next/server";
import {
  cercaErogazioni,
  DISCLAIMER_FINANZIAMENTI,
  filtraPerAnno,
  leggiProvenanceFinanziamenti,
  ordinaErogazioni,
  paginaFinanziamenti,
  tutteErogazioni,
} from "@/lib/finanziamenti-dati";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PER_AMMESSI = [10, 20, 50] as const;
const ORD_AMMESSI = ["totale_desc", "totale_asc", "anno_desc", "nome_asc"] as const;

function intero(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function rispostaVuota() {
  return NextResponse.json({
    items: [],
    total: 0,
    page: 1,
    per: 20,
    count: 0,
    provenance: {},
    disclaimer: DISCLAIMER_FINANZIAMENTI,
  });
}

export async function GET(request: Request) {
  try {
    let params: URLSearchParams;
    try {
      params = new URL(request.url).searchParams;
    } catch {
      return rispostaVuota();
    }
    const q = (params.get("q") ?? "").slice(0, 100);
    const annoGrezzo = (params.get("anno") ?? "").trim().slice(0, 4);
    const anno = /^\d{4}$/.test(annoGrezzo) ? Number.parseInt(annoGrezzo, 10) : null;
    const ordGrezzo = (params.get("ord") ?? "totale_desc").trim().toLowerCase().slice(0, 20);
    const ord = (ORD_AMMESSI as readonly string[]).includes(ordGrezzo) ? ordGrezzo : "totale_desc";
    const page = intero(params.get("page"), 1, 1, 1000);
    const perGrezzo = intero(params.get("per"), 20, 1, 50);
    const per = (PER_AMMESSI as readonly number[]).includes(perGrezzo) ? perGrezzo : 20;

    let base = await tutteErogazioni();
    base = filtraPerAnno(base, anno);
    base = cercaErogazioni(base, q);
    base = ordinaErogazioni(base, ord);
    const totale = base.length;
    const items = paginaFinanziamenti(base, page, per);
    let provenance: unknown = {};
    try {
      provenance = await leggiProvenanceFinanziamenti();
    } catch {
      provenance = {};
    }
    return NextResponse.json({
      items,
      total: totale,
      page,
      per,
      count: totale,
      provenance,
      disclaimer: DISCLAIMER_FINANZIAMENTI,
    });
  } catch {
    return rispostaVuota();
  }
}
