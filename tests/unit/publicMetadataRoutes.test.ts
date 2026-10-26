import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { publicGuideWhere } from '@/lib/guide-access'

/**
 * Служебные адреса для поисковиков и установки приложения: /sitemap.xml,
 * /robots.txt и манифест PWA. CMS — граница, подменяется `@/lib/payload`.
 */

const find = vi.hoisted(() => vi.fn())

vi.mock('@/lib/payload', () => ({ getPayload: async () => ({ find }) }))

beforeEach(() => {
  find.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('sitemap.xml', () => {
  async function sitemap() {
    const { GET } = await import('@/app/sitemap.xml/route')
    const response = await GET()
    return { response, xml: await response.text() }
  }

  it('берёт из CMS только опубликованные публичные гайды и от имени анонима', async () => {
    find.mockResolvedValue({ docs: [], hasNextPage: false })

    await sitemap()

    expect(find).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'guides',
      where: publicGuideWhere,
      overrideAccess: false,
      user: null,
      select: { slug: true, updatedAt: true },
      sort: 'id',
    }))
  })

  it('перечисляет раздел гайдов и все гайды со всех страниц выборки, с датой изменения', async () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://learn.example.test')
    find
      .mockResolvedValueOnce({ docs: [{ slug: 'git-basics', updatedAt: '2026-10-01T10:00:00.000Z' }], hasNextPage: true })
      .mockResolvedValueOnce({ docs: [{ slug: 'docker-compose', updatedAt: '2026-10-20T08:30:00.000Z' }], hasNextPage: false })

    const { response, xml } = await sitemap()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true)
    expect([...xml.matchAll(/<url>(.*?)<\/url>/g)].map((match) => match[1])).toEqual([
      '<loc>https://learn.example.test/guides</loc>',
      '<loc>https://learn.example.test/guides/git-basics</loc><lastmod>2026-10-01T10:00:00.000Z</lastmod>',
      '<loc>https://learn.example.test/guides/docker-compose</loc><lastmod>2026-10-20T08:30:00.000Z</lastmod>',
    ])
    expect(find.mock.calls.map(([args]) => args.page)).toEqual([1, 2])
  })

  it('спецсимволы из slug и даты не ломают XML', async () => {
    find.mockResolvedValue({ docs: [{ slug: "o'reilly & <co>", updatedAt: '2026-10-01"<x>' }], hasNextPage: false })

    const { xml } = await sitemap()

    expect(xml).toContain('<loc>https://learn.mentorcareer.ru/guides/o&apos;reilly%20%26%20%3Cco%3E</loc>')
    expect(xml).toContain('<lastmod>2026-10-01&quot;&lt;x&gt;</lastmod>')
    expect(xml.replace(/<[^>]+>/g, '')).not.toMatch(/[<>"']|&(?!amp;|lt;|gt;|quot;|apos;)/)
  })
})

describe('robots.txt', () => {
  it('закрывает API и админку, но не сам сайт: краулер должен видеть noindex закрытых страниц', async () => {
    const { default: robots } = await import('@/app/robots')

    const result = robots()

    expect(result.rules).toEqual({ userAgent: '*', allow: '/', disallow: ['/api/', '/admin/'] })
  })

  it('ссылка на sitemap строится от адреса сайта, а без него — от прод-домена', async () => {
    const { default: robots } = await import('@/app/robots')

    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://learn.example.test')
    expect(robots().sitemap).toBe('https://learn.example.test/sitemap.xml')

    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', '')
    expect(robots().sitemap).toBe('https://learn.mentorcareer.ru/sitemap.xml')
  })
})

describe('манифест PWA', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))

  /** Next отдаёт /icon.svg из src/app, остальное — из public. */
  function iconPath(src: string): string {
    const fromApp = `${root}src/app${src}`
    return existsSync(fromApp) ? fromApp : `${root}public${src}`
  }

  function pngSize(path: string): string {
    const header = readFileSync(path)
    return `${header.readUInt32BE(16)}x${header.readUInt32BE(20)}`
  }

  it('устанавливается как отдельное приложение на русском с корнем сайта как стартом', async () => {
    const { default: manifest } = await import('@/app/manifest')

    expect(manifest()).toMatchObject({ id: '/', start_url: '/', scope: '/', display: 'standalone', lang: 'ru', prefer_related_applications: false })
  })

  it('каждая иконка существует, а размеры PNG совпадают с объявленными', async () => {
    const { default: manifest } = await import('@/app/manifest')
    const icons = manifest().icons ?? []

    for (const icon of icons) {
      const path = iconPath(icon.src)
      expect(existsSync(path), icon.src).toBe(true)
      if (icon.type === 'image/png') expect(pngSize(path), icon.src).toBe(icon.sizes)
    }
  })

  it('есть иконки 192 и 512 для установки и отдельная maskable для Android', async () => {
    const { default: manifest } = await import('@/app/manifest')
    const icons = manifest().icons ?? []

    expect(icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any')).toBe(true)
    expect(icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any')).toBe(true)
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
  })
})
