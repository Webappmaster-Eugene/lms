import { publicGuideWhere } from '@/lib/guide-access'
import { collectAllPages } from '@/lib/paginate'
import { getPayload } from '@/lib/payload'
import { siteUrl } from '@/lib/site-metadata'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const payload = await getPayload()
  const guides = await collectAllPages(({ page, limit }) => payload.find({
    collection: 'guides', where: publicGuideWhere, select: { slug: true, updatedAt: true },
    overrideAccess: false, user: null, depth: 0, sort: 'id', page, limit,
  }), { label: 'публичные гайды для sitemap' })
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  const entries = [
    `<url><loc>${escape(new URL('/guides', siteUrl()).toString())}</loc></url>`,
    ...guides.map((guide) => `<url><loc>${escape(new URL(`/guides/${encodeURIComponent(guide.slug)}`, siteUrl()).toString())}</loc><lastmod>${escape(guide.updatedAt)}</lastmod></url>`),
  ]
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
