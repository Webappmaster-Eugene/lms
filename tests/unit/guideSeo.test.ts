import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guideSeo, guideStructuredData } from '@/lib/guide-seo'

const guide = { title: 'Обслуживание харнесса', summary: 'Как очистить окружение агента', slug: 'harness-maintenance', updatedAt: '2026-10-25T12:00:00.000Z' }

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://learn.mentorcareer.ru'))
afterEach(() => vi.unstubAllEnvs())

describe('SEO публичных гайдов', () => {
  it('индексируется только публичный опубликованный гайд; у него свой сниппет и canonical', () => {
    const metadata = guideSeo({ ...guide, isPublic: true, isPublished: true })
    expect(metadata.robots).toEqual({ index: true, follow: true, googleBot: { index: true, follow: true } })
    expect(metadata.alternates?.canonical).toBe('https://learn.mentorcareer.ru/guides/harness-maintenance')
    expect(metadata.openGraph).toMatchObject({ type: 'article', title: guide.title, description: guide.summary })
    expect(metadata.twitter).toMatchObject({ title: guide.title, description: guide.summary })
    for (const flags of [{}, { isPublic: false, isPublished: true }, { isPublic: true, isPublished: false }]) {
      expect(guideSeo({ ...guide, ...flags }).robots).toMatchObject({ index: false, googleBot: { index: false } })
      expect(guideSeo({ ...guide, ...flags }).alternates).toBeUndefined()
    }
  })

  it('структурированные данные сохраняют текст и не позволяют закрыть script из CMS', () => {
    const data = guideStructuredData({ ...guide, title: '</script><script>alert(1)</script>' })
    expect(data).not.toContain('<')
    expect(JSON.parse(data)).toMatchObject({ '@type': 'Article', headline: '</script><script>alert(1)</script>', inLanguage: 'ru' })
  })
})
