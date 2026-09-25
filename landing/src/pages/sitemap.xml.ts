import type { APIRoute } from 'astro'

import { SITE_URL } from '../config'

/** Генерируется при сборке: статичный файл забывали обновлять, и lastmod
 *  месяцами врал. Changefreq и priority Google игнорирует, поэтому их нет. */
const PAGES = ['/'] as const

export const GET: APIRoute = () => {
  const lastmod = new Date().toISOString().slice(0, 10)
  const urls = PAGES.map(
    (path) => `  <url>\n    <loc>${new URL(path, SITE_URL).href}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`,
  ).join('\n')

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  )
}
