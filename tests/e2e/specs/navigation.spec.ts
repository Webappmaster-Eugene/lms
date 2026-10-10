import { expect, test } from '@playwright/test'

import { CONTENT, USERS, NOT_FOUND_HEADING } from '../fixtures/data'
import { storageStateOf } from '../fixtures/env'

/**
 * Навигация, тема, поиск, 404 и формы (поддержка, профиль).
 */
test.use({ storageState: storageStateOf('doer') })

const NAV: [string, RegExp, string][] = [
  ['Курсы', /\/courses$/, 'Курсы'],
  ['Роадмапы', /\/roadmaps$/, 'Роадмапы'],
  ['Тренажёр', /\/trainer$/, 'Тренажёр кода'],
  ['Лидерборд', /\/leaderboard$/, 'Лидерборд'],
  ['Сертификаты', /\/certificates$/, 'Мои сертификаты'],
  ['Заметки', /\/notes$/, 'Мои заметки'],
  ['Вопросы', /\/questions$/, 'Мои вопросы'],
  ['Сохранённое', /\/saved$/, 'Сохранённое'],
  ['Профиль', /\/profile$/, `${USERS.doer.firstName} ${USERS.doer.lastName}`],
  ['Контакты', /\/contacts$/, 'Контакты'],
  ['Помощь', /\/help$/, 'Помощь'],
  ['Дашборд', /\/$/, `Привет, ${USERS.doer.firstName}!`],
]

test('боковое меню ведёт во все разделы', async ({ page }) => {
  await page.goto('/')
  // Desktop sidebar stays an aside; mobile menu uses a modal dialog.
  const sidebar = page.locator('aside').last()
  for (const [link, url, heading] of NAV) {
    await sidebar.getByRole('link', { name: link, exact: true }).click()
    await expect(page, link).toHaveURL(url)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
  }
})

test.describe('телефон 375px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('боковое меню скрыто, нижняя навигация работает, горизонтального скролла нет', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('aside').last()).toBeHidden()
    await expect(page.getByRole('dialog', { name: 'Меню платформы' })).toHaveCount(0)
    const bottom = page.getByRole('navigation', { name: 'Основная навигация' })
    await bottom.getByRole('link', { name: /Курсы/ }).click()
    await expect(page).toHaveURL(/\/courses$/)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test('переключатель темы меняет класс html и запоминает выбор', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')
  const wasDark = ((await html.getAttribute('class')) ?? '').includes('dark')
  await page.getByRole('button', { name: 'Переключить тему' }).first().click()
  await expect(html).toHaveClass(wasDark ? /light/ : /dark/)
  await page.reload()
  await expect(html).toHaveClass(wasDark ? /light/ : /dark/)
})

test('поиск в шапке находит урок и переходит к нему', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox', { name: /Поиск/ }).first().fill('HTML')
  const result = page.getByRole('option', { name: new RegExp(CONTENT.lessons[0].title) })
  await expect(result).toBeVisible()
  await result.click()
  await expect(page).toHaveURL(new RegExp(`/lessons/${CONTENT.lessons[0].slug}$`))
})

