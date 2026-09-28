import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

import { MARK, stateOf } from './env'

/**
 * Ученик на проде: навигация, поиск, каталог, урок, заметки, видео,
 * прохождение урока, серия, календарь, курс. Новый ученик — без прогресса,
 * поэтому сценарии идут по порядку.
 */
test.use({ storageState: stateOf('student') })
test.describe.configure({ mode: 'serial' })

type Course = { title: string; href: string }
let course: Course
let firstLesson: string
let secondLesson: string | null = null

/** Первый курс каталога, в котором больше одного урока. */
async function pickCourse(page: Page): Promise<Course> {
  await page.goto('/courses')
  const cards = page.locator('a[href^="/courses/"]').filter({ has: page.locator('h3') })
  await expect(cards.first()).toBeVisible()
  for (const card of await cards.all()) {
    const lessons = Number((await card.innerText()).match(/(\d+)\s+урок/)?.[1] ?? 0)
    if (lessons > 1) {
      return { title: (await card.locator('h3').innerText()).trim(), href: (await card.getAttribute('href')) ?? '' }
    }
  }
  throw new Error('В каталоге прода нет курса больше чем с одним уроком')
}

test('меню: все разделы на месте, ментора нет', async ({ page }) => {
  await page.goto('/')
  const sidebar = page.locator('aside').last()
  for (const item of ['Дашборд', 'Курсы', 'Роадмапы', 'Тренажёр', 'Лидерборд', 'Сертификаты', 'Заметки', 'Вопросы', 'Сохранённое', 'Профиль', 'Помощь']) {
    await expect(sidebar.getByRole('link', { name: item, exact: true })).toBeVisible()
  }
  await expect(sidebar.getByRole('link', { name: 'Вопросы учеников' })).toHaveCount(0)
})

