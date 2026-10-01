import type { MetadataRoute } from "next";

import { QUERY_CAP_MASSIMO, queryLaws } from "@/lib/db";
import { getCorpusInfo, getSeedLaws } from "@/lib/sources";

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://simple-law.it").replace(/\/+$/, "");

/**
 * Totale reale del corpus a build time (mai hardcoded).
 * Fonte primaria `getCorpusInfo().totale`, fallback `getSeedLaws().length`.
 * Never-throw (-> 0): il chiamante usa il cap massimo in caso di 0.
 */
function totaleCorpusBuildTime(): number {
  try {
    const totale = getCorpusInfo()?.totale;
    if (typeof totale === "number" && Number.isFinite(totale) && totale > 0) {
      return Math.floor(totale);
    }
  } catch {
    // fallback sotto
  }
  try {
    const n = getSeedLaws().length;
    if (typeof n === "number" && Number.isFinite(n) && n > 0) return Math.floor(n);
  } catch {
    // fallback a 0
  }
  return 0;
}

/**
 * Percorso ELI slugificato per /leggi/[...eli], stesse regole di `lawHref`
 * (trim, strip slash, split, encode per segmento). Ritorna null se ELI
 * assente/malformato: la voce viene saltata (mai 500). Never-throw.
 */
function slugPercorsoEli(eli: unknown): string | null {
  try {
    if (typeof eli !== "string") return null;
    const pulito = eli.trim().replace(/^\/+/, "").replace(/\/+$/, "");
    if (!pulito) return null;
    const segmenti = pulito
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    if (segmenti.length === 0) return null;
    const encoded = segmenti.map((s) => encodeURIComponent(s)).join("/");
    return encoded || null;
  } catch {
    return null;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statiche: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE_URL}/leggi`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/gazzetta`, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/ministri`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/parlamento`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/parlamento/deputati`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/parlamento/senatori`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/parlamento/gruppi`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE_URL}/parlamento/ddl`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/eurlex`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE_URL}/quirinale`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE_URL}/elezioni`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/elezioni/europee-2024`, changeFrequency: "monthly", priority: 0.6 },
    {
      url: `${BASE_URL}/elezioni/politiche-2022-camera`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/elezioni/politiche-2022-senato`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    { url: `${BASE_URL}/elezioni/referendum-2025`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/regionali-extra`, changeFrequency: "monthly", priority: 0.6 },
    {
      url: `${BASE_URL}/regionali-extra/regionali-2024-liguria`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/regionali-extra/regionali-2025-calabria`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    { url: `${BASE_URL}/consulta`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE_URL}/controllo`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE_URL}/controllo/lista`, changeFrequency: "daily", priority: 0.6 },
    { url: `${BASE_URL}/finanziamenti`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/statistiche`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE_URL}/semplifica`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/salvati`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/fonti`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/metodologia`, changeFrequency: "monthly", priority: 0.6 },
  ];
  try {
    // Limite dinamico = intero corpus reale (mai troncamento sotto il totale).
    // Clamp al cap anti-DoS di queryLaws; se il totale non e' leggibile,
    // usa il cap massimo (copre comunque l'intero corpus).
    const totale = totaleCorpusBuildTime();
    const limite = totale > 0 ? Math.min(QUERY_CAP_MASSIMO, totale) : QUERY_CAP_MASSIMO;
    const leggi = await queryLaws(
      { sort: "data_desc" } as unknown as Parameters<typeof queryLaws>[0],
      limite,
    );
    const visti = new Set<string>();
    const dinamiche: MetadataRoute.Sitemap = [];
    for (const law of leggi) {
      try {
        const slug = slugPercorsoEli((law as { eli?: unknown })?.eli);
        if (!slug) continue;
        const chiave = slug.toLowerCase();
        if (visti.has(chiave)) continue;
        visti.add(chiave);
        dinamiche.push({
          url: `${BASE_URL}/leggi/${slug}`,
          lastModified: law.dataEmanazione,
        });
      } catch {
        continue;
      }
    }
    return [...statiche, ...dinamiche];
  } catch {
    return statiche;
  }
}
