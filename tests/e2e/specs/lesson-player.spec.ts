import { readFile } from 'node:fs/promises'
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'
import type { Lesson } from '@/payload-types'
import { CONTENT } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

const PARTS = 3
const NOTES = '## Коротко\n\nСуть урока одной строкой.\n\n## Подробно\n\nРазбор по шагам.\n\n```ts\nconst a = 1\n```\n'
const MOBILE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

/** Настоящий урок из трёх записей и конспекта: браузерное поведение плеера моками не проверить. */
async function createLesson(admin: APIRequestContext) {
  const buffer = await readFile(new URL('../fixtures/resume-test.webm', import.meta.url))
  const stamp = Date.now()
  const media: { id: number; url: string }[] = []
  for (let part = 1; part <= PARTS; part++) {
    const uploaded = await admin.post(`${APP_URL}/api/media`, { multipart: { _payload: JSON.stringify({ alt: `Часть ${part}` }), file: { name: `player-${stamp}-${part}.webm`, mimeType: 'video/webm', buffer } } })
    expect(uploaded.status()).toBe(201)
    media.push((await uploaded.json()).doc)
  }
  const course = (await (await admin.get(`${APP_URL}/api/courses?where[slug][equals]=${CONTENT.course.slug}&depth=0`)).json()).docs[0]
  const created = await admin.post(`${APP_URL}/api/lessons`, { data: {
    title: `Урок из трёх частей ${stamp}`, course: course.id, isPublished: true, estimatedMinutes: 30,
    content: [
      ...media.map((file, index) => ({ blockType: 'video', title: `Часть ${index + 1}`, videoUrl: file.url, displayMode: 'embed' })),
      { blockType: 'lessonNotes', markdown: NOTES, source: 'author' },
    ],
  } })
  expect(created.status()).toBe(201)
  return { lesson: (await created.json()).doc as Lesson, media }
}

const framePlaying = (page: Page) => page.locator('[data-lesson-video] video').evaluateAll((videos) => (videos as HTMLVideoElement[]).map((video) => !video.paused))
const fullscreenIndex = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[data-lesson-video] video')].indexOf(document.fullscreenElement as Element))

