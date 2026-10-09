import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { CONTENT } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

test('админ скрывает неназначенное, открывает одну задачу и полностью выключает тренажёр', async ({ browser }, testInfo) => {
  const admin = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('admin') })
  const learner = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: { cookies: [], origins: [] } })
  let userId: number | undefined
  try {
    const email = `visibility-trainer-${Date.now()}@lms.test`
    const password = 'Assignment-Visibility-Test-1'
    const created = await admin.request.post(`${APP_URL}/api/users`, { data: { email, password, firstName: 'Персональное', lastName: 'Обучение', role: 'student' } })
    expect(created.status()).toBe(201)
    userId = (await created.json()).doc.id as number
    expect((await learner.request.post(`${APP_URL}/api/users/login`, { data: { email, password } })).status()).toBe(200)
    const task = (await (await admin.request.get(`${APP_URL}/api/trainer-tasks?where[slug][equals]=${CONTENT.task.slug}&depth=0`)).json()).docs[0] as { id: number; title: string }
    const course = (await (await admin.request.get(`${APP_URL}/api/courses?where[slug][equals]=${CONTENT.course.slug}&depth=0`)).json()).docs[0] as { id: number }
    const adminPage = await admin.newPage()
    await adminPage.goto(`/admin/learning-access?user=${userId}`)
    await expect(adminPage.getByRole('heading', { name: 'Персональное Обучение' })).toBeVisible()
    await expect(adminPage.getByRole('radio', { name: /Показывать только назначенное/ })).toBeChecked()
    await expect(adminPage.getByRole('radio', { name: /Только назначенные задачи/ })).toBeChecked()
    expect((await learner.request.get(`${APP_URL}/api/courses/${course.id}`)).status()).toBe(404)
    expect((await learner.request.get(`${APP_URL}/api/trainer-tasks/${task.id}?depth=3`)).status()).toBe(404)
    const studentPage = await learner.newPage()
    await studentPage.goto('/courses')
    await expect(studentPage.getByRole('link', { name: new RegExp(CONTENT.course.title) })).toHaveCount(0)
    const picker = adminPage.getByRole('region', { name: 'Добавить назначение' })
    await picker.getByRole('combobox', { name: /^Материал/ }).selectOption('trainer-tasks')
    await picker.getByLabel('Поиск по названию').fill(task.title)
    await picker.getByRole('button', { name: 'Открыть', exact: true }).click()
    await adminPage.getByRole('button', { name: 'Посмотреть доступ по курсам' }).click()
    await expect(adminPage.getByText(/Доступны 1 из \d+ опубликованных задач/)).toBeVisible()
    await adminPage.getByRole('button', { name: 'Сохранить назначения' }).click()
    await expect(adminPage.getByText(/Назначения сохранены/)).toBeVisible()
    expect((await learner.request.get(`${APP_URL}/api/trainer-tasks/${task.id}`)).status()).toBe(200)
    expect((await learner.request.get(`${APP_URL}/api/courses/${course.id}`)).status()).toBe(404)
    await studentPage.goto(`/trainer/${CONTENT.topic.slug}/${CONTENT.task.slug}`)
    await expect(studentPage.getByRole('heading', { name: CONTENT.task.title, exact: true })).toBeVisible()
    for (const width of [320, 390, 1440]) {
      await adminPage.setViewportSize({ width, height: 960 })
      for (const theme of ['light', 'dark']) {
        await adminPage.evaluate((value) => { document.documentElement.dataset.theme = value }, theme)
        await expect.poll(() => adminPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        const accessibility = await new AxeBuilder({ page: adminPage }).include('.learning-access').withRules(['color-contrast', 'label', 'select-name', 'button-name']).analyze()
        expect(accessibility.violations).toEqual([])
        await adminPage.screenshot({ path: testInfo.outputPath(`learning-options-${width}-${theme}.png`), fullPage: true })
      }
    }
    await adminPage.getByRole('radio', { name: /Тренажёр выключен/ }).check()
    await adminPage.getByRole('button', { name: 'Сохранить назначения' }).click()
    await expect(adminPage.getByText(/Назначения сохранены/)).toBeVisible()
    expect((await learner.request.get(`${APP_URL}/api/trainer-tasks/${task.id}`)).status()).toBe(404)
    const retained = await (await admin.request.get(`${APP_URL}/api/manage/learning-access?user=${userId}`)).json() as { trainerMode: string; rules: { target: { value: number } }[] }
    expect(retained.trainerMode).toBe('disabled')
    expect(retained.rules.map((rule) => rule.target.value)).toContain(task.id)
    await studentPage.reload()
    await expect(studentPage.getByRole('heading', { name: CONTENT.task.title, exact: true })).toHaveCount(0)
  } finally {
    if (userId) expect((await admin.request.delete(`${APP_URL}/api/users/${userId}`)).status()).toBe(200)
    await learner.close()
    await admin.close()
  }
})
