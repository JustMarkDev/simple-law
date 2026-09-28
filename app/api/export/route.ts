import { NextResponse } from "next/server";
import { queryLaws } from "@/lib/db";
import type { LawRecordExtra } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Numero massimo di righe esportabili in una singola richiesta. */
export const EXPORT_CAP = 5000;

/** Dimensione del batch di streaming (righe per chunk in output). */
export const EXPORT_BATCH = 500;

/** Finestra del rate-limit: 20 richieste al minuto per client. */
export const EXPORT_RATE_MAX = 20;
export const EXPORT_RATE_FINESTRA_MS = 60_000;

const COLONNE = [
  "eli",
  "nir",
  "tipo",
  "numero",
  "dataEmanazione",
  "titolo",
  "stato",
  "gulpease",
  "qualita",
  "codiceRedazionale",
  "dataGU",
  "numeroGU",
] as const;

type ColonnaExport = (typeof COLONNE)[number];

type RigaProiettata = Record<ColonnaExport, unknown>;

/** Proiezione a 12 colonne: mai `testo`, `sintesi`, `semplificata`, `fonti` o `extra`. */
function proietta(row: LawRecordExtra): RigaProiettata {
  return {
    eli: row.eli,
    nir: row.nir,
    tipo: row.tipo,
    numero: row.numero,
    dataEmanazione: row.dataEmanazione,
    titolo: row.titolo,
    stato: row.stato,
    gulpease: row.gulpease,
    qualita: row.qualita ?? null,
    codiceRedazionale: row.codiceRedazionale ?? "",
    dataGU: row.dataGU ?? "",
    numeroGU: row.numeroGU ?? "",
  };
}

function cellaCsv(value: unknown): string {
  const testo = value === null || value === undefined ? "" : String(value);
  // Neutralizza le formule (CSV injection, OWASP): apice se dopo eventuali
  // spazi/controlli iniziali (inclusi BOM e spazi unicode) inizia con = + - @ | % ; " tab.
  // La pulizia iniziale copre anche i caratteri bidi (U+202A-U+202E, U+200B ecc.)
  // usati per camuffare l'attacco.
  const senzaBidi = testo.replace(/^[\s\u0000-\u0020\uFEFF\u2000-\u200B\u202A-\u202E]+/, "");
  const protetto = /^[=+\-@|%;"\t]/.test(senzaBidi) ? `'${testo}` : testo;
  if (/[",\r\n]/.test(protetto)) return `"${protetto.replace(/"/g, '""')}"`;
  return protetto;
}

function rigaCsv(row: RigaProiettata): string {
  return COLONNE.map((colonna) => cellaCsv(row[colonna])).join(",");
}

/* ---------------------------------------------------------------------------
 * Rate-limit in-memory (best-effort per istanza): 20 richieste/min per client.
 * ------------------------------------------------------------------------- */

const finestre = new Map<string, number[]>();

function ipClient(request: Request): string {
  try {
    const url = new URL(request.url);
    void url;
  } catch {
    return "anonimo";
  }
  const h = request.headers;
  const diretto =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "anonimo";
  return diretto.slice(0, 80) || "anonimo";
}

/** Azzera il rate-limit (usata nei test). Non lancia. */
export function azzeraLimiteExport(): void {
  finestre.clear();
}

function superaLimite(ip: string, ora: number): boolean {
  const lista = (finestre.get(ip) ?? []).filter((t) => ora - t < EXPORT_RATE_FINESTRA_MS);
  if (lista.length >= EXPORT_RATE_MAX) {
    finestre.set(ip, lista);
    return true;
  }
  lista.push(ora);
  finestre.set(ip, lista);
  return false;
}

function filtriRichiesta(searchParams: URLSearchParams): { q: string; tipo: string; anno: string } {
  // Stessi tagli di GET /api/leggi: q max 200, tipo max 80.
  return {
    q: (searchParams.get("q") ?? "").slice(0, 200),
    tipo: (searchParams.get("tipo") ?? "").slice(0, 80),
    anno: searchParams.get("anno") ?? "",
  };
}

/**
 * GET /api/export?formato=csv|json&q=&tipo=&anno=
 * Scarica un estratto del corpus (max 5000 righe) come allegato, in streaming.
 *
 * - La lettura usa `queryLaws` (never-throw) con cap 5000; l'output e'
 *   emesso a batch di 500 righe via ReadableStream, senza mai costruire
 *   l'intero corpo in memoria (scala verso 100GB).
 * - Proiezione a 12 colonne: mai `testo`/`semplificata` in output.
 * - CSV con BOM e protezione anti-injection; JSON in streaming.
 * - Non lancia mai 500: errore inatteso -> 200 con elenco vuoto.
 */
export async function GET(request: Request) {
  const inizio = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const formato = (searchParams.get("formato") ?? "csv").trim().toLowerCase();
    if (formato !== "csv" && formato !== "json") {
      return NextResponse.json(
        { error: "Formato non supportato: usa csv o json" },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    const ip = ipClient(request);
    if (superaLimite(ip, Date.now())) {
      return NextResponse.json(
        { error: "Troppe richieste: hai superato 20 esportazioni al minuto, riprova tra poco" },
        {
          status: 429,
          headers: { "cache-control": "no-store", "retry-after": "60" },
        },
      );
    }

    const filtri = filtriRichiesta(searchParams);
    let items: LawRecordExtra[] = [];
    try {
      items = await queryLaws(filtri, EXPORT_CAP);
    } catch {
      items = [];
    }
    if (!Array.isArray(items)) items = [];
    const proiettate = items.slice(0, EXPORT_CAP).map(proietta);
    const generatedAt = new Date().toISOString();

    if (Date.now() - inizio > 500) {
      console.warn(`[export] query lenta: ${Date.now() - inizio}ms filtri=${JSON.stringify(filtri)}`);
    }

    if (formato === "json") {
      const encoder = new TextEncoder();
      let indice = 0;
      let primo = true;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(`{"items":[`),
          );
          while (indice < proiettate.length) {
            const fine = Math.min(indice + EXPORT_BATCH, proiettate.length);
            const pezzi: string[] = [];
            for (let i = indice; i < fine; i += 1) {
              pezzi.push(`${primo ? "" : ","}${JSON.stringify(proiettate[i])}`);
              primo = false;
            }
            controller.enqueue(encoder.encode(pezzi.join("")));
            indice = fine;
          }
          controller.enqueue(
            encoder.encode(
              `],"total":${proiettate.length},"generatedAt":${JSON.stringify(generatedAt)},"filtri":${JSON.stringify(filtri)}}`,
            ),
          );
          controller.close();
        },
      });
      return new NextResponse(stream, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": 'attachment; filename="leggi-export.json"',
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }

    const encoder = new TextEncoder();
    let indice = 0;
    let primaRiga = true;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        while (indice < proiettate.length || primaRiga) {
          if (primaRiga) {
            controller.enqueue(encoder.encode(`\uFEFF${COLONNE.join(",")}\r\n`));
            primaRiga = false;
            if (proiettate.length === 0) break;
            continue;
          }
          const fine = Math.min(indice + EXPORT_BATCH, proiettate.length);
          const pezzi: string[] = [];
          for (let i = indice; i < fine; i += 1) {
            pezzi.push(rigaCsv(proiettate[i]));
          }
          controller.enqueue(encoder.encode(`${pezzi.join("\r\n")}\r\n`));
          indice = fine;
        }
        controller.close();
      },
    });
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="leggi-export.csv"',
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ items: [], total: 0 });
  }
}
