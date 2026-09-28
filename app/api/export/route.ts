import { NextResponse } from "next/server";
import { countLaws, listLaws } from "@/lib/db";
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
 * - Lettura paginata (`listLaws` a pagine da 500, `sort: data_desc` stabile):
 *   ogni `pull` asyncaricatica una sola pagina e la proietta subito a 12
 *   colonne (mai `testo`/`sintesi`/`semplificata`/`fonti`/`extra` in memoria
 *   d'uscita); backpressure nativa, mai l'intero corpo in memoria.
 * - `total` = righe esportate; `totaleReale` = righe corrispondenti ai filtri
 *   (può superare il cap) + `troncato: true` e header `X-Export-Troncato: 1`
 *   quando il cap taglia righe (mai silenzio sul troncamento).
 * - Proiezione a 12 colonne: mai `testo`/`semplificata` in output.
 * - CSV con BOM e protezione anti-injection; JSON con framing incrementale
 *   senza trailing comma (valido anche a corpus vuoto).
 * - Non lancia mai 500: errore inatteso -> 200 con elenco vuoto; errore o
 *   abort in `pull` -> `controller.error` (mai corpo troncato spacciato per
 *   valido: su abort il client riceve errore di rete, non 200).
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
    // Totale reale per il flag di troncamento (never-throw: fallback 0).
    let totaleReale = 0;
    try {
      totaleReale = await countLaws(filtri);
      if (!Number.isFinite(totaleReale) || totaleReale < 0) totaleReale = 0;
    } catch {
      totaleReale = 0;
    }
    const troncato = totaleReale > EXPORT_CAP;
    const generatedAt = new Date().toISOString();

    if (Date.now() - inizio > 500) {
      console.warn(`[export] conteggio lento: ${Date.now() - inizio}ms filtri=${JSON.stringify(filtri)}`);
    }

    const segnale = request.signal;
    const abortErrore = (): Error => {
      try {
        return new DOMException("Esportazione annullata dal client", "AbortError");
      } catch {
        return new Error("Esportazione annullata dal client");
      }
    };

    // Sorgente paginata condivisa da CSV e JSON: carica una pagina alla
    // volta (mai oltre EXPORT_BATCH righe in memoria d'uscita).
    const creaSorgente = () => {
      let pagina = 1;
      let finite = false;
      let scritti = 0;
      return {
        scritti: () => scritti,
        async prossima(): Promise<RigaProiettata[]> {
          if (finite || scritti >= EXPORT_CAP) {
            finite = true;
            return [];
          }
          const residuo = EXPORT_CAP - scritti;
          const per = Math.min(EXPORT_BATCH, residuo);
          let items: LawRecordExtra[] = [];
          try {
            const paginaDati = await listLaws({ ...filtri, page: pagina, per, sort: "data_desc" });
            if (Array.isArray(paginaDati.items)) items = paginaDati.items;
          } catch {
            items = [];
          }
          pagina += 1;
          if (items.length < per) finite = true;
          const righe = items.slice(0, per).map(proietta);
          scritti += righe.length;
          if (scritti >= EXPORT_CAP) finite = true;
          return righe;
        },
      };
    };

    const intestazioniComuni = {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "X-Export-Total": String(Math.min(totaleReale, EXPORT_CAP)),
      "X-Export-Totale-Reale": String(totaleReale),
      "X-Export-Troncato": troncato ? "1" : "0",
    };

    if (formato === "json") {
      const encoder = new TextEncoder();
      const sorgente = creaSorgente();
      let primo = true;
      let aperto = false;
      let chiuso = false;
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            if (segnale?.aborted) {
              controller.error(abortErrore());
              return;
            }
            if (chiuso) {
              controller.close();
              return;
            }
            if (!aperto) {
              controller.enqueue(encoder.encode(`{"items":[`));
              aperto = true;
              return;
            }
            const righe = await sorgente.prossima();
            if (segnale?.aborted) {
              controller.error(abortErrore());
              return;
            }
            if (righe.length > 0) {
              let pezzo = "";
              for (const riga of righe) {
                pezzo += `${primo ? "" : ","}${JSON.stringify(riga)}`;
                primo = false;
              }
              controller.enqueue(encoder.encode(pezzo));
              return;
            }
            const totale = sorgente.scritti();
            controller.enqueue(
              encoder.encode(
                `],"total":${totale},"totaleReale":${totaleReale},"troncato":${troncato ? "true" : "false"},"cap":${EXPORT_CAP},"generatedAt":${JSON.stringify(generatedAt)},"filtri":${JSON.stringify(filtri)}}`,
              ),
            );
            chiuso = true;
            controller.close();
          } catch (errore) {
            try {
              controller.error(errore);
            } catch {
              // controller gia' chiuso: niente da fare
            }
          }
        },
        cancel() {
          chiuso = true;
        },
      });
      return new NextResponse(stream, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": 'attachment; filename="leggi-export.json"',
          ...intestazioniComuni,
        },
      });
    }

    const encoder = new TextEncoder();
    const sorgente = creaSorgente();
    let intestazioneInviata = false;
    let finitoCsv = false;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (segnale?.aborted) {
            controller.error(abortErrore());
            return;
          }
          if (finitoCsv) {
            controller.close();
            return;
          }
          if (!intestazioneInviata) {
            controller.enqueue(encoder.encode(`\uFEFF${COLONNE.join(",")}\r\n`));
            intestazioneInviata = true;
            return;
          }
          const righe = await sorgente.prossima();
          if (segnale?.aborted) {
            controller.error(abortErrore());
            return;
          }
          if (righe.length === 0) {
            finitoCsv = true;
            controller.close();
            return;
          }
          const pezzi: string[] = [];
          for (const riga of righe) {
            pezzi.push(rigaCsv(riga));
          }
          controller.enqueue(encoder.encode(`${pezzi.join("\r\n")}\r\n`));
        } catch (errore) {
          try {
            controller.error(errore);
          } catch {
            // controller gia' chiuso: niente da fare
          }
        }
      },
      cancel() {
        finitoCsv = true;
      },
    });
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="leggi-export.csv"',
        ...intestazioniComuni,
      },
    });
  } catch {
    return NextResponse.json({ items: [], total: 0 });
  }
}
