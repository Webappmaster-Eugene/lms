import { expect, test } from '@playwright/test'

import { CONTENT, USERS, NOT_FOUND_HEADING } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

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
  await expect(page.getByRole('img', { name: /Календарь занятий\. 1 активный день: 1 урок/ })).toBeVisible()
  await expect(page.getByText('Урок пройден', { exact: true })).toBeVisible()

  // Остались первые два урока: 15 + 20 минут по оценке из сида.
  await page.goto(`/courses/${CONTENT.course.slug}`)
  await expect(page.getByText('Осталось ~35 мин')).toBeVisible()

  // В рейтинге doer поднялся выше студента без баллов и помечен «(вы)».
  await page.goto('/leaderboard')
  const main = page.locator('main')
  await expect(main).toContainText(`${USERS.doer.firstName} ${USERS.doer.lastName}(вы)`)
  const text = await main.innerText()
  expect(text.indexOf(USERS.leader.lastName)).toBeLessThan(text.indexOf(USERS.doer.lastName))
  expect(text.indexOf(USERS.doer.lastName)).toBeLessThan(text.indexOf(USERS.student.lastName))

  await page.goto('/')
  await expect(page.getByText('Дней подряд', { exact: true }).locator('..')).toContainText('1')
  await expect(page.getByText('Сегодня урок уже пройден — серия 1 день подряд')).toBeVisible()
})

test('заметка к уроку сохраняется, переживает перезагрузку и видна среди всех заметок', async ({ page }) => {
  const base = `Заметка e2e ${Date.now()}`
  const text = `${base} [1:05]`
  await page.goto(`/lessons/${second.slug}`)
  await page.getByRole('button', { name: 'Мои заметки' }).click()
  const area = page.getByPlaceholder('Запишите ключевые моменты урока...')
  await area.fill(text)
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('Заметка сохранена')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Мои заметки' }).click()
  await expect(page.getByPlaceholder('Запишите ключевые моменты урока...')).toHaveValue(text)

  // Та же заметка — на общей странице, со ссылкой обратно на урок.
  await page.goto('/notes')
  // На странице заметок метка становится ссылкой «1:05» — без скобок.
  const card = page.getByRole('listitem').filter({ hasText: base })
  await expect(card.getByRole('link', { name: '1:05' })).toHaveAttribute('href', `/lessons/${second.slug}?t=65`)
  await expect(card.getByRole('link', { name: second.title })).toHaveAttribute('href', `/lessons/${second.slug}`)
  await card.getByRole('link', { name: second.title }).click()
  await expect(page).toHaveURL(`/lessons/${second.slug}`)

  await page.getByRole('button', { name: 'Мои заметки' }).click()
  await page.getByRole('button', { name: 'Удалить' }).click()
  await expect(page.getByText('Заметка удалена')).toBeVisible()
})

