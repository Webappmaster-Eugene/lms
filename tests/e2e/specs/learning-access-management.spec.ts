import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { CONTENT } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

test('администратор назначает роадмап с исключением урока, ученик видит программу и только разрешённый контент', async ({ browser }, testInfo) => {
  const admin = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('admin') })
  const learner = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: { cookies: [], origins: [] } })
  let userId: number | undefined
  try {
    const email = `assignment-${Date.now()}@lms.test`
    const password = 'Assignment-Test-Pass-1'
    const created = await admin.request.post(`${APP_URL}/api/users`, { data: { email, password, firstName: 'Александр', lastName: 'Назначенный', role: 'student', learningCatalogVisibility: 'catalog', trainerAccessMode: 'all', learningAccessMode: 'assigned' } })
    expect(created.status()).toBe(201)
    userId = (await created.json()).doc.id as number
    expect((await learner.request.post(`${APP_URL}/api/users/login`, { data: { email, password } })).status()).toBe(200)
    const lessons = await Promise.all(CONTENT.lessons.slice(0, 2).map(async (lesson) => (await (await admin.request.get(`${APP_URL}/api/lessons?where[slug][equals]=${lesson.slug}&depth=0`)).json()).docs[0] as { id: number; title: string }))
    expect((await learner.request.get(`${APP_URL}/api/lessons/${lessons[0].id}`)).status()).toBe(404)
    const page = await admin.newPage()
    await page.goto(`/admin/learning-access?user=${userId}`)
    await expect(page.getByRole('heading', { name: 'Александр Назначенный' })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Только назначенные материалы/ })).toBeChecked()
    const picker = page.getByRole('region', { name: 'Добавить назначение' })
    await picker.getByLabel('Поиск по названию').fill(CONTENT.roadmap.title)
    await picker.getByRole('button', { name: 'Открыть', exact: true }).click()
    await picker.getByRole('combobox', { name: 'Материал', exact: true }).selectOption('lessons')
    await picker.getByRole('combobox', { name: 'Действие', exact: true }).selectOption('deny')
    await picker.getByLabel('Поиск по названию').fill(CONTENT.lessons[0].title)
    await picker.getByRole('button', { name: 'Закрыть', exact: true }).click()
    await page.getByRole('button', { name: 'Посмотреть доступ по курсам' }).click()
    const preview = page.getByRole('region', { name: 'Предварительный просмотр доступа' })
    await expect(preview.getByText('Открыт частично')).toBeVisible()
    await page.getByRole('button', { name: 'Сохранить назначения' }).click()
    await expect(page.getByText(/Назначения сохранены/)).toBeVisible()
    expect((await learner.request.get(`${APP_URL}/api/lessons/${lessons[0].id}?depth=3`)).status()).toBe(404)
    expect((await learner.request.get(`${APP_URL}/api/lessons/${lessons[1].id}`)).status()).toBe(200)
    const studentPage = await learner.newPage()
    await studentPage.goto(`/courses/${CONTENT.course.slug}`)
    await expect(studentPage.getByRole('heading', { name: CONTENT.course.title, exact: true })).toBeVisible()
    const allowedLinks = studentPage.getByRole('link', { name: new RegExp(CONTENT.lessons[1].title) })
    await expect(allowedLinks.first()).toBeVisible()
    for (const link of await allowedLinks.all()) await expect(link).toHaveAttribute('href', `/lessons/${CONTENT.lessons[1].slug}`)
    await expect(studentPage.getByRole('link', { name: new RegExp(CONTENT.lessons[0].title) })).toHaveCount(0)
    await studentPage.goto(`/lessons/${CONTENT.lessons[0].slug}`)
    await expect(studentPage.getByText(/Доступ к этому уроку пока не назначен/)).toBeVisible()
    await studentPage.goto('/admin/learning-access')
    await expect(studentPage.locator('.learning-access')).toHaveCount(0)
    expect((await learner.request.get(`${APP_URL}/api/manage/learning-access?kind=catalog`)).status()).toBe(403)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 960 })
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => { document.documentElement.dataset.theme = value }, theme)
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        const accessibility = await new AxeBuilder({ page }).include('.learning-access').withRules(['color-contrast', 'label', 'select-name', 'button-name']).analyze()
        expect(accessibility.violations).toEqual([])
        await page.screenshot({ path: testInfo.outputPath(`learning-access-${width}-${theme}.png`), fullPage: true })
      }
    }
  } finally {
    if (userId) await admin.request.delete(`${APP_URL}/api/users/${userId}`)
    await learner.close()
    await admin.close()
  }
})

