import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Lesson } from '@/payload-types'
import { learningVideos } from '@/lib/learning-state'
import { CONTENT } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

test('другое устройство видит точный урок/ролик/время, текстовый урок обновляется после реального открытия', async ({ browser }) => {
  const admin = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('admin') })
  const first = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: { cookies: [], origins: [] } })
  const second = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } })
  const stranger = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('student') })
  let mediaId: number | undefined
  let userId: number | undefined
  let videoLessonId: number | undefined
  let textLessonId: number | undefined
  const email = `resume-${Date.now()}@lms.test`
  const password = 'Resume-Test-Pass-1'
  try {
    const createdUser = await admin.request.post(`${APP_URL}/api/users`, { data: { email, password, firstName: 'Продолжение', lastName: 'Урока', role: 'student', learningAccessMode: 'all' } })
    expect(createdUser.status()).toBe(201)
    userId = (await createdUser.json()).doc.id as number
    for (const context of [first, second]) {
      expect((await context.request.post(`${APP_URL}/api/users/login`, { data: { email, password } })).status()).toBe(200)
    }
    const course = (await (await admin.request.get(`${APP_URL}/api/courses?where[slug][equals]=${CONTENT.course.slug}&depth=0`)).json()).docs[0]
    const uploaded = await admin.request.post(`${APP_URL}/api/media`, { multipart: { _payload: JSON.stringify({ alt: 'Тестовая запись продолжения' }), file: { name: `resume-${Date.now()}.webm`, mimeType: 'video/webm', buffer: await readFile(new URL('../fixtures/resume-test.webm', import.meta.url)) } } })
    expect(uploaded.status()).toBe(201)
    const media = (await uploaded.json()).doc
    mediaId = media.id as number
    const createdVideoLesson = await admin.request.post(`${APP_URL}/api/lessons`, { data: {
      title: `Сохранённая запись ${Date.now()}`, course: course.id, isPublished: true,
      content: [{ id: 'recording', blockType: 'video', title: 'Разбор интерфейса', videoUrl: media.url, displayMode: 'embed' }],
    } })
    expect(createdVideoLesson.status()).toBe(201)
    const lesson = (await createdVideoLesson.json()).doc as Lesson
    videoLessonId = lesson.id
    const videoId = learningVideos(lesson)[0].id
    const createdTextLesson = await admin.request.post(`${APP_URL}/api/lessons`, { data: { title: `Текстовая инструкция ${Date.now()}`, course: course.id, isPublished: true } })
    expect(createdTextLesson.status()).toBe(201)
    const textLesson = (await createdTextLesson.json()).doc as Lesson
    textLessonId = textLesson.id

    // Exercise a real native video, including seek, playback and pause; the API is not mocked.
    const laptop = await first.newPage()
    await laptop.goto(`/lessons/${lesson.slug}`)
    const video = laptop.locator('video')
    await expect(laptop.getByText(/Место остановки сохраняется в аккаунте/)).toBeVisible()
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(1)
    await video.evaluate((element: HTMLVideoElement) => { element.currentTime = 754 })
    await video.evaluate((element: HTMLVideoElement) => element.play())
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(754.1)
    const paused = laptop.waitForResponse((response) => response.url().endsWith('/api/learning-state') && response.request().method() === 'POST' && response.request().postDataJSON().videoId === videoId)
    await video.evaluate((element: HTMLVideoElement) => element.pause())
    expect((await paused).status()).toBe(200)
    await expect.poll(async () => (await (await first.request.get(`${APP_URL}/api/learning-state?lessonId=${lesson.id}`)).json()).positions[videoId].seconds).toBe(754)
    const phone = await second.newPage()
    await phone.goto('/')
    expect(await phone.evaluate(() => localStorage.length)).toBe(0)
    const resume = phone.getByRole('link', { name: /Продолжить с того места/ })
    await expect(resume).toContainText(lesson.title)
    await expect(resume).toContainText('Разбор интерфейса · Остановились на 12:34')
    await expect(resume).toHaveAttribute('href', `/lessons/${lesson.slug}?video=${encodeURIComponent(videoId)}#video-${encodeURIComponent(videoId)}`)
    await resume.click()
    const resumedVideo = phone.locator('video')
    await expect.poll(() => resumedVideo.evaluate((element: HTMLVideoElement) => Math.floor(element.currentTime))).toBe(754)
    await expect(phone.getByText('Продолжили с 12:34')).toBeVisible()
    const otherTab = await first.newPage()
    await otherTab.goto('/')
    await expect(otherTab.getByRole('link', { name: /Продолжить с того места/ })).toContainText('12:34')

    // Shared navigation has priority over personal resume, without overwriting it on arrival.
    const clipHref = `/lessons/${lesson.slug}?video=${encodeURIComponent(videoId)}&t=373&rate=1.5`
    await phone.goto(clipHref)
    await expect.poll(() => phone.locator('video').evaluate((element: HTMLVideoElement) => Math.floor(element.currentTime))).toBe(373)
    await expect.poll(() => phone.locator('video').evaluate((element: HTMLVideoElement) => element.playbackRate)).toBe(1.5)
    await phone.reload()
    await expect.poll(() => phone.locator('video').evaluate((element: HTMLVideoElement) => Math.floor(element.currentTime))).toBe(373)
    const personalPosition = await second.request.get(`${APP_URL}/api/learning-state?lessonId=${lesson.id}`)
    expect((await personalPosition.json()).positions[videoId].seconds).toBe(754)

    const unrelated = await stranger.request.get(`${APP_URL}/api/learning-state?lessonId=${lesson.id}`)
    expect((await unrelated.json()).positions).toEqual({})
    expect((await stranger.request.post(`${APP_URL}/api/learning-state`, { data: { lessonId: lesson.id, expectedUserId: userId, at: Date.now() } })).status()).toBe(403)

    // A text lesson is recorded by the mounted page, without any completion or video.
    const opened = phone.waitForResponse((response) => response.url().endsWith('/api/learning-state') && response.request().method() === 'POST')
    await phone.goto(`/lessons/${textLesson.slug}`)
    expect((await opened).status()).toBe(200)
    await otherTab.reload()
    await expect(otherTab.getByRole('link', { name: /Продолжить с того места/ })).toContainText(textLesson.title)
    const progress = await first.request.get(`${APP_URL}/api/user-progress?where[user][equals]=${userId}`)
    expect((await progress.json()).totalDocs).toBe(0)
  } finally {
    if (videoLessonId) await admin.request.delete(`${APP_URL}/api/lessons/${videoLessonId}`)
    if (textLessonId) await admin.request.delete(`${APP_URL}/api/lessons/${textLessonId}`)
    if (mediaId) await admin.request.delete(`${APP_URL}/api/media/${mediaId}`)
    if (userId) await admin.request.delete(`${APP_URL}/api/users/${userId}`)
    for (const context of [first, second, stranger, admin]) await context.close()
  }
})
