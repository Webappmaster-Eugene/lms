import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { CONTENT, NOT_FOUND_HEADING } from '../fixtures/data'
import { storageStateOf } from '../fixtures/env'

/**
 * Платформа закрыта логином, в поиск ей не нужно: проверяем базовые мета-теги
 * публичных страниц, иконки, превью для мессенджеров и что у каждой внутренней
 * страницы свой заголовок.
 */
test('публичные страницы: lang=ru, title, description, viewport, manifest, иконка', async ({ page, request }) => {
  for (const path of ['/login', '/forgot-password']) {
    await page.goto(path)
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await expect(page).toHaveTitle(/MentorCareer LMS/)
    const description = await page.locator('meta[name="description"]').getAttribute('content')
    expect(description?.length ?? 0, path).toBeGreaterThan(50)
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /MentorCareer/)
  }
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  const manifest = await request.get(manifestHref!)
  expect(manifest.status()).toBe(200)
  expect((await manifest.json()).lang ?? 'ru').toBe('ru')
  await expectIcons(page, request)
})

/** Иконки и превью раньше пропадали молча: поле icons в метаданных layout отключило app/icon.svg. */
async function expectIcons(page: Page, request: APIRequestContext) {
  const icons = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll((links) =>
    links.map((link) => new URL(link.getAttribute('href') ?? '', location.href).pathname),
  )
  expect(icons).toEqual(expect.arrayContaining(['/favicon.ico', '/icon.svg', '/images/pwa/apple-touch-icon.png']))
  for (const path of new Set(icons)) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(200)
    expect(response.headers()['content-type'], path).toMatch(/^image\//)
  }
}

test('ссылка на платформу в мессенджере получает картинку превью', async ({ page, request }) => {
  // Краулер мессенджера без cookie попадает на /login — превью строится по его мета-тегам.
  await page.goto('/login')
  const image = await page.locator('meta[property="og:image"]').getAttribute('content')
  expect(image).toMatch(/^https?:\/\/[^/]+\/images\/og\.png$/)
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200')
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
  const png = await request.get(new URL(image!).pathname, { maxRedirects: 0 })
  expect(png.status()).toBe(200)
  expect(png.headers()['content-type']).toBe('image/png')
})

test('favicon.ico и llms.txt отдаются без входа', async ({ request }) => {
  const favicon = await request.get('/favicon.ico', { maxRedirects: 0 })
  expect(favicon.status()).toBe(200)
  expect(favicon.headers()['content-type']).toMatch(/^image\//)
  const llms = await request.get('/llms.txt', { maxRedirects: 0 })
  expect(llms.status()).toBe(200)
  expect(llms.headers()['content-type']).toMatch(/^text\/plain.*utf-8/i)
  expect(await llms.text()).toContain('MentorCareer')
})

test.describe('внутренние страницы', () => {
  test.use({ storageState: storageStateOf('student') })

  test('у каждой страницы свой title с шаблоном «… — MentorCareer LMS»', async ({ page }) => {
    const expected: [string, string][] = [
      ['/', 'Дашборд'],
      ['/courses', 'Курсы'],
      [`/courses/${CONTENT.course.slug}`, CONTENT.course.title],
      [`/lessons/${CONTENT.lessons[0].slug}`, `${CONTENT.lessons[0].title} · ${CONTENT.course.title}`],
      ['/trainer', 'Тренажёр кода'],
      [`/trainer/${CONTENT.topic.slug}/${CONTENT.task.slug}`, CONTENT.task.title],
      ['/roadmaps', 'Роадмапы'],
      ['/leaderboard', 'Лидерборд'],
      ['/help', 'Помощь'],
    ]
    for (const [path, title] of expected) {
      await page.goto(path)
      await expect(page, path).toHaveTitle(`${title} - MentorCareer LMS`)
    }
  })

  test('урок описан своим текстом, а внутренние страницы сохраняют иконки', async ({ page, request }) => {
    await page.goto(`/lessons/${CONTENT.lessons[0].slug}`)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', `Урок 1 курса «${CONTENT.course.title}».`)
    await expectIcons(page, request)
  })

  // Страница урока вне группы со скелетоном: notFound() успевает до начала стрима.
  test('черновик/несуществующий урок отдаёт HTTP 404, а не «мягкий» 404 со статусом 200', async ({ request }) => {
    const response = await request.get(`/lessons/${CONTENT.draftLesson.slug}`)
    expect(await response.text()).toContain(NOT_FOUND_HEADING)
    expect(response.status()).toBe(404)
  })
})