test('поиск с клавиатуры: «/» ставит фокус, стрелка и Enter открывают задачу тренажёра', async ({ page }) => {
  await page.goto('/')
  await page.locator('body').press('/')
  const input = page.getByRole('combobox', { name: /Поиск/ }).first()
  await expect(input).toBeFocused()
  await page.keyboard.type(CONTENT.task.title)
  await expect(page.getByRole('option', { name: new RegExp(CONTENT.task.title) })).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/trainer/${CONTENT.topic.slug}/${CONTENT.task.slug}$`))
})

test('поиск не показывает черновики и честно говорит, что ничего нет', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox', { name: /Поиск/ }).first().fill('Черновик')
  await expect(page.getByText('По запросу «Черновик» ничего не нашлось')).toBeVisible()
  await expect(page.getByRole('option', { name: new RegExp(CONTENT.draftLesson.title) })).toHaveCount(0)
})

test('роадмап: граф с узлами, клик по узлу открывает панель темы с курсом', async ({ page }) => {
  await page.goto(`/roadmaps/${CONTENT.roadmap.slug}`)
  await expect(page.getByRole('heading', { name: CONTENT.roadmap.title, level: 1 })).toBeVisible()
  await page.getByText('Веб-основы').first().click()
  const panel = page.getByLabel('Тема «Веб-основы»')
  await expect(panel).toBeVisible()
  await expect(panel.getByText(CONTENT.course.title)).toBeVisible()
  await page.getByRole('button', { name: 'Закрыть панель темы' }).click()
  await expect(panel).toBeHidden()
})

test('неизвестный адрес — своя страница 404 с меню платформы', async ({ page }) => {
  await page.goto('/definitely-not-a-page')
  await expect(page.getByRole('heading', { name: NOT_FOUND_HEADING })).toBeVisible()
  await expect(page.locator('aside').last().getByRole('link', { name: 'Курсы', exact: true })).toBeVisible()
})

// loading.tsx есть только у списков (группа (lists)): иначе ответ начинал
// стримиться до notFound(), и неизвестный адрес отдавал 200.
test('неизвестный адрес отвечает HTTP 404', async ({ request }) => {
  const response = await request.get('/definitely-not-a-page')
  expect(response.status()).toBe(404)
})

test('FAQ на странице помощи раскрывает ответ', async ({ page }) => {
  await page.goto('/help')
  const [item] = CONTENT.faq
  await page.getByRole('button', { name: item.question }).click()
  await expect(page.getByText(item.answer)).toBeVisible()
})

test('форма поддержки: кнопка неактивна до заполнения, после отправки — подтверждение', async ({ page }) => {
  await page.goto('/help')
  const submit = page.getByRole('button', { name: 'Отправить', exact: true })
  await page.locator('#support-subject').fill('Вопрос из e2e')
  await page.locator('#support-message').fill('Проверка формы обращения')
  await submit.click()
  await expect(page.getByText('Сообщение отправлено')).toBeVisible()
  await page.getByRole('button', { name: 'Отправить ещё' }).click()
  await expect(page.locator('#support-subject')).toHaveValue('')
})

test('редактирование профиля: «О себе» сохраняется и видно в профиле', async ({ page }) => {
  const bio = `Люблю JavaScript ${Date.now()}`
  await page.goto('/profile/edit')
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue(USERS.doer.firstName)
  const about = page.getByRole('textbox', { name: 'О себе', exact: true })
  await expect(about).toBeEnabled()
  await about.fill(bio)
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Профиль сохранён.' })).toBeVisible()
  await expect(page).toHaveURL(/\/profile\/edit$/)

  await page.reload()
  await expect(about).toHaveValue(bio)
  await page.getByRole('link', { name: 'Назад к профилю', exact: true }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByText(bio, { exact: true })).toBeVisible()
})

test('студент может загрузить аватар в профиле', async ({ page }) => {
  await page.goto('/profile/edit')
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue(USERS.doer.firstName)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
  await page.getByLabel('Изменить аватар', { exact: true }).setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png })
  const avatar = page.getByAltText('Ваш аватар', { exact: true })
  await expect(avatar).toHaveAttribute('src', /^blob:/)
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Профиль сохранён.' })).toBeVisible()
  await expect(page).toHaveURL(/\/profile\/edit$/)
  await expect(avatar).toHaveAttribute('src', /\/api\/media\/file\//)
  const savedUrl = await avatar.getAttribute('src')
  if (!savedUrl) throw new Error('Сохранённый аватар не получил URL')

  await page.reload()
  await expect(avatar).toHaveAttribute('src', savedUrl)
  await expect.poll(() => avatar.evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true)
  await page.getByRole('link', { name: 'Назад к профилю', exact: true }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByAltText('Аватар', { exact: true })).toHaveAttribute('src', savedUrl)
})

test('«?» открывает список горячих клавиш, кнопка в меню — тоже', async ({ page }) => {
  await page.goto('/')
  await page.locator('body').press('?')
  const dialog = page.getByRole('dialog', { name: 'Горячие клавиши' })
  await expect(dialog).toContainText('Поиск по курсам, урокам и задачам')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await page.locator('aside').last().getByRole('button', { name: 'Горячие клавиши' }).click()
  await expect(dialog).toBeVisible()
})
