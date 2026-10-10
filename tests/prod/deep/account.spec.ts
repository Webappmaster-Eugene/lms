import { expect, test, type Page } from '@playwright/test'

import { MARK, PROD_URL, stateOf } from '../env'

test.use({ storageState: stateOf('student') })

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

async function saveProfile(page: Page) {
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/profile' && response.request().method() === 'PATCH')
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click()
  expect((await pending).status()).toBe(200)
  await expect(page.getByRole('status').filter({ hasText: 'Профиль сохранён' })).toBeVisible()
}

test('персонализация: имя, Telegram и аватар сохраняются на проде', async ({ page, playwright }) => {
  await page.goto('/profile/edit', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('Имя', { exact: true })).toBeVisible()
  const originalFirst = await page.getByLabel('Имя', { exact: true }).inputValue()
  const originalLast = await page.getByLabel('Фамилия', { exact: true }).inputValue()
  const initialResponse = await page.request.get('/api/profile', { headers: { Origin: PROD_URL } })
  expect(initialResponse.status()).toBe(200)
  const initial = await initialResponse.json() as { profile: { id: number } }
  const admin = await playwright.request.newContext({ baseURL: PROD_URL, storageState: stateOf('admin'), extraHTTPHeaders: { Origin: PROD_URL } })
  try {
    await page.getByLabel('Имя', { exact: true }).fill('Проверка')
    await page.getByLabel('Фамилия', { exact: true }).fill('Профиля')
    await page.getByLabel('Telegram', { exact: true }).fill('@lms_test_profile')
    await page.getByLabel('О себе', { exact: true }).fill(MARK)
    await page.getByLabel('Изменить аватар', { exact: true }).setInputFiles({ name: 'prod-test-avatar.png', mimeType: 'image/png', buffer: png })
    await saveProfile(page)
    const saved = await (await page.request.get('/api/profile', { headers: { Origin: PROD_URL } })).json() as { profile: { avatar: { id: number } | null; telegram: string } }
    expect(saved.profile.avatar?.id).toBeGreaterThan(0)
    expect(saved.profile.telegram).toBe('https://t.me/lms_test_profile')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Проверка')
    await expect(page.getByLabel('О себе', { exact: true })).toHaveValue(MARK)
    await expect(page.getByAltText('Ваш аватар')).toHaveAttribute('src', /\/api\/media\/file\//)
    const header = page.locator('header').getByRole('link', { name: 'Настроить профиль: Проверка Профиля', exact: true })
    await expect(header.locator('img')).toBeVisible()
    await header.click()
    await expect(page).toHaveURL(/\/profile\/edit$/)
    await page.getByRole('button', { name: 'Удалить аватар', exact: true }).click()
    await page.getByLabel('Имя', { exact: true }).fill(originalFirst)
    await page.getByLabel('Фамилия', { exact: true }).fill(originalLast)
    await saveProfile(page)
    await expect(page.getByAltText('Ваш аватар')).toHaveCount(0)
  } finally {
    // Чистим загрузки временного ученика даже при отказе последующего сохранения профиля.
    const uploads = await admin.get(`/api/media?where[uploadedBy][equals]=${initial.profile.id}&depth=0&limit=100`)
    expect(uploads.ok()).toBe(true)
    const images = await uploads.json() as { docs: { id: number }[] }
    for (const image of images.docs) expect((await admin.delete(`/api/media/${image.id}`)).status()).toBe(200)
    await admin.dispose()
  }
})

test('персонализация: свой комментарий меняется и удаляется, ответ ментора остаётся', async ({ page, browser }) => {
  await page.goto('/courses', { waitUntil: 'domcontentloaded' })
  await page.locator('a[href^="/courses/"]').filter({ has: page.locator('h3') }).first().click()
  await page.getByRole('link', { name: /Начать курс|Продолжить с урока/ }).click()
  const original = `${MARK}: проверка редактирования`
  const updated = `${MARK}: вопрос изменён`
  const answer = `${MARK}: сохраняемый ответ ментора`
  await page.getByRole('textbox', { name: 'Вопрос к уроку', exact: true }).fill(original)
  const posted = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/comments' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Отправить вопрос', exact: true }).click()
  const published = await posted
  expect(published.status()).toBe(201)
  const root = await published.json() as { doc: { id: number; lesson: number | { id: number } } }
  const lesson = typeof root.doc.lesson === 'number' ? root.doc.lesson : root.doc.lesson.id
  const mentor = await browser.newContext({ baseURL: PROD_URL, storageState: stateOf('admin'), extraHTTPHeaders: { Origin: PROD_URL } })
  try {
    expect((await mentor.request.post('/api/comments', { data: { lesson, parentComment: root.doc.id, content: answer } })).status()).toBe(201)
    await page.reload({ waitUntil: 'domcontentloaded' })
    const thread = page.locator(`#comment-${root.doc.id}`)
    await expect(thread.getByText(answer, { exact: true })).toBeVisible()
    const reply = thread.locator('li').filter({ hasText: answer })
    await expect(reply.getByRole('button', { name: /^(Изменить|Удалить)$/ })).toHaveCount(0)
    await thread.getByRole('button', { name: 'Изменить', exact: true }).click()
    await page.getByRole('textbox', { name: 'Текст комментария', exact: true }).fill(updated)
    await thread.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(thread.getByText(updated, { exact: true })).toBeVisible()
    await thread.getByRole('button', { name: 'Удалить', exact: true }).click()
    await thread.getByRole('alertdialog', { name: 'Удалить комментарий?' }).getByRole('button', { name: 'Отмена', exact: true }).click()
    await expect(thread.getByText(updated, { exact: true })).toBeVisible()
    await thread.getByRole('button', { name: 'Удалить', exact: true }).click()
    await thread.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
    await expect(thread.getByText('(Комментарий удалён)', { exact: true })).toBeVisible()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(thread.getByText(answer, { exact: true })).toBeVisible()
    await expect(thread.getByRole('button', { name: /^(Изменить|Удалить)$/ })).toHaveCount(0)
  } finally { await mentor.close() }
})

test('персонализация: порядок меню и инструкция своих тестов на телефоне', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const labels = ['Дашборд', 'Роадмапы', 'Курсы', 'Тренажёр', 'История обучения', 'Сертификаты', 'Заметки', 'Вопросы', 'Сохранённое', 'Лидерборд', 'Профиль', 'Приложение', 'Уведомления', 'Контакты', 'Помощь']
  await expect(page.locator('aside').getByRole('navigation', { name: 'Меню платформы', exact: true }).getByRole('link')).toHaveText(labels)
  await page.setViewportSize({ width: 375, height: 844 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Ещё', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Меню платформы', exact: true }).getByRole('navigation', { name: 'Меню платформы', exact: true }).getByRole('link')).toHaveText(labels)
  await page.goto('/trainer/js-interview-practice/interview-js-equal-range', { waitUntil: 'domcontentloaded' })
  const help = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Свои тесты' }) })
  await expect(help.locator('summary')).toContainText('задайте входные значения')
  await help.locator('summary').click()
  await expect(help.getByText('Пример из текущей задачи', { exact: true })).toBeVisible()
  await help.getByRole('button', { name: 'Добавить свой тест', exact: true }).click()
  await expect(help.getByRole('textbox', { name: 'Аргументы теста 1', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
