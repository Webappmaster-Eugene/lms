import type { Metadata } from 'next'
import { metaDescription, OG_IMAGE, SITE_NAME, siteUrl } from '@/lib/site-metadata'

type SeoGuide = { title: string; summary: string; slug: string; isPublic?: boolean | null; isPublished?: boolean | null; announcedAt?: string | null; updatedAt: string }

export function guideSeo(guide: SeoGuide): Metadata {
  const index = guide.isPublic === true && guide.isPublished === true
  const description = metaDescription(guide.summary)
  const url = new URL(`/guides/${encodeURIComponent(guide.slug)}`, siteUrl()).toString()
  return {
    title: guide.title,
    description,
    robots: { index, follow: index, googleBot: { index, follow: index } },
    ...(index && {
      alternates: { canonical: url },
      openGraph: { type: 'article', locale: 'ru_RU', siteName: SITE_NAME, title: guide.title, description, url, images: [OG_IMAGE], publishedTime: guide.announcedAt ?? undefined, modifiedTime: guide.updatedAt },
      twitter: { card: 'summary_large_image', title: guide.title, description, images: [OG_IMAGE.url] },
    }),
  }
}

export function guideStructuredData(guide: SeoGuide): string {
  return JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Article',
    headline: guide.title, description: metaDescription(guide.summary),
    mainEntityOfPage: new URL(`/guides/${encodeURIComponent(guide.slug)}`, siteUrl()).toString(),
    datePublished: guide.announcedAt ?? undefined, dateModified: guide.updatedAt,
    inLanguage: 'ru', image: new URL(OG_IMAGE.url, siteUrl()).toString(),
    publisher: { '@type': 'Organization', name: 'MentorCareer', url: 'https://info.mentorcareer.ru' },
  }).replace(/</g, '\\u003c')
}
