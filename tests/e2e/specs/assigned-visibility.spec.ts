import { expect, test } from '@playwright/test'
import { CONTENT, NOT_FOUND_HEADING } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

test('одно назначение урока раскрывает только его путь и не выдаёт сертификат за весь курс', async ({ browser }) => {
  const admin = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('admin') })
  const learner = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { Origin: APP_URL }, storageState: { cookies: [], origins: [] } })
  let userId: number | undefined
  try {
    const email = `assigned-one-lesson-${Date.now()}@lms.test`
    const password = 'Assigned-One-Lesson-Test-1'
    const created = await admin.request.post(`${APP_URL}/api/users`, { data: { email, password, firstName: 'Назначенный', lastName: 'Урок', role: 'student' } })
    expect(created.status()).toBe(201)
    userId = (await created.json()).doc.id as number
    expect((await learner.request.post(`${APP_URL}/api/users/login`, { data: { email, password } })).status()).toBe(200)
    const page = await learner.newPage()
    for (const path of ['/', '/courses', '/roadmaps']) {
      await page.goto(path)
      await expect(page.getByText('Администратор ещё не назначил обучение')).toBeVisible()
      for (const title of [CONTENT.course.title, CONTENT.roadmap.title, CONTENT.lessons[0].title]) await expect(page.getByText(title, { exact: true })).toHaveCount(0)
      await expect(page.getByRole('link', { name: /Тренажёр/ })).toHaveCount(0)
    }
    const lessons = await Promise.all(CONTENT.lessons.slice(0, 2).map(async (lesson) => {
      const response = await admin.request.get(`${APP_URL}/api/lessons?where[slug][equals]=${lesson.slug}&depth=0`)
      expect(response.status()).toBe(200)
      return (await response.json()).docs[0] as { id: number }
    }))
    expect((await admin.request.post(`${APP_URL}/api/learning-access-grants`, { data: { user: userId, target: { relationTo: 'lessons', value: lessons[0].id }, effect: 'allow' } })).status()).toBe(201)
    const courseResponse = await page.goto(`/courses/${CONTENT.course.slug}`)
    expect(courseResponse?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: CONTENT.course.title, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(CONTENT.lessons[0].title) }).first()).toBeVisible()
    await expect(page.getByText(CONTENT.lessons[1].title, { exact: true })).toHaveCount(0)
    expect(await courseResponse?.text()).not.toContain(CONTENT.lessons[1].title)
    await expect(page.getByText('Прогресс назначенных уроков')).toBeVisible()
    const denied = await page.goto(`/lessons/${CONTENT.lessons[1].slug}`)
    expect(denied?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: NOT_FOUND_HEADING, exact: true })).toBeVisible()
    expect(await denied?.text()).not.toContain(CONTENT.lessons[1].title)
    await page.goto(`/lessons/${CONTENT.lessons[0].slug}`)
    await expect(page.getByRole('heading', { name: CONTENT.lessons[0].title, exact: true })).toBeVisible()
    await expect(page.getByText('Назначенный урок 1 из 1')).toBeVisible()
    await page.getByRole('button', { name: 'Показать содержание' }).click()
    const sheet = page.getByRole('dialog', { name: 'Содержание курса' })
    await expect(sheet.getByRole('link', { name: new RegExp(CONTENT.lessons[0].title) })).toBeVisible()
    await expect(sheet.getByText(CONTENT.lessons[1].title)).toHaveCount(0)
    await page.getByRole('button', { name: 'Закрыть содержание' }).click()
    expect((await learner.request.post(`${APP_URL}/api/user-progress`, { data: { lesson: lessons[0].id, isCompleted: true } })).status()).toBe(201)
    const certificates = await learner.request.get(`${APP_URL}/api/certificates?depth=0`)
    expect(certificates.status()).toBe(200)
    expect((await certificates.json()).totalDocs).toBe(0)
    await page.goto(`/courses/${CONTENT.course.slug}`)
    await expect(page.getByText(/Все назначенные уроки пройдены/)).toBeVisible()
    await expect(page.getByText(/^Курс пройден/)).toHaveCount(0)
    await page.goto(`/roadmaps/${CONTENT.roadmap.slug}?view=list`)
    await expect(page.getByRole('heading', { name: CONTENT.roadmap.title, exact: true })).toBeVisible()
    await expect(page.getByText(CONTENT.lessons[1].title, { exact: true })).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  } finally {
    if (userId) expect((await admin.request.delete(`${APP_URL}/api/users/${userId}`)).status()).toBe(200)
    await learner.close()
    await admin.close()
  }
})
