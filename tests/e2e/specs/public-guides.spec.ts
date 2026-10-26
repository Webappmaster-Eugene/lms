import { expect, test } from '@playwright/test'
import { APP_URL, storageStateOf } from '../fixtures/env'

test.use({ storageState: storageStateOf('admin') })

test('админ делает гайд публичным: гость читает, скачивает и видит SEO; снятие флага закрывает всё', async ({ page, request, browser }) => {
  const slug = `public-guide-${Date.now()}`
  const ids: number[] = []
  async function create(suffix: string, isPublished: boolean, isPublic = false) {
    const response = await request.post('/api/guides', { data: { title: `Публичность ${suffix}`, summary: 'Описание для превью ссылки', slug: `${slug}-${suffix}`, markdown: '## Обслуживание\n\nТекст инструкции.\n\n## Проверка\n\nПроверьте результат.', isPublished, isPublic } })
    expect(response.status()).toBe(201)
    const { doc } = await response.json()
    ids.push(doc.id)
    return doc as { id: number; title: string; slug: string }
  }
  const guest = await browser.newContext({ baseURL: APP_URL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { Origin: APP_URL } })
  try {
    const item = await create('open', true)
    const closed = await create('closed', true)
    const draft = await create('draft', false, true)
    await page.goto(`/admin/collections/guides/${item.id}`)
    await page.locator('#field-isPublic').check()
    await Promise.all([
      page.waitForResponse((response) => response.url().includes(`/api/guides/${item.id}`) && response.request().method() === 'PATCH' && response.ok()),
      page.getByRole('button', { name: 'Save', exact: true }).first().click(),
    ])
    await page.goto('/guides')
    await expect(page.getByRole('link', { name: new RegExp(item.title) }).getByText('Публичный', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(closed.title) }).getByText('Публичный', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: new RegExp(draft.title) }).getByText('Публичный после публикации', { exact: true })).toBeVisible()
    await expect(page.getByText('С меткой «Публичный» гайд открывается без входа')).toBeVisible()

    const reader = await guest.newPage()
    const response = await reader.goto(`/guides/${item.slug}`)
    expect(response?.status()).toBe(200)
    expect(response?.headers()['x-robots-tag'] ?? '').not.toContain('noindex')
    await expect(reader.getByRole('heading', { name: item.title, level: 1 })).toBeVisible()
    await expect(reader.getByRole('link', { name: 'Войти в LMS' })).toBeVisible()
    await expect(reader.getByRole('button', { name: 'В сохранённое' })).toHaveCount(0)
    await expect(reader.getByRole('region', { name: 'Гайд помог?' })).toHaveCount(0)
    await expect(reader.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow')
    await expect(reader.locator('meta[name="googlebot"]')).toHaveAttribute('content', 'index, follow')
    await expect(reader.locator('link[rel="canonical"]')).toHaveAttribute('href', `${APP_URL}/guides/${item.slug}`)
    await expect(reader.locator('meta[property="og:title"]')).toHaveAttribute('content', item.title)
    await expect(reader.locator('meta[property="og:description"]')).toHaveAttribute('content', 'Описание для превью ссылки')
    expect(JSON.parse(await reader.locator('script[type="application/ld+json"]').innerText())).toMatchObject({ '@type': 'Article', headline: item.title })
    const download = await guest.request.get(`/guides/${item.slug}/download`)
    expect(download.status()).toBe(200)
    expect(await download.text()).toContain('Текст инструкции.')
    await reader.goto('/guides')
    await expect(reader.getByRole('link', { name: new RegExp(item.title) })).toBeVisible()
    await expect(reader.getByText('Публичный', { exact: true })).toHaveCount(0)
    await expect(reader.getByText(closed.title)).toHaveCount(0)
    await expect(reader.getByText(draft.title)).toHaveCount(0)
    const sitemap = await guest.request.get('/sitemap.xml')
    expect(sitemap.status()).toBe(200)
    expect(await sitemap.text()).toContain(`/guides/${item.slug}</loc>`)
    expect(await sitemap.text()).not.toContain(closed.slug)
    expect(await sitemap.text()).not.toContain(draft.slug)
    for (const hidden of [closed, draft]) {
      expect((await guest.request.get(`/guides/${hidden.slug}`)).status()).toBe(404)
      expect((await guest.request.get(`/guides/${hidden.slug}/download`)).status()).toBe(404)
    }
    expect((await guest.request.get('/courses', { maxRedirects: 0 })).status()).toBe(307)
    await reader.setViewportSize({ width: 375, height: 812 })
    await reader.goto(`/guides/${item.slug}`)
    expect(await reader.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await request.patch(`/api/guides/${item.id}`, { data: { isPublic: false } })
    expect((await guest.request.get(`/guides/${item.slug}`)).status()).toBe(404)
    expect((await guest.request.get(`/guides/${item.slug}/download`)).status()).toBe(404)
    expect(await (await guest.request.get('/sitemap.xml')).text()).not.toContain(item.slug)
  } finally {
    await guest.close()
    for (const id of ids) await request.delete(`/api/guides/${id}`)
  }
})
