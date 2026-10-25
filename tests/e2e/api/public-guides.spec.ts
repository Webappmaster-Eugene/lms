import { expect, request as playwrightRequest, test } from '@playwright/test'
import { APP_URL, storageStateOf } from '../fixtures/env'

test.use({ storageState: storageStateOf('admin') })

test('публичный HTTP: HTML и метаданные без cookie, sitemap, вложение, скачивание и отзыв доступа', async ({ request }) => {
  const slug = `public-http-${Date.now()}`
  const ids: number[] = []
  let mediaId: number | undefined
  const guest = await playwrightRequest.newContext({ baseURL: APP_URL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: {} })
  async function create(suffix: string, isPublished: boolean, isPublic: boolean, markdown = 'Текст инструкции.') {
    const response = await request.post('/api/guides', { data: { title: `HTTP-гайд ${suffix}`, summary: 'Описание для пересылки ссылки', slug: `${slug}-${suffix}`, markdown, isPublished, isPublic } })
    expect(response.status()).toBe(201)
    const { doc } = await response.json()
    ids.push(doc.id)
    return doc as { id: number; slug: string; title: string }
  }
  try {
    const bytes = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c636000000000050001a5f645400000000049454e44ae426082', 'hex')
    const uploaded = await request.post('/api/media', { multipart: { _payload: JSON.stringify({ alt: 'Публичная схема' }), file: { name: `${slug}.png`, mimeType: 'image/png', buffer: bytes } } })
    expect(uploaded.status()).toBe(201)
    const image = (await uploaded.json()).doc as { id: number; filename: string }
    mediaId = image.id
    const mediaPath = `/api/media/file/${image.filename}`
    const markdown = `## Обслуживание\n\nТекст инструкции.\n\n![Схема](${mediaPath})`
    const item = await create('open', true, false, markdown)
    const closed = await create('closed', true, false)
    const draft = await create('draft', false, true)
    expect((await guest.get(mediaPath)).status()).toBe(401)
    expect((await request.patch(`/api/guides/${item.id}`, { data: { isPublic: true } })).status()).toBe(200)

    const response = await guest.get(`/guides/${item.slug}`)
    expect(response.status()).toBe(200)
    expect(response.headers()['x-robots-tag'] ?? '').not.toContain('noindex')
    const html = await response.text()
    expect(html).toContain(`>${item.title}</h1>`)
    expect(html).toContain('Текст инструкции.')
    for (const name of ['robots', 'googlebot']) {
      expect(html).toContain(`name="${name}" content="index, follow"`)
    }
    expect(html).toContain(`rel="canonical" href="${APP_URL}/guides/${item.slug}"`)
    expect(html).toContain(`property="og:title" content="${item.title}"`)
    expect(html).toContain('property="og:description" content="Описание для пересылки ссылки"')
    const structured = /<script type="application\/ld\+json">([^<]+)<\/script>/.exec(html)?.[1]
    expect(JSON.parse(structured ?? '{}')).toMatchObject({ '@type': 'Article', headline: item.title })
    expect(html).not.toContain('aria-label="В сохранённое"')
    const imageResponse = await guest.get(mediaPath)
    expect(imageResponse.status()).toBe(200)
    expect(imageResponse.headers()['content-type']).toBe('image/png')
    const download = await guest.get(`/guides/${item.slug}/download`)
    expect(download.status()).toBe(200)
    expect(await download.text()).toContain(markdown.replaceAll('](/api/', `](${APP_URL}/api/`))
    expect(download.headers()['x-robots-tag']).toContain('noindex')

    const listing = await (await guest.get('/guides')).text()
    expect(listing).toContain(item.title)
    expect(listing).not.toContain(closed.title)
    expect(listing).not.toContain(draft.title)
    const sitemap = await guest.get('/sitemap.xml')
    expect(sitemap.status()).toBe(200)
    const xml = await sitemap.text()
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
    expect(locations).toContain(`${APP_URL}/guides/${item.slug}`)
    expect(locations).not.toContain(`${APP_URL}/guides/${closed.slug}`)
    expect(locations).not.toContain(`${APP_URL}/guides/${draft.slug}`)
    expect(await (await guest.get('/robots.txt')).text()).toContain(`Sitemap: ${APP_URL}/sitemap.xml`)
    for (const hidden of [closed, draft]) {
      const denied = await guest.get(`/guides/${hidden.slug}`)
      expect(denied.status()).toBe(404)
      expect(await denied.text()).not.toContain(hidden.title)
      expect((await guest.get(`/guides/${hidden.slug}/download`)).status()).toBe(404)
    }
    expect((await guest.get('/courses', { maxRedirects: 0 })).status()).toBe(307)
    expect((await guest.get(`/api/guides/versions?where[parent][equals]=${item.id}`)).status()).toBe(403)
    expect((await request.patch(`/api/guides/${item.id}`, { data: { isPublic: false } })).status()).toBe(200)
    expect((await guest.get(`/guides/${item.slug}`)).status()).toBe(404)
    expect((await guest.get(`/guides/${item.slug}/download`)).status()).toBe(404)
    expect((await guest.get(mediaPath)).status()).toBe(401)
    expect(await (await guest.get('/sitemap.xml')).text()).not.toContain(item.slug)
  } finally {
    await guest.dispose()
    for (const id of ids) await request.delete(`/api/guides/${id}`)
    if (mediaId !== undefined) await request.delete(`/api/media/${mediaId}`)
  }
})
