import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { CONTENT } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

test('история сохраняет отдельные курсы, фильтрует уроки и работает на узком телефоне', async ({ browser }, testInfo) => {
  const admin = await browser.newContext({ baseURL: APP_URL, extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('admin') })
  const learner = await browser.newContext({ baseURL: APP_URL, extraHTTPHeaders: { Origin: APP_URL }, storageState: { cookies: [], origins: [] }, viewport: { width: 320, height: 780 } })
  const stranger = await browser.newContext({ baseURL: APP_URL, storageState: storageStateOf('student'), viewport: { width: 320, height: 780 } })
  let userId: number | undefined
  let courseId: number | undefined
  let lessonId: number | undefined
  const email = `history-${Date.now()}@lms.test`
  const password = 'History-Test-Pass-1'
  try {
    const created = await admin.request.post('/api/users', { data: { email, password, firstName: 'История', lastName: 'Обучения', role: 'student', learningAccessMode: 'all', trainerAccessMode: 'all', learningCatalogVisibility: 'catalog' } })
    expect(created.status()).toBe(201)
    userId = (await created.json()).doc.id as number
    expect((await learner.request.post('/api/users/login', { data: { email, password } })).status()).toBe(200)
    const roadmapResponse = await admin.request.get(`/api/roadmaps?where[slug][equals]=${CONTENT.roadmap.slug}&depth=0`)
    expect(roadmapResponse.status()).toBe(200)
    const roadmapId = (await roadmapResponse.json()).docs[0].id as number
    const courseResponse = await admin.request.post('/api/courses', { data: { title: 'Параллельное обучение DevOps', slug: `history-course-${Date.now()}`, roadmap: roadmapId, isPublished: true } })
    expect(courseResponse.status()).toBe(201)
    courseId = (await courseResponse.json()).doc.id as number
    const lessonResponse = await admin.request.post('/api/lessons', { data: { title: 'Контейнеры и приложение с длинным названием на телефоне', course: courseId, isPublished: true } })
    expect(lessonResponse.status()).toBe(201)
    const lesson = (await lessonResponse.json()).doc as { id: number; slug: string; title: string }
    lessonId = lesson.id
    const page = await learner.newPage()
    await page.addInitScript(() => {
      localStorage.setItem('lms:pwa-install-explained:v1', 'seen')
      localStorage.setItem('theme', 'light')
    })
    for (const slug of [CONTENT.lessons[0].slug, lesson.slug, CONTENT.lessons[1].slug]) {
      const opened = page.waitForResponse(response => response.url().endsWith('/api/learning-state') && response.request().method() === 'POST' && !response.request().postDataJSON().videoId)
      await page.goto(`/lessons/${slug}`)
      expect((await opened).status()).toBe(200)
    }
    await page.goto('/learning-history')
    await expect(page.getByRole('heading', { name: 'История обучения', exact: true })).toBeVisible()
    const courses = page.getByRole('region', { name: 'Ваше обучение' })
    await expect(courses.getByRole('link', { name: new RegExp(CONTENT.course.title) }).first()).toContainText(CONTENT.lessons[1].title)
    await expect(courses.getByRole('link', { name: /Параллельное обучение DevOps/ })).toContainText(lesson.title)
    const views = page.getByRole('list', { name: 'Просмотренные уроки' })
    await expect(views.getByRole('listitem')).toHaveCount(3)
    await expect(views.getByText('Урок пройден')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('history-320-light.png'), fullPage: true })
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.screenshot({ path: testInfo.outputPath('history-320-dark.png'), fullPage: true })
    const bottom = page.getByRole('navigation', { name: 'Основная навигация' })
    await expect(bottom.getByRole('link')).toHaveText(['Роадмапы', 'Курсы', 'Тренажёр', 'Главная'])
    await courses.getByRole('link', { name: 'Все просмотры этого курса' }).last().click()
    await expect(page.getByRole('list', { name: 'Просмотренные уроки' }).getByRole('listitem')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Параллельное обучение DevOps' })).toBeVisible()
    await page.getByRole('link', { name: /Контейнеры и приложение/ }).click()
    await expect(page.getByRole('heading', { name: lesson.title, exact: true })).toBeVisible()
    const progress = await learner.request.get(`/api/user-progress?where[user][equals]=${userId}`)
    expect((await progress.json()).totalDocs).toBe(0)
    const another = await stranger.newPage()
    await another.goto(`${APP_URL}/learning-history`)
    await expect(another.getByRole('link', { name: /Контейнеры и приложение/ })).toHaveCount(0)
  } finally {
    if (lessonId) await admin.request.delete(`/api/lessons/${lessonId}`)
    if (courseId) await admin.request.delete(`/api/courses/${courseId}`)
    if (userId) await admin.request.delete(`/api/users/${userId}`)
    await Promise.all([admin.close(), learner.close(), stranger.close()])
  }
})
