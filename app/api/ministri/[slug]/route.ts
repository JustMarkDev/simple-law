import { NextResponse } from "next/server";
import { getMinisterBySlug } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/** GET /api/ministri/[slug] -> dettaglio ministro. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const ministro = await getMinisterBySlug(slug ?? "");
    if (!ministro) {
      return NextResponse.json({ error: "Ministro non trovato" }, { status: 404 });
    }
    return NextResponse.json({ ministro });
  } catch {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }
}
