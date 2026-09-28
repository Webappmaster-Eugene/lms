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
  ['Профиль', /\/profile$/, `${USERS.doer.firstName} ${USERS.doer.lastName}`],
  ['Контакты', /\/contacts$/, 'Контакты'],
  ['Помощь', /\/help$/, 'Помощь'],
  ['Дашборд', /\/$/, `Привет, ${USERS.doer.firstName}!`],
]

test('боковое меню ведёт во все разделы', async ({ page }) => {
  await page.goto('/')
  // Первый <aside> — выезжающее мобильное меню, второй — постоянное десктопное.
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
    await expect(page.locator('aside').first()).not.toBeInViewport()
    const bottom = page.locator('nav').filter({ has: page.getByRole('link', { name: /Курсы/ }) }).last()
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
  await page.getByPlaceholder('Поиск курсов и уроков...').first().fill('HTML')
  const result = page.getByRole('button', { name: new RegExp(CONTENT.lessons[0].title) })
  await expect(result).toBeVisible()
  await result.click()
  await expect(page).toHaveURL(new RegExp(`/lessons/${CONTENT.lessons[0].slug}$`))
})

test('поиск не показывает черновики', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('Поиск курсов и уроков...').first().fill('Черновик')
  await page.waitForTimeout(800)
  await expect(page.getByRole('button', { name: new RegExp(CONTENT.draftLesson.title) })).toHaveCount(0)
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

// Регрессия e5b1744: catch-all [...rest] + loading.tsx — ответ начинает стримиться
// до notFound(), и неизвестный адрес отдаёт 200 вместо 404 (до коммита было 404).
test.fail('БАГ: неизвестный адрес отвечает HTTP 404', async ({ request }) => {
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
  // Форма подгружает текущий профиль уже после рендера — ждём, иначе он затрёт ввод.
  const loaded = page.waitForResponse((r) => r.url().endsWith('/api/users/me'))
  await page.goto('/profile/edit')
  await loaded
  await page.locator('#bio').fill(bio)
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('Профиль обновлён. Перенаправление...')).toBeVisible()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByText(bio)).toBeVisible()
})

test('студент может загрузить аватар в профиле', async ({ page }) => {
  const loaded = page.waitForResponse((r) => r.url().endsWith('/api/users/me'))
  await page.goto('/profile/edit')
  await loaded
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
  await page.locator('input[type="file"]').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('Профиль обновлён. Перенаправление...')).toBeVisible({ timeout: 5000 })
})
