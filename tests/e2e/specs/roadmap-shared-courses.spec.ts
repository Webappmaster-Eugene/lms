import { expect, test } from '@playwright/test'
import { CONTENT } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

/**
 * Курс живёт в одном роадмапе, а тема другого показывает его как свой: на карте, в списке
 * роадмапов и в фильтре каталога. Страницы собираются на сервере, поэтому смотрим их живыми.
 */
test.describe('Курс из другого роадмапа', () => {
  test.use({ storageState: storageStateOf('admin') })

  test('виден в теме чужой карты, считается в её прогрессе и находится в каталоге', async ({ page, browser }) => {
    const key = `shared-course-${Date.now()}`
    const title = `Карта с общим курсом ${key}`
    const created: { collection: string; id: number }[] = []
    async function create(collection: string, data: Record<string, unknown>) {
      const response = await page.request.post(`/api/${collection}`, { data })
      expect(response.status()).toBe(201)
      const { doc } = await response.json() as { doc: { id: number } }
      created.push({ collection, id: doc.id })
      return doc
    }
    const student = await browser.newContext({ baseURL: APP_URL, storageState: storageStateOf('student') })
    try {
      const courses = await page.request.get(`/api/courses?where[slug][equals]=${CONTENT.course.slug}&depth=0`)
      const course = (await courses.json()).docs[0] as { id: number }
      const roadmap = await create('roadmaps', { title, slug: key, isPublished: true })
      await create('roadmap-nodes', { roadmap: roadmap.id, nodeId: `${key}-topic`, nodeType: 'topic', label: 'Тема с общим курсом', positionX: 0, positionY: 0, sharedCourses: [course.id] })

      const learner = await student.newPage()
      await learner.goto(`/roadmaps/${key}?view=list`)
      await learner.getByText('Тема с общим курсом', { exact: true }).click()
      await expect(learner.getByRole('link', { name: CONTENT.course.title, exact: true }).first()).toBeVisible()
      await expect(learner.getByRole('progressbar', { name: `Прогресс курса «${CONTENT.course.title}»` }).first()).toBeVisible()
      await expect(learner.getByText('Курсы вне карты')).toHaveCount(0)

      await learner.goto('/roadmaps')
      await expect(learner.getByRole('link', { name: new RegExp(title) })).toContainText(/1 курс/)

      await learner.goto(`/courses?roadmap=${encodeURIComponent(title)}`)
      await expect(learner.getByRole('link', { name: new RegExp(CONTENT.course.title) }).first()).toBeVisible()
    } finally {
      await student.close()
      for (const { collection, id } of created.reverse()) expect((await page.request.delete(`/api/${collection}/${id}`)).status()).toBe(200)
    }
  })

  test('процент и статус карты считают только её курсы, курс другой карты в них не входит', async ({ page, browser }) => {
    const key = `own-progress-${Date.now()}`
    const title = `Карта своих курсов ${key}`
    const created: { collection: string; id: number }[] = []
    async function create(collection: string, data: Record<string, unknown>) {
      const response = await page.request.post(`/api/${collection}`, { data })
      expect(response.status()).toBe(201)
      const { doc } = await response.json() as { doc: { id: number } }
      created.push({ collection, id: doc.id })
      return doc
    }
    const learner = await browser.newContext({ baseURL: APP_URL, extraHTTPHeaders: { Origin: APP_URL }, storageState: { cookies: [], origins: [] } })
    let userId: number | undefined
    try {
      const home = await create('roadmaps', { title: `Родная карта ${key}`, slug: `${key}-home`, isPublished: true })
      const map = await create('roadmaps', { title, slug: key, isPublished: true })
      const foreign = await create('courses', { title: `Курс другой карты ${key}`, slug: `${key}-foreign`, roadmap: home.id, isPublished: true })
      const own = await create('courses', { title: `Свой курс ${key}`, slug: `${key}-own`, roadmap: map.id, isPublished: true })
      const foreignLesson = await create('lessons', { title: `Урок другой карты ${key}`, slug: `${key}-foreign-lesson`, course: foreign.id, isPublished: true })
      const ownLesson = await create('lessons', { title: `Свой урок ${key}`, slug: `${key}-own-lesson`, course: own.id, isPublished: true })
      await create('roadmap-nodes', { roadmap: map.id, nodeId: `${key}-topic`, nodeType: 'topic', label: 'Тема со своим и общим курсом', positionX: 0, positionY: 0, course: own.id, sharedCourses: [foreign.id] })

      const email = `${key}@lms.test`
      const password = 'Own-Progress-Test-1'
      const user = await page.request.post('/api/users', { data: { email, password, firstName: 'Свой', lastName: 'Прогресс', role: 'student' } })
      expect(user.status()).toBe(201)
      userId = (await user.json()).doc.id as number
      for (const target of [{ relationTo: 'roadmaps', value: map.id }, { relationTo: 'courses', value: foreign.id }]) {
        expect((await page.request.post('/api/learning-access-grants', { data: { user: userId, target, effect: 'allow' } })).status()).toBe(201)
      }
      expect((await learner.request.post('/api/users/login', { data: { email, password } })).status()).toBe(200)
      const finish = async (lesson: number) => expect((await learner.request.post('/api/user-progress', { data: { lesson, isCompleted: true } })).status()).toBe(201)
      const view = await learner.newPage()
      const card = view.getByRole('link', { name: new RegExp(title) })
      const overall = view.getByText('Прогресс назначенного обучения').locator('..')

      // Курс другой карты пройден, а программа карты - нет: на карте он виден, в проценте его нет.
      await finish(foreignLesson.id)
      await view.goto('/roadmaps')
      await expect(card).toContainText('2 курса')
      await expect(card).toContainText('Не начат')
      await expect(card).toContainText('0%')
      await view.goto(`/roadmaps/${key}?view=list`)
      await expect(overall).toContainText('0%')
      await expect(view.getByText(/Все назначенные уроки пройдены/)).toHaveCount(0)

      await finish(ownLesson.id)
      await view.goto('/roadmaps')
      await expect(card).toContainText('Пройден')
      await expect(card).toContainText('100%')
      await view.goto(`/roadmaps/${key}?view=list`)
      await expect(overall).toContainText('100%')
      await expect(view.getByText(/Все назначенные уроки пройдены/)).toBeVisible()
    } finally {
      await learner.close()
      if (userId) expect((await page.request.delete(`/api/users/${userId}`)).status()).toBe(200)
      for (const { collection, id } of created.reverse()) expect((await page.request.delete(`/api/${collection}/${id}`)).status()).toBe(200)
    }
  })
})
