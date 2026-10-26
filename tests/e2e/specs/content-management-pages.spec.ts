import { expect, test, type APIRequestContext } from '@playwright/test'

import { adminContext } from '../fixtures/accounts'
import { CONTENT, NOT_FOUND_HEADING } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

/**
 * Страницы «Учебного контента», которые не проходит сквозной сценарий content-management:
 * настройки курса, новый урок и доступ ко всем страницам /manage по ролям.
 */
type Seed = { roadmap: number; course: number; section: number; lesson: number }

async function seedIds(api: APIRequestContext): Promise<Seed> {
  const one = async (collection: string, slug: string) => {
    const response = await api.get(`/api/${collection}?where[slug][equals]=${slug}&depth=0`)
    expect(response.status()).toBe(200)
    return (await response.json()).docs[0].id as number
  }
  return {
    roadmap: await one('roadmaps', CONTENT.roadmap.slug),
    course: await one('courses', CONTENT.course.slug),
    section: await one('sections', CONTENT.section.slug),
    lesson: await one('lessons', CONTENT.lessons[0].slug),
  }
}

function managePages(ids: Seed): string[] {
  return [
    '/manage',
    `/manage/roadmaps/${ids.roadmap}`,
    '/manage/courses/new',
    `/manage/courses/${ids.course}`,
    `/manage/courses/${ids.course}/settings`,
    `/manage/lessons/new?course=${ids.course}`,
    `/manage/lessons/${ids.lesson}`,
  ]
}

