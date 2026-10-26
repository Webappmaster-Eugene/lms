import { expect, test } from '@playwright/test'

import { adminContext, createAccount, deleteAccount, signedInContext, unsubscribeLinkOf, type Account } from '../fixtures/accounts'
import { NOT_FOUND_HEADING, USERS } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

/**
 * Email-рассылки ученикам (/manage/broadcasts): список, черновик, предпросмотр письма, правка,
 * удаление и отписка по ссылке из письма. SMTP в e2e выключен: письма не уходят, и интерфейс
 * обязан честно сказать, что запуск и тестовая отправка недоступны.
 */
test.describe('администратор', () => {
  test.use({ storageState: storageStateOf('admin') })

  test('черновик: выбор получателя, предпросмотр письма, правка, отписка ученика и удаление', async ({ page, browser }) => {
    const admin = await adminContext(browser)
    let account: Account | undefined
    let broadcastId: number | undefined
    const subject = `Новый курс по Node.js ${Date.now()}`
    try {
      account = await createAccount(admin.request, { firstName: 'Рассылка', lastName: 'Получатель' })

      await page.goto('/manage')
      await page.getByRole('link', { name: 'Email-рассылки', exact: true }).click()
      await expect(page).toHaveURL(/\/manage\/broadcasts$/)
      await expect(page.getByRole('heading', { name: 'Email-рассылки', level: 1 })).toBeVisible()
      await expect(page.getByRole('status').filter({ hasText: 'Исходящая почта на сервере не настроена' })).toBeVisible()

      await page.getByRole('link', { name: 'Новая рассылка', exact: true }).click()
      await expect(page).toHaveURL(/\/manage\/broadcasts\/new$/)
      await expect(page.getByRole('heading', { name: 'Новая рассылка', level: 1 })).toBeVisible()
      const everyone = page.getByRole('radio', { name: /Все активные ученики/ })
      await expect(everyone).toBeChecked()
      await expect(page.getByText(/Сейчас получат: \d+/)).toBeVisible()
      await expect(page.getByText('Изменений нет', { exact: true })).toBeVisible()

      await page.getByRole('textbox', { name: 'Тема письма' }).fill(subject)
      await page.getByRole('textbox', { name: 'Текст письма' }).fill('Курс уже открыт.\n\n**Первый модуль** — бесплатно.')
      await page.getByRole('textbox', { name: /Кнопка в письме/ }).fill('Открыть курсы')
      await page.getByRole('textbox', { name: 'Ссылка кнопки' }).fill('/courses')
      await expect(page.getByText('Есть несохранённые изменения', { exact: true })).toBeVisible()

      // Выбранная аудитория без учеников не сохраняется.
      await page.getByRole('radio', { name: /Выбранные ученики/ }).check()
      await page.getByRole('button', { name: 'Создать черновик', exact: true }).click()
      await expect(page.getByRole('main').getByRole('alert')).toHaveText('Выберите хотя бы одного ученика')

      await page.getByRole('searchbox', { name: 'Найти ученика' }).fill(account.email)
      const title = `${account.name} (${account.email})`
      await page.getByRole('button', { name: `Добавить: ${title}`, exact: true }).click()
      await expect(page.getByRole('list', { name: 'Выбранные ученики' })).toContainText(title)
      await expect(page.getByRole('button', { name: `Выбран: ${title}`, exact: true })).toBeDisabled()
      await expect(page.getByText('Выбрано: 1', { exact: true })).toBeVisible()

      const created = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/manage/broadcasts' && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'Создать черновик', exact: true }).click()
      const response = await created
      expect(response.status()).toBe(201)
      broadcastId = (await response.json()).doc.id as number

      await expect(page).toHaveURL(new RegExp(`/manage/broadcasts/${broadcastId}$`))
      await expect(page.getByRole('heading', { name: subject, level: 1 })).toBeVisible()
      await expect(page.locator('header').getByText('Черновик', { exact: true })).toBeVisible()
      const summary = page.getByRole('region', { name: 'Сводка' })
      await expect(summary.getByText('Выбранные ученики: 1', { exact: true })).toBeVisible()
      const recipients = summary.locator('div').filter({ has: page.getByText('Получат сейчас', { exact: true }) }).locator('dd')
      await expect(recipients).toHaveText('1')
      // Без почтового сервера запуск и тест закрыты, редактирование и удаление — нет.
      await expect(page.getByRole('status').filter({ hasText: 'Запуск и тестовая отправка станут доступны после настройки SMTP' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Запустить рассылку' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Отправить тест себе' })).toBeDisabled()

      // Предпросмотр — то самое письмо: приветствие по имени, разметка, кнопка и ссылка отписки.
      await expect(page.getByText(`Тема: ${subject}`)).toBeVisible()
      const letter = page.frameLocator('iframe[title="Предпросмотр письма рассылки"]')
      await expect(letter.getByText(`Привет, ${USERS.admin.firstName}!`)).toBeVisible()
      await expect(letter.locator('strong', { hasText: 'Первый модуль' })).toBeVisible()
      await expect(letter.getByRole('link', { name: 'Открыть курсы' })).toHaveAttribute('href', `${APP_URL}/courses`)
      const adminId = (await (await admin.request.get('/api/users/me')).json()).user.id as number
      await expect(letter.getByRole('link', { name: 'Отписаться от рассылок' })).toHaveAttribute('href', `${APP_URL}${unsubscribeLinkOf(adminId)}`)

      await page.getByRole('link', { name: 'Редактировать', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/manage/broadcasts/${broadcastId}/edit$`))
      await expect(page.getByRole('heading', { name: 'Редактирование рассылки', level: 1 })).toBeVisible()
      await expect(page.getByRole('textbox', { name: 'Тема письма' })).toHaveValue(subject)
      await expect(page.getByRole('radio', { name: /Выбранные ученики/ })).toBeChecked()
      await expect(page.getByRole('list', { name: 'Выбранные ученики' })).toContainText(title)
      await page.getByRole('textbox', { name: 'Тема письма' }).fill(`${subject} (правка)`)
      const updated = page.waitForResponse((response) => response.url().endsWith(`/api/manage/broadcasts/${broadcastId}`) && response.request().method() === 'PATCH')
      await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click()
      expect((await updated).status()).toBe(200)
      await expect(page).toHaveURL(new RegExp(`/manage/broadcasts/${broadcastId}$`))
      await expect(page.getByRole('heading', { name: `${subject} (правка)`, level: 1 })).toBeVisible()

      // Ученик открывает ссылку из письма на телефоне, где он не входил в платформу.
      const phone = await browser.newContext({ baseURL: APP_URL, storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } })
      try {
        const mail = await phone.newPage()
        await mail.goto(unsubscribeLinkOf(account.id))
        await expect(mail.getByRole('heading', { name: 'Отписаться от рассылок?', level: 1 })).toBeVisible()
        await mail.getByRole('button', { name: 'Отписаться от рассылок', exact: true }).click()
        await expect(mail.getByRole('heading', { name: 'Вы отписались от рассылок', level: 1 })).toBeVisible()
        await expect(mail.getByRole('button', { name: 'Вернуть подписку', exact: true })).toBeVisible()
      } finally { await phone.close() }

      await page.reload()
      await expect(recipients).toHaveText('0 · исключено 1')
      await expect(page.getByText('Сейчас некому отправить: выберите учеников с действующим адресом.')).toBeVisible()

      await page.getByRole('link', { name: 'Email-рассылки', exact: true }).click()
      const row = page.getByRole('link', { name: new RegExp(`${subject} \\(правка\\)`) })
      await expect(row).toContainText('Выбранные ученики: 1')
      await expect(row).toContainText('Черновик')
      await row.click()
      // Без ожидания под нагрузкой клик «Удалить» успевал до конца перехода, и confirm терялся.
      await expect(page).toHaveURL(new RegExp(`/manage/broadcasts/${broadcastId}$`))
      await expect(page.getByRole('heading', { name: `${subject} (правка)`, level: 1 })).toBeVisible()
      page.once('dialog', (dialog) => dialog.dismiss())
      await page.getByRole('button', { name: 'Удалить', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/manage/broadcasts/${broadcastId}$`))
      page.once('dialog', (dialog) => dialog.accept())
      await page.getByRole('button', { name: 'Удалить', exact: true }).click()
      await expect(page).toHaveURL(/\/manage\/broadcasts$/)
      await expect(page.getByText(subject)).toHaveCount(0)
      await page.goto(`/manage/broadcasts/${broadcastId}`)
      await expect(page.getByRole('heading', { name: NOT_FOUND_HEADING })).toBeVisible()
      broadcastId = undefined
    } finally {
      if (broadcastId) await admin.request.delete(`/api/manage/broadcasts/${broadcastId}`)
      await deleteAccount(admin.request, account)
      await admin.close()
    }
  })

  test('ссылка отписки вне платформы: неверный токен и удалённый аккаунт не меняют ничего', async ({ page, browser }) => {
    const admin = await adminContext(browser)
    let account: Account | undefined = await createAccount(admin.request)
    const link = unsubscribeLinkOf(account.id)
    try {
      await deleteAccount(admin.request, account)
      account = undefined
      for (const path of ['/unsubscribe?token=garbage', '/unsubscribe', link]) {
        expect((await page.goto(path))?.status(), path).toBe(200)
        await expect(page.getByRole('heading', { name: 'Ссылка недействительна', level: 1 })).toBeVisible()
        await expect(page.getByRole('button', { name: /Отписаться|Вернуть/ })).toHaveCount(0)
        await expect(page.getByRole('link', { name: 'Настройки уведомлений', exact: true })).toHaveAttribute('href', '/settings/notifications')
      }
    } finally {
      await deleteAccount(admin.request, account)
      await admin.close()
    }
  })
})

