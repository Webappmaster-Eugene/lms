import { expect, test, type Page, type Route } from '@playwright/test'

import { CONTENT, USERS } from '../fixtures/data'
import { storageStateOf } from '../fixtures/env'

test.use({ storageState: storageStateOf('doer') })

async function holdClientScripts(page: Page) {
  let release = () => {}
  const gate = new Promise<void>((resolve) => { release = resolve })
  const matcher = /\/_next\/static\/.*\.js(?:\?.*)?$/
  const handler = async (route: Route) => {
    await gate
    await route.continue()
  }
  await page.route(matcher, handler)
  return {
    release,
    close: async () => {
      release()
      await page.unroute(matcher, handler)
    },
  }
}

test('медленная загрузка скриптов не позволяет потерять текст вопроса до подключения обработчика', async ({ page }) => {
  const scripts = await holdClientScripts(page)
  let commentId: number | undefined
  try {
    await page.goto(`/lessons/${CONTENT.lessons[0].slug}`, { waitUntil: 'commit' })
    const input = page.getByRole('textbox', { name: 'Вопрос к уроку', exact: true })
    const send = page.getByRole('button', { name: 'Отправить вопрос', exact: true })
    await expect(input).toBeVisible()
    await expect(input).toBeDisabled()
    await expect(send).toBeDisabled()

    scripts.release()
    await expect(input).toBeEnabled()
    const text = `Сохраняемый вопрос ${Date.now()}`
    await input.fill(text)
    await expect(send).toBeEnabled()
    await expect(input).toHaveValue(text)
    const posted = page.waitForResponse(response => new URL(response.url()).pathname === '/api/comments' && response.request().method() === 'POST')
    await send.click()
    const response = await posted
    expect(response.status()).toBe(201)
    const created: { doc: { id: number } } = await response.json()
    commentId = created.doc.id
    await page.reload()
    await expect(page.locator(`#comment-${commentId}`).getByText(text, { exact: true })).toBeVisible()
  } finally {
    await scripts.close()
    if (commentId !== undefined) {
      expect((await page.request.delete(`/api/comments/${commentId}/remove`)).status()).toBe(200)
    }
  }
})

test('мобильное меню становится доступно после загрузки скриптов и открывается с первого нажатия', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 })
  const scripts = await holdClientScripts(page)
  try {
    await page.goto('/', { waitUntil: 'commit' })
    const more = page.getByRole('button', { name: 'Ещё', exact: true })
    await expect(more).toBeVisible()
    await expect(more).toBeDisabled()
    scripts.release()
    await expect(more).toBeEnabled()
    await more.click()
    const menu = page.getByRole('dialog', { name: 'Меню платформы', exact: true })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('link', { name: 'Профиль', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Закрыть меню', exact: true }).click()
    await expect(menu).not.toBeVisible()
  } finally { await scripts.close() }
})

test('поиск после загрузки скриптов сохраняет запрос и показывает результат сервера', async ({ page }) => {
  const scripts = await holdClientScripts(page)
  try {
    await page.goto('/', { waitUntil: 'commit' })
    const input = page.getByRole('combobox', { name: 'Поиск по курсам, урокам и задачам', exact: true })
    await expect(input).toBeVisible()
    await expect(input).toBeDisabled()
    scripts.release()
    await expect(input).toBeEnabled()
    await input.fill(CONTENT.course.title)
    await expect(input).toHaveValue(CONTENT.course.title)
    await expect(page.getByRole('option').filter({ hasText: CONTENT.course.title })).toBeVisible()
  } finally { await scripts.close() }
})

test('свой тест добавляется с первого нажатия после загрузки тренажёра и сохраняет введённые данные', async ({ page }) => {
  const scripts = await holdClientScripts(page)
  try {
    await page.goto(`/trainer/${CONTENT.topic.slug}/${CONTENT.task.slug}`, { waitUntil: 'commit' })
    const help = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Свои тесты' }) })
    await help.locator('summary').click()
    const add = help.getByRole('button', { name: 'Добавить свой тест', exact: true })
    await expect(add).toBeVisible()
    await expect(add).toBeDisabled()
    scripts.release()
    await expect(add).toBeEnabled()
    await add.click()
    const args = help.getByRole('textbox', { name: 'Аргументы теста 1', exact: true })
    const expected = help.getByRole('textbox', { name: 'Ожидаемый результат теста 1', exact: true })
    await args.fill('2, 3')
    await expected.fill('5')
    // Ещё одно изменение состояния не должно сбросить первый созданный тест.
    await add.click()
    await expect(help.getByRole('textbox', { name: 'Аргументы теста 2', exact: true })).toBeVisible()
    await expect(args).toHaveValue('2, 3')
    await expect(expected).toHaveValue('5')
    await help.getByRole('button', { name: 'Удалить свой тест 2', exact: true }).click()
    await expect(help.getByRole('textbox', { name: 'Аргументы теста 2', exact: true })).toHaveCount(0)
    await expect(args).toHaveValue('2, 3')
  } finally { await scripts.close() }
})

test.describe('публичные формы', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('вход после медленной загрузки сохраняет email при вводе пароля и авторизует ученика', async ({ page }) => {
    const scripts = await holdClientScripts(page)
    try {
      await page.goto('/login', { waitUntil: 'commit' })
      const email = page.getByLabel('Email', { exact: true })
      const password = page.getByLabel('Пароль', { exact: true })
      const submit = page.getByRole('button', { name: 'Войти', exact: true })
      await expect(email).toBeVisible()
      await expect(email).toBeDisabled()
      await expect(password).toBeDisabled()
      await expect(submit).toBeDisabled()
      scripts.release()
      await expect(email).toBeEnabled()
      await email.fill(USERS.doer.email)
      await password.fill(USERS.doer.password)
      await expect(email).toHaveValue(USERS.doer.email)
      const loggedIn = page.waitForResponse(response => new URL(response.url()).pathname === '/api/users/login' && response.request().method() === 'POST')
      await submit.click()
      expect((await loggedIn).status()).toBe(200)
      await expect(page.getByRole('heading', { name: /Привет,/ })).toBeVisible()
    } finally { await scripts.close() }
  })

  test('форма восстановления пароля после загрузки передаёт введённый email', async ({ page }) => {
    const scripts = await holdClientScripts(page)
    const emailValue = 'hydration-request@example.invalid'
    let requestedEmail: unknown
    // Проверяем клиентскую форму; доставка писем проверяется отдельно.
    await page.route('**/api/users/forgot-password', async route => {
      const data: { email?: unknown } = route.request().postDataJSON()
      requestedEmail = data.email
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })
    try {
      await page.goto('/forgot-password', { waitUntil: 'commit' })
      const input = page.getByLabel('Email', { exact: true })
      const submit = page.getByRole('button', { name: 'Отправить ссылку', exact: true })
      await expect(input).toBeVisible()
      await expect(input).toBeDisabled()
      await expect(submit).toBeDisabled()
      scripts.release()
      await expect(input).toBeEnabled()
      await input.fill(emailValue)
      await submit.click()
      await expect(page.getByText(emailValue, { exact: true })).toBeVisible()
      expect(requestedEmail).toBe(emailValue)
    } finally { await scripts.close() }
  })
})
