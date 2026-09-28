import { NextResponse } from "next/server";
import { fetchGovernoComunicati, getSeedCdm } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/cdm -> comunicati del Governo (live con fallback seed). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limiteGrezzo = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limite = Number.isFinite(limiteGrezzo) && limiteGrezzo > 0 ? Math.min(limiteGrezzo, 50) : 10;

  try {
    const items = await fetchGovernoComunicati(limite);
    const usaSeed = getSeedCdm().some((seed) => items.some((item) => item.id === seed.id));
    return NextResponse.json({ items, count: items.length, source: usaSeed ? "seed" : "live" });
  } catch {
    const fallback = getSeedCdm().slice(0, limite);
    return NextResponse.json({ items: fallback, count: fallback.length, source: "seed" });
  }
}
