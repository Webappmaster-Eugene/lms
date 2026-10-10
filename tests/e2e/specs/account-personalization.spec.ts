import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test'

import { CONTENT, USERS } from '../fixtures/data'
import { APP_URL } from '../fixtures/env'

const screenshotDirectory = resolve('.codex/state/account-ux')
const password = 'Account-Test-Password-123'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const menuLabels = ['Дашборд', 'Роадмапы', 'Курсы', 'Тренажёр', 'Сертификаты', 'Заметки', 'Вопросы', 'Сохранённое', 'Лидерборд', 'Профиль', 'Приложение', 'Уведомления', 'Контакты', 'Помощь']

type Account = { id: number; email: string; admin: APIRequestContext; commentIds: number[] }
const test = base.extend<{ account: Account }>({
  account: async ({ playwright, baseURL, page }, runFixture) => {
    const admin = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: APP_URL } })
    expect((await admin.post('/api/users/login', { data: USERS.admin })).status()).toBe(200)
    const email = `account-${randomUUID()}@lms.test`
    const created = await admin.post('/api/users', { data: { email, password, firstName: 'Личный', lastName: 'Аккаунт', role: 'student', isActive: true, learningAccessMode: 'all', learningCatalogVisibility: 'catalog', trainerAccessMode: 'all' } })
    expect(created.status(), await created.text()).toBe(201)
    const { doc } = await created.json() as { doc: { id: number } }
    const account: Account = { id: doc.id, email, admin, commentIds: [] }
    try {
      expect((await page.request.post('/api/users/login', { data: { email, password } })).status()).toBe(200)
      await runFixture(account)
    } finally {
      const ownComments = await admin.get(`/api/comments?where[user][equals]=${doc.id}&limit=100&depth=0`)
      if (ownComments.ok()) {
        const comments = await ownComments.json() as { docs: { id: number }[] }
        for (const id of new Set([...account.commentIds, ...comments.docs.map((comment) => comment.id)].reverse())) {
          const deleted = await admin.delete(`/api/comments/${id}`)
          expect([200, 404]).toContain(deleted.status())
        }
      }
      const mediaResponse = await admin.get(`/api/media?where[uploadedBy][equals]=${doc.id}&limit=100&depth=0`)
      if (mediaResponse.ok()) {
        const media = await mediaResponse.json() as { docs: { id: number }[] }
        for (const image of media.docs) expect((await admin.delete(`/api/media/${image.id}`)).status()).toBe(200)
      }
      expect((await admin.delete(`/api/users/${doc.id}`)).status()).toBe(200)
      await admin.dispose()
    }
  },
})

async function openSettings(page: Page) {
  await page.goto('/profile/edit')
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Личный')
}

