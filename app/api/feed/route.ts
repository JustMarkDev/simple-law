import { getLawsFromDBorSeed, listLaws } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Numero massimo di voci esposte nel feed. */
export const FEED_MAX = 50;

/** Rimuove i caratteri vietati in XML 1.0 (control characters). */
function pulisciXml(value: string): string {
  // U+0000-U+0008, U+000B, U+000C, U+000E-U+001F, U+007F non sono validi in XML 1.0.
  // oxlint-disable-next-line no-control-regex -- strips control characters on purpose
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function escXml(value: string): string {
  return pulisciXml(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function dataRfc822(iso: string): string {
  const data = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(data.getTime()) ? new Date().toUTCString() : data.toUTCString();
}

/** Hash FNV-1a a 32 bit, reso come esadecimale (per ETag senza dipendenze). */
function etagPer(contenuto: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < contenuto.length; i += 1) {
    hash ^= contenuto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `"sl-${(hash >>> 0).toString(16)}"`;
}

/**
 * GET /api/feed -> feed RSS delle ultime norme (max 50).
 * Legge solo una pagina server (`listLaws` page 1, per 50, data_desc):
 * mai full-scan del corpus. Con ETag/Last-Modified e 304 condizionale;
 * non lancia mai 500: errore inatteso -> feed vuoto 200.
 */
export async function GET(request?: Request) {
  try {
    let items: Awaited<ReturnType<typeof getLawsFromDBorSeed>> = [];
    try {
      const pagina = await listLaws({ page: 1, per: FEED_MAX, sort: "data_desc" });
      items = (Array.isArray(pagina?.items) ? pagina.items : []).slice(0, FEED_MAX);
    } catch {
      items = [];
    }
    if (items.length === 0) {
      try {
        const tutte = await getLawsFromDBorSeed();
        items = (Array.isArray(tutte) ? tutte : []).slice(0, FEED_MAX);
      } catch {
        items = [];
      }
    }

    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://simplelaw.example").replace(
      /\/+$/,
      "",
    );
    const ultimaData = items[0]?.dataEmanazione
      ? dataRfc822(items[0].dataEmanazione)
      : new Date().toUTCString();

    const voci = items
      .map((law) => {
        const link = `${base}/leggi${law.eli}`;
        return [
          "    <item>",
          `      <title>${escXml(law.titolo)}</title>`,
          `      <link>${escXml(link)}</link>`,
          `      <guid isPermaLink="false">${escXml(law.eli)}</guid>`,
          `      <pubDate>${dataRfc822(law.dataEmanazione)}</pubDate>`,
          `      <description>${escXml(law.sintesi)}</description>`,
          "    </item>",
        ].join("\n");
      })
      .join("\n");

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0">',
      "  <channel>",
      "    <title>SimpleLaw Italia - Ultime norme</title>",
      `    <link>${escXml(base)}</link>`,
      "    <description>Novita' normative italiane spiegate in parole semplici.</description>",
      "    <language>it-IT</language>",
      `    <lastBuildDate>${ultimaData}</lastBuildDate>`,
      voci,
      "  </channel>",
      "</rss>",
      "",
    ].join("\n");

    const etag = etagPer(xml);
    const intestazioni: Record<string, string> = {
      "content-type": "application/rss+xml; charset=utf-8",
      etag,
      "last-modified": ultimaData,
      "cache-control": "public, max-age=300, stale-while-revalidate=600",
    };

    if (request) {
      const seNessunaCorrispondenza = request.headers.get("if-none-match");
      if (seNessunaCorrispondenza && seNessunaCorrispondenza === etag) {
        return new Response(null, { status: 304, headers: intestazioni });
      }
      const seModificatoDa = request.headers.get("if-modified-since");
      if (seModificatoDa && seModificatoDa === ultimaData) {
        return new Response(null, { status: 304, headers: intestazioni });
      }
    }

    return new Response(xml, {
      status: 200,
      headers: intestazioni,
    });
  } catch {
    const vuoto = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0">',
      "  <channel>",
      "    <title>SimpleLaw Italia - Ultime norme</title>",
      "    <language>it-IT</language>",
      "  </channel>",
      "</rss>",
      "",
    ].join("\n");
    return new Response(vuoto, {
      status: 200,
      headers: {
        "content-type": "application/rss+xml; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}
