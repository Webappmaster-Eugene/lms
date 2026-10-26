import { expect, test } from '@playwright/test'
import { CONTENT } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

/**
 * Буткемп — отдельный раздел меню: виден только назначенному ученику, в «Курсах» его нет,
 * старые ссылки /courses/… ведут в раздел буткемпа.
 */
test('буткемп появляется в меню только после назначения и живёт вне «Курсов»', async ({ browser }) => {
  const admin = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('admin') })
  const learner = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { Origin: APP_URL }, storageState: { cookies: [], origins: [] } })
  const key = Date.now()
  const created: { users?: number; lessons?: number; sections?: number; courses?: number } = {}
  try {
    const roadmaps = await admin.request.get(`${APP_URL}/api/roadmaps?where[slug][equals]=${CONTENT.roadmap.slug}&depth=0`)
    const roadmap = (await roadmaps.json()).docs[0] as { id: number }
    const course = await admin.request.post(`${APP_URL}/api/courses`, { data: { title: `Буткемп E2E ${key}`, slug: `bootcamp-e2e-${key}`, roadmap: roadmap.id, isPublished: true, isBootcamp: true } })
    expect(course.status()).toBe(201)
    created.courses = (await course.json()).doc.id as number
    const section = await admin.request.post(`${APP_URL}/api/sections`, { data: { title: 'Неделя 0', course: created.courses, order: 0, isPublished: true } })
    expect(section.status()).toBe(201)
    created.sections = (await section.json()).doc.id as number
    const lesson = await admin.request.post(`${APP_URL}/api/lessons`, { data: { title: `Методичка ${key}`, slug: `bootcamp-e2e-lesson-${key}`, course: created.courses, section: created.sections, order: 0, isPublished: true } })
    expect(lesson.status()).toBe(201)
    created.lessons = (await lesson.json()).doc.id as number

    const email = `bootcamp-menu-${key}@lms.test`
    const password = 'Bootcamp-Menu-Test-1'
    const user = await admin.request.post(`${APP_URL}/api/users`, { data: { email, password, firstName: 'Участник', lastName: 'Буткемпа', role: 'student' } })
    expect(user.status()).toBe(201)
    created.users = (await user.json()).doc.id as number
    expect((await learner.request.post(`${APP_URL}/api/users/login`, { data: { email, password } })).status()).toBe(200)
    const page = await learner.newPage()
    const menu = page.getByRole('navigation', { name: 'Меню платформы' }).last()

    await page.goto('/bootcamp')
    await expect(page.getByText('Буткемп вам не назначен')).toBeVisible()
    await expect(menu.getByRole('link', { name: 'Буткемп' })).toHaveCount(0)

    expect((await admin.request.post(`${APP_URL}/api/learning-access-grants`, { data: { user: created.users, target: { relationTo: 'courses', value: created.courses }, effect: 'allow' } })).status()).toBe(201)

    await page.goto('/')
    await menu.getByRole('link', { name: 'Буткемп' }).click()
    // Единственный буткемп открывается сразу, без промежуточного списка.
    await expect(page).toHaveURL(`/bootcamp/bootcamp-e2e-${key}`)
    await expect(page.getByRole('heading', { level: 1, name: `Буткемп E2E ${key}` })).toBeVisible()
    await expect(menu.getByRole('link', { name: 'Буткемп' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByText('Начать буткемп')).toBeVisible()

    await page.goto('/courses')
    await expect(page.getByText(`Буткемп E2E ${key}`)).toHaveCount(0)
    await page.goto(`/courses/bootcamp-e2e-${key}`)
    await expect(page).toHaveURL(`/bootcamp/bootcamp-e2e-${key}`)

    await page.goto(`/lessons/bootcamp-e2e-lesson-${key}`)
    await expect(page.getByRole('heading', { level: 1, name: `Методичка ${key}` })).toBeVisible()
    await expect(page.locator(`a[href="/bootcamp/bootcamp-e2e-${key}"]`).first()).toBeAttached()
    await expect(page.locator(`a[href="/courses/bootcamp-e2e-${key}"]`)).toHaveCount(0)

    // На телефоне вкладка «Буткемп» в нижней панели.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Буткемп' })).toHaveAttribute('href', '/bootcamp')
  } finally {
    for (const [collection, id] of Object.entries(created).reverse()) {
      if (id) expect((await admin.request.delete(`${APP_URL}/api/${collection}/${id}`)).status()).toBe(200)
    }
    await admin.close()
    await learner.close()
  }
})