async function saveProfile(page: Page) {
  const pending = page.waitForResponse((response) => response.url().endsWith('/api/profile') && response.request().method() === 'PATCH')
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click()
  const saved = await pending
  expect(saved.status(), await saved.text()).toBe(200)
  await expect(page.getByRole('status').filter({ hasText: 'Профиль сохранён' })).toBeVisible()
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('личные данные, загрузка и удаление аватара сохраняются и обновляют шапку', async ({ page, account }) => {
  await openSettings(page)
  await page.getByLabel('Имя', { exact: true }).fill('Александра')
  await page.getByLabel('Фамилия', { exact: true }).fill('Иванова')
  await page.getByLabel('Telegram', { exact: true }).fill('@alexandra_dev')
  await page.getByLabel('О себе', { exact: true }).fill('Изучаю React.\nИщу первую работу.')
  await saveProfile(page)
  await expect(page.getByRole('link', { name: 'Настроить профиль: Александра Иванова' })).toBeVisible()
  const profile = await (await page.request.get('/api/profile')).json() as { profile: { id: number; telegram: string } }
  expect(profile.profile).toMatchObject({ id: account.id, telegram: 'https://t.me/alexandra_dev' })

  // Real file chooser validation: unsupported and oversized images cannot be saved as an avatar.
  await page.getByLabel('Изменить аватар', { exact: true }).setInputFiles({ name: 'avatar.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') })
  await expect(page.getByRole('main').getByRole('alert')).toContainText('до 2 МБ')
  await page.getByLabel('Изменить аватар', { exact: true }).setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) })
  await expect(page.getByRole('main').getByRole('alert')).toContainText('до 2 МБ')
  await page.getByLabel('Изменить аватар', { exact: true }).setInputFiles({ name: `account-${account.id}.png`, mimeType: 'image/png', buffer: png })
  await expect(page.getByAltText('Ваш аватар')).toHaveAttribute('src', /^blob:/)
  await saveProfile(page)
  await expect(page.getByAltText('Ваш аватар')).toHaveAttribute('src', /\/api\/media\/file\//)
  await expect(page.getByRole('link', { name: 'Настроить профиль: Александра Иванова' }).locator('img')).toBeVisible()
  await page.getByRole('button', { name: 'Удалить аватар', exact: true }).click()
  await saveProfile(page)
  await expect(page.getByAltText('Ваш аватар')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Настроить профиль: Александра Иванова' }).locator('img')).toHaveCount(0)
  await page.goto('/profile')
  await expect(page.getByRole('heading', { level: 1, name: 'Александра Иванова' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Telegram: @alexandra_dev' })).toHaveAttribute('href', 'https://t.me/alexandra_dev')
})

test('смена email подтверждается паролем и сохраняет текущий вход', async ({ page, account, playwright, baseURL }) => {
  const other = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: APP_URL } })
  const login = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: APP_URL } })
  try {
    expect((await other.post('/api/users/login', { data: { email: account.email, password } })).status()).toBe(200)
    await openSettings(page)
    const newEmail = `changed-${randomUUID()}@lms.test`
    await page.getByLabel('E-mail для входа', { exact: true }).fill(newEmail)
    await page.getByLabel('Текущий пароль для смены e-mail', { exact: true }).fill('Wrong-Password-123')
    const denied = page.waitForResponse((response) => response.url().endsWith('/api/profile') && response.request().method() === 'PATCH')
    await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click()
    expect((await denied).status()).toBe(403)
    await expect(page.getByRole('main').getByRole('alert')).toContainText('пароль')
    expect((await (await page.request.get('/api/profile')).json()).profile.email).toBe(account.email)
    await page.getByLabel('Текущий пароль для смены e-mail', { exact: true }).fill(password)
    await saveProfile(page)
    expect((await (await page.request.get('/api/profile')).json()).profile.email).toBe(newEmail)
    expect((await other.get('/api/profile')).status()).toBe(401)
    expect((await login.post('/api/users/login', { data: { email: account.email, password } })).status()).toBe(401)
    expect((await login.post('/api/users/login', { data: { email: newEmail, password } })).status()).toBe(200)
    await page.reload()
    await expect(page.getByLabel('E-mail для входа', { exact: true })).toHaveValue(newEmail)
  } finally { await other.dispose(); await login.dispose() }
})

