import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/health -> stato applicazione e sorgente dati. */
export async function GET() {
  let db: "connected" | "seed" = "seed";
  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = "connected";
    } catch {
      db = "seed";
    }
  }
  return NextResponse.json({ ok: true, db, time: new Date().toISOString() });
}
