import { NextResponse } from "next/server";
import { runStoricoSync } from "@/lib/sync";
import type { StoricoSyncOptions, SyncReport } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** I download bulk possono richiedere piu' tempo di una richiesta standard. */
export const maxDuration = 60;

/** Tetto massimo di pagine per singola ricerca avanzata. */
export const MAX_PAGES = 10;
/** Limiti per i parametri CSV (`denominazioni`, `collezioni`). */
export const MAX_LISTA_ITEMS = 20;
export const MAX_LISTA_CARATTERI = 80;

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

interface ListaParam {
  voci: string[] | undefined;
  troncata: boolean;
}

/** Divide un CSV, limitando a `MAX_LISTA_ITEMS` voci da `MAX_LISTA_CARATTERI`. */
function lista(value: string | null): ListaParam {
  if (!value) return { voci: undefined, troncata: false };
  const grezze = value
    .split(",")
    .map((voce) => voce.trim())
    .filter(Boolean);
  if (grezze.length === 0) return { voci: undefined, troncata: false };

  let troncata = grezze.length > MAX_LISTA_ITEMS;
  const voci = grezze.slice(0, MAX_LISTA_ITEMS).map((voce) => {
    if (voce.length > MAX_LISTA_CARATTERI) {
      troncata = true;
      return voce.slice(0, MAX_LISTA_CARATTERI);
    }
    return voce;
  });
  return { voci, troncata };
}

function notaTroncamento(nome: string, param: ListaParam): string | undefined {
  if (!param.troncata) return undefined;
  return `Parametro "${nome}" troncato: massimo ${MAX_LISTA_ITEMS} voci da ${MAX_LISTA_CARATTERI} caratteri.`;
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
 * GET|POST /api/sync/storico
 * Trigger del bulk storico: archivi opzionali + ricerca avanzata paginata.
 * Parametri: `limit`, `pageSize`, `maxPages` (max 10), `annoDa`, `annoA`,
 * `denominazioni` (CSV, max 20 voci da 80 caratteri), `collezioni` (idem).
 * La destinazione degli archivi e' fissa (`data/bulk`, `DEFAULT_ZIP_DIR`).
 * Se `CRON_SECRET` e' impostato richiede `Authorization: Bearer <segreto>`.
 * Risponde sempre JSON (anche in caso di errore), mai 500.
 */
export async function GET(request: Request) {
  if (!autorizzato(request)) {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const denominazioni = lista(searchParams.get("denominazioni"));
  const collezioni = lista(searchParams.get("collezioni"));

  const options: StoricoSyncOptions = {
    limit: intero(searchParams.get("limit"), 200, 2000),
    pageSize: intero(searchParams.get("pageSize"), 50, 200),
    maxPages: intero(searchParams.get("maxPages"), 5, MAX_PAGES),
    annoDa: searchParams.get("annoDa") ?? undefined,
    annoA: searchParams.get("annoA") ?? undefined,
    denominazioni: denominazioni.voci,
    collezioni: collezioni.voci,
  };

  const note = [
    notaTroncamento("denominazioni", denominazioni),
    notaTroncamento("collezioni", collezioni),
  ].filter((voce): voce is string => Boolean(voce));

  try {
    const report = await runStoricoSync(options);
    if (note.length === 0) return NextResponse.json(report);
    return NextResponse.json({ ...report, notes: [...report.notes, ...note] });
  } catch (cause) {
    const fallito = erroreReport("storico", cause);
    return NextResponse.json({ ...fallito, notes: [...fallito.notes, ...note] });
  }
}

/** POST: stesso comportamento della GET (per cron o trigger manuali). */
export const POST = GET;
