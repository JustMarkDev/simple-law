import { getLawsFromDBorSeed } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function escXml(value: string): string {
  return value
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

/** GET /api/feed -> feed RSS delle ultime norme. */
export async function GET() {
  let items: Awaited<ReturnType<typeof getLawsFromDBorSeed>> = [];
  try {
    items = (await getLawsFromDBorSeed()).slice(0, 50);
  } catch {
    items = [];
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://simplelaw.example").replace(/\/+$/, "");
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

  return new Response(xml, {
    status: 200,
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
