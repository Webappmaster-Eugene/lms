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

test('гайд из .md-файла: шапка заполняет поля, текст уходит в Markdown, страница его верстает', async ({ page, request }) => {
  const stamp = Date.now()
  const slug = `admin-md-${stamp}`
  const file = `---\ntitle: Гайд из файла ${stamp}\nsummary: "Описание: из шапки"\nslug: ${slug}\n---\n\n## Раздел\n\n| Шаг | Итог |\n| --- | --- |\n| Загрузить | Готово |\n`
  await page.goto('/admin/collections/guides/create')
  await page.locator('input[type="file"][accept*=".md"]').setInputFiles({ name: 'guide.md', mimeType: 'text/markdown', buffer: Buffer.from(file) })
  await expect(page.getByText('«guide.md»: заполнены текст, название, описание, slug')).toBeVisible()
  await expect(page.locator('#field-title')).toHaveValue(`Гайд из файла ${stamp}`)
  await expect(page.locator('#field-summary')).toHaveValue('Описание: из шапки')
  await expect(page.locator('#field-markdown')).toHaveValue(/^## Раздел/)
  await save(page)
  await expect(page).toHaveURL(/\/admin\/collections\/guides\/\d+/)
  const id = page.url().match(/guides\/(\d+)/)![1]
  await page.goto(`/guides/${slug}`)
  await expect(page.getByRole('table')).toContainText('Готово')
  await request.delete(`/api/guides/${id}`)
})

test('гайд пишется в редакторе CMS: шаблон, панель форматирования, предпросмотр, версия после сохранения', async ({ page, request }) => {
  const stamp = Date.now()
  await page.goto('/admin/collections/guides/create')
  await page.locator('#field-title').fill(`Гайд из редактора ${stamp}`)
  await page.locator('#field-summary').fill('Написан прямо в CMS')
  const editor = page.locator('#field-markdown')
  await page.getByRole('button', { name: 'Вставить шаблон гайда' }).click()
  await expect(editor).toHaveValue(/^Вступление: для кого этот гайд/)

  // Панель меняет выделенную строку, Ctrl+Z отменяет правку панели.
  await editor.evaluate((element: HTMLTextAreaElement) => {
    const start = element.value.indexOf('Текст шага.')
    element.focus()
    element.setSelectionRange(start, start + 'Текст шага.'.length)
  })
  await page.getByRole('button', { name: 'Жирный' }).click()
  await expect(editor).toHaveValue(/\*\*Текст шага\.\*\*/)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor).not.toHaveValue(/\*\*Текст шага\.\*\*/)

  await page.getByRole('group', { name: 'Вид редактора' }).getByRole('button', { name: 'Рядом' }).click()
  const preview = page.getByLabel('Предпросмотр гайда')
  await expect(preview.getByRole('heading', { name: 'Что понадобится', level: 2 })).toBeVisible()
  await expect(preview.locator('.guide-prose__callout--warning')).toContainText('Внимание')
  await expect(page.getByText(/≈ \d+ мин чтения · разделов: 4/)).toBeVisible()

  await save(page)
  await expect(page).toHaveURL(/\/admin\/collections\/guides\/\d+/)
  const id = page.url().match(/guides\/(\d+)/)![1]
  const versions = await request.get(`/api/guides/versions?where[parent][equals]=${id}`)
  expect((await versions.json()).totalDocs).toBe(1)
  await request.delete(`/api/guides/${id}`)
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
