import { NextResponse } from "next/server";
import { listMinisters } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/ministri -> elenco ministri (DB o seed). */
export async function GET() {
  try {
    const items = await listMinisters();
    return NextResponse.json({ items, count: items.length });
  } catch {
    return NextResponse.json({ items: [], count: 0 });
  }
}
