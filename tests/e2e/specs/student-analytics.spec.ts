import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { APP_URL, storageStateOf } from '../fixtures/env'
import { CONTENT } from '../fixtures/data'

test('администратор видит устройства, место остановки и подтверждённый прогресс; ученик не читает аналитику', async ({ browser }, testInfo) => {
  const admin = await browser.newContext({ storageState: storageStateOf('admin') })
  const student = await browser.newContext({ storageState: { cookies: [], origins: [] }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36 YaBrowser/24.1' })
  let userId: number | undefined
  try {
    const email = `analytics-${Date.now()}@lms.test`
    const password = 'Analytics-Test-Pass-1'
    const created = await admin.request.post(`${APP_URL}/api/users`, { data: { email, password, firstName: 'Александр', lastName: 'Аналитика', role: 'student' } })
    expect(created.status()).toBe(201)
    userId = (await created.json()).doc.id as number
    const roadmap = (await (await admin.request.get(`${APP_URL}/api/roadmaps?where[slug][equals]=${CONTENT.roadmap.slug}&depth=0`)).json()).docs[0] as { id: number }
    expect((await admin.request.post(`${APP_URL}/api/learning-access-grants`, { data: { user: userId, target: { relationTo: 'roadmaps', value: roadmap.id }, effect: 'allow' } })).status()).toBe(201)
    expect((await student.request.post(`${APP_URL}/api/users/login`, { data: { email, password } })).status()).toBe(200)
    const lesson = (await (await admin.request.get(`${APP_URL}/api/lessons?where[slug][equals]=${CONTENT.lessons[0].slug}&depth=0`)).json()).docs[0] as { id: number }
    const heartbeat = await student.request.post(`${APP_URL}/api/activity`, { headers: { Origin: new URL(APP_URL).origin, 'Sec-Fetch-Site': 'same-origin' }, data: { expectedUserId: userId, path: `/lessons/${CONTENT.lessons[0].slug}`, timezone: 'Europe/Moscow', standalone: true } })
    expect(heartbeat.status()).toBe(200)
    expect((await student.request.post(`${APP_URL}/api/learning-state`, { data: { lessonId: lesson.id, at: Date.now(), expectedUserId: userId } })).status()).toBe(200)
    expect((await student.request.post(`${APP_URL}/api/user-progress`, { data: { lesson: lesson.id, isCompleted: true } })).status()).toBe(201)
    const page = await admin.newPage()
    await page.goto(`/admin/student-analytics?user=${userId}`)
    await expect(page.getByRole('heading', { name: 'Александр Аналитика', exact: true })).toBeVisible()
    const devices = page.getByRole('region', { name: 'Устройства и входы' })
    await expect(devices.getByRole('heading', { name: 'Телефон', exact: true })).toBeVisible()
    await expect(devices.getByText(/Яндекс Браузер/)).toBeVisible()
    await expect(devices.getByText('Активность за последние 5 минут', { exact: true })).toBeVisible()
    await expect(devices.getByText('Приложение, Europe/Moscow', { exact: true })).toBeVisible()
    const timeline = page.getByRole('region', { name: 'История пользователя' })
    await expect(timeline.getByRole('heading', { name: 'Урок пройден', exact: true })).toBeVisible()
    await expect(timeline.getByText('Сообщено устройством', { exact: true })).toBeVisible()
    await expect(timeline.getByText('Зафиксировано платформой', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('region', { name: 'Последнее место обучения' }).getByRole('link', { name: CONTENT.lessons[0].title })).toBeVisible()
    const denied = await student.request.get(`${APP_URL}/api/manage/student-analytics?user=${userId}`)
    expect(denied.status()).toBe(403)
    const body = await (await admin.request.get(`${APP_URL}/api/manage/student-analytics?user=${userId}`)).json()
    const serialized = JSON.stringify(body)
    for (const forbidden of ['sessionHash', 'payload-token', 'Authorization', '_sid', 'userAgent']) expect(serialized).not.toContain(forbidden)
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 920 })
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => { document.documentElement.dataset.theme = value }, theme)
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        const accessibility = await new AxeBuilder({ page }).include('.student-analytics').withRules(['color-contrast', 'label', 'button-name', 'link-name']).analyze()
        expect(accessibility.violations).toEqual([])
        await page.screenshot({ path: testInfo.outputPath(`student-analytics-${width}-${theme}.png`), fullPage: true })
      }
    }
    const deniedPage = await student.newPage()
    await deniedPage.goto('/admin/student-analytics')
    await expect(deniedPage.getByRole('heading', { name: 'Активность пользователей', exact: true })).toHaveCount(0)
  } finally {
    if (userId) await admin.request.delete(`${APP_URL}/api/users/${userId}`)
    await student.close()
    await admin.close()
  }
})

test('администратор видит собственный сохранённый вход и реальный сигнал CMS без выдачи SID', async ({ browser }) => {
  const admin = await browser.newContext({ storageState: storageStateOf('admin') })
  try {
    const me = await admin.request.get(`${APP_URL}/api/users/me`)
    expect(me.status()).toBe(200)
    const user = (await me.json()).user as { id: number; firstName: string; lastName: string }
    const page = await admin.newPage()
    const activity = page.waitForResponse((response) => response.url().endsWith('/api/activity') && response.request().method() === 'POST')
    await page.goto(`/admin/student-analytics?user=${user.id}`)
    expect((await activity).status()).toBe(200)
    await expect(page.getByRole('heading', { name: `${user.firstName} ${user.lastName}`, exact: true })).toBeVisible()
    await expect(page.locator('.student-analytics__student-heading').getByText('Администратор', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Назначить обучение', exact: true })).toHaveCount(0)
    await expect.poll(async () => {
      const response = await admin.request.get(`${APP_URL}/api/manage/student-analytics?user=${user.id}`)
      expect(response.status()).toBe(200)
      const body = await response.json()
      for (const forbidden of ['sessionHash', 'payload-token', 'Authorization', '_sid', 'userAgent']) expect(JSON.stringify(body)).not.toContain(forbidden)
      return body.onlineSessionCount as number
    }).toBeGreaterThan(0)
  } finally { await admin.close() }
})