test('ученик отписывается по ссылке, видит выбор в настройках уведомлений и возвращает подписку', async ({ browser }) => {
  const admin = await adminContext(browser)
  let account: Account | undefined
  try {
    account = await createAccount(admin.request)
    const learner = await signedInContext(browser, account)
    try {
      const page = await learner.newPage()
      await page.goto('/settings/notifications')
      const letters = page.getByRole('checkbox', { name: /Письма-рассылки/ })
      await expect(letters).toBeChecked()

      // Ссылка из письма работает и в браузере, где ученик вошёл: отписка видна в настройках.
      await page.goto(unsubscribeLinkOf(account.id))
      await page.getByRole('button', { name: 'Отписаться от рассылок', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Вы отписались от рассылок', level: 1 })).toBeVisible()
      await page.getByRole('link', { name: 'Открыть платформу', exact: true }).click()
      await expect(page.getByRole('heading', { name: `Привет, ${account.firstName}!` })).toBeVisible()
      await page.goto('/settings/notifications')
      await expect(letters).not.toBeChecked()

      await letters.check()
      const saved = page.waitForResponse((response) => response.url().endsWith('/api/push/settings') && response.request().method() === 'PATCH')
      await page.getByRole('button', { name: 'Сохранить настройки', exact: true }).click()
      expect((await saved).status()).toBe(200)
      await expect(page.getByRole('status').filter({ hasText: 'Настройки сохранены.' })).toBeVisible()
      await page.goto(unsubscribeLinkOf(account.id))
      await expect(page.getByRole('heading', { name: 'Отписаться от рассылок?', level: 1 })).toBeVisible()

      // Вернуть подписку можно и со страницы отписки.
      await page.getByRole('button', { name: 'Отписаться от рассылок', exact: true }).click()
      await page.getByRole('button', { name: 'Вернуть подписку', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Подписка возвращена', level: 1 })).toBeVisible()
      await page.goto('/settings/notifications')
      await expect(letters).toBeChecked()
    } finally { await learner.close() }
  } finally {
    await deleteAccount(admin.request, account)
    await admin.close()
  }
})

test.describe('доступ к рассылкам', () => {
  const pages = ['/manage/broadcasts', '/manage/broadcasts/new', '/manage/broadcasts/1', '/manage/broadcasts/1/edit']

  test('гость уходит на вход с возвратом', async ({ browser }) => {
    const guest = await browser.newContext({ baseURL: APP_URL, storageState: { cookies: [], origins: [] } })
    try {
      const page = await guest.newPage()
      for (const path of pages) {
        await page.goto(path)
        await expect(page, path).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === path)
      }
    } finally { await guest.close() }
  })

  test.describe('ученик', () => {
    test.use({ storageState: storageStateOf('student') })

    test('получает 404 без названий рассылок и не может создать её через API', async ({ page }) => {
      for (const path of pages) {
        expect((await page.goto(path))?.status(), path).toBe(404)
        await expect(page.getByRole('heading', { name: NOT_FOUND_HEADING })).toBeVisible()
        await expect(page.getByRole('heading', { name: /Email-рассылки|Новая рассылка|Редактирование рассылки/ })).toHaveCount(0)
      }
      const denied = await page.request.post('/api/manage/broadcasts', { data: { subject: 'Взлом', body: 'Текст', audience: 'all', recipients: [] } })
      expect(denied.status()).toBe(403)
    })
  })
})