test('вопрос к уроку: ментор отвечает, ученик видит ответ и уведомление', async ({ page, browser }) => {
  const text = `Вопрос e2e ${Date.now()}`
  await page.goto(`/lessons/${second.slug}`)
  await page.getByRole('textbox', { name: 'Вопрос к уроку' }).fill(text)
  await page.getByRole('button', { name: 'Отправить вопрос' }).click()
  await expect(page.getByText('Вопрос отправлен ментору')).toBeVisible()
  const thread = page.getByRole('listitem').filter({ hasText: text })
  await expect(thread.getByText('Ждёт ответа')).toBeVisible()
  const questionId = (await thread.getAttribute('id'))?.replace('comment-', '')

  // Ментор отвечает со своей страницы вопросов.
  const mentor = await browser.newContext({ baseURL: APP_URL, storageState: storageStateOf('admin') })
  const mentorPage = await mentor.newPage()
  await mentorPage.goto('/admin/questions')
  const card = mentorPage.locator(`#comment-${questionId}`)
  await card.getByRole('textbox', { name: /Ответ ученику/ }).fill('Ответ ментора e2e')
  await card.getByRole('button', { name: 'Ответить' }).click()
  await expect(mentorPage.getByText('Ответ отправлен — ученик получит уведомление')).toBeVisible()
  await mentorPage.getByRole('button', { name: /Есть ответ/ }).click()
  await expect(mentorPage.locator(`#comment-${questionId}`)).toContainText('Ответ ментора e2e')
  await mentor.close()

  // Дашборд зовёт прочитать ответ; просмотр ветки убирает карточку.
  await page.goto('/')
  const answers = page.getByRole('region', { name: /Ментор ответил/ })
  await expect(answers).toContainText('Ответ ментора e2e')
  await answers.getByRole('link', { name: /Ответ на ваш вопрос/ }).click()
  await expect(page).toHaveURL(new RegExp(`/lessons/${second.slug}#comment-${questionId}$`))
  await expect(thread.getByText('Ответ ментора e2e')).toBeVisible()
  await expect(async () => {
    await page.goto('/')
    await expect(page.getByRole('region', { name: /Ментор ответил/ })).toHaveCount(0)
  }).toPass({ timeout: 15_000 })

  await page.goto(`/lessons/${second.slug}`)
  await expect(thread.getByText('Ответ ментора e2e')).toBeVisible()
  await expect(thread.getByText('Ментор', { exact: true })).toBeVisible()
  await expect(thread.getByText('Есть ответ')).toBeVisible()

  await page.getByRole('button', { name: /Уведомления/ }).click()
  await expect(page.getByText(`Ответ на ваш вопрос к уроку «${second.title}»`)).toBeVisible()

  await page.goto('/questions')
  const item = page.getByRole('listitem').filter({ hasText: text })
  await expect(item.getByText('Ответ ментора e2e')).toBeVisible()
  await expect(item.getByRole('link', { name: second.title })).toHaveAttribute(
    'href',
    `/lessons/${second.slug}#comment-${questionId}`,
  )
})

test.describe('видео досмотрено — предложение отметить урок', () => {
  // Отдельный ученик: отметка урока не должна менять состояние doer и student.
  test.use({ storageState: storageStateOf('leader'), viewport: { width: 375, height: 812 } })

  test('на телефоне предложение над нижней навигацией, отметка ведёт к следующему уроку', async ({ page }) => {
    await page.goto(`/lessons/${first.slug}`)
    await expect(page.getByRole('button', { name: 'Отметить пройденным' })).toBeVisible()
    // В сиде нет видео — конец ролика сообщает сам плеер этим событием.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('lms:video-ended')))

    const dialog = page.getByRole('dialog', { name: 'Видео досмотрено' })
    await expect(dialog).toBeInViewport()
    const dialogBox = await dialog.boundingBox()
    const navBox = await page.locator('nav').filter({ hasText: 'Главная' }).boundingBox()
    expect((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0)).toBeLessThanOrEqual(navBox?.y ?? 0)

    await dialog.getByRole('button', { name: 'Отметить' }).click()
    await expect(dialog.getByRole('link', { name: `Дальше: ${second.title}` })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Урок пройден' })).toBeVisible()
    await dialog.getByRole('link', { name: `Дальше: ${second.title}` }).click()
    await expect(page).toHaveURL(new RegExp(`/lessons/${second.slug}$`))
  })
})

test('«Сохранить» урок и задачу: они в «Сохранённом», оттуда же убираются', async ({ page }) => {
  await page.goto(`/lessons/${third.slug}`)
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Сохранено' })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Сохранено' })).toBeVisible()

  await page.goto(`/trainer/${CONTENT.topic.slug}/${CONTENT.task.slug}`)
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Сохранено' })).toBeVisible()

  await page.goto('/saved')
  await expect(page.getByRole('link', { name: third.title })).toHaveAttribute('href', `/lessons/${third.slug}`)
  await expect(page.getByRole('link', { name: CONTENT.task.title })).toHaveAttribute(
    'href',
    `/trainer/${CONTENT.topic.slug}/${CONTENT.task.slug}`,
  )
  await page.getByRole('button', { name: `Убрать «${third.title}» из сохранённого` }).click()
  await page.getByRole('button', { name: `Убрать «${CONTENT.task.title}» из сохранённого` }).click()
  await expect(page.getByText(/Здесь пока пусто/)).toBeVisible()
  await page.reload()
  await expect(page.getByText(/Здесь пока пусто/)).toBeVisible()
})
