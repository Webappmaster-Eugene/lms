import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { APP_URL, storageStateOf } from '../fixtures/env'
import { CONTENT } from '../fixtures/data'

test('администратор видит, как ученики проходят роадмап и курс, и где останавливаются', async ({ browser }, testInfo) => {
  const admin = await browser.newContext({ storageState: storageStateOf('admin') })
  const student = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  let userId: number | undefined
  try {
    const email = `course-analytics-${Date.now()}@lms.test`
    const password = 'Course-Analytics-Pass-1'
    const created = await admin.request.post(`${APP_URL}/api/users`, { data: { email, password, firstName: 'Курсовой', lastName: 'Ученик', role: 'student', learningAccessMode: 'assigned' } })
    expect(created.status()).toBe(201)
    userId = (await created.json()).doc.id as number
    const roadmap = (await (await admin.request.get(`${APP_URL}/api/roadmaps?where[slug][equals]=${CONTENT.roadmap.slug}&depth=0`)).json()).docs[0] as { id: number }
    expect((await admin.request.post(`${APP_URL}/api/learning-access-grants`, { data: { user: userId, target: { relationTo: 'roadmaps', value: roadmap.id }, effect: 'allow' } })).status()).toBe(201)
    expect((await student.request.post(`${APP_URL}/api/users/login`, { data: { email, password } })).status()).toBe(200)
    const lesson = (await (await admin.request.get(`${APP_URL}/api/lessons?where[slug][equals]=${CONTENT.lessons[0].slug}&depth=0`)).json()).docs[0] as { id: number }
    expect((await student.request.post(`${APP_URL}/api/user-progress`, { data: { lesson: lesson.id, isCompleted: true } })).status()).toBe(201)

    const page = await admin.newPage()
    await page.goto('/admin/learning-analytics')
    await expect(page.getByRole('heading', { name: 'Курсы и роадмапы', level: 1 })).toBeVisible()
    const roadmaps = page.getByRole('region', { name: 'Таблица роадмапов' })
    await expect(roadmaps.getByRole('row', { name: new RegExp(CONTENT.roadmap.title) })).toBeVisible()
    const courses = page.getByRole('region', { name: 'Таблица курсов' })
    await courses.getByRole('button', { name: new RegExp(CONTENT.course.title) }).click()
    const lessons = page.getByRole('region', { name: 'Уроки курса' })
    await expect(lessons.getByRole('link', { name: CONTENT.lessons[0].title })).toBeVisible()
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 920 })
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => { document.documentElement.dataset.theme = value }, theme)
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        const accessibility = await new AxeBuilder({ page }).include('.learning-analytics').withRules(['color-contrast', 'label', 'button-name', 'link-name']).analyze()
        expect(accessibility.violations).toEqual([])
      }
    }
    await page.setViewportSize({ width: 1440, height: 920 })
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
    await page.locator('.learning-analytics').screenshot({ path: testInfo.outputPath('learning-analytics.png') })
    expect((await student.request.get(`${APP_URL}/api/manage/learning-analytics`)).status()).toBe(403)
  } finally {
    if (userId) await admin.request.delete(`${APP_URL}/api/users/${userId}`)
    await student.close()
    await admin.close()
  }
})
