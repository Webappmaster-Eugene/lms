import { expect, test, type Browser, type Page } from '@playwright/test'

import { CONTENT, USERS, NOT_FOUND_HEADING } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

/**
 * Админка Payload: вход, создание и публикация урока, правка, снятие с
 * публикации — и как это видит студент на фронте. Созданное удаляется в конце.
 */
test.use({ storageState: storageStateOf('admin') })

async function asStudent<T>(browser: Browser, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ baseURL: APP_URL, storageState: storageStateOf('student') })
  try {
    return await fn(await context.newPage())
  } finally {
    await context.close()
  }
}

async function pickRelation(page: Page, field: string, text: string) {
  await page.locator(`#field-${field} .rs__control`).click()
  await page.keyboard.type(text)
  await page.locator('.rs__option', { hasText: text }).first().click()
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Save' }).first().click()
  await expect(page.getByText(/successfully|успешно/i).first()).toBeVisible()
}

test('вход в админку через форму и дашборд с группами коллекций', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: APP_URL, storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login/)
  await page.locator('#field-email').fill(USERS.admin.email)
  await page.locator('#field-password').fill(USERS.admin.password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  for (const group of ['Контент', 'Тренажёр', 'Пользователи']) {
    await expect(page.getByRole('button', { name: group }).first()).toBeVisible()
  }
  await context.close()
})

test('студент в админку не попадает', async ({ browser }) => {
  await asStudent(browser, async (page) => {
    await page.goto('/admin')
    await expect(page.getByRole('link', { name: 'Lessons' })).toHaveCount(0)
    await expect(page.getByText(/Unauthorized|not allowed|нет доступа/i).first()).toBeVisible()
  })
})

test('страницы ментора на платформе: чужих уводят настоящим редиректом, а не страницей с кодом 200', async ({ browser }) => {
  for (const { storageState, redirectPath } of [
    { storageState: { cookies: [], origins: [] }, redirectPath: '/login' },
    { storageState: storageStateOf('student'), redirectPath: '/' },
  ]) {
    const context = await browser.newContext({ baseURL: APP_URL, storageState })
    try {
      for (const path of ['/admin/questions', '/admin/import-yandex']) {
        const response = await context.request.get(path, { maxRedirects: 0 })
        expect(response.status(), path).toBe(307)
        expect(new URL(response.headers().location ?? '', APP_URL).pathname, path).toBe(redirectPath)
      }
    } finally {
      await context.close()
    }
  }
})

test.describe.serial('урок: создание → публикация → правка → снятие с публикации', () => {
  const title = `Урок из админки ${Date.now()}`
  let lessonId = ''
  let slug = ''

  test.afterAll(async ({ request }) => {
    if (lessonId) await request.delete(`/api/lessons/${lessonId}`)
  })

  test('админ создаёт опубликованный урок в курсе', async ({ page }) => {
    await page.goto('/admin/collections/lessons/create')
    await page.locator('#field-title').fill(title)
    slug = `admin-e2e-${Date.now()}`
    await page.locator('#field-slug').fill(slug)
    await pickRelation(page, 'course', CONTENT.course.title)
    await pickRelation(page, 'section', CONTENT.section.title)
    await page.locator('#field-order').fill('4')
    await page.locator('#field-isPublished').check()
    await save(page)
    await expect(page).toHaveURL(/\/admin\/collections\/lessons\/\d+/)
    lessonId = page.url().match(/lessons\/(\d+)/)![1]
  })

  test('студент видит урок в программе курса и открывает его', async ({ browser }) => {
    await asStudent(browser, async (page) => {
      await page.goto(`/courses/${CONTENT.course.slug}`)
      await page.getByRole('link', { name: new RegExp(title) }).first().click()
      await expect(page).toHaveURL(new RegExp(`/lessons/${slug}$`))
      await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
    })
  })

  test('правка названия в админке сразу видна на фронте, slug не меняется', async ({ page, browser }) => {
    await page.goto(`/admin/collections/lessons/${lessonId}`)
    await page.locator('#field-title').fill(`${title} (правка)`)
    await save(page)
    await expect(page.locator('#field-slug')).toHaveValue(slug)
    await asStudent(browser, async (student) => {
      await student.goto(`/lessons/${slug}`)
      await expect(student.getByRole('heading', { name: `${title} (правка)`, level: 1 })).toBeVisible()
    })
  })

  test('снятый с публикации урок пропадает у студента', async ({ page, browser }) => {
    await page.goto(`/admin/collections/lessons/${lessonId}`)
    await page.locator('#field-isPublished').uncheck()
    await save(page)
    await asStudent(browser, async (student) => {
      await student.goto(`/lessons/${slug}`)
      await expect(student.getByRole('heading', { name: NOT_FOUND_HEADING })).toBeVisible()
      await student.goto(`/courses/${CONTENT.course.slug}`)
      await expect(student.getByText(title)).toHaveCount(0)
    })
  })
})

test('урок без ручного slug сохраняется, slug генерируется из названия', async ({ page, request }) => {
  const stamp = Date.now()
  await page.goto('/admin/collections/lessons/create')
  await page.locator('#field-title').fill(`Автослаг Урок ${stamp}`)
  await pickRelation(page, 'course', CONTENT.course.title)
  await save(page)
  await expect(page).toHaveURL(/\/admin\/collections\/lessons\/\d+/)
  await expect(page.locator('#field-slug')).toHaveValue(`avtoslag-urok-${stamp}`)
  await request.delete(`/api/lessons/${page.url().match(/lessons\/(\d+)/)![1]}`)
})

test('контакты из «Настроек сайта» появляются на странице контактов', async ({ page, browser, request }) => {
  const channel = `https://t.me/e2e_changed_${Date.now()}`
  await page.goto('/admin/globals/site-settings')
  const input = page.locator('#field-contacts__telegramChannel')
  const previous = await input.inputValue()
  await input.fill(channel)
  await save(page)
  try {
    await asStudent(browser, async (student) => {
      await student.goto('/contacts')
      await expect(student.locator(`a[href="${channel}"]`).first()).toBeVisible()
    })
  } finally {
    await request.post('/api/globals/site-settings', { data: { contacts: { telegramChannel: previous } } })
  }
})
