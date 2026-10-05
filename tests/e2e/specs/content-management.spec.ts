import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Course, Lesson, Section } from '@/payload-types'
import { CONTENT } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

test.describe('Учебный контент внутри LMS', () => {
  test.use({ storageState: storageStateOf('admin') })

  test('роадмап → курс → раздел → материалы урока → публикация → ученик', async ({ page, browser }, testInfo) => {
    let course: Course | undefined
    let section: Section | undefined
    let lesson: Lesson | undefined
    const student = await browser.newContext({ storageState: storageStateOf('student') })
    try {
      await page.goto(`/roadmaps/${CONTENT.roadmap.slug}`)
      await page.getByRole('link', { name: 'Курсы и уроки', exact: true }).click()
      await expect(page).toHaveURL(/\/manage\/roadmaps\/\d+$/)
      await page.getByRole('link', { name: 'Добавить курс', exact: true }).first().click()
      await page.getByRole('textbox', { name: 'Название курса', exact: true }).fill(`Практика Node.js ${testInfo.workerIndex}-${Date.now()}`)
      await page.getByRole('textbox', { name: 'Описание курса', exact: true }).fill('Научитесь описывать HTTP-запросы и проверять ответы сервера.')
      const createdCourse = page.waitForResponse((response) => response.url().endsWith('/api/manage/content/courses') && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'Создать черновик', exact: true }).click()
      const courseResponse = await createdCourse
      expect(courseResponse.status()).toBe(201)
      course = (await courseResponse.json()).doc as Course
      await expect(page).toHaveURL(new RegExp(`/manage/courses/${course.id}$`))
      await expect(page.getByRole('heading', { name: course.title, exact: true })).toBeVisible()
      expect((await student.request.get(`${APP_URL}/api/courses/${course.id}`)).status()).toBe(404)

      await page.getByRole('link', { name: 'Настройки и публикация', exact: true }).click()
      await page.getByRole('checkbox', { name: 'Опубликовать курс', exact: true }).check()
      await page.getByRole('button', { name: 'Сохранить и опубликовать', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/manage/courses/${course.id}$`))

      const newSection = page.getByRole('form', { name: 'Новый раздел', exact: true })
      await newSection.getByRole('textbox', { name: 'Название раздела', exact: true }).fill('HTTP на практике')
      await newSection.getByRole('textbox', { name: 'Описание раздела', exact: true }).fill('Запросы, ответы и коды состояния.')
      await newSection.getByRole('checkbox', { name: 'Опубликовать раздел', exact: true }).check()
      const createdSection = page.waitForResponse((response) => response.url().endsWith('/api/manage/content/sections') && response.request().method() === 'POST')
      await newSection.getByRole('button', { name: 'Сохранить и опубликовать', exact: true }).click()
      section = (await (await createdSection).json()).doc as Section
      const chapter = page.getByRole('region', { name: `Раздел «${section.title}»`, exact: true })
      await chapter.getByRole('link', { name: 'Добавить урок в раздел', exact: true }).click()
      await expect(page.getByRole('combobox', { name: 'Раздел курса', exact: true })).toHaveValue(String(section.id))
      await page.getByRole('textbox', { name: 'Название урока', exact: true }).fill('Запрос и ответ Node.js')
      await page.getByRole('textbox', { name: 'Краткое описание', exact: true }).fill('Проследите запрос от клиента до сервера и проверьте код ответа.')
      await page.getByRole('button', { name: 'Текст', exact: true }).click()
      await page.getByRole('textbox', { name: 'Текст урока', exact: true }).fill('Текст урока о запросе и ответе.')
      await page.getByRole('button', { name: 'Видео', exact: true }).click()
      await page.getByLabel('Название видео', { exact: false }).fill('Обработка запроса')
      await page.getByLabel('Ссылка на видео', { exact: false }).fill('https://www.youtube.com/watch?v=e2e-video')
      await page.getByRole('combobox', { name: 'Как показывать видео', exact: true }).selectOption('link')
      await page.getByRole('button', { name: 'Ссылка', exact: true }).last().click()
      await page.getByLabel('Название ссылки', { exact: false }).fill('Документация Node.js')
      await page.getByLabel('Адрес ссылки', { exact: false }).fill('https://nodejs.org/api/http.html')
      const createdLesson = page.waitForResponse((response) => response.url().endsWith('/api/manage/content/lessons') && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'Создать черновик', exact: true }).click()
      const lessonResponse = await createdLesson
      expect(lessonResponse.status()).toBe(201)
      lesson = (await lessonResponse.json()).doc as Lesson
      await expect(page).toHaveURL(new RegExp(`/manage/lessons/${lesson.id}$`))
      expect(lesson.content?.map((block) => block.blockType)).toEqual(['text', 'video', 'link'])
      const ids = lesson.content?.map((block) => block.id)
      expect((await student.request.get(`${APP_URL}/api/lessons/${lesson.id}`)).status()).toBe(404)

      await page.reload()
      await expect(page.getByRole('textbox', { name: 'Текст урока', exact: true })).toContainText('Текст урока о запросе и ответе.')
      await page.getByRole('textbox', { name: 'Название урока', exact: true }).fill('HTTP: запрос и ответ')
      await page.getByRole('button', { name: 'Поднять материал 3', exact: true }).click()
      await page.getByRole('checkbox', { name: 'Опубликовать урок', exact: true }).check()
      const updatedLesson = page.waitForResponse((response) => response.url().endsWith(`/api/manage/content/lessons/${lesson?.id}`) && response.request().method() === 'PATCH')
      await page.getByRole('button', { name: 'Сохранить и опубликовать', exact: true }).click()
      const update = await updatedLesson
      expect(update.status()).toBe(200)
      const published = (await update.json()).doc as Lesson
      expect(published.slug).toBe(lesson.slug)
      expect(published.content?.map((block) => block.id)).toEqual([ids?.[0], ids?.[2], ids?.[1]])
      await expect(page.getByRole('status')).toContainText('Урок опубликован')
      await page.screenshot({ path: testInfo.outputPath('lms-lesson-editor.png'), fullPage: true })
      const accessibility = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(accessibility.violations).toEqual([])

      const learnerPage = await student.newPage()
      await learnerPage.goto(`${APP_URL}/courses/${course.slug}`)
      await expect(learnerPage.getByRole('region', { name: 'Описание курса' })).toContainText('Научитесь описывать HTTP-запросы')
      await expect(learnerPage.getByRole('link', { name: 'Редактировать программу', exact: true })).toHaveCount(0)
      await learnerPage.goto(`${APP_URL}/lessons/${lesson.slug}`)
      await expect(learnerPage.getByRole('heading', { name: 'HTTP: запрос и ответ', exact: true })).toBeVisible()
      await expect(learnerPage.getByText(published.description ?? '', { exact: true })).toBeVisible()
      await expect(learnerPage.getByRole('link', { name: 'Редактировать урок', exact: true })).toHaveCount(0)
      await learnerPage.goto(`${APP_URL}/manage`)
      await expect(learnerPage.getByRole('heading', { name: 'Учебный контент', exact: true })).toHaveCount(0)
    } finally {
      await student.close()
      if (lesson) await page.request.delete(`/api/lessons/${lesson.id}`)
      if (section) await page.request.delete(`/api/sections/${section.id}`)
      if (course) await page.request.delete(`/api/courses/${course.id}`)
    }
  })

  test('на телефоне меню открывает контент, а выход сохраняет черновик формы', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Ещё', exact: true }).click()
    await page.locator('aside').first().getByRole('link', { name: 'Учебный контент', exact: true }).click()
    await expect(page).toHaveURL(/\/manage$/)
    await page.getByRole('link', { name: 'Добавить курс', exact: true }).first().click()
    await page.getByRole('textbox', { name: 'Название курса', exact: true }).fill('Несохранённый курс')
    page.once('dialog', (dialog) => dialog.dismiss())
    await page.getByRole('button', { name: 'Назад к курсам', exact: true }).click()
    await expect(page).toHaveURL(/\/manage\/courses\/new$/)
    await expect(page.getByRole('textbox', { name: 'Название курса', exact: true })).toHaveValue('Несохранённый курс')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('lms-course-editor-mobile.png'), fullPage: true })
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Назад к курсам', exact: true }).click()
    await expect(page).toHaveURL(/\/manage$/)
  })

  test('тема роадмапа выбирается при создании курса в списке по этапам', async ({ page }) => {
    await page.goto(`/roadmaps/${CONTENT.roadmap.slug}`)
    await page.getByRole('tab', { name: 'Список по этапам', exact: true }).click()
    const summary = page.locator('summary').filter({ hasText: 'Веб-основы' })
    if (await summary.locator('..').getAttribute('open') === null) await summary.click()
    const topic = summary.locator('..')
    const create = topic.getByRole('link', { name: 'Добавить курс в тему', exact: true })
    const href = await create.getAttribute('href')
    expect(href).toMatch(/\?roadmap=\d+&node=\d+$/)
    await create.click()
    await expect(page).toHaveURL(/\/manage\/courses\/new\?roadmap=\d+&node=\d+$/)
    const url = new URL(page.url())
    await expect(page.getByRole('combobox', { name: 'Роадмап', exact: true })).toHaveValue(url.searchParams.get('roadmap') ?? '')
    await expect(page.getByRole('combobox', { name: 'Тема на карте', exact: true })).toHaveValue(url.searchParams.get('node') ?? '')
    await expect(page.getByRole('heading', { name: 'Новый курс', exact: true })).toBeVisible()
  })
})
