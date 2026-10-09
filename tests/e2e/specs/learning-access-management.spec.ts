import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { CONTENT } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

test('администратор назначает роадмап с исключением урока, ученик видит программу и только разрешённый контент', async ({ browser }, testInfo) => {
  const admin = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('admin') })
  const learner = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: { cookies: [], origins: [] } })
  let userId: number | undefined
  try {
    const email = `assignment-${Date.now()}@lms.test`
    const password = 'Assignment-Test-Pass-1'
    const created = await admin.request.post(`${APP_URL}/api/users`, { data: { email, password, firstName: 'Александр', lastName: 'Назначенный', role: 'student', learningCatalogVisibility: 'catalog', trainerAccessMode: 'all', learningAccessMode: 'assigned' } })
    expect(created.status()).toBe(201)
    userId = (await created.json()).doc.id as number
    expect((await learner.request.post(`${APP_URL}/api/users/login`, { data: { email, password } })).status()).toBe(200)
    const lessons = await Promise.all(CONTENT.lessons.slice(0, 2).map(async (lesson) => (await (await admin.request.get(`${APP_URL}/api/lessons?where[slug][equals]=${lesson.slug}&depth=0`)).json()).docs[0] as { id: number; title: string }))
    expect((await learner.request.get(`${APP_URL}/api/lessons/${lessons[0].id}`)).status()).toBe(404)
    const page = await admin.newPage()
    await page.goto(`/admin/learning-access?user=${userId}`)
    await expect(page.getByRole('heading', { name: 'Александр Назначенный' })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Только назначенные материалы/ })).toBeChecked()
    const picker = page.getByRole('region', { name: 'Добавить назначение' })
    await picker.getByLabel('Поиск по названию').fill(CONTENT.roadmap.title)
    await picker.getByRole('button', { name: 'Открыть', exact: true }).click()
    await picker.getByRole('combobox', { name: 'Материал', exact: true }).selectOption('lessons')
    await picker.getByRole('combobox', { name: 'Действие', exact: true }).selectOption('deny')
    await picker.getByLabel('Поиск по названию').fill(CONTENT.lessons[0].title)
    await picker.getByRole('button', { name: 'Закрыть', exact: true }).click()
    await page.getByRole('button', { name: 'Посмотреть доступ по курсам' }).click()
    const preview = page.getByRole('region', { name: 'Предварительный просмотр доступа' })
    await expect(preview.getByText('Открыт частично')).toBeVisible()
    await page.getByRole('button', { name: 'Сохранить назначения' }).click()
    await expect(page.getByText(/Назначения сохранены/)).toBeVisible()
    expect((await learner.request.get(`${APP_URL}/api/lessons/${lessons[0].id}?depth=3`)).status()).toBe(404)
    expect((await learner.request.get(`${APP_URL}/api/lessons/${lessons[1].id}`)).status()).toBe(200)
    const studentPage = await learner.newPage()
    await studentPage.goto(`/courses/${CONTENT.course.slug}`)
    await expect(studentPage.getByRole('heading', { name: CONTENT.course.title, exact: true })).toBeVisible()
    const allowedLinks = studentPage.getByRole('link', { name: new RegExp(CONTENT.lessons[1].title) })
    await expect(allowedLinks.first()).toBeVisible()
    for (const link of await allowedLinks.all()) await expect(link).toHaveAttribute('href', `/lessons/${CONTENT.lessons[1].slug}`)
    await expect(studentPage.getByRole('link', { name: new RegExp(CONTENT.lessons[0].title) })).toHaveCount(0)
    await studentPage.goto(`/lessons/${CONTENT.lessons[0].slug}`)
    await expect(studentPage.getByText(/Доступ к этому уроку пока не назначен/)).toBeVisible()
    await studentPage.goto('/admin/learning-access')
    await expect(studentPage.getByRole('heading', { name: 'Доступ к обучению', exact: true })).toHaveCount(0)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 960 })
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => { document.documentElement.dataset.theme = value }, theme)
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        const accessibility = await new AxeBuilder({ page }).include('.learning-access').withRules(['color-contrast', 'label', 'select-name', 'button-name']).analyze()
        expect(accessibility.violations).toEqual([])
        await page.screenshot({ path: testInfo.outputPath(`learning-access-${width}-${theme}.png`), fullPage: true })
      }
    }
  } finally {
    if (userId) await admin.request.delete(`${APP_URL}/api/users/${userId}`)
    await learner.close()
    await admin.close()
  }
})
