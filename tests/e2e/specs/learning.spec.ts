import { expect, test } from '@playwright/test'

import { CONTENT, USERS, NOT_FOUND_HEADING } from '../fixtures/data'
import { storageStateOf } from '../fixtures/env'

/**
 * Путь студента по курсу: дашборд → курс → урок → «Отметить пройденным» →
 * баллы в профиле и рейтинге, заметки и вопросы к уроку. Состояние меняет
 * отдельный студент «doer», чтобы скриншоты основного студента не плыли.
 */
test.use({ storageState: storageStateOf('doer') })

const [first, second, third] = CONTENT.lessons

test('дашборд приветствует по имени и ведёт к курсам', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: `Привет, ${USERS.doer.firstName}!` })).toBeVisible()
  await page.goto('/courses')
  await expect(page.getByRole('heading', { name: 'Курсы' })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(CONTENT.course.title) }).first().click()
  await expect(page).toHaveURL(new RegExp(`/courses/${CONTENT.course.slug}$`))
  await expect(page.getByRole('heading', { name: CONTENT.course.title, level: 1 })).toBeVisible()
  for (const lesson of CONTENT.lessons) await expect(page.getByText(lesson.title).first()).toBeVisible()
  // Черновик в программе курса не показывается.
  await expect(page.getByText(CONTENT.draftLesson.title)).toHaveCount(0)
})

test('урок: контент, навигация вперёд и назад по курсу', async ({ page }) => {
  await page.goto(`/lessons/${first.slug}`)
  await expect(page.getByRole('heading', { name: first.title, level: 1 })).toBeVisible()
  await expect(page.getByText(`${first.title}: ключевые понятия урока.`)).toBeVisible()
  await page.getByRole('link', { name: new RegExp(second.title) }).last().click()
  await expect(page).toHaveURL(new RegExp(`/lessons/${second.slug}$`))
  await page.getByRole('link', { name: new RegExp(first.title) }).last().click()
  await expect(page).toHaveURL(new RegExp(`/lessons/${first.slug}$`))
})

test('черновик и несуществующий урок — страница 404', async ({ page }) => {
  for (const slug of [CONTENT.draftLesson.slug, 'no-such-lesson']) {
    await page.goto(`/lessons/${slug}`)
    await expect(page.getByRole('heading', { name: NOT_FOUND_HEADING })).toBeVisible()
  }
})

test('«Отметить пройденным» начисляет баллы: кнопка, прогресс курса, профиль, рейтинг', async ({ page }) => {
  await page.goto(`/lessons/${third.slug}`)
  const button = page.getByRole('button', { name: 'Отметить пройденным' })
  await expect(button).toBeVisible()
  await button.click()
  await expect(page.getByRole('button', { name: 'Урок пройден' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Урок пройден' })).toBeVisible()
  await expect(page.getByText(/1\s*\/\s*3/).first()).toBeVisible()

  // 10 за урок + 5 за достижение «Первый шаг».
  await page.goto('/profile')
  await expect(page.getByText('Баллов', { exact: true }).locator('..')).toContainText('15')
  await expect(page.getByText('Уроков пройдено', { exact: true }).locator('..')).toContainText('1')
  await expect(page.getByText('Пройдите первый урок')).toBeVisible()
  await expect(page.getByText('Урок пройден', { exact: true })).toBeVisible()

  // В рейтинге doer поднялся выше студента без баллов и помечен «(вы)».
  await page.goto('/leaderboard')
  const main = page.locator('main')
  await expect(main).toContainText(`${USERS.doer.firstName} ${USERS.doer.lastName}(вы)`)
  const text = await main.innerText()
  expect(text.indexOf(USERS.leader.lastName)).toBeLessThan(text.indexOf(USERS.doer.lastName))
  expect(text.indexOf(USERS.doer.lastName)).toBeLessThan(text.indexOf(USERS.student.lastName))

  await page.goto('/')
  await expect(page.getByText('Дней подряд', { exact: true }).locator('..')).toContainText('1')
})

test('заметка к уроку сохраняется и переживает перезагрузку', async ({ page }) => {
  const text = `Заметка e2e ${Date.now()}`
  await page.goto(`/lessons/${second.slug}`)
  await page.getByRole('button', { name: 'Мои заметки' }).click()
  const area = page.getByPlaceholder('Запишите ключевые моменты урока...')
  await area.fill(text)
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('Заметка сохранена')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Мои заметки' }).click()
  await expect(page.getByPlaceholder('Запишите ключевые моменты урока...')).toHaveValue(text)

  await page.getByRole('button', { name: 'Удалить' }).click()
  await expect(page.getByText('Заметка удалена')).toBeVisible()
})

test('вопрос к уроку появляется в обсуждении', async ({ page }) => {
  const text = `Вопрос e2e ${Date.now()}`
  await page.goto(`/lessons/${second.slug}`)
  await page.getByPlaceholder('Задайте вопрос или оставьте комментарий...').fill(text)
  await page.getByPlaceholder('Задайте вопрос или оставьте комментарий...').press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Комментарий добавлен')).toBeVisible()
  await expect(page.getByText(text)).toBeVisible()
})
