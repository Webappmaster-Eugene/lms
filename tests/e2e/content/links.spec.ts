import { expect, test, type Page } from '@playwright/test'

import { NOT_FOUND_HEADING } from '../fixtures/data'
import { APP_URL, LANDING_URL, storageStateOf } from '../fixtures/env'

/**
 * Битые ссылки. Платформа обходится как студент от дашборда по всем внутренним
 * ссылкам; внешние адреса не запрашиваются (сеть наружу в тестах не нужна) —
 * только проверяется, что они абсолютные и по https.
 */
const SKIP = [/^\/admin/, /^\/api\//, /^\/_next\//]
const MAX_PAGES = 60

async function linksOn(page: Page): Promise<string[]> {
  return page.locator('a[href]').evaluateAll((anchors) => anchors.map((a) => (a as HTMLAnchorElement).href))
}

test.describe('платформа (как студент)', () => {
  test.use({ storageState: storageStateOf('student') })

  test('все внутренние ссылки открываются без 4xx/5xx и без страницы 404', async ({ page }) => {
    test.setTimeout(5 * 60_000)
    const origin = new URL(APP_URL).origin
    const queue = ['/']
    const seen = new Set<string>(queue)
    const broken: string[] = []
    const external = new Set<string>()
    const brokenImages: string[] = []

    while (queue.length > 0 && seen.size <= MAX_PAGES) {
      const path = queue.shift()!
      const response = await page.goto(path)
      const status = response?.status() ?? 0
      const soft404 = (await page.getByRole('heading', { name: NOT_FOUND_HEADING, exact: true }).count()) > 0
      if (status >= 400 || soft404) broken.push(`${path} → ${status}${soft404 ? ' (страница 404)' : ''}`)

      const images = await page.locator('img').evaluateAll((imgs) =>
        imgs.filter((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth === 0).map((img) => (img as HTMLImageElement).src),
      )
      brokenImages.push(...images.map((src) => `${path}: ${src}`))

      for (const href of await linksOn(page)) {
        const url = new URL(href)
        if (url.origin !== origin) {
          if (url.protocol === 'http:' || url.protocol === 'https:') external.add(href)
          continue
        }
        const target = url.pathname
        if (SKIP.some((re) => re.test(target)) || seen.has(target)) continue
        seen.add(target)
        queue.push(target)
      }
    }

    expect(broken, 'битые внутренние ссылки').toEqual([])
    expect(brokenImages, 'картинки не загрузились').toEqual([])
    expect([...external].filter((href) => !href.startsWith('https://')), 'внешние ссылки не по https').toEqual([])
    expect(seen.size, 'обход нашёл разделы платформы').toBeGreaterThan(10)
  })
})

test.describe('лендинг', () => {
  test.use({ baseURL: LANDING_URL })

  test('все локальные ссылки, картинки, стили, скрипты и шрифты отдаются', async ({ page, request }) => {
    await page.goto('/')
    const origin = new URL(LANDING_URL).origin
    const resources = await page.evaluate(() => [
      ...[...document.querySelectorAll('a[href]')].map((el) => (el as HTMLAnchorElement).href),
      ...[...document.querySelectorAll('img[src], source[srcset]')].map((el) => (el as HTMLImageElement).src || (el as HTMLSourceElement).srcset.split(' ')[0]),
      ...[...document.querySelectorAll('link[href]')].map((el) => (el as HTMLLinkElement).href),
      ...[...document.querySelectorAll('script[src]')].map((el) => (el as HTMLScriptElement).src),
    ])
    const local = [...new Set(resources.filter((u) => u.startsWith(origin)).map((u) => new URL(u).pathname))]
    expect(local.length).toBeGreaterThan(5)
    const broken: string[] = []
    for (const path of local) {
      const response = await request.get(path)
      if (response.status() >= 400) broken.push(`${path} → ${response.status()}`)
    }
    expect(broken).toEqual([])

    const external = resources.filter((u) => /^https?:/.test(u) && !u.startsWith(origin))
    expect(external.filter((u) => !u.startsWith('https://')), 'внешние ссылки не по https').toEqual([])
    // Ссылка «в платформу» ведёт на боевой адрес LMS.
    expect(external.some((u) => u.startsWith('https://learn.mentorcareer.ru'))).toBe(true)
  })
})
