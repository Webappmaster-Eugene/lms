import { expect, test } from '@playwright/test'

import { adminContext, createAccount, deleteAccount, signedInContext, type Account } from '../fixtures/accounts'
import { CONTENT, NOT_FOUND_HEADING, SUM_SOLUTION } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'
import { setCode } from '../fixtures/monaco'

/**
 * Режим собеседования тренажёра: /trainer/interview/new создаёт комнату, /trainer/interview/[token] —
 * общий редактор для участников с аккаунтом. Комнаты принадлежат временным ученикам и удаляются вместе с ними.
 */
const ROOM_URL = /\/trainer\/interview\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const CODE = `${SUM_SOLUTION}console.log(sum(2, 3))\n`

test('комната по задаче: условие, общий код, консоль, приглашённый участник и завершение', async ({ browser }) => {
  const admin = await adminContext(browser)
  let owner: Account | undefined
  let guest: Account | undefined
  try {
    owner = await createAccount(admin.request, { firstName: 'Кандидат', lastName: 'Собеседование' })
    guest = await createAccount(admin.request, { firstName: 'Интервьюер', lastName: 'Платформы' })
    const ownerContext = await signedInContext(browser, owner, { permissions: ['clipboard-read', 'clipboard-write'] })
    const guestContext = await signedInContext(browser, guest)
    try {
      const page = await ownerContext.newPage()
      await page.goto(`/trainer/${CONTENT.topic.slug}/${CONTENT.task.slug}`)
      await page.getByRole('link', { name: 'На собеседовании', exact: true }).click()
      await expect(page).toHaveURL(/\/trainer\/interview\/new\?taskId=\d+$/)
      await expect(page.getByRole('heading', { name: 'Собеседование', level: 1 })).toBeVisible()
      await expect(page.getByText('Комната откроется с условием и шаблоном выбранной задачи.')).toBeVisible()
      await page.getByRole('button', { name: 'Создать комнату', exact: true }).click()
      await expect(page).toHaveURL(ROOM_URL)
      const roomUrl = page.url()

      await expect(page.getByRole('heading', { name: CONTENT.task.title, level: 1 })).toBeVisible()
      const statement = page.locator('aside').filter({ has: page.getByRole('heading', { name: 'Условие', level: 2 }) })
      await expect(statement).toContainText('sum(a, b)')
      await expect(page.getByText('Онлайн: 1', { exact: true })).toBeVisible()
      await expect(page.locator('.monaco-editor .view-lines').first()).toContainText('function sum(a, b)')
      // Без подсказок и эталона: разбор задачи в комнату не попадает.
      await expect(page.getByText('Достаточно оператора')).toHaveCount(0)

      await setCode(page, CODE)
      const editor = page.getByRole('region', { name: 'Общий редактор' })
      await expect(editor.getByRole('status')).toHaveText('Код сохранён')
      await editor.getByRole('button', { name: 'Запустить', exact: true }).click()
      const output = page.getByLabel('Консоль', { exact: true })
      await expect(output.locator('pre').last()).toHaveText('5')

      await page.getByRole('button', { name: 'Пригласить', exact: true }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Ссылка скопирована. Отправьте её собеседнику с аккаунтом на платформе.' })).toBeVisible()
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(roomUrl)

      const interviewer = await guestContext.newPage()
      await interviewer.goto(roomUrl)
      await expect(interviewer.getByRole('heading', { name: CONTENT.task.title, level: 1 })).toBeVisible()
      await expect(interviewer.locator('.monaco-editor .view-lines').first()).toContainText('console.log(sum(2, 3))')
      // Завершить комнату может только её создатель.
      await expect(interviewer.getByRole('button', { name: 'Завершить', exact: true })).toHaveCount(0)
      await expect(page.getByText('Онлайн: 2', { exact: true })).toBeVisible({ timeout: 15_000 })
      await page.getByText('Онлайн: 2', { exact: true }).click()
      await expect(page.getByText(`${guest.name} · онлайн`)).toBeVisible()
      await interviewer.getByRole('region', { name: 'Общий редактор' }).getByRole('button', { name: 'Запустить', exact: true }).click()
      await expect(interviewer.getByLabel('Консоль', { exact: true }).locator('pre').last()).toHaveText('5')

      page.once('dialog', (dialog) => dialog.accept())
      await page.getByRole('button', { name: 'Завершить', exact: true }).click()
      await expect(page.getByText(/Собеседование · \d\d:\d\d · Завершено/)).toBeVisible()
      await expect(editor.getByRole('button', { name: 'Запустить', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Пригласить', exact: true })).toBeDisabled()
      await expect(interviewer.getByText(/Собеседование · \d\d:\d\d · Завершено/)).toBeVisible({ timeout: 15_000 })
      await expect(interviewer.getByRole('region', { name: 'Общий редактор' }).getByRole('button', { name: 'Запустить', exact: true })).toBeDisabled()
      // Код остаётся доступен участникам после завершения.
      await interviewer.reload()
      await expect(interviewer.locator('.monaco-editor .view-lines').first()).toContainText('console.log(sum(2, 3))')
    } finally { await Promise.all([ownerContext.close(), guestContext.close()]) }
  } finally {
    await deleteAccount(admin.request, owner)
    await deleteAccount(admin.request, guest)
    await admin.close()
  }
})

test('комната из каталога тренажёра открывается с чистым редактором', async ({ browser }) => {
  const admin = await adminContext(browser)
  let owner: Account | undefined
  try {
    owner = await createAccount(admin.request)
    const context = await signedInContext(browser, owner)
    try {
      const page = await context.newPage()
      await page.goto('/trainer')
      const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Режим собеседования' }) })
      await section.getByRole('link', { name: 'Создать комнату', exact: true }).click()
      await expect(page).toHaveURL(/\/trainer\/interview\/new$/)
      await expect(page.getByText('Комната откроется с чистым редактором. Условие можно обсудить с собеседником.')).toBeVisible()
      await page.getByRole('button', { name: 'Создать комнату', exact: true }).click()
      await expect(page).toHaveURL(ROOM_URL)
      await expect(page.getByRole('heading', { name: 'Собеседование', level: 1 })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Условие' })).toHaveCount(0)
      await expect(page.locator('.monaco-editor .view-lines').first()).toContainText('Готов к собеседованию')
      await expect(page.getByRole('combobox', { name: 'Язык решения' })).toHaveValue('js')
      await page.getByRole('region', { name: 'Общий редактор' }).getByRole('button', { name: 'Запустить', exact: true }).click()
      await expect(page.getByLabel('Консоль', { exact: true }).locator('pre').last()).toHaveText('Готов к собеседованию')
      await page.getByRole('link', { name: 'Тренажёр', exact: true }).first().click()
      await expect(page).toHaveURL(/\/trainer$/)
    } finally { await context.close() }
  } finally {
    await deleteAccount(admin.request, owner)
    await admin.close()
  }
})

test.describe('доступ к комнатам собеседования', () => {
  test('гость уходит на вход с возвратом к комнате', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: APP_URL, storageState: { cookies: [], origins: [] } })
    try {
      const page = await context.newPage()
      for (const path of ['/trainer/interview/new?taskId=1', '/trainer/interview/12345678-1234-4123-8123-123456789012']) {
        await page.goto(path)
        await expect(page, path).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === path)
      }
    } finally { await context.close() }
  })

  test.describe('ученик', () => {
    test.use({ storageState: storageStateOf('student') })

    test('неверная ссылка — 404, несуществующая комната — честное сообщение', async ({ page }) => {
      expect((await page.goto('/trainer/interview/not-a-room'))?.status()).toBe(404)
      await expect(page.getByRole('heading', { name: NOT_FOUND_HEADING })).toBeVisible()
      await page.goto('/trainer/interview/12345678-1234-4123-8123-123456789012')
      await expect(page.getByRole('heading', { name: 'Комната собеседования', level: 1 })).toBeVisible()
      await expect(page.getByText('Комната не найдена')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Вернуться в тренажёр' })).toHaveAttribute('href', '/trainer')
    })
  })

  test('ученик с выключенным тренажёром не создаёт комнату и не входит по приглашению', async ({ browser }) => {
    const admin = await adminContext(browser)
    let owner: Account | undefined
    let blocked: Account | undefined
    try {
      owner = await createAccount(admin.request)
      blocked = await createAccount(admin.request, { trainerAccessMode: 'disabled' })
      const ownerContext = await signedInContext(browser, owner)
      const blockedContext = await signedInContext(browser, blocked)
      try {
        const created = await ownerContext.request.post('/api/trainer/interview', { data: {} })
        expect(created.status(), await created.text()).toBe(201)
        const token = (await created.json()).room.token as string
        const page = await blockedContext.newPage()
        await page.goto('/trainer')
        await expect(page.getByRole('heading', { name: 'Режим собеседования' })).toHaveCount(0)
        for (const path of ['/trainer/interview/new', `/trainer/interview/${token}`]) {
          await page.goto(path)
          await expect(page.getByText('Доступ к тренажёру не назначен. Обратитесь к наставнику.'), path).toBeVisible()
          await expect(page.getByRole('button', { name: 'Создать комнату' }), path).toHaveCount(0)
          await expect(page.locator('.monaco-editor'), path).toHaveCount(0)
        }
        expect((await blockedContext.request.post(`/api/trainer/interview/${token}`, { data: {} })).status()).toBe(403)
      } finally { await Promise.all([ownerContext.close(), blockedContext.close()]) }
    } finally {
      await deleteAccount(admin.request, owner)
      await deleteAccount(admin.request, blocked)
      await admin.close()
    }
  })
})
