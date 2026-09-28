import { expect, test } from '@playwright/test'

import { MARK, PROD_URL, stateOf } from './env'

/**
 * Вопрос к уроку на проде целиком: ученик спрашивает → ментор отвечает со своей
 * страницы → ученик видит ответ в уроке, в уведомлениях и в «Моих вопросах» →
 * ментор закрывает вопрос.
 */
test.use({ storageState: stateOf('student') })

test('вопрос ученика, ответ ментора, уведомление и статусы', async ({ page, browser }) => {
  const question = `${MARK}: почему урок так устроен?`
  const answer = `${MARK}: ответ ментора`

  await page.goto('/courses')
  await page.locator('a[href^="/courses/"]').filter({ has: page.locator('h3') }).first().click()
  await page.getByRole('link', { name: /Начать курс|Продолжить с урока/ }).click()
  await expect(page).toHaveURL(/\/lessons\//)
  const lessonPath = new URL(page.url()).pathname

  await page.getByRole('textbox', { name: 'Вопрос к уроку' }).fill(question)
  await page.getByRole('button', { name: 'Отправить вопрос' }).click()
  await expect(page.getByText('Вопрос отправлен ментору')).toBeVisible()
  const thread = page.getByRole('listitem').filter({ hasText: question })
  await expect(thread.getByText('Ждёт ответа')).toBeVisible()
  const questionId = (await thread.getAttribute('id'))?.replace('comment-', '')
  expect(questionId).toMatch(/^\d+$/)

  const mentor = await browser.newContext({ baseURL: PROD_URL, storageState: stateOf('admin') })
  const mentorPage = await mentor.newPage()
  await mentorPage.goto('/')
  await expect(mentorPage.locator('aside').last().getByRole('link', { name: 'Вопросы учеников' })).toBeVisible()
  await mentorPage.goto('/admin/questions')
  const card = mentorPage.locator(`#comment-${questionId}`)
  await expect(card).toContainText(question)
  await card.getByRole('textbox', { name: /Ответ ученику/ }).fill(answer)
  await card.getByRole('button', { name: 'Ответить' }).click()
  await expect(mentorPage.getByText('Ответ отправлен — ученик получит уведомление')).toBeVisible()

  await page.goto('/')
  const answers = page.getByRole('region', { name: /Ментор ответил/ })
  await expect(answers).toContainText(answer)
  await answers.getByRole('link', { name: /Ответ на ваш вопрос/ }).first().click()
  await expect(page).toHaveURL(new RegExp(`#comment-${questionId}$`))
  await expect(thread.getByText(answer)).toBeVisible()
  await expect(async () => {
    await page.goto('/')
    await expect(page.getByRole('region', { name: /Ментор ответил/ })).toHaveCount(0)
  }).toPass({ timeout: 15_000 })

  await page.goto(lessonPath)
  await expect(thread.getByText(answer)).toBeVisible()
  await expect(thread.getByText('Ментор', { exact: true })).toBeVisible()
  await expect(thread.getByText('Есть ответ')).toBeVisible()

  await page.getByRole('button', { name: /Уведомления/ }).click()
  await expect(page.getByText(/Ответ на ваш вопрос к уроку/).first()).toBeVisible()

  await page.goto('/questions')
  const item = page.getByRole('listitem').filter({ hasText: question })
  await expect(item.getByText(answer)).toBeVisible()
  await expect(item.getByRole('link').first()).toHaveAttribute('href', `${lessonPath}#comment-${questionId}`)

  await mentorPage.getByRole('button', { name: /Есть ответ/ }).click()
  await mentorPage.locator(`#comment-${questionId}`).getByRole('button', { name: 'Отметить решённым' }).click()
  await expect(mentorPage.getByText('Вопрос закрыт')).toBeVisible()
  await mentor.close()

  await page.reload()
  await expect(page.getByRole('listitem').filter({ hasText: question }).getByText('Решён')).toBeVisible()
})

test('ученика на страницу ментора не пускает', async ({ request }) => {
  const response = await request.get('/admin/questions', { maxRedirects: 0 })
  expect(response.status()).toBe(307)
})
