import { expect, test } from '@playwright/test'
import { APP_URL, storageStateOf } from '../fixtures/env'

/**
 * SQL-темы открываются только по назначению: режим «весь тренажёр» их не показывает ни в
 * каталоге, ни в поиске, ни по прямой ссылке. Исполнение запросов здесь не проверяется:
 * e2e не поднимает gateway, это делает pnpm test:integration:runtime.
 */
test('SQL-тема по назначению: без гранта её нет нигде, с грантом видна задача с таблицами и правилами проверки', async ({ browser }) => {
  const admin = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('admin') })
  const learner = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: { cookies: [], origins: [] } })
  const stamp = Date.now()
  const created: Array<[string, number]> = []
  try {
    const post = async (collection: string, data: Record<string, unknown>) => {
      const response = await admin.request.post(`${APP_URL}/api/${collection}`, { data })
      expect(response.status(), collection).toBe(201)
      const id = (await response.json()).doc.id as number
      created.unshift([collection, id])
      return id
    }
    const topicTitle = `SQL по назначению ${stamp}`
    const taskTitle = `Названия отделов ${stamp}`
    const topicSlug = `e2e-sql-${stamp}`
    const taskSlug = `e2e-sql-task-${stamp}`
    const topic = await post('trainer-topics', { title: topicTitle, slug: topicSlug, category: 'sql', order: 99, assignedOnly: true, isPublished: true })
    await post('trainer-tasks', {
      title: taskTitle, slug: taskSlug, topic, order: 1, difficulty: 'easy', checkMode: 'program', languages: ['sql'],
      descriptionMd: 'Выведите `name` всех отделов.\n\n| id | name |\n| --- | --- |\n| 1 | Продажи |',
      starterCode: '-- Напишите запрос\n', solutionCode: 'SELECT name FROM departments', solutionNotes: 'Простая выборка.',
      sqlOrdered: false,
      runtimeCases: [
        { name: 'Данные из условия', hidden: false, input: "CREATE TABLE departments (id integer, name text); INSERT INTO departments VALUES (1, 'Продажи');", expected: ' name\n---------\n Продажи\n(1 строка)' },
        { name: 'Скрытый набор 1', hidden: true, input: "CREATE TABLE departments (id integer, name text); INSERT INTO departments VALUES (1, 'СЕКРЕТНЫЙ_ОТДЕЛ');", expected: ' name\n---------\n СЕКРЕТНЫЙ_ОТДЕЛ\n(1 строка)' },
      ],
      timeLimitMs: 3000, pointsReward: 10, isPublished: true,
    })

    const email = `sql-assigned-${stamp}@lms.test`
    const password = 'Sql-Assigned-Test-1'
    const user = await post('users', { email, password, firstName: 'Ученик', lastName: 'SQL', role: 'student', trainerAccessMode: 'all', learningCatalogVisibility: 'catalog' })
    expect((await learner.request.post(`${APP_URL}/api/users/login`, { data: { email, password } })).status()).toBe(200)
    const page = await learner.newPage()

    await page.goto('/trainer')
    await expect(page.getByRole('heading', { name: 'Тренажёр кода' })).toBeVisible()
    await expect(page.getByText(topicTitle)).toHaveCount(0)
    await page.goto('/trainer/tasks')
    await page.getByLabel('Поиск задач').fill(taskTitle)
    await expect(page.getByRole('link', { name: new RegExp(taskTitle) })).toHaveCount(0)
    expect((await page.goto(`/trainer/${topicSlug}/${taskSlug}`))?.status()).toBe(404)
    expect((await learner.request.get(`${APP_URL}/api/trainer-topics/${topic}`)).status()).toBe(404)

    await post('learning-access-grants', { user, target: { relationTo: 'trainer-topics', value: topic }, effect: 'allow' })
    await page.goto('/trainer')
    await page.getByRole('link', { name: new RegExp(topicTitle) }).first().click()
    await expect(page).toHaveURL(new RegExp(`/trainer/${topicSlug}$`))
    await page.getByRole('link', { name: new RegExp(taskTitle) }).first().click()
    await expect(page.getByRole('heading', { name: taskTitle })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Продажи' })).toBeVisible()
    await expect(page.getByText(/поднимает чистую базу с данными задачи/)).toBeVisible()
    await page.getByRole('button', { name: 'Тесты' }).click()
    await expect(page.getByText(/на отдельной свежей базе/)).toContainText('порядок строк не важен')
    await expect(page.getByText(/Свои проверки/)).toHaveCount(0)
    expect(await page.content()).not.toContain('СЕКРЕТНЫЙ_ОТДЕЛ')
  } finally {
    for (const [collection, id] of created) expect((await admin.request.delete(`${APP_URL}/api/${collection}/${id}`)).status(), `${collection} ${id}`).toBe(200)
    await admin.close()
    await learner.close()
  }
})