test('смена пароля проверяет подтверждение и отзывает другие сессии', async ({ page, account, playwright, baseURL }) => {
  const other = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: APP_URL } })
  const login = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: APP_URL } })
  try {
    expect((await other.post('/api/users/login', { data: { email: account.email, password } })).status()).toBe(200)
    await openSettings(page)
    const newPassword = 'New-Account-Password-456'
    await page.getByLabel('Текущий пароль', { exact: true }).fill(password)
    await page.getByLabel('Новый пароль', { exact: true }).fill(newPassword)
    await page.getByLabel('Повторите новый пароль', { exact: true }).fill('Different-Password-456')
    await page.getByRole('button', { name: 'Изменить пароль', exact: true }).click()
    await expect(page.getByRole('main').getByRole('alert')).toContainText('не совпадают')
    await page.getByLabel('Повторите новый пароль', { exact: true }).fill(newPassword)
    await page.getByRole('button', { name: 'Показать: новый пароль', exact: true }).click()
    await expect(page.getByLabel('Новый пароль', { exact: true })).toHaveAttribute('type', 'text')
    const changed = page.waitForResponse((response) => response.url().endsWith('/api/profile/password') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Изменить пароль', exact: true }).click()
    const saved = await changed
    expect(saved.status(), await saved.text()).toBe(200)
    await expect(page.getByRole('status').filter({ hasText: 'Пароль изменён' })).toBeVisible()
    await expect(page.getByLabel('Новый пароль', { exact: true })).toHaveValue('')
    expect((await page.request.get('/api/profile')).status()).toBe(200)
    expect((await other.get('/api/profile')).status()).toBe(401)
    expect((await login.post('/api/users/login', { data: { email: account.email, password } })).status()).toBe(401)
    expect((await login.post('/api/users/login', { data: { email: account.email, password: newPassword } })).status()).toBe(200)
  } finally { await other.dispose(); await login.dispose() }
})