test.describe('администратор', () => {
  test.use({ storageState: storageStateOf('admin') })

  test('настройки курса: тема на карте, предварительный курс, конфликт правок, публикация и снятие', async ({ page, browser }) => {
    const admin = await adminContext(browser)
    const student = await browser.newContext({ baseURL: APP_URL, storageState: storageStateOf('student') })
    let courseId: number | undefined
    try {
      const ids = await seedIds(admin.request)
      const stamp = Date.now()
      const created = await admin.request.post('/api/courses', { data: { title: `Настройки курса ${stamp}`, slug: `e2e-settings-${stamp}`, roadmap: ids.roadmap, order: 7, isPublished: false } })
      expect(created.status(), await created.text()).toBe(201)
      const course = (await created.json()).doc as { id: number; slug: string; title: string }
      courseId = course.id
      const title = `Курс после настройки ${stamp}`

      await page.goto(`/manage/courses/${course.id}`)
      await expect(page.getByText('Черновик', { exact: true }).first()).toBeVisible()
      await page.getByRole('link', { name: 'Настройки и публикация', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/manage/courses/${course.id}/settings$`))
      await expect(page.getByRole('heading', { name: 'Настройки курса', level: 1 })).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Путь к учебному контенту' }).getByRole('link', { name: course.title })).toHaveAttribute('href', `/manage/courses/${course.id}`)
      const form = page.getByRole('form', { name: 'Редактирование курса' })
      await expect(form.getByRole('textbox', { name: 'Название курса', exact: true })).toHaveValue(course.title)
      // Курс нельзя перенести в другой роадмап из настроек.
      await expect(form.getByRole('combobox', { name: 'Роадмап', exact: true })).toBeDisabled()
      await expect(form.getByRole('combobox', { name: 'Роадмап', exact: true })).toHaveValue(String(ids.roadmap))
      await expect(form.getByText('Курс остаётся в исходном роадмапе.')).toBeVisible()
      const node = form.getByRole('combobox', { name: 'Тема на карте', exact: true })
      // Категория «Старт» — не тема: привязать к ней курс нельзя.
      await expect(node.locator('option')).toHaveText(['Без привязки к теме', 'Веб-основы'])
      await expect(page.getByText('Изменений нет', { exact: true })).toBeVisible()

      await form.getByRole('textbox', { name: 'Название курса', exact: true }).fill(title)
      await node.selectOption({ label: 'Веб-основы' })
      await form.getByRole('spinbutton', { name: 'Время на курс, часов' }).fill('6')
      await form.locator('summary').filter({ hasText: 'Курсы, которые нужно пройти заранее' }).click()
      await form.getByRole('checkbox', { name: CONTENT.course.title, exact: true }).check()
      await expect(page.getByText('Есть несохранённые изменения', { exact: true })).toBeVisible()

      // Тем временем курс поменяли в другой вкладке: правки формы не теряются и не затирают чужие.
      expect((await admin.request.patch(`/api/courses/${course.id}`, { data: { estimatedHours: 2 } })).status()).toBe(200)
      await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click()
      await expect(page.getByRole('main').getByRole('alert')).toContainText('Ваши изменения остаются в форме')
      await expect(form.getByRole('textbox', { name: 'Название курса', exact: true })).toHaveValue(title)
      expect((await (await admin.request.get(`/api/courses/${course.id}?depth=0`)).json()).title).toBe(course.title)

      page.once('dialog', (dialog) => dialog.accept())
      await page.reload()
      await expect(form.getByRole('spinbutton', { name: 'Время на курс, часов' })).toHaveValue('2')
      await form.getByRole('textbox', { name: 'Название курса', exact: true }).fill(title)
      await node.selectOption({ label: 'Веб-основы' })
      await form.getByRole('spinbutton', { name: 'Время на курс, часов' }).fill('6')
      await form.locator('summary').filter({ hasText: 'Курсы, которые нужно пройти заранее' }).click()
      await form.getByRole('checkbox', { name: CONTENT.course.title, exact: true }).check()
      await form.getByRole('checkbox', { name: 'Опубликовать курс', exact: true }).check()
      await expect(form.getByText('После сохранения ученики увидят курс. Разделы и уроки публикуются отдельно.')).toBeVisible()
      const saved = page.waitForResponse((response) => response.url().endsWith(`/api/manage/content/courses/${course.id}`) && response.request().method() === 'PATCH')
      await page.getByRole('button', { name: 'Сохранить и опубликовать', exact: true }).click()
      expect((await saved).status()).toBe(200)
      await expect(page).toHaveURL(new RegExp(`/manage/courses/${course.id}$`))
      await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Посмотреть как ученик', exact: true })).toHaveAttribute('href', `/courses/${course.slug}`)
      const stored = (await (await admin.request.get(`/api/courses/${course.id}?depth=0`)).json()) as { roadmapNode: number; prerequisites: number[]; estimatedHours: number; isPublished: boolean }
      expect(stored).toMatchObject({ estimatedHours: 6, prerequisites: [ids.course], isPublished: true })
      expect(stored.roadmapNode).toEqual(expect.any(Number))

      const learner = await student.newPage()
      await learner.goto(`/courses/${course.slug}`)
      await expect(learner.getByRole('heading', { name: title, level: 1 })).toBeVisible()
      await expect(learner.getByText('~6ч')).toBeVisible()

      await page.getByRole('link', { name: 'Настройки и публикация', exact: true }).click()
      await form.locator('summary').filter({ hasText: 'Адрес страницы' }).click()
      await expect(form.getByRole('textbox', { name: 'Адрес курса' })).toHaveValue(course.slug)
      await form.getByRole('checkbox', { name: 'Опубликовать курс', exact: true }).uncheck()
      await expect(form.getByText('Черновик виден только администраторам. Можно спокойно подготовить программу.')).toBeVisible()
      const unpublished = page.waitForResponse((response) => response.url().endsWith(`/api/manage/content/courses/${course.id}`) && response.request().method() === 'PATCH')
      await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click()
      expect((await unpublished).status()).toBe(200)
      await expect(page).toHaveURL(new RegExp(`/manage/courses/${course.id}$`))
      await expect(page.getByRole('link', { name: 'Посмотреть как ученик', exact: true })).toHaveCount(0)
      await learner.goto(`/courses/${course.slug}`)
      await expect(learner.getByRole('heading', { name: NOT_FOUND_HEADING })).toBeVisible()
      await expect(learner.getByText(title)).toHaveCount(0)
    } finally {
      if (courseId) await admin.request.delete(`/api/courses/${courseId}`)
      await Promise.all([student.close(), admin.close()])
    }
  })

  test('новый урок: раздел из ссылки, черновик в программе курса и закрыт для ученика', async ({ page, browser }) => {
    const admin = await adminContext(browser)
    const student = await browser.newContext({ baseURL: APP_URL, storageState: storageStateOf('student') })
    let lessonId: number | undefined
    try {
      const ids = await seedIds(admin.request)
      const title = `Новый урок ${Date.now()}`
      await page.goto(`/manage/courses/${ids.course}`)
      const chapter = page.getByRole('region', { name: `Раздел «${CONTENT.section.title}»`, exact: true })
      await chapter.getByRole('link', { name: 'Добавить урок в раздел', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/manage/lessons/new\\?course=${ids.course}&section=${ids.section}$`))
      await expect(page.getByRole('heading', { name: 'Новый урок', level: 1 })).toBeVisible()
      await expect(page.getByText(`Курс: ${CONTENT.course.title}`)).toBeVisible()
      const form = page.getByRole('form', { name: 'Новый урок' })
      await expect(form.getByRole('combobox', { name: 'Раздел курса', exact: true })).toHaveValue(String(ids.section))

      // Без правок форма уходит без вопросов, с правками — спрашивает.
      await page.getByRole('button', { name: 'Назад к программе', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/manage/courses/${ids.course}$`))
      await page.getByRole('link', { name: 'Добавить урок', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/manage/lessons/new\\?course=${ids.course}$`))
      await expect(form.getByRole('combobox', { name: 'Раздел курса', exact: true })).toHaveValue('')
      await form.getByRole('textbox', { name: 'Название урока', exact: true }).fill(title)
      page.once('dialog', (dialog) => dialog.dismiss())
      await page.getByRole('button', { name: 'Назад к программе', exact: true }).click()
      await expect(page).toHaveURL(/\/manage\/lessons\/new\?/)
      await expect(form.getByRole('textbox', { name: 'Название урока', exact: true })).toHaveValue(title)

      const description = 'Короткое описание нового урока.'
      await form.getByRole('textbox', { name: 'Краткое описание', exact: true }).fill(description)
      await expect(form.getByText(`${description.length} / 300`)).toBeVisible()
      await form.getByRole('combobox', { name: 'Раздел курса', exact: true }).selectOption(String(ids.section))
      await form.getByRole('spinbutton', { name: 'Время на урок, минут' }).fill('25')
      await form.getByRole('checkbox', { name: 'Опубликовать урок', exact: true }).check()
      await form.getByRole('checkbox', { name: 'Опубликовать урок', exact: true }).uncheck()
      const created = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/manage/content/lessons' && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'Создать черновик', exact: true }).click()
      const response = await created
      expect(response.status()).toBe(201)
      const lesson = (await response.json()).doc as { id: number; slug: string; isPublished: boolean; estimatedMinutes: number; section: number }
      lessonId = lesson.id
      expect(lesson).toMatchObject({ isPublished: false, estimatedMinutes: 25, section: ids.section })
      await expect(page).toHaveURL(new RegExp(`/manage/lessons/${lesson.id}$`))
      await expect(page.getByRole('heading', { name: 'Редактор урока', level: 1 })).toBeVisible()
      const editor = page.getByRole('form', { name: 'Редактирование урока' })
      await expect(editor.getByRole('textbox', { name: 'Название урока', exact: true })).toHaveValue(title)
      await expect(editor.getByText('Изменений нет', { exact: true })).toBeVisible()

      await page.getByRole('navigation', { name: 'Путь к учебному контенту' }).getByRole('link', { name: CONTENT.course.title }).click()
      await expect(page).toHaveURL(new RegExp(`/manage/courses/${ids.course}$`))
      const row = chapter.getByRole('listitem').filter({ hasText: title })
      await expect(row).toContainText(description)
      await expect(row).toContainText('Черновик')
      await expect(row.getByRole('link', { name: `Редактировать урок «${title}»` })).toHaveAttribute('href', `/manage/lessons/${lesson.id}`)

      const learner = await student.newPage()
      await learner.goto(`/courses/${CONTENT.course.slug}`)
      await expect(learner.getByText(title)).toHaveCount(0)
      await learner.goto(`/lessons/${lesson.slug}`)
      await expect(learner.getByRole('heading', { name: NOT_FOUND_HEADING })).toBeVisible()
    } finally {
      if (lessonId) await admin.request.delete(`/api/lessons/${lessonId}`)
      await Promise.all([student.close(), admin.close()])
    }
  })

  test('новый урок без курса или с разделом чужого курса — страница 404', async ({ page, browser }) => {
    const admin = await adminContext(browser)
    try {
      const ids = await seedIds(admin.request)
      for (const path of ['/manage/lessons/new', '/manage/lessons/new?course=999999', `/manage/lessons/new?course=${ids.course}&section=999999`, '/manage/courses/999999/settings']) {
        await page.goto(path)
        await expect(page.getByRole('heading', { name: NOT_FOUND_HEADING }), path).toBeVisible()
        await expect(page.getByRole('heading', { name: /Новый урок|Настройки курса/ }), path).toHaveCount(0)
      }
    } finally { await admin.close() }
  })

  test('БАГ: после создания урока нет подтверждения «Черновик урока сохранён.»', async ({ page, browser }) => {
    // LessonForm ставит сообщение и сразу делает router.replace на /manage/lessons/<id>: это другая
    // страница, форма монтируется заново, и сообщение пропадает. То же у CourseForm при создании курса.
    test.fail()
    const admin = await adminContext(browser)
    let lessonId: number | undefined
    try {
      const ids = await seedIds(admin.request)
      await page.goto(`/manage/lessons/new?course=${ids.course}`)
      await page.getByRole('textbox', { name: 'Название урока', exact: true }).fill(`Подтверждение ${Date.now()}`)
      const created = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/manage/content/lessons' && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'Создать черновик', exact: true }).click()
      lessonId = (await (await created).json()).doc.id as number
      await expect(page).toHaveURL(new RegExp(`/manage/lessons/${lessonId}$`))
      await expect(page.getByRole('status').filter({ hasText: 'Черновик урока сохранён.' })).toBeVisible({ timeout: 5_000 })
    } finally {
      if (lessonId) await admin.request.delete(`/api/lessons/${lessonId}`)
      await admin.close()
    }
  })
})

