import { expect, test } from '@playwright/test'

import { LANDING_URL, LANDING_USE } from '../fixtures/env'

/**
 * Лендинг (landing/, Astro): мета-теги, canonical, Open Graph, JSON-LD,
 * robots.txt, sitemap.xml, 404, якоря меню. Сайт в индексе — ошибка здесь
 * стоит позиций в выдаче, поэтому проверяется то, что видит поисковик.
 */
const SITE = 'https://info.mentorcareer.ru'

test.use(LANDING_USE)

test('title, description, canonical, robots и язык страницы', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  const title = await page.title()
  expect(title.length).toBeGreaterThan(20)
  // Сниппет режется по ширине (~600px): для кириллицы это 65–70 символов.
  expect(title.length).toBeLessThanOrEqual(70)
  const description = await page.locator('meta[name="description"]').getAttribute('content')
  expect(description?.length ?? 0).toBeGreaterThan(70)
  expect(description?.length ?? 0).toBeLessThanOrEqual(160)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}/`)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index, follow/)
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/)
  await expect(page.locator('h1')).toHaveCount(1)
  // Стили встроены в HTML: отдельный файл задерживал первый экран лишним запросом.
  await expect(page.locator('link[rel="stylesheet"]')).toHaveCount(0)
})

test('шаги разделов — заголовки h3 под заголовком раздела', async ({ page }) => {
  await page.goto('/')
  const trainer = page.locator('#trainer')
  await expect(trainer.locator('h2')).toHaveText('Напишите код, проверьте и отправьте решение')
  // Номер шага отделён пробелом: «1Прочитайте» поисковик прочитал бы одним словом.
  await expect(trainer.getByRole('heading', { level: 3 })).toHaveText(['1 Прочитайте условие и тесты', '2 Проверьте код: «Запустить»', '3 Получите зачёт: «Отправить»'])
  expect(await page.locator('.chapter h3').count()).toBe(await page.locator('[data-step]').count())
})

test('дубли главной отвечают 301 на /', async ({ request }) => {
  // Полный адрес: «//» без него читается как ссылка без протокола.
  const origin = new URL(LANDING_URL).origin
  for (const [path, location] of [['/index.html', '/'], ['/index.html?utm_source=tg', '/?utm_source=tg'], ['//', '/']]) {
    const response = await request.get(`${origin}${path}`, { maxRedirects: 0 })
    expect(response.status(), path).toBe(301)
    expect(response.headers()['location'], path).toBe(location)
  }
})

test('CSP из nginx.conf не ломает страницу: показ шагов, увеличение, поиск по оглавлению', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') violations.push(message.text()) })
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => console.error(`CSP: ${event.violatedDirective} ${event.blockedURI}`))
  })
  const response = await page.goto('/')
  // Сервер тестов берёт заголовки из nginx.conf — проверяем, что CSP действительно пришла.
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'")
  await page.waitForLoadState('networkidle')
  const trainer = page.locator('#trainer')
  await trainer.locator('[data-play]').click()
  await expect(trainer.locator('[data-tour-label]')).toContainText('Шаг 1 из 3')
  await trainer.locator('[data-zoom]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.locator('[data-contents-search] input').first().fill('тренажёр')
  expect(violations).toEqual([])
})

test('Open Graph и Twitter Card заполнены и указывают на существующую картинку', async ({ page, request }) => {
  await page.goto('/')
  const og = async (property: string) => page.locator(`meta[property="og:${property}"]`).getAttribute('content')
  expect(await og('title')).toBe(await page.title())
  expect(await og('description')).toBe(await page.locator('meta[name="description"]').getAttribute('content'))
  expect(await og('url')).toBe(`${SITE}/`)
  expect(await og('type')).toBe('website')
  expect(await og('locale')).toBe('ru_RU')
  const image = await og('image')
  expect(image).toBe(`${SITE}/og.png`)
  // Картинку проверяем в локальной сборке: тот же путь, что уедет на прод.
  const png = await request.get(new URL(image!).pathname)
  expect(png.status()).toBe(200)
  expect(png.headers()['content-type']).toBe('image/png')
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
})

test('JSON-LD описывает инструкцию и FAQ совпадает с вопросами на странице', async ({ page }) => {
  await page.goto('/')
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
  expect(blocks.length).toBeGreaterThan(0)
  const graph = blocks.flatMap((text) => {
    const data = JSON.parse(text) as { '@graph'?: Record<string, unknown>[] }
    return data['@graph'] ?? [data]
  })
  const types = graph.map((node) => node['@type'])
  expect(types).toEqual(expect.arrayContaining(['Organization', 'WebSite', 'WebPage', 'ImageObject', 'FAQPage']))
  const webPage = graph.find((node) => node['@type'] === 'WebPage') as { dateModified: string; primaryImageOfPage: { '@id': string } }
  expect(Number.isNaN(Date.parse(webPage.dateModified))).toBe(false)
  expect(webPage.primaryImageOfPage['@id']).toBe(`${SITE}/#primaryimage`)
  expect(types).not.toContain('Person')
  expect(types).not.toContain('Course')
  for (const node of graph) {
    if (typeof node['@id'] === 'string') expect(node['@id']).toMatch(new RegExp(`^${SITE}/`))
  }
  // Все ссылки @id внутри графа ведут на существующие узлы.
  const ids = new Set(graph.map((node) => node['@id']).filter(Boolean))
  const refs = JSON.stringify(graph).match(/"@id":"[^"]+"/g) ?? []
  for (const ref of refs) expect(ids.has(ref.slice(7, -1)), ref).toBe(true)

  const faq = graph.find((node) => node['@type'] === 'FAQPage') as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
  expect(faq.mainEntity.length).toBeGreaterThan(3)
  const faqSection = page.locator('#faq')
  for (const question of faq.mainEntity) {
    expect(question.acceptedAnswer.text.length, question.name).toBeGreaterThan(10)
    await expect(faqSection.getByText(question.name, { exact: false }).first(), question.name).toBeAttached()
  }
})