test('свой комментарий можно изменить и удалить, ответ ментора остаётся', async ({ page, account }) => {
  const lessons = await (await account.admin.get(`/api/lessons?where[slug][equals]=${CONTENT.lessons[0].slug}&depth=0`)).json() as { docs: { id: number }[] }
  const lessonId = lessons.docs[0]?.id
  expect(lessonId).toBeDefined()
  await page.goto(`/lessons/${CONTENT.lessons[0].slug}`)
  await page.getByRole('textbox', { name: 'Вопрос к уроку', exact: true }).fill('Почему нужен семантический HTML?')
  const posted = page.waitForResponse((response) => response.url().endsWith('/api/comments') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Отправить вопрос', exact: true }).click()
  const published = await posted
  expect(published.status(), await published.text()).toBe(201)
  const question = page.locator('li[id^="comment-"]').getByText('Почему нужен семантический HTML?', { exact: true })
  await expect(question).toBeVisible()
  const docs = await (await page.request.get(`/api/comments?where[lesson][equals]=${lessonId}&depth=0`)).json() as { docs: { id: number; content: string }[] }
  const root = docs.docs.find((comment) => comment.content === 'Почему нужен семантический HTML?')
  expect(root).toBeDefined()
  if (!root) throw new Error('Не найден опубликованный вопрос')
  account.commentIds.push(root.id)
  const mentorText = 'Семантика помогает доступности и поиску.'
  const reply = await account.admin.post('/api/comments', { data: { lesson: lessonId, parentComment: root.id, content: mentorText } })
  expect(reply.status(), await reply.text()).toBe(201)
  account.commentIds.push((await reply.json()).doc.id)
  await page.reload()
  const thread = page.locator(`#comment-${root.id}`)
  await expect(thread.getByText(mentorText, { exact: true })).toBeVisible()
  const mentor = thread.locator('li').filter({ hasText: mentorText })
  await expect(mentor.getByRole('button', { name: /^(Изменить|Удалить)$/ })).toHaveCount(0)
  await thread.getByRole('button', { name: 'Изменить', exact: true }).click()
  await page.getByRole('textbox', { name: 'Текст комментария', exact: true }).fill('Черновик, который отменён')
  await thread.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(question).toBeVisible()
  await thread.getByRole('button', { name: 'Изменить', exact: true }).click()
  await page.getByRole('textbox', { name: 'Текст комментария', exact: true }).fill('Как семантика влияет на доступность?')
  await thread.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(thread.locator('p').filter({ hasText: 'Как семантика влияет на доступность?' })).toBeVisible()
  await thread.getByRole('button', { name: 'Удалить', exact: true }).click()
  const confirmation = thread.getByRole('alertdialog', { name: 'Удалить комментарий?' })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(confirmation).toHaveCount(0)
  await thread.getByRole('button', { name: 'Удалить', exact: true }).click()
  await thread.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
  await expect(thread.getByText('(Комментарий удалён)', { exact: true })).toBeVisible()
  await expect(thread.getByText(mentorText, { exact: true })).toBeVisible()
  await expect(thread.getByRole('button', { name: /^(Изменить|Удалить)$/ })).toHaveCount(0)
  await page.reload()
  await expect(thread.getByText(mentorText, { exact: true })).toBeVisible()
})

test('меню имеет заданный порядок, профиль кликабелен, приложение и уведомления разделены', async ({ page, account: _account }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/')
  const desktopMenu = page.locator('aside').getByRole('navigation', { name: 'Меню платформы', exact: true })
  await expect(desktopMenu.getByRole('link')).toHaveText(menuLabels)
  const profile = page.locator('header').getByRole('link', { name: 'Настроить профиль: Личный Аккаунт' })
  const box = await profile.boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(44)
  expect(box?.width).toBeGreaterThanOrEqual(44)
  await profile.focus()
  await expect(profile).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/profile\/edit$/)
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Личный')
  await page.setViewportSize({ width: 375, height: 844 })
  await page.getByRole('button', { name: 'Ещё', exact: true }).click()
  const mobileMenu = page.getByRole('dialog', { name: 'Меню платформы', exact: true })
  await expect(mobileMenu.getByRole('navigation', { name: 'Меню платформы', exact: true }).getByRole('link')).toHaveText(menuLabels)
  await mobileMenu.getByRole('link', { name: 'Приложение', exact: true }).click()
  await expect(page).toHaveURL(/\/settings\/app$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Приложение' })).toBeVisible()
  await page.getByRole('button', { name: 'Ещё', exact: true }).click()
  await page.getByRole('dialog', { name: 'Меню платформы', exact: true }).getByRole('link', { name: 'Уведомления', exact: true }).click()
  await expect(page).toHaveURL(/\/settings\/notifications$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Уведомления' })).toBeVisible()
  await noOverflow(page)
})

test('подсказка своих тестов понятна до открытия и показывает пример задачи', async ({ page, account: _account }) => {
  await page.setViewportSize({ width: 375, height: 844 })
  await page.goto(`/trainer/${CONTENT.topic.slug}/${CONTENT.task.slug}`)
  const help = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Свои тесты' }) })
  await expect(help).not.toHaveAttribute('open')
  await expect(help.locator('summary')).toContainText('задайте входные значения')
  await help.locator('summary').click()
  await expect(help.getByText('Пример из текущей задачи', { exact: true })).toBeVisible()
  await help.getByRole('button', { name: 'Добавить свой тест', exact: true }).click()
  await expect(help.getByRole('textbox', { name: 'Аргументы теста 1', exact: true })).toBeVisible()
  await expect(help.getByRole('textbox', { name: 'Ожидаемый результат теста 1', exact: true })).toBeVisible()
  await noOverflow(page)
})

test('профиль доступен без переполнения в светлой и тёмной теме на телефоне и desktop', async ({ page, account: _account }) => {
  test.setTimeout(120_000)
  await mkdir(screenshotDirectory, { recursive: true })
  for (const theme of ['light', 'dark']) {
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: width === 375 ? 844 : 960 })
      await page.goto('/profile/edit')
      await expect(page.getByLabel('Имя', { exact: true })).toBeVisible()
      await page.getByLabel('Тема оформления', { exact: true }).selectOption(theme)
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
      await noOverflow(page)
      await page.getByLabel('Имя', { exact: true }).focus()
      await expect(page.getByLabel('Имя', { exact: true })).toBeFocused()
      const a11y = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(a11y.violations).toEqual([])
      await page.screenshot({ path: resolve(screenshotDirectory, `profile-${theme}-${width}.png`), fullPage: true, animations: 'disabled' })
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: resolve(screenshotDirectory, `profile-${theme}-${width}-viewport.png`), animations: 'disabled' })
    }
  }
})