test('администратор создаёт ученика, открывает карту и курс в дереве, ученик входит выданным паролем, ученик удаляется', async ({ browser }) => {
  const admin = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('admin') })
  const learner = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: { cookies: [], origins: [] } })
  const email = `tree-${Date.now()}@lms.test`
  let created = false
  try {
    const page = await admin.newPage()
    await page.goto('/admin/learning-access')
    await page.getByRole('button', { name: 'Новый ученик' }).click()
    const form = page.getByRole('form', { name: 'Новый ученик' })
    await form.getByLabel('Почта (логин)').fill(email)
    await form.getByLabel('Имя').fill('Дарья')
    await form.getByLabel('Фамилия').fill('Деревьева')
    await form.getByRole('button', { name: 'Создать ученика' }).click()
    const notice = page.getByRole('region', { name: 'Логин и пароль ученика' })
    const text = await notice.getByLabel('Текст для отправки ученику').inputValue()
    created = true
    const password = /Пароль: (\S+)/.exec(text)?.[1]
    expect(password).toBeTruthy()
    await expect(page.getByRole('heading', { name: 'Дарья Деревьева' })).toBeVisible()

    const tree = page.getByRole('region', { name: 'Дерево доступа' })
    await tree.getByLabel('Поиск по роадмапам и курсам').fill(CONTENT.course.title)
    await tree.getByRole('checkbox', { name: CONTENT.course.title, exact: true }).check()
    await expect(tree.getByRole('checkbox', { name: CONTENT.roadmap.title, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Сохранить назначения' }).click()
    await expect(page.getByText(/Назначения сохранены/)).toBeVisible()

    expect((await learner.request.post(`${APP_URL}/api/users/login`, { data: { email, password } })).status()).toBe(200)
    const lessons = await learner.request.get(`${APP_URL}/api/lessons?where[slug][equals]=${CONTENT.lessons[0].slug}&depth=0`)
    expect((await lessons.json()).docs).toHaveLength(1)

    const card = page.getByRole('region', { name: 'Карточка ученика' })
    await card.getByRole('button', { name: 'Удалить' }).click()
    await card.getByLabel('Для подтверждения введите почту ученика').fill(email)
    await card.getByRole('button', { name: 'Удалить навсегда' }).click()
    await expect(page.getByText('Ученик удалён.')).toBeVisible()
    created = false
    expect((await learner.request.post(`${APP_URL}/api/users/login`, { data: { email, password } })).status()).toBe(401)
  } finally {
    if (created) {
      const found = await (await admin.request.get(`${APP_URL}/api/users?where[email][equals]=${encodeURIComponent(email)}&depth=0`)).json() as { docs: { id: number }[] }
      for (const doc of found.docs) await admin.request.delete(`${APP_URL}/api/users/${doc.id}`)
    }
    await learner.close()
    await admin.close()
  }
})

test('заморозка: ученик выходит и видит причину при входе, предупреждение за две недели, разморозка пускает снова', async ({ browser }) => {
  const admin = await browser.newContext({ extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('admin') })
  const learner = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const email = `freeze-${Date.now()}@lms.test`
  let created = false
  const signIn = async (studentPage: Page, password: string) => {
    await studentPage.goto('/login')
    await studentPage.getByLabel('Email').fill(email)
    await studentPage.getByLabel('Пароль').fill(password)
    await studentPage.getByRole('button', { name: 'Войти' }).click()
  }
  try {
    const page = await admin.newPage()
    await page.goto('/admin/learning-access')
    await page.getByRole('button', { name: 'Новый ученик' }).click()
    const form = page.getByRole('form', { name: 'Новый ученик' })
    await form.getByLabel('Почта (логин)').fill(email)
    await form.getByLabel('Имя').fill('Зоя')
    await form.getByLabel('Фамилия').fill('Морозова')
    await form.getByRole('button', { name: 'Создать ученика' }).click()
    const text = await page.getByRole('region', { name: 'Логин и пароль ученика' }).getByLabel('Текст для отправки ученику').inputValue()
    created = true
    const password = /Пароль: (\S+)/.exec(text)?.[1] as string
    const card = page.getByRole('region', { name: 'Карточка ученика' })
    await expect(card.getByText(/^Доступ до \d{2}\.\d{2}\.\d{4}$/)).toBeVisible()

    // Плановая заморозка завтра: ученик видит предупреждение с просьбой написать наставнику.
    await card.getByRole('button', { name: 'Изменить срок доступа' }).click()
    const plan = card.getByRole('form', { name: 'Плановая заморозка' })
    const tomorrow = await plan.getByLabel('Доступ до').getAttribute('min') as string
    await plan.getByLabel('Доступ до').fill(tomorrow)
    await plan.getByRole('button', { name: 'Сохранить дату' }).click()
    await expect(card.getByText(`Доступ до ${tomorrow.split('-').reverse().join('.')}`)).toBeVisible()
    const studentPage = await learner.newPage()
    await signIn(studentPage, password)
    await expect(studentPage.getByRole('complementary', { name: 'Срок доступа' })).toContainText('напишите наставнику')

    await card.getByRole('button', { name: 'Заморозить' }).click()
    const freeze = card.getByRole('form', { name: 'Заморозка аккаунта' })
    await freeze.getByLabel('Бессрочно, до разморозки').check()
    await freeze.getByLabel('Причина').selectOption('no-contact')
    await freeze.getByRole('button', { name: 'Заморозить аккаунт' }).click()
    await expect(card.getByText('Заморожен бессрочно, не выходит на связь. Войти не сможет.')).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Выбор ученика' }).getByText('Заморожен', { exact: true })).toBeVisible()

    await studentPage.reload()
    await expect(studentPage).toHaveURL(/\/login/)
    expect((await (await learner.request.get(`${APP_URL}/api/users/me`)).json()).user).toBeNull()
    await signIn(studentPage, password)
    await expect(studentPage.getByText('Доступ к платформе приостановлен. Чтобы продолжить обучение, напишите наставнику.')).toBeVisible()

    await card.getByRole('button', { name: 'Разморозить' }).click()
    await card.getByRole('form', { name: 'Разморозка аккаунта' }).getByRole('button', { name: 'Разморозить аккаунт' }).click()
    await expect(card.getByText(/^Доступ до \d{2}\.\d{2}\.\d{4}$/)).toBeVisible()
    await signIn(studentPage, password)
    await expect(studentPage).not.toHaveURL(/\/login/)
    await expect(studentPage.getByRole('complementary', { name: 'Срок доступа' })).toHaveCount(0)
  } finally {
    if (created) {
      const found = await (await admin.request.get(`${APP_URL}/api/users?where[email][equals]=${encodeURIComponent(email)}&depth=0`)).json() as { docs: { id: number }[] }
      for (const doc of found.docs) await admin.request.delete(`${APP_URL}/api/users/${doc.id}`)
    }
    await learner.close()
    await admin.close()
  }
})
