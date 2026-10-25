import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-metadata'

export default function robots(): MetadataRoute.Robots {
  // Crawlers must be able to read noindex. Authorisation protects learning content.
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/'] }, sitemap: new URL('/sitemap.xml', siteUrl()).toString() }
}
