import { expect, test } from '@playwright/test'
import { CONTENT, NOT_FOUND_HEADING } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

test.use({ storageState: storageStateOf('student') })

test('ссылка на подборку курсов переживает reload, назад и перенос на телефон', async ({ page, browser }) => {
  const url = `/courses?q=${encodeURIComponent(CONTENT.course.title)}&roadmap=${encodeURIComponent(CONTENT.roadmap.title)}&sort=title&assigned=1`
  await page.goto(url)
  await expect(page.getByRole('searchbox')).toHaveValue(CONTENT.course.title)
  await expect(page.getByRole('link', { name: new RegExp(CONTENT.course.title) })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('searchbox')).toHaveValue(CONTENT.course.title)
  await expect(page.getByRole('combobox', { name: 'Порядок курсов' })).toHaveValue('title')
  await page.getByRole('combobox', { name: 'Порядок курсов' }).selectOption('progress')
  await expect(page).toHaveURL(/sort=progress/)
  await page.goBack()
  await expect(page.getByRole('combobox', { name: 'Порядок курсов' })).toHaveValue('title')
  const phone = await browser.newContext({ storageState: storageStateOf('student'), viewport: { width: 390, height: 844 } })
  try {
    const mobile = await phone.newPage()
    await mobile.goto(`${APP_URL}${url}`)
    await expect(mobile.getByRole('searchbox')).toHaveValue(CONTENT.course.title)
    await expect(mobile.getByRole('combobox', { name: 'Порядок курсов' })).toHaveValue('title')
    await expect(mobile.getByRole('link', { name: new RegExp(CONTENT.course.title) })).toBeVisible()
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  } finally { await phone.close() }
})

test('язык задачи восстанавливается из общей ссылки без кода решения в URL', async ({ page }) => {
  await page.goto(`/trainer/${CONTENT.topic.slug}/${CONTENT.task.slug}?lang=ts`)
  await expect(page.getByRole('button', { name: 'TypeScript', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.getByRole('button', { name: 'TypeScript', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'JavaScript', exact: true }).click()
  await expect(page).toHaveURL(/lang=js/)
  expect(new URL(page.url()).searchParams.has('code')).toBe(false)
})

test('настройки общей ссылки не открывают скрытый урок', async ({ page }) => {
  const protectedRequests: string[] = []
  page.on('request', (request) => { if (/\/api\/(?:lesson-assets|yandex-disk)/.test(request.url())) protectedRequests.push(request.url()) })
  await page.goto(`/lessons/${CONTENT.draftLesson.slug}?video=anything:abcd&t=373&rate=1.5`)
  await expect(page.getByRole('heading', { name: NOT_FOUND_HEADING })).toBeVisible()
  await expect(page.locator('video')).toHaveCount(0)
  expect(protectedRequests).toEqual([])
})

test('вход сохраняет путь и настройки исходной общей ссылки', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try {
    const page = await context.newPage()
    const destination = `/lessons/${CONTENT.lessons[0].slug}?video=${encodeURIComponent('clip:abcd')}&t=373&rate=1.5`
    await page.goto(`${APP_URL}${destination}`)
    await expect(page).toHaveURL(/\/login\?redirect=/)
    expect(new URL(page.url()).searchParams.get('redirect')).toBe(destination)
  } finally { await context.close() }
})
