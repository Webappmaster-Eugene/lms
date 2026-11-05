import { readFile } from 'node:fs/promises'
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'
import type { Lesson } from '@/payload-types'
import { CONTENT } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

const PARTS = 3
const NOTES = '## Коротко\n\nСуть урока одной строкой.\n\n## Подробно\n\nРазбор по шагам.\n\n```ts\nconst a = 1\n```\n'
const MOBILE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

/** Настоящий урок из трёх записей и конспекта: браузерное поведение плеера моками не проверить. */
async function createLesson(admin: APIRequestContext, { parts = PARTS, order = 9000 }: { parts?: number; order?: number } = {}) {
  const buffer = await readFile(new URL('../fixtures/resume-test.webm', import.meta.url))
  const stamp = Date.now()
  const media: { id: number; url: string }[] = []
  for (let part = 1; part <= parts; part++) {
    const uploaded = await admin.post(`${APP_URL}/api/media`, { multipart: { _payload: JSON.stringify({ alt: `Часть ${part}` }), file: { name: `player-${stamp}-${part}.webm`, mimeType: 'video/webm', buffer } } })
    expect(uploaded.status()).toBe(201)
    media.push((await uploaded.json()).doc)
  }
  const course = (await (await admin.get(`${APP_URL}/api/courses?where[slug][equals]=${CONTENT.course.slug}&depth=0`)).json()).docs[0]
  const created = await admin.post(`${APP_URL}/api/lessons`, { data: {
    title: `Урок из частей ${parts} ${stamp}`, course: course.id, isPublished: true, estimatedMinutes: 30, order,
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
const isDocumentExpanded = (page: Page) => page.evaluate(() => document.fullscreenElement === document.documentElement)
const targetIndex = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[data-lesson-video]')].findIndex((frame) => frame.hasAttribute('data-lesson-fullscreen-target')))
const targetRect = (page: Page) => page.evaluate(() => {
  const { x, y, width, height } = (document.querySelector('[data-lesson-fullscreen-target]') as HTMLElement).getBoundingClientRect()
  return { x, y, width, height }
})

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
  let nextLesson: Lesson
  let nextMedia: { id: number; url: string }[]

  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('admin') })
    admin = adminContext.request
    ;({ lesson, media } = await createLesson(admin))
    // Сразу следом: смахивание с последней части ведёт сюда.
    ;({ lesson: nextLesson, media: nextMedia } = await createLesson(admin, { parts: 1, order: 9001 }))
  })

  test.afterAll(async () => {
    for (const created of [lesson, nextLesson]) await admin.delete(`${APP_URL}/api/lessons/${created.id}`)
    for (const file of [...media, ...nextMedia]) await admin.delete(`${APP_URL}/api/media/${file.id}`)
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

  test('метка из заметки перематывает нескачанную часть, пока играет другая', async ({ browser }) => {
    const { context, page, videos } = await openLesson(browser)
    await videos.nth(1).evaluate((video: HTMLVideoElement) => video.play())
    await expect.poll(() => framePlaying(page)).toEqual([false, true, false])

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('lms:video-seek', { detail: { seconds: 40 } })))

    await expect.poll(() => videos.nth(0).evaluate((video: HTMLVideoElement) => Math.floor(video.currentTime))).toBe(40)
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

  test('телефон: кнопка разворачивает документ, смахивание листает части и уроки без выхода из режима', async ({ browser }) => {
    const { context, page, videos } = await openLesson(browser, MOBILE)
    await page.evaluate(() => {
      const state = window as unknown as { fullscreenChanges: number }
      state.fullscreenChanges = 0
      document.addEventListener('fullscreenchange', () => { state.fullscreenChanges++ })
    })
    await videos.nth(0).scrollIntoViewIfNeeded()
    await page.locator('[data-lesson-video]').nth(0).getByRole('button', { name: 'Во весь экран' }).click()
    await expect.poll(() => isDocumentExpanded(page)).toBe(true)
    await videos.nth(0).evaluate((video: HTMLVideoElement) => video.play())
    const size = page.viewportSize() ?? MOBILE.viewport

    // Кадр занимает весь экран: предки не должны запирать position: fixed в своих границах.
    await expect.poll(() => targetIndex(page)).toBe(0)
    expect(await targetRect(page)).toEqual({ x: 0, y: 0, width: size.width, height: size.height })

    await fingerSwipe(page, size.width - 40, 40, size.height / 2)

    await expect.poll(() => targetIndex(page)).toBe(1)
    await expect.poll(() => framePlaying(page)).toEqual([false, true, false])

    await fingerSwipe(page, size.width - 40, 40, size.height / 2)
    await expect.poll(() => targetIndex(page)).toBe(2)

    // С последней части - следующий урок: режим тот же, вход повторять не нужно.
    await fingerSwipe(page, size.width - 40, 40, size.height / 2)
    await expect.poll(() => page.url()).toContain(nextLesson.slug)
    await expect.poll(() => targetIndex(page)).toBe(0)
    expect(await isDocumentExpanded(page)).toBe(true)
    await expect.poll(() => page.locator('[data-lesson-video] video').first().evaluate((video: HTMLVideoElement) => !video.paused)).toBe(true)
    expect(await page.evaluate(() => (window as unknown as { fullscreenChanges: number }).fullscreenChanges)).toBe(1)

    await page.locator('[data-lesson-fullscreen-target]').getByRole('button', { name: 'Свернуть' }).click()
    await expect.poll(() => isDocumentExpanded(page)).toBe(false)
    await expect.poll(() => targetIndex(page)).toBe(-1)
    await context.close()
  })

  test('телефон: пока следующий урок грузится, плашка видна поверх кадра и переход не повторяется', async ({ browser }) => {
    const { context, page, videos } = await openLesson(browser, MOBILE)
    const last = page.locator('[data-lesson-video]').nth(PARTS - 1)
    await last.scrollIntoViewIfNeeded()
    await last.getByRole('button', { name: 'Во весь экран' }).click()
    await expect.poll(() => isDocumentExpanded(page)).toBe(true)
    await videos.nth(PARTS - 1).evaluate((video: HTMLVideoElement) => video.play())
    const size = page.viewportSize() ?? MOBILE.viewport
    const requests: string[] = []
    page.on('request', (request) => {
      // Заранее подгруженные ссылки не в счёт: нужны сами переходы на следующий урок.
      if (request.url().includes(`${nextLesson.slug}?_rsc=`) && !request.headers()['next-router-prefetch']) requests.push(request.url())
    })
    // Сервер отвечает не сразу: как и на проде, есть время заметить плашку и смахнуть ещё раз.
    await page.route(/_rsc=/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })

    await fingerSwipe(page, size.width - 40, 40, size.height / 2)
    const plate = page.locator('[data-lesson-fullscreen-overlay]')
    await expect(plate).toBeVisible()
    // Над кадром, а не под ним: иначе во весь экран ничто не покажет, что переход идёт.
    expect(await page.evaluate(() => {
      const zIndex = (selector: string) => Number(getComputedStyle(document.querySelector(selector) as HTMLElement).zIndex)
      return zIndex('[data-lesson-fullscreen-overlay]') > zIndex('[data-lesson-fullscreen-target]')
    })).toBe(true)
    await fingerSwipe(page, size.width - 40, 40, size.height / 2)
    await expect(plate).toBeVisible()

    await expect.poll(() => page.url()).toContain(nextLesson.slug)
    expect(requests).toHaveLength(1)
    await expect.poll(() => page.locator('[data-lesson-video] video').first().evaluate((video: HTMLVideoElement) => !video.paused)).toBe(true)
    await context.close()
  })

  test('телефон: браузер развернул само видео - первое смахивание переводит в режим документа', async ({ browser }) => {
    const { context, page, videos } = await openLesson(browser, MOBILE)
    await videos.nth(0).scrollIntoViewIfNeeded()
    // evaluate идёт с признаком действия пользователя, как поворот телефона у Chrome.
    await videos.nth(0).evaluate(async (video: HTMLVideoElement) => {
      await video.requestFullscreen()
      await video.play()
    })
    await expect.poll(() => fullscreenIndex(page)).toBe(0)
    const size = page.viewportSize() ?? MOBILE.viewport

    await fingerSwipe(page, size.width - 40, 40, size.height / 2)

    await expect.poll(() => targetIndex(page)).toBe(1)
    await expect.poll(() => framePlaying(page)).toEqual([false, true, false])
    await context.close()
  })

  test('телефон: поворот с играющим видео разворачивает его, обратный поворот сворачивает', async ({ browser }) => {
    const { context, page, videos } = await openLesson(browser, MOBILE)
    await videos.nth(1).scrollIntoViewIfNeeded()
    await videos.nth(1).evaluate((video: HTMLVideoElement) => video.play())
    const cdp = await context.newCDPSession(page)
    const rotate = (width: number, height: number, type: 'landscapePrimary' | 'portraitPrimary', angle: number) =>
      cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 3, mobile: true, screenOrientation: { type, angle } })

    await rotate(844, 390, 'landscapePrimary', 90)

    await expect.poll(() => targetIndex(page)).toBe(1)
    await expect.poll(() => targetRect(page)).toEqual({ x: 0, y: 0, width: 844, height: 390 })

    await fingerSwipe(page, 800, 40, 195)

    await expect.poll(() => targetIndex(page)).toBe(2)
    await expect.poll(() => framePlaying(page)).toEqual([false, false, true])

    await rotate(390, 844, 'portraitPrimary', 0)

    await expect.poll(() => targetIndex(page)).toBe(-1)
    await context.close()
  })

  test('телефон: шкала внизу развёрнутого кадра остаётся перемоткой', async ({ browser }) => {
    const { context, page, videos } = await openLesson(browser, MOBILE)
    await videos.nth(0).scrollIntoViewIfNeeded()
    await page.locator('[data-lesson-video]').nth(0).getByRole('button', { name: 'Во весь экран' }).click()
    await expect.poll(() => isDocumentExpanded(page)).toBe(true)
    const size = page.viewportSize() ?? MOBILE.viewport

    await fingerSwipe(page, size.width - 40, 40, size.height - 30)
    await page.waitForTimeout(500)

    expect(await targetIndex(page)).toBe(0)
    await context.close()
  })

  test('компьютер: стрелки во весь экран перематывают, Shift+N листает с сохранением режима', async ({ browser }) => {
    const { context, page, videos } = await openLesson(browser)
    const first = videos.nth(0)
    await first.scrollIntoViewIfNeeded()
    await expect.poll(() => first.evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(1)
    await page.locator('[data-lesson-video]').nth(0).getByRole('button', { name: 'Во весь экран' }).click()
    await expect.poll(() => isDocumentExpanded(page)).toBe(true)
    const start = await first.evaluate((video: HTMLVideoElement) => video.currentTime)
    const url = page.url()

    await page.keyboard.press('ArrowRight')

    await expect.poll(() => first.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeCloseTo(start + 5, 0)
    expect(page.url()).toBe(url)
    expect(await targetIndex(page)).toBe(0)

    await page.keyboard.press('Shift+KeyN')

    await expect.poll(() => targetIndex(page)).toBe(1)
    expect(await isDocumentExpanded(page)).toBe(true)
    await context.close()
  })

  test('компьютер: жест тачпада листает часть и не выбрасывает из режима', async ({ browser }) => {
    const { context, page, videos } = await openLesson(browser)
    await videos.nth(0).scrollIntoViewIfNeeded()
    await page.locator('[data-lesson-video]').nth(0).getByRole('button', { name: 'Во весь экран' }).click()
    await expect.poll(() => isDocumentExpanded(page)).toBe(true)
    await videos.nth(0).evaluate((video: HTMLVideoElement) => video.play())
    // Право на вход от клика истекает: дальше только то, что даёт сам жест, а он прав не даёт.
    await page.waitForTimeout(6000)
    const size = page.viewportSize() ?? { width: 1280, height: 720 }
    await page.mouse.move(size.width / 2, size.height / 2)

    await page.mouse.wheel(150, 0)

    await expect.poll(() => targetIndex(page)).toBe(1)
    await expect.poll(() => framePlaying(page)).toEqual([false, true, false])
    expect(await isDocumentExpanded(page)).toBe(true)
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
