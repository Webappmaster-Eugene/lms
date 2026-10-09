import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  // Crawlers must be able to read noindex. Authorisation protects learning content.
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/'] } }
}