test('robots.txt разрешает индексацию и указывает sitemap', async ({ request }) => {
  const response = await request.get('/robots.txt')
  expect(response.status()).toBe(200)
  const text = await response.text()
  expect(text).toMatch(/User-agent: \*/)
  expect(text).not.toMatch(/Disallow: \/\s*$/m)
  expect(text).toContain(`Sitemap: ${SITE}/sitemap.xml`)
  // Метки рассылок и рекламы не должны плодить дубли в Яндексе.
  expect(text).toMatch(/^Clean-param: utm_source&[^\n]*utm_campaign[^\n]* \/$/m)
})

test('sitemap.xml — валидный XML со страницами лендинга и свежим lastmod', async ({ request, page }) => {
  const response = await request.get('/sitemap.xml')
  expect(response.status()).toBe(200)
  const xml = await response.text()
  const parsed = await page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, 'application/xml')
    return {
      error: doc.getElementsByTagName('parsererror').length > 0,
      locs: [...doc.getElementsByTagName('loc')].map((n) => n.textContent),
      lastmod: [...doc.getElementsByTagName('lastmod')].map((n) => n.textContent),
    }
  }, xml)
  expect(parsed.error).toBe(false)
  expect(parsed.locs).toEqual(['/', '/bootcamp/nodejs/', '/bootcamp/nodejs/payment/', '/bootcamp/nodejs/offer/', '/bootcamp/nodejs/quality/', '/privacy/', '/consent/'].map((path) => `${SITE}${path}`))
  expect(parsed.lastmod[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test('favicon.ico, SVG-иконка и apple-touch-icon отдаются картинками', async ({ page, request }) => {
  await page.goto('/')
  const icons = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll((links) =>
    links.map((link) => link.getAttribute('href')),
  )
  // /favicon.ico запрашивают и без ссылки в <head>: Яндекс, старые браузеры, превью мессенджеров.
  for (const href of new Set(['/favicon.ico', ...icons])) {
    const response = await request.get(href!)
    expect(response.status(), href!).toBe(200)
    expect(response.headers()['content-type'], href!).toMatch(/^image\//)
  }
  expect(icons).toEqual(expect.arrayContaining(['/favicon.svg', '/apple-touch-icon.png']))
})

test('llms.txt доступен и в UTF-8', async ({ request }) => {
  const response = await request.get('/llms.txt')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('charset=utf-8')
  expect(await response.text()).toContain('MentorCareer')
})

test('несуществующий адрес — 404 с noindex, а не «мягкий» 404', async ({ page }) => {
  const response = await page.goto('/no-such-page')
  expect(response?.status()).toBe(404)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('каждый пункт меню и метка рельса ведут на существующий якорь', async ({ page }) => {
  await page.goto('/')
  const hrefs = await page.locator('a[href^="#"]').evaluateAll((links) => [...new Set(links.map((a) => a.getAttribute('href')))])
  expect(hrefs.length).toBeGreaterThan(5)
  for (const href of hrefs) {
    if (!href || href === '#') continue
    await expect(page.locator(href), href).toHaveCount(1)
  }
})

test('картинки с alt, внешние ссылки в новой вкладке — с rel="noopener"', async ({ page }) => {
  await page.goto('/')
  const withoutAlt = await page.locator('img:not([alt])').count()
  expect(withoutAlt).toBe(0)
  const unsafe = await page
    .locator('a[target="_blank"]')
    .evaluateAll((links) => links.filter((a) => !/noopener|noreferrer/.test(a.getAttribute('rel') ?? '')).map((a) => a.getAttribute('href')))
  expect(unsafe).toEqual([])
})
