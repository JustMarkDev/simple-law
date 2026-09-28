import { NextResponse } from "next/server";
import { queryLaws } from "@/lib/db";
import type { LawRecordExtra } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Numero massimo di righe esportabili in una singola richiesta. */
export const EXPORT_CAP = 5000;

const COLONNE: readonly (keyof LawRecordExtra)[] = [
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
];

function cellaCsv(value: unknown): string {
  const testo = value === null || value === undefined ? "" : String(value);
  // Neutralizza le formule (CSV injection, OWASP): apice se dopo eventuali
  // spazi/controlli iniziali (inclusi BOM e spazi unicode) inizia con = + - @ | % ; " tab.
  const senzaBidi = testo.replace(/^[\s\u0000-\u0020\uFEFF\u2000-\u200B\u202A-\u202E]+/, "");
  const protetto = /^[=+\-@|%;"\t]/.test(senzaBidi) ? `'${testo}` : testo;
  if (/[",\r\n]/.test(protetto)) return `"${protetto.replace(/"/g, '""')}"`;
  return protetto;
}

function toCsv(rows: readonly LawRecordExtra[]): string {
  const righe = [COLONNE.join(",")];
  for (const row of rows) {
    righe.push(COLONNE.map((colonna) => cellaCsv(row[colonna])).join(","));
  }
  return `\uFEFF${righe.join("\r\n")}`;
}

/**
 * GET /api/export?formato=csv|json&q=&tipo=&anno=
 * Scarica un estratto del corpus (max 5000 righe) come allegato.
 * Risponde sempre 200 con JSON su errore inatteso.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const formato = (searchParams.get("formato") ?? "csv").trim().toLowerCase();
    if (formato !== "csv" && formato !== "json") {
      return NextResponse.json(
        { error: "Formato non supportato: usa csv o json" },
        { status: 400 },
      );
    }

    const filtri = {
      q: searchParams.get("q") ?? "",
      tipo: searchParams.get("tipo") ?? "",
      anno: searchParams.get("anno") ?? "",
    };
    const items = await queryLaws(filtri, EXPORT_CAP);
    const generatedAt = new Date().toISOString();

    if (formato === "json") {
      return NextResponse.json(
        { items, total: items.length, generatedAt, filtri },
        {
          headers: {
            "content-disposition": 'attachment; filename="leggi-export.json"',
            "cache-control": "no-store",
          },
        },
      );
    }

    return new NextResponse(toCsv(items), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="leggi-export.csv"',
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ items: [], total: 0 });
  }
}