test.describe('доступ к страницам учебного контента', () => {
  test('гость уходит на вход с возвратом на ту же страницу', async ({ browser }) => {
    const admin = await adminContext(browser)
    const guest = await browser.newContext({ baseURL: APP_URL, storageState: { cookies: [], origins: [] } })
    try {
      const page = await guest.newPage()
      for (const path of managePages(await seedIds(admin.request))) {
        await page.goto(path)
        await expect(page, path).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === path)
      }
    } finally { await Promise.all([guest.close(), admin.close()]) }
  })

  test.describe('ученик', () => {
    test.use({ storageState: storageStateOf('student') })

    test('получает 404 и не видит форм и названий черновиков', async ({ page, browser }) => {
      const admin = await adminContext(browser)
      try {
        for (const path of managePages(await seedIds(admin.request))) {
          expect((await page.goto(path))?.status(), path).toBe(404)
          await expect(page.getByRole('heading', { name: NOT_FOUND_HEADING }), path).toBeVisible()
          await expect(page.getByRole('form'), path).toHaveCount(0)
          await expect(page.getByText(CONTENT.draftLesson.title), path).toHaveCount(0)
        }
        const denied = await page.request.patch(`/api/manage/content/courses/${(await seedIds(admin.request)).course}`, { data: { title: 'Взлом' } })
        expect(denied.status()).toBe(403)
      } finally { await admin.close() }
    })
  })
})