test('несуществующая страница — 404 со своим экраном', async ({ page }) => {
  const response = await page.goto('/net-takoy-stranicy-e2e')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('каталог: фильтры и поиск', async ({ page }) => {
  course = await pickCourse(page)
  await expect(page.getByRole('button', { name: /В процессе/ })).toBeVisible()
  await page.getByRole('searchbox', { name: /Найти курс/ }).fill('zzzz-нет-такого')
  await expect(page.getByText(/попробуйте сбросить фильтры/)).toBeVisible()
})

test('поиск в шапке: «/», курс в выдаче, Enter открывает; пустой результат назван', async ({ page }) => {
  await page.goto('/')
  await page.locator('body').press('/')
  const search = page.getByRole('combobox', { name: /Поиск/ }).first()
  await expect(search).toBeFocused()
  await page.keyboard.type(course.title.slice(0, 20))
  await expect(page.getByRole('option', { name: new RegExp(course.title.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first()).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/(courses|lessons|roadmaps|trainer)\//)

  await page.goto('/')
  await page.getByRole('combobox', { name: /Поиск/ }).first().fill('zzzqqq')
  await expect(page.getByText('По запросу «zzzqqq» ничего не нашлось')).toBeVisible()
})

test('роадмапы открываются', async ({ page }) => {
  await page.goto('/roadmaps')
  const first = page.locator('main a[href^="/roadmaps/"]').first()
  await expect(first).toBeVisible()
  await first.click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('курс: новичку предлагается начать, урок знает своё место в курсе', async ({ page }) => {
  await page.goto(course.href)
  await page.getByRole('link', { name: /Начать курс/ }).click()
  await expect(page).toHaveURL(/\/lessons\//)
  firstLesson = new URL(page.url()).pathname
  await expect(page.getByText(/Урок 1 из \d+/)).toBeVisible()
})

test('урок: стрелки листают соседние уроки', async ({ page }) => {
  await page.goto(firstLesson)
  await page.locator('h1').click()
  await page.keyboard.press('ArrowRight')
  await expect(page).not.toHaveURL(new RegExp(`${firstLesson}$`))
  secondLesson = new URL(page.url()).pathname
  await expect(page.getByText(/Урок 2 из \d+/)).toBeVisible()
  await page.locator('h1').click()
  await page.keyboard.press('ArrowLeft')
  await expect(page).toHaveURL(new RegExp(`${firstLesson}$`))
})

test('заметки: Ctrl+Enter, общая страница, выгрузка, удаление', async ({ page }) => {
  const text = `${MARK}: заметка к уроку [1:05]`
  await page.goto(firstLesson)
  await page.getByRole('button', { name: /Мои заметки/ }).click()
  const area = page.getByRole('textbox', { name: 'Заметка к уроку' })
  await area.fill(text)
  await expect(page.getByText('Не сохранено')).toBeVisible()
  await area.press('Control+Enter')
  await expect(page.getByText('Заметка сохранена')).toBeVisible()
  await expect(page.getByText('Не сохранено')).toHaveCount(0)

  await page.goto('/notes')
  const card = page.getByRole('listitem').filter({ hasText: `${MARK}: заметка к уроку` })
  await expect(card).toBeVisible()
  await expect(card.getByRole('link', { name: '1:05' })).toHaveAttribute('href', `${firstLesson}?t=65`)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Скачать все/ }).click()
  expect(await readFile(await (await download).path(), 'utf8')).toContain(text)

  await card.getByRole('link', { name: /./ }).filter({ hasNotText: '1:05' }).first().click()
  await expect(page).toHaveURL(new RegExp(`${firstLesson}$`))
  await page.getByRole('button', { name: /Мои заметки/ }).click()
  await page.getByRole('button', { name: 'Удалить' }).click()
  await expect(page.getByText('Заметка удалена')).toBeVisible()
})

test('видео: скорость запоминается, метка времени вставляется в заметку (если в уроке есть видео)', async ({ page }) => {
  let found = false
  for (const lesson of [firstLesson, secondLesson].filter(Boolean) as string[]) {
    await page.goto(lesson)
    if ((await page.locator('video').count()) === 0) continue
    found = true
    const speed = page.getByRole('group', { name: 'Скорость воспроизведения' }).first()
    await speed.getByRole('button', { name: '1,5×' }).click()
    await page.reload()
    await expect(page.getByRole('group', { name: 'Скорость воспроизведения' }).first().getByRole('button', { name: '1,5×' })).toHaveAttribute('aria-pressed', 'true')
    await speed.getByRole('button', { name: '1×' }).click()

    // Метка времени видео в заметке: вставка и кнопка перехода. Заметку не сохраняем.
    await page.getByRole('button', { name: /Мои заметки/ }).click()
    await page.getByRole('button', { name: /Вставить время видео/ }).click()
    const area = page.getByRole('textbox', { name: 'Заметка к уроку' })
    await expect(area).toHaveValue(/^\[\d+:\d{2}\] $/)
    const label = (await area.inputValue()).slice(1, -2)
    await page.getByRole('group', { name: 'Перейти к моменту видео' }).getByRole('button', { name: label }).click()
    await expect(page.locator('video').first()).toBeInViewport()
    break
  }
  test.skip(!found, 'в первых уроках курса нет видео с Яндекс.Диска')
})

test.describe('телефон', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('видео досмотрено: предложение над нижней навигацией, отметка и переход дальше', async ({ page }) => {
    await page.goto(firstLesson)
    await expect(page.getByRole('button', { name: 'Отметить пройденным' })).toBeVisible()
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('lms:video-ended')))
    const dialog = page.getByRole('dialog', { name: 'Видео досмотрено' })
    await expect(dialog).toBeInViewport()
    const box = await dialog.boundingBox()
    const nav = await page.locator('nav').filter({ hasText: 'Главная' }).boundingBox()
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(nav?.y ?? 0)

    await dialog.getByRole('button', { name: 'Отметить' }).click()
    await expect(page.getByRole('button', { name: 'Урок пройден' })).toBeVisible()
    await dialog.getByRole('link', { name: /Дальше:/ }).click()
    await expect(page).toHaveURL(new RegExp(`${secondLesson}$`))
  })
})

test('после урока: серия на дашборде, календарь в профиле, прогресс курса', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Сегодня урок уже пройден — серия 1 день подряд')).toBeVisible()
  await expect(page.getByText('Дней подряд', { exact: true }).locator('..')).toContainText('1')
  await expect(page.getByText('Продолжить с того места, где остановились')).toBeVisible()

  await page.goto('/profile')
  await expect(page.getByRole('img', { name: /Календарь занятий\. 1 активный день: 1 урок/ })).toBeVisible()
  await expect(page.getByText('Уроков пройдено', { exact: true }).locator('..')).toContainText('1')

  await page.goto(course.href)
  await expect(page.getByText(/^1\/\d+ \(\d+%\)$/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Продолжить с урока/ })).toBeVisible()
})

test('«Сохранить» урок, «Сохранённое», подсказка по «?»', async ({ page }) => {
  await page.goto(firstLesson)
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Сохранено' })).toHaveAttribute('aria-pressed', 'true')
  const title = (await page.locator('h1').innerText()).trim()

  await page.goto('/saved')
  await expect(page.getByRole('link', { name: title })).toHaveAttribute('href', firstLesson)
  await page.getByRole('button', { name: `Убрать «${title}» из сохранённого` }).click()
  await expect(page.getByText(/Здесь пока пусто/)).toBeVisible()

  await page.locator('body').press('?')
  await expect(page.getByRole('dialog', { name: 'Горячие клавиши' })).toBeVisible()
})

test('сертификаты и тренажёр открываются', async ({ page }) => {
  await page.goto('/certificates')
  await expect(page.getByRole('heading', { name: 'Мои сертификаты', level: 1 })).toBeVisible()

  await page.goto('/trainer/tasks')
  const task = page.locator('main a[href^="/trainer/"]').filter({ hasNot: page.locator('text=Все задачи') }).last()
  await expect(task).toBeVisible()
  await task.click()
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 30_000 })
  // Закладка на задачу — и сразу снять, чтобы не оставлять записей.
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Сохранено' })).toBeVisible()
  await page.getByRole('button', { name: 'Сохранено' }).click()
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Отправить/ }).first()).toBeVisible()
})
