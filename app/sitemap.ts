import type { MetadataRoute } from 'next'

import { queryLaws } from '@/lib/db'

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://simple-law.it').replace(/\/+$/, '')

// Numero di schede legge incluse nella sitemap.
// Se la build risulta troppo lenta, ridurre a 2000.
const LIMITE_SITEMAP = 5000

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statiche: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/leggi`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/ministri`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/parlamento`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/parlamento/deputati`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/parlamento/senatori`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/parlamento/gruppi`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE_URL}/parlamento/ddl`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE_URL}/consulta`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE_URL}/statistiche`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE_URL}/semplifica`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/salvati`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/fonti`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/metodologia`, changeFrequency: 'monthly', priority: 0.6 },
  ]
  try {
    const leggi = await queryLaws(
      { sort: 'data_desc' } as unknown as Parameters<typeof queryLaws>[0],
      LIMITE_SITEMAP,
    )
    const dinamiche: MetadataRoute.Sitemap = leggi.map((law) => ({
      // Usa law.eli così com'è, togliendo solo eventuali slash iniziali
      // per evitare doppi slash in /leggi//...
      url: `${BASE_URL}/leggi/${law.eli.replace(/^\/+/, '')}`,
      lastModified: law.dataEmanazione,
    }))
    return [...statiche, ...dinamiche]
  } catch {
    return statiche
  }
}