async function fingerSwipe(page: Page, fromX: number, toX: number, y: number) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y }] })
  for (let step = 1; step <= 6; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fromX + ((toX - fromX) * step) / 6, y }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test.describe('плеер урока из нескольких частей', () => {
  let adminContext: BrowserContext
  let admin: APIRequestContext
  let lesson: Lesson
  let media: { id: number; url: string }[]

  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('admin') })
    admin = adminContext.request
    ;({ lesson, media } = await createLesson(admin))
  })

  test.afterAll(async () => {
    await admin.delete(`${APP_URL}/api/lessons/${lesson.id}`)
    for (const file of media) await admin.delete(`${APP_URL}/api/media/${file.id}`)
    await adminContext.close()
  })

  async function openLesson(browser: import('@playwright/test').Browser, options: Parameters<typeof browser.newContext>[0] = {}) {
    const context = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('admin'), ...options })
    const page = await context.newPage()
    await page.goto(`/lessons/${lesson.slug}`)
    const stay = page.getByRole('button', { name: 'Продолжить в браузере' })
    if (await stay.isVisible().catch(() => false)) await stay.click()
    return { context, page, videos: page.locator('[data-lesson-video] video') }
  }

  test('запуск другой части ставит играющую на паузу', async ({ browser }) => {
    const { context, page, videos } = await openLesson(browser)
    await videos.nth(0).evaluate((video: HTMLVideoElement) => video.play())
    await expect.poll(() => framePlaying(page)).toEqual([true, false, false])

    await videos.nth(1).evaluate((video: HTMLVideoElement) => video.play())

    await expect.poll(() => framePlaying(page)).toEqual([false, true, false])
    await context.close()
  })

  test('прокрутка к конспекту не запускает загрузку всех частей', async ({ browser }) => {
    const { context, page, videos } = await openLesson(browser, { viewport: { width: 390, height: 500 } })
    const files = new Set<string>()
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (path.startsWith('/api/media/file/') && path.endsWith('.webm')) files.add(path)
    })

    // Быстрее, чем видео успевает задержаться у экрана, как при обычном пролистывании.
    for (let step = 0; step < 30; step++) {
      await page.mouse.wheel(0, 120)
      await page.waitForTimeout(15)
    }
    await page.waitForTimeout(2000)

    const preloads = await videos.evaluateAll((list) => (list as HTMLVideoElement[]).map((video) => video.preload))
    expect(preloads.filter((preload) => preload !== 'none').length).toBeLessThanOrEqual(1)
    expect(files.size).toBeLessThan(PARTS)
    await context.close()
  })

  test('конспект свёрнут, кнопка одна и раскрывает его', async ({ browser }) => {
    const { context, page } = await openLesson(browser)
    const section = page.getByRole('region', { name: 'Конспект урока' })
    const link = page.getByRole('link', { name: 'Читать конспект' })

    await expect(section.getByRole('button', { name: 'Развернуть конспект' })).toHaveAttribute('aria-expanded', 'false')
    await expect(section.getByText('Суть урока одной строкой.')).toBeHidden()
    await expect(link).toHaveCount(1)

    await link.click()

    await expect(section.getByText('Суть урока одной строкой.')).toBeVisible()
    await expect(section).toBeInViewport()
    await context.close()
  })

  test('ссылка на раздел конспекта открывает его сразу', async ({ browser }) => {
    const { context, page } = await openLesson(browser)
    await page.goto(`/lessons/${lesson.slug}#konspekt-2`)

    await expect(page.getByRole('heading', { level: 2, name: 'Подробно' })).toBeInViewport()
    await context.close()
  })

  test('телефон: смахивание во весь экран переносит режим на следующую часть', async ({ browser }) => {
    const { context, page, videos } = await openLesson(browser, MOBILE)
    await videos.nth(0).scrollIntoViewIfNeeded()
    // evaluate идёт с признаком действия пользователя, как нажатие кнопки плеера.
    await videos.nth(0).evaluate(async (video: HTMLVideoElement) => {
      await video.requestFullscreen()
      await video.play()
    })
    await expect.poll(() => fullscreenIndex(page)).toBe(0)
    const size = page.viewportSize() ?? MOBILE.viewport

    await fingerSwipe(page, size.width - 40, 40, size.height / 2)

    await expect.poll(() => fullscreenIndex(page)).toBe(1)
    await expect.poll(() => framePlaying(page)).toEqual([false, true, false])
    await context.close()
  })

  test('телефон: шкала внизу развёрнутого видео остаётся перемоткой', async ({ browser }) => {
    const { context, page, videos } = await openLesson(browser, MOBILE)
    await videos.nth(0).scrollIntoViewIfNeeded()
    await videos.nth(0).evaluate((video: HTMLVideoElement) => video.requestFullscreen())
    await expect.poll(() => fullscreenIndex(page)).toBe(0)
    const size = page.viewportSize() ?? MOBILE.viewport

    await fingerSwipe(page, size.width - 40, 40, size.height - 30)
    await page.waitForTimeout(500)

    expect(await fullscreenIndex(page)).toBe(0)
    await context.close()
  })

  test('компьютер: стрелки во весь экран перематывают, Shift+N листает с сохранением режима', async ({ browser }) => {
    const { context, page, videos } = await openLesson(browser)
    const first = videos.nth(0)
    await first.scrollIntoViewIfNeeded()
    await expect.poll(() => first.evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(1)
    await first.evaluate((video: HTMLVideoElement) => video.requestFullscreen())
    await expect.poll(() => fullscreenIndex(page)).toBe(0)
    const start = await first.evaluate((video: HTMLVideoElement) => video.currentTime)
    const url = page.url()

    await page.keyboard.press('ArrowRight')

    await expect.poll(() => first.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeCloseTo(start + 5, 0)
    expect(page.url()).toBe(url)
    expect(await fullscreenIndex(page)).toBe(0)

    await page.keyboard.press('Shift+KeyN')

    await expect.poll(() => fullscreenIndex(page)).toBe(1)
    await context.close()
  })

  test('компьютер: жест тачпада листает часть; без права на вход она играет в обычном режиме', async ({ browser }) => {
    const { context, page, videos } = await openLesson(browser)
    const first = videos.nth(0)
    await first.scrollIntoViewIfNeeded()
    await first.evaluate(async (video: HTMLVideoElement) => {
      await video.requestFullscreen()
      await video.play()
    })
    await expect.poll(() => fullscreenIndex(page)).toBe(0)
    // Право на вход от evaluate истекает: дальше только то, что даёт сам жест, а он прав не даёт.
    await page.waitForTimeout(6000)
    const size = page.viewportSize() ?? { width: 1280, height: 720 }
    await page.mouse.move(size.width / 2, size.height / 2)

    await page.mouse.wheel(150, 0)

    await expect.poll(() => framePlaying(page)).toEqual([false, true, false])
    expect(await fullscreenIndex(page)).not.toBe(0)
    await context.close()
  })

  test('прерванная подготовка не теряет место остановки', async ({ browser }) => {
    const { context, page, videos } = await openLesson(browser, { viewport: { width: 390, height: 500 } })
    const first = videos.nth(0)
    await first.scrollIntoViewIfNeeded()
    await expect.poll(() => first.evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 15_000 }).toBeGreaterThanOrEqual(1)
    const saved = page.waitForResponse((response) => response.url().endsWith('/api/learning-state') && response.request().method() === 'POST' && response.request().postDataJSON().seconds === 100)
    await first.evaluate((video: HTMLVideoElement) => { video.currentTime = 100 })
    await saved

    await page.reload()
    await first.scrollIntoViewIfNeeded()
    await expect.poll(() => first.evaluate((video: HTMLVideoElement) => Math.floor(video.currentTime)), { timeout: 15_000 }).toBe(100)

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await expect.poll(() => first.evaluate((video: HTMLVideoElement) => video.readyState)).toBe(0)
    await expect.poll(() => first.evaluate((video: HTMLVideoElement) => video.preload)).toBe('none')

    await first.evaluate((video: HTMLVideoElement) => video.play())

    await expect.poll(() => first.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(100)
    await context.close()
  })
})
