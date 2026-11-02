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
})
