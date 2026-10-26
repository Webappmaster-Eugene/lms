import { expect, test } from '@playwright/test'

import { adminContext, createAccount, deleteAccount, signedInContext, type Account } from '../fixtures/accounts'
import { CONTENT, NOT_FOUND_HEADING } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

/**
 * Завершение курса глазами ученика: уведомление «Курс завершён!» на /notifications,
 * сертификат в списке /certificates и его страница /certificates/[id], закрытая для других.
 * Состояние меняет временный ученик — сертификаты и уведомления уходят вместе с ним.
 */
test('пройденный курс: уведомление, сертификат в списке и на своей странице, чужим — 404', async ({ browser }) => {
  const admin = await adminContext(browser)
  const stranger = await browser.newContext({ baseURL: APP_URL, storageState: storageStateOf('student') })
  let account: Account | undefined
  try {
    account = await createAccount(admin.request, { firstName: 'Выпускник', lastName: 'Курса' })
    const learner = await signedInContext(browser, account, { permissions: ['clipboard-read', 'clipboard-write'] })
    try {
      const course = (await (await admin.request.get(`/api/courses?where[slug][equals]=${CONTENT.course.slug}&depth=0`)).json()).docs[0] as { id: number }
      const lessons = (await (await admin.request.get(`/api/lessons?where[course][equals]=${course.id}&where[isPublished][equals]=true&sort=order&depth=0&limit=100`)).json()).docs as { id: number; slug: string }[]
      const last = lessons.find((lesson) => lesson.slug === CONTENT.lessons[2].slug)
      expect(last).toBeDefined()
      for (const lesson of lessons.filter((item) => item !== last)) {
        expect((await learner.request.post('/api/user-progress', { data: { lesson: lesson.id, isCompleted: true } })).status()).toBe(201)
      }

      const page = await learner.newPage()
      await page.goto('/certificates')
      await expect(page.getByRole('heading', { name: 'Мои сертификаты', level: 1 })).toBeVisible()
      await expect(page.getByText('Завершите курс или роадмап, чтобы получить сертификат')).toBeVisible()

      await page.goto(`/lessons/${CONTENT.lessons[2].slug}`)
      await page.getByRole('button', { name: 'Отметить пройденным' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Курс пройден!' })).toBeVisible()

      await page.goto('/notifications')
      await expect(page.getByRole('heading', { name: 'Уведомления', level: 1 })).toBeVisible()
      const inbox = page.getByRole('list', { name: 'Уведомления' })
      const finished = inbox.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Курс завершён!' }) })
      await expect(finished).toContainText('Не прочитано')
      await page.getByRole('button', { name: 'Непрочитанные', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Непрочитанные', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(finished).toBeVisible()
      await finished.getByRole('link', { name: 'Открыть: Курс завершён!' }).click()

      await expect(page).toHaveURL(/\/certificates$/)
      const card = page.getByRole('link', { name: new RegExp(`${CONTENT.course.title}.*Курс`) })
      await expect(card).toContainText(account.name)
      await expect(card).toContainText(/MC-C-[0-9A-Z]+-[0-9A-F]{6}/)
      await card.click()
      await expect(page).toHaveURL(/\/certificates\/\d+$/)
      const certificateUrl = page.url()
      await expect(page.getByRole('heading', { name: account.name, level: 1 })).toBeVisible()
      await expect(page.getByText('успешно завершил(а) курс')).toBeVisible()
      await expect(page.getByText(`«${CONTENT.course.title}»`)).toBeVisible()
      await expect(page.getByText(/MC-C-[0-9A-Z]+-[0-9A-F]{6}/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Скачать PDF' })).toBeVisible()
      await page.getByRole('button', { name: 'Скопировать ссылку' }).click()
      await expect(page.getByRole('button', { name: 'Ссылка скопирована' })).toBeVisible()
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(certificateUrl)

      // Уведомление прочитано переходом, фильтр «Непрочитанные» его больше не показывает.
      await page.goto('/notifications')
      await expect(finished).toBeVisible()
      await expect(finished).not.toContainText('Не прочитано')
      await page.getByRole('button', { name: 'Непрочитанные', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Курс завершён!' })).toHaveCount(0)

      const other = await stranger.newPage()
      expect((await other.goto(certificateUrl))?.status()).toBe(404)
      await expect(other.getByRole('heading', { name: NOT_FOUND_HEADING })).toBeVisible()
      await expect(other.getByText(account.name)).toHaveCount(0)
      await other.goto('/certificates')
      await expect(other.getByText(account.name)).toHaveCount(0)
    } finally { await learner.close() }
  } finally {
    await deleteAccount(admin.request, account)
    await Promise.all([stranger.close(), admin.close()])
  }
})

test('уведомления: пустой список, отметка «Прочитано» и счётчик непрочитанных', async ({ browser }) => {
  const admin = await adminContext(browser)
  let account: Account | undefined
  try {
    account = await createAccount(admin.request)
    const learner = await signedInContext(browser, account)
    try {
      const page = await learner.newPage()
      await page.goto('/notifications')
      await expect(page.getByText('Уведомлений пока нет', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Непрочитанные', exact: true }).click()
      await expect(page.getByText('Все уведомления прочитаны', { exact: true })).toBeVisible()

      // Первый пройденный урок даёт достижение «Первый шаг» и уведомление о нём.
      const lesson = (await (await admin.request.get(`/api/lessons?where[slug][equals]=${CONTENT.lessons[0].slug}&depth=0`)).json()).docs[0] as { id: number }
      expect((await learner.request.post('/api/user-progress', { data: { lesson: lesson.id, isCompleted: true } })).status()).toBe(201)
      await page.getByRole('button', { name: 'Обновить', exact: true }).click()
      const item = page.getByRole('list', { name: 'Уведомления' }).getByRole('listitem').filter({ hasText: 'Первый шаг' })
      await expect(item).toContainText('Не прочитано')
      await expect(page.getByText('Непрочитанных: 1', { exact: true })).toBeVisible()
      await item.getByRole('button', { name: /^Прочитано/ }).click()
      await expect(page.getByText('Все уведомления прочитаны', { exact: true })).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: 'Все', exact: true }).click()
      await expect(item).toBeVisible()
      await expect(item).not.toContainText('Не прочитано')
      await expect(item.getByRole('button', { name: /^Прочитано/ })).toHaveCount(0)
      await expect(page.getByText('Непрочитанных: 0', { exact: true })).toBeVisible()
      await page.reload()
      await expect(item).toBeVisible()
      await expect(item).not.toContainText('Не прочитано')
      await expect(page.getByRole('link', { name: 'Настройки уведомлений', exact: true })).toHaveAttribute('href', '/settings/notifications')
    } finally { await learner.close() }
  } finally {
    await deleteAccount(admin.request, account)
    await admin.close()
  }
})
