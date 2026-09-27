import { expect, test } from '@playwright/test'

import { CONTENT, NOT_FOUND_HEADING } from '../fixtures/data'
import { storageStateOf } from '../fixtures/env'

/**
 * Платформа закрыта логином, в поиск ей не нужно: проверяем базовые мета-теги
 * публичных страниц и что у каждой внутренней страницы свой заголовок.
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
})

test.describe('внутренние страницы', () => {
  test.use({ storageState: storageStateOf('student') })

  test('у каждой страницы свой title с шаблоном «… — MentorCareer LMS»', async ({ page }) => {
    const expected: [string, string][] = [
      ['/', 'Дашборд'],
      ['/courses', 'Курсы'],
      [`/courses/${CONTENT.course.slug}`, CONTENT.course.title],
      [`/lessons/${CONTENT.lessons[0].slug}`, CONTENT.lessons[0].title],
      ['/trainer', 'Тренажёр кода'],
      [`/trainer/${CONTENT.topic.slug}/${CONTENT.task.slug}`, CONTENT.task.title],
      ['/roadmaps', 'Роадмапы'],
      ['/leaderboard', 'Лидерборд'],
      ['/help', 'Помощь'],
    ]
    for (const [path, title] of expected) {
      await page.goto(path)
      await expect(page, path).toHaveTitle(`${title} — MentorCareer LMS`)
    }
  })

  // Next с loading.tsx начинает стримить ответ до notFound(), и статус уже 200.
  test.fail('БАГ: черновик/несуществующий урок отдаёт HTTP 404, а не «мягкий» 404 со статусом 200', async ({ request }) => {
    const response = await request.get(`/lessons/${CONTENT.draftLesson.slug}`)
    expect(await response.text()).toContain(NOT_FOUND_HEADING)
    expect(response.status()).toBe(404)
  })
})
