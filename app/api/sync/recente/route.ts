import { NextResponse } from "next/server";
import { runRecenteSync } from "@/lib/sync";
import type { RecenteSyncOptions, SyncReport } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Con `CRON_SECRET` impostato richiede `Authorization: Bearer <segreto>`.
 * Senza variabile la route resta aperta solo fuori produzione (sviluppo/test);
 * in produzione risponde 401 (fail-closed contro DoS/costi).
 */
function autorizzato(request: Request): boolean {
  const segreto = process.env.CRON_SECRET?.trim();
  if (!segreto) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${segreto}`;
}

function intero(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function dataIso(value: string | null): string | undefined {
  const grezzo = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(grezzo) ? grezzo : undefined;
}

function erroreReport(source: SyncReport["source"], cause: unknown): SyncReport {
  const ora = new Date().toISOString();
  const messaggio = cause instanceof Error ? cause.message : "Errore sconosciuto";
  return {
    source,
    ok: false,
    fetched: 0,
    simplified: 0,
    persisted: 0,
    collections: [],
    errors: [messaggio],
    notes: [],
    startedAt: ora,
    finishedAt: ora,
  };
}

/**
 * GET|POST /api/sync/recente
 * Ingest degli atti aggiornati. Parametri: `dal`, `al` (`YYYY-MM-DD`),
 * `limit`. Senza `dal`/`al` usa gli ultimi 30 giorni.
 * Se `CRON_SECRET` e' impostato richiede `Authorization: Bearer <segreto>`.
 * Risponde sempre JSON, mai 500.
 */
export async function GET(request: Request) {
  if (!autorizzato(request)) {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const options: RecenteSyncOptions = {
    dal: dataIso(searchParams.get("dal")),
    al: dataIso(searchParams.get("al")),
    limit: intero(searchParams.get("limit"), 200, 2000),
  };

  try {
    const report = await runRecenteSync(options);
    return NextResponse.json(report);
  } catch (cause) {
    return NextResponse.json(erroreReport("recente", cause));
  }
}

/** POST: stesso comportamento della GET. */
export const POST = GET;
