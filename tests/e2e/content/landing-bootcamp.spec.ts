import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { USERS } from '../fixtures/data'
import { APP_URL, LANDING_URL, LANDING_USE } from '../fixtures/env'
import { LEAD_ANSWERS, LEAD_PDF, LEAD_PDF_NEAR_LIMIT } from '../../fixtures/bootcampLead'
import { zipOf } from '../../fixtures/zip'
import { ENTRY_TASKS } from '../../../src/data/bootcamp-entry/tasks'
import { AUTHOR_PROFILES, ORGANIZATION_ID, ORGANIZATION_PROFILES } from '../../../landing/src/config'
import { FORMAT_PATH, GROUP_LIMIT, LAST_CLASS, LAST_CLASS_ISO, PROGRAM_PATH, START, START_ISO, WEEKS } from '../../../landing/src/data/bootcamp'
import { INTERVIEW_QUESTIONS_TOTAL, PROGRAM_WEEKS_DETAILED, weekAnchor } from '../../../landing/src/data/bootcamp-program'

/**
 * Страница буткемпа и форма предзаписи: заявка идёт через тот же путь, что в проде
 * (лендинг → /api/bootcamp/leads → LMS), и сохраняется в базе e2e.
 */
const SITE = 'https://info.mentorcareer.ru'
const PAGE = '/bootcamp/nodejs/'

test.use(LANDING_USE)

async function adminToken(request: APIRequestContext): Promise<string> {
  const login = await request.post(`${APP_URL}/api/users/login`, { headers: { Origin: APP_URL }, data: { email: USERS.admin.email, password: USERS.admin.password } })
  return (await login.json() as { token: string }).token
}

async function adminLeads(request: APIRequestContext, email: string) {
  const token = await adminToken(request)
  const found = await request.get(`${APP_URL}/api/bootcamp-leads?where[email][equals]=${encodeURIComponent(email)}&depth=0`, { headers: { Authorization: `JWT ${token}` } })
  expect(found.status()).toBe(200)
  return (await found.json() as { docs: { email: string; name: string | null; submissionCount: number; source: { utmSource: string | null }; problem: string | null; resume: number | null; fillSeconds: number | null; entryTaskSentAt: string | null; entryTaskToken: string | null; entrySubmissionCount: number | null }[] }).docs
}

/** Анкета так, как её заполняет человек: подписи полей, а не имена. */
async function fillLead(page: Page, email: string) {
  await page.getByRole('textbox', { name: 'Имя' }).fill(LEAD_ANSWERS.name)
  await page.getByRole('textbox', { name: 'Telegram' }).fill(LEAD_ANSWERS.telegram)
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('combobox', { name: 'С чем вы пришли?' }).selectOption(LEAD_ANSWERS.reason)
  await page.getByRole('textbox', { name: 'В чём сейчас проблема?' }).fill(LEAD_ANSWERS.problem)
  await page.getByRole('textbox', { name: 'Ваша история' }).fill(LEAD_ANSWERS.story)
  await page.getByRole('textbox', { name: 'Какой результат будет успехом и к какому сроку?' }).fill(LEAD_ANSWERS.goal)
  await page.getByRole('combobox', { name: 'Насколько срочно?' }).selectOption(LEAD_ANSWERS.urgency)
  await page.getByRole('combobox', { name: 'Сколько часов в неделю готовы уделять?' }).selectOption(LEAD_ANSWERS.hoursPerWeek)
  await page.getByRole('checkbox').check()
  // Сервер не принимает анкету быстрее 15 секунд: часы страницы двигаем, а не ждём.
  await page.clock.fastForward(20_000)
}

test('страница: метаданные, CSP без нарушений, адрес без косой черты ведёт на канонический', async ({ page, request }) => {
  const problems: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()) })
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => console.error(`CSP: ${event.violatedDirective} ${event.blockedURI}`))
  })
  const response = await page.goto(PAGE)
  expect(response?.status()).toBe(200)
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'")
  await expect(page.locator('h1')).toHaveText('Буткемп Node.js: backend, о котором спрашивают на собеседованиях')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}${PAGE}`)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow')
  expect((await page.title()).length).toBeLessThanOrEqual(70)
  const description = await page.locator('meta[name="description"]').getAttribute('content')
  expect(description?.length ?? 0).toBeGreaterThan(70)
  expect(description?.length ?? 0).toBeLessThanOrEqual(160)
  // Предзапись: цена видна, но оплаты на странице нет.
  await expect(page.locator('main')).toContainText('45 000 ₽ за весь поток')
  await expect(page.locator('main')).not.toContainText(/оплатить|купить/i)
  expect(problems).toEqual([])

  const origin = new URL(LANDING_URL).origin
  const bare = await request.get(`${origin}/bootcamp/nodejs?utm_source=tg`, { maxRedirects: 0 })
  expect(bare.status()).toBe(301)
  expect(bare.headers()['location']).toBe('/bootcamp/nodejs/?utm_source=tg')
  expect(await (await request.get(`${origin}/sitemap.xml`)).text()).toContain(`<loc>${SITE}${PAGE}</loc>`)
  expect((await request.get(`${origin}/privacy/`)).status()).toBe(200)
})

test('разметка курса: даты, размер группы и профили наставника совпадают со страницей', async ({ page }) => {
  await page.goto(PAGE)
  type Node = Record<string, unknown> & { '@type': string; '@id'?: string }
  const graph = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((text) => (JSON.parse(text) as { '@graph': Node[] })['@graph'])
  const byType = <T = Node>(type: string) => graph.find((node) => node['@type'] === type) as T | undefined
  const instance = byType<{ hasCourseInstance: { startDate: string; endDate: string; maximumAttendeeCapacity: number } }>('Course')!.hasCourseInstance
  expect(instance).toMatchObject({ startDate: START_ISO, endDate: LAST_CLASS_ISO, maximumAttendeeCapacity: GROUP_LIMIT })
  // В разметку попадает только то, что посетитель видит на странице.
  const main = page.locator('main')
  await expect(main).toContainText(START)
  await expect(main).toContainText(LAST_CLASS)
  await expect(main).toContainText(`до ${GROUP_LIMIT} человек`)

  const sameAs = byType<{ sameAs: string[] }>('Person')!.sameAs
  expect(sameAs).toEqual(AUTHOR_PROFILES)
  expect(new Set(sameAs).size).toBe(sameAs.length)
  expect(sameAs).toEqual(expect.arrayContaining(['https://nadtocheev.ru/', 'https://mentorcareer.ru/mentor', 'https://t.me/eugene_galera']))

  // Организация та же, что на mentorcareer.ru: поисковики собирают её с разных сайтов по @id и ссылкам.
  const organization = byType<{ '@id': string; url: string; sameAs: string[] }>('Organization')
  expect(organization).toMatchObject({ '@id': ORGANIZATION_ID, url: 'https://mentorcareer.ru/' })
  expect(organization?.sameAs).toEqual(ORGANIZATION_PROFILES)
  expect(byType('Course')?.provider).toEqual({ '@id': ORGANIZATION_ID })
  await expect(page.locator('#mentor a[href="https://mentorcareer.ru/mentor"]')).toBeVisible()

  const site = byType('WebSite')
  expect(site?.['@id']).toBe(`${SITE}/#website`)
  expect(byType('WebPage')?.isPartOf).toEqual({ '@id': site?.['@id'] })
})

test('форма: ошибки рядом с полями, анкета с резюме сохраняется, в конце ссылка на Telegram, повтор не плодит дубль', async ({ page, request }) => {
  const email = `lead-${Date.now()}@mail.test`
  await page.clock.install()
  await page.goto(`${PAGE}?utm_source=e2e&utm_medium=test`)
  const submit = page.getByRole('button', { name: 'Оставить заявку' })

  await submit.click()
  const nameField = page.getByRole('textbox', { name: 'Имя' })
  await expect(nameField).toBeFocused()
  await expect(nameField).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#lead-name-error')).toHaveText(/Как к вам обращаться/)
  await expect(page.locator('#lead-telegram-error')).toHaveText(/Укажите Telegram/)
  await expect(page.locator('#lead-email-error')).toHaveText(/Укажите email/)
  await expect(page.locator('#lead-reason-error')).toHaveText(/с чем вы пришли/)
  await expect(page.locator('#lead-problem-error')).toHaveText(/в чём сейчас проблема/)
  await expect(page.locator('#lead-story-error')).toHaveText(/свою историю/)
  await expect(page.locator('#lead-consent-error')).toHaveText(/Отметьте согласие/)

  // Сто раз одно слово проверку длины прошло бы, а связным текстом не считается.
  const problem = page.getByRole('textbox', { name: 'В чём сейчас проблема?' })
  await problem.fill('работа '.repeat(20))
  await expect(page.locator('#lead-problem-count')).toHaveText('139 из 100 знаков')
  await submit.click()
  await expect(page.locator('#lead-problem-error')).toHaveText(/связного текста/)

  await fillLead(page, email.toUpperCase())
  await page.getByRole('textbox', { name: 'Ссылки' }).fill('github.com/ivan')
  await page.locator('#lead-resume').setInputFiles({ name: 'Иван резюме.pdf', mimeType: 'application/pdf', buffer: Buffer.from(LEAD_PDF) })
  await submit.click()

  const done = page.locator('[data-done]')
  await expect(done).toBeVisible()
  await expect(done).toBeFocused()
  await expect(done).toContainText('Заявка сохранена')
  await expect(done).toContainText(email.toUpperCase())
  const telegram = done.getByRole('link', { name: 'Написать в Telegram @eugene_galera' })
  const href = new URL(await telegram.getAttribute('href') ?? '')
  expect(href.origin + href.pathname).toBe('https://t.me/eugene_galera')
  expect(href.searchParams.get('text')).toBe('Здравствуйте! Меня зовут Иван. Заявка на буткемп Node.js: Сменить работу или вырасти в грейде.')

  const [lead] = await adminLeads(request, email)
  expect(lead).toMatchObject({ email, name: 'Иван', submissionCount: 1, source: { utmSource: 'e2e' }, telegram: '@ivan_petrov', reason: 'switch-or-grow', links: 'https://github.com/ivan' })
  expect(lead?.problem).toBe(LEAD_ANSWERS.problem)
  expect(lead?.resume).toBeTruthy()
  expect(lead?.fillSeconds).toBeGreaterThanOrEqual(20)
  // Задание уходит только кнопкой в карточке.
  expect(lead?.entryTaskSentAt ?? null).toBeNull()

  await page.goto(PAGE)
  await fillLead(page, email)
  await submit.click()
  await expect(page.locator('[data-done]')).toBeVisible()
  const again = await adminLeads(request, email)
  expect(again).toHaveLength(1)
  expect(again[0]?.submissionCount).toBe(2)
})

test('форма: быстрее 15 секунд - понятный отказ, ввод остаётся', async ({ page }) => {
  const email = `lead-fast-${Date.now()}@mail.test`
  await page.clock.install()
  await page.goto(PAGE)
  await page.getByRole('textbox', { name: 'Имя' }).fill(LEAD_ANSWERS.name)
  await page.getByRole('textbox', { name: 'Telegram' }).fill(LEAD_ANSWERS.telegram)
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('combobox', { name: 'С чем вы пришли?' }).selectOption(LEAD_ANSWERS.reason)
  await page.getByRole('textbox', { name: 'В чём сейчас проблема?' }).fill(LEAD_ANSWERS.problem)
  await page.getByRole('textbox', { name: 'Ваша история' }).fill(LEAD_ANSWERS.story)
  await page.getByRole('textbox', { name: 'Какой результат будет успехом и к какому сроку?' }).fill(LEAD_ANSWERS.goal)
  await page.getByRole('combobox', { name: 'Насколько срочно?' }).selectOption(LEAD_ANSWERS.urgency)
  await page.getByRole('combobox', { name: 'Сколько часов в неделю готовы уделять?' }).selectOption(LEAD_ANSWERS.hoursPerWeek)
  await page.getByRole('checkbox').check()

  await page.getByRole('button', { name: 'Оставить заявку' }).click()

  await expect(page.locator('[data-status]')).toHaveText(/слишком быстро/)
  await expect(page.getByRole('textbox', { name: 'Ваша история' })).toHaveValue(LEAD_ANSWERS.story)
  await expect(page.locator('[data-done]')).toBeHidden()
})

test('форма: файл почти на 5 МБ проходит через настоящий сервер и прокси лендинга', async ({ page, request }) => {
  const email = `lead-big-${Date.now()}@mail.test`
  await page.clock.install()
  await page.goto(PAGE)
  await fillLead(page, email)
  await page.locator('#lead-resume').setInputFiles({ name: 'Большое резюме.pdf', mimeType: 'application/pdf', buffer: Buffer.from(LEAD_PDF_NEAR_LIMIT) })
  await page.getByRole('button', { name: 'Оставить заявку' }).click()
  await expect(page.locator('[data-done]')).toBeVisible({ timeout: 30_000 })
  const [lead] = await adminLeads(request, email)
  expect(lead?.resume).toBeTruthy()
})

test('форма: неверный файл и ошибка сервера показываются у поля резюме', async ({ page }) => {
  await page.clock.install()
  await page.goto(PAGE)
  await fillLead(page, `lead-file-${Date.now()}@mail.test`)
  const resume = page.locator('#lead-resume')

  await resume.setInputFiles({ name: 'cv.txt', mimeType: 'text/plain', buffer: Buffer.from('резюме') })
  await page.getByRole('button', { name: 'Оставить заявку' }).click()
  await expect(page.locator('#lead-resume-error')).toHaveText(/PDF или DOCX/)
  await expect(resume).toBeFocused()

  // Расширение верное, а содержимое нет: это видит только сервер.
  await resume.setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ исполняемый файл') })
  await page.getByRole('button', { name: 'Оставить заявку' }).click()
  await expect(page.locator('#lead-resume-error')).toHaveText(/PDF или DOCX/)
  await expect(page.locator('[data-done]')).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'В чём сейчас проблема?' })).toHaveValue(LEAD_ANSWERS.problem)
})

test('сбой сети и ошибка сервера: введённое остаётся, ложного успеха нет', async ({ page }) => {
  await page.clock.install()
  await page.goto(PAGE)
  await fillLead(page, `lead-offline-${Date.now()}@mail.test`)
  const status = page.locator('[data-status]')

  await page.route('**/api/bootcamp/leads', (route) => route.abort('internetdisconnected'))
  await page.getByRole('button', { name: 'Оставить заявку' }).click()
  await expect(status).toHaveText(/Нет связи с сервером/)
  await expect(page.locator('[data-done]')).toBeHidden()

  await page.unroute('**/api/bootcamp/leads')
  await page.route('**/api/bootcamp/leads', (route) => route.fulfill({ status: 502, body: '' }))
  await page.getByRole('button', { name: 'Оставить заявку' }).click()
  await expect(status).toHaveText(/сервер ответил 502/)
  await expect(page.getByRole('textbox', { name: 'Email' })).not.toHaveValue('')
  await expect(page.getByRole('textbox', { name: 'Ваша история' })).toHaveValue(LEAD_ANSWERS.story)
  await expect(page.getByRole('checkbox')).toBeChecked()
  await expect(page.getByRole('button', { name: 'Оставить заявку' })).toBeEnabled()

  await page.unroute('**/api/bootcamp/leads')
  await page.getByRole('button', { name: 'Оставить заявку' }).click()
  await expect(page.locator('[data-done]')).toBeVisible()
})

test('путь недели: скриншоты загружаются, шаг выбирается, увеличение возвращает фокус', async ({ page }) => {
  await page.goto(PAGE)
  await expect(page.locator('.bc-path-chapter')).toHaveCount(6)
  for (const image of await page.locator('.bc-path img').all()) {
    await image.scrollIntoViewIfNeeded()
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete ? img.naturalWidth : 0)).toBeGreaterThan(0)
  }
  const review = page.locator('#path-review [data-walkthrough]')
  await review.getByRole('button', { name: 'Ваш ответ', exact: true }).click()
  await expect(review.getByRole('button', { name: 'Шаг 2: Ваш ответ' })).toHaveAttribute('aria-pressed', 'true')
  const zoom = review.getByRole('button', { name: 'Увеличить' })
  await zoom.click()
  await expect(page.locator('.image-dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.image-dialog')).toBeHidden()
  await expect(zoom).toBeFocused()
  // Правило владельца 27.10.2026: только короткий дефис, без длинного тире.
  expect(await page.locator('body').innerText()).not.toMatch(/[—–]/)
  expect(`${await page.title()} ${await page.locator('meta[name="description"]').getAttribute('content')}`).not.toMatch(/[—–]/)
})

test('путь недели на телефоне: снимок крупно у шага, листание, весь экран и касание статичного снимка', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${PAGE}#path-review`)
  const review = page.locator('#path-review [data-walkthrough]')
  const count = review.locator('[data-focus-count]')
  await expect(review).toHaveClass(/focus-mode/)
  await expect(count).toHaveText('Шаг 1 из 3')
  await expect(review.locator('.screen-canvas')).not.toHaveCSS('transform', 'none')
  await expect(review.getByRole('button', { name: 'Показать шаги' })).toBeHidden()
  // Кадр во всю ширину экрана.
  expect((await review.boundingBox())?.width).toBe(390)

  await review.getByRole('button', { name: 'Дальше' }).click()
  await expect(count).toHaveText('Шаг 2 из 3')
  await expect(review.getByRole('button', { name: 'Шаг 2: Ваш ответ' })).toHaveAttribute('aria-pressed', 'true')
  await expect(review.locator('[data-step="1"] p')).toBeVisible()
  await expect(review.locator('[data-step="0"] p')).toBeHidden()
  await review.getByRole('button', { name: 'Назад' }).click()
  await expect(count).toHaveText('Шаг 1 из 3')
  await expect(review.getByRole('button', { name: 'Назад' })).toHaveAttribute('aria-disabled', 'true')
  // Метка третьего шага в середине снимка: окно должно открыться прокрученным к ней.
  await review.getByRole('button', { name: 'Дальше' }).click()
  await review.getByRole('button', { name: 'Дальше' }).click()
  await expect(count).toHaveText('Шаг 3 из 3')

  const full = review.getByRole('button', { name: 'Весь экран' })
  await full.click()
  const dialog = page.locator('.image-dialog')
  await expect(dialog).toBeVisible()
  await expect.poll(() => dialog.locator('.dialog-image-scroll').evaluate((element) => element.scrollLeft + element.scrollTop)).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(full).toBeFocused()

  const extra = page.locator('#path-checks .bc-extra')
  await extra.locator('img').click()
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('img')).toHaveAttribute('src', /bc-gitlab-pipeline\.webp$/)
  await page.keyboard.press('Escape')
  await expect(extra.getByRole('button', { name: 'Увеличить' })).toBeFocused()

  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  // Подсказка про листание видна только на телефоне, длинного тире нет и в ней.
  await expect(page.locator('.bc-sample')).toContainText('проведите по нему пальцем')
  expect(await page.locator('body').innerText()).not.toMatch(/[—–]/)
})

test('программа, формат, оплата, оферта, качество, политика и согласие: свои адреса в карте сайта, ссылки со страницы буткемпа, реквизиты', async ({ page, request }) => {
  await page.goto(PAGE)
  await expect(page.locator('#lead-consent + label a')).toHaveAttribute('href', '/consent/')
  for (const path of ['/bootcamp/nodejs/payment/', '/bootcamp/nodejs/offer/', '/bootcamp/nodejs/quality/']) await expect(page.locator(`main a[href="${path}"]`)).toHaveCount(1)
  for (const path of [PROGRAM_PATH, FORMAT_PATH]) {
    await expect(page.locator(`main a[href="${path}"]`).first()).toBeVisible()
    await expect(page.locator(`footer a[href="${path}"]`)).toHaveCount(1)
  }
  const origin = new URL(LANDING_URL).origin
  const sitemap = await (await request.get(`${origin}/sitemap.xml`)).text()
  for (const path of [PROGRAM_PATH, FORMAT_PATH, '/bootcamp/nodejs/payment/', '/bootcamp/nodejs/offer/', '/bootcamp/nodejs/quality/', '/privacy/', '/consent/']) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(200)
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}${path}`)
    expect((await page.title()).length, path).toBeLessThanOrEqual(70)
    const description = await page.locator('meta[name="description"]').getAttribute('content') ?? ''
    expect(description.length, path).toBeGreaterThan(70)
    expect(description.length, path).toBeLessThanOrEqual(160)
    // Исполнитель виден на каждой странице: закон о защите прав потребителей.
    await expect(page.locator('footer')).toContainText('ИНН')
    expect(`${await page.locator('body').innerText()} ${await page.title()} ${description}`, path).not.toMatch(/[—–]/)
    expect(sitemap).toContain(`<loc>${SITE}${path}</loc>`)
    const bare = await request.get(`${origin}${path.slice(0, -1)}`, { maxRedirects: 0 })
    expect(bare.status(), path).toBe(301)
  }
  const llms = await (await request.get(`${origin}/llms.txt`)).text()
  expect(llms).toContain(`${SITE}/bootcamp/nodejs/payment/`)
  expect(llms).toContain(`${SITE}/bootcamp/nodejs/offer/`)
  expect(llms).toContain(`${SITE}${PROGRAM_PATH}`)
  expect(llms).toContain(`${SITE}${FORMAT_PATH}`)
  expect(llms).toContain(`${SITE}/llms-full.txt`)
  expect(llms).toContain('## Связанные сайты')
  expect(llms).toContain('https://mentorcareer.ru/mentor')
  const sample = await request.get(`${origin}/bootcamp/samples/nodejs-week-01-node-runtime.pdf`)
  expect(sample.status()).toBe(200)
  expect(sample.headers()['content-type']).toBe('application/pdf')
  expect(llms).not.toMatch(/[—–]/)
})

test('программа по неделям: все недели с якорями, оглавление, разметка курса и полный текст для ИИ-поиска', async ({ page, request }) => {
  await page.goto(PROGRAM_PATH)
  const weeks = page.locator('section.bc-week')
  await expect(weeks).toHaveCount(PROGRAM_WEEKS_DETAILED.length)
  for (const week of PROGRAM_WEEKS_DETAILED) {
    await expect(page.locator(`#${weekAnchor(week.number)} h2`)).toHaveText(`Неделя ${week.number}. ${week.title}`)
    await expect(page.locator(`.bc-toc a[href="#${weekAnchor(week.number)}"]`)).toHaveCount(1)
  }
  // Вопросы собеседования на странице все, без ответов: столько же пунктов, сколько в выгрузке методичек.
  const questions = page.locator('section.bc-week ol.bc-list > li')
  await expect(questions).toHaveCount(INTERVIEW_QUESTIONS_TOTAL)

  type Node = Record<string, unknown> & { '@type': string; '@id'?: string }
  const graph = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((text) => (JSON.parse(text) as { '@graph': Node[] })['@graph'])
  const course = graph.find((node) => node['@type'] === 'Course') as { '@id': string; syllabusSections: { name: string; url: string }[] } | undefined
  expect(course?.['@id']).toBe(`${SITE}${PAGE}#course`)
  expect(course?.syllabusSections).toHaveLength(PROGRAM_WEEKS_DETAILED.length)
  // Каждый раздел программы в разметке ведёт на существующий якорь страницы.
  for (const section of course?.syllabusSections ?? []) await expect(page.locator(new URL(section.url).hash)).toHaveCount(1)
  const list = graph.find((node) => node['@type'] === 'ItemList') as { numberOfItems: number } | undefined
  expect(list?.numberOfItems).toBe(PROGRAM_WEEKS_DETAILED.length)
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${SITE}/bootcamp/og-nodejs-program.png`)

  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)

  await page.goto(PAGE)
  const mainGraph = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((text) => (JSON.parse(text) as { '@graph': Node[] })['@graph'])
  const occupational = mainGraph.find((node) => node['@type'] === 'EducationalOccupationalProgram') as { timeToComplete: string; hasCourse: { '@id': string } } | undefined
  expect(occupational?.timeToComplete).toBe(`P${WEEKS}W`)
  expect(occupational?.hasCourse).toEqual({ '@id': `${SITE}${PAGE}#course` })

  const origin = new URL(LANDING_URL).origin
  const full = await request.get(`${origin}/llms-full.txt`)
  expect(full.status()).toBe(200)
  const text = await full.text()
  for (const week of PROGRAM_WEEKS_DETAILED) expect(text).toContain(`### Неделя ${week.number}. ${week.title}`)
  expect(text).not.toMatch(/[—–]/)
  expect(text).not.toMatch(/\(K\d{2}/)
})

test('входное задание: личная страница без входа, проверка в браузере, отправка решения и прежний архив', async ({ page, request }) => {
  const archive = zipOf('README.md', '# Задание')
  const uploaded = await request.post(`${APP_URL}/api/bootcamp-entry-tasks`, {
    headers: { Authorization: `JWT ${await adminToken(request)}`, Origin: APP_URL },
    multipart: {
      file: { name: `entry-${Date.now()}.zip`, mimeType: 'application/zip', buffer: archive },
      _payload: JSON.stringify({ program: 'nodejs', active: true, readme: '# Входное задание\n\n## Условие задания\n\nЗадача 1. Заявка на бронь.' }),
    },
  })
  expect(uploaded.status()).toBe(201)

  const email = `entry-${Date.now()}@example.com`
  const sent = await request.post(`${APP_URL}/api/bootcamp/leads`, {
    headers: { Origin: APP_URL, 'Sec-Fetch-Site': 'same-origin' },
    multipart: { ...LEAD_ANSWERS, program: 'nodejs', email, consent: 'on', consentVersion: '2026-10-27' },
  })
  expect(sent.status()).toBe(200)
  const [lead] = await adminLeads(request, email)
  const token = lead?.entryTaskToken ?? ''
  expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/)

  const response = await page.goto(`${APP_URL}/entry-task/${token}`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Входное задание буткемпа Node.js')
  await expect(page.locator('main')).toContainText('Иван, спасибо за заявку')
  expect(await page.title()).toBe('Входное задание буткемпа - MentorCareer')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  for (const task of ENTRY_TASKS) await expect(page.getByRole('heading', { level: 2, name: new RegExp(task.title) })).toBeVisible()
  expect(await page.locator('main').innerText()).not.toMatch(/[—–]/)

  // Заготовка проверяется на сервере и не проходит: кандидат сразу видит, что тесты работают.
  await page.getByRole('button', { name: 'Проверить' }).first().click()
  await expect(page.getByText('Часть тестов не пройдена').first()).toBeVisible()
  await page.getByRole('button', { name: 'Отправить решение' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Решите хотя бы одну задачу' })).toBeVisible()

  const [price] = ENTRY_TASKS
  const submitted = await request.post(`${APP_URL}/api/entry-task/${token}/submit`, {
    headers: { Origin: APP_URL, 'Sec-Fetch-Site': 'same-origin' },
    data: { solutions: { [price?.slug ?? '']: price?.solutionCode } },
  })
  expect(submitted.status()).toBe(200)
  await page.reload()
  await expect(page.locator('main')).toContainText(`пройдено ${price?.cases.length} из`)
  const [saved] = await adminLeads(request, email)
  expect(saved?.entrySubmissionCount).toBe(1)

  await page.setViewportSize({ width: 375, height: 812 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)

  // Прежнее задание с архивом осталось и отдаётся по той же ссылке, если наставник пришлёт её отдельно.
  const download = await request.get(`${APP_URL}/entry-task/${token}/download`)
  expect(download.status()).toBe(200)
  expect(download.headers()['content-type']).toBe('application/zip')
  expect(Buffer.from(await download.body()).equals(archive)).toBe(true)

  const missing = await page.goto(`${APP_URL}/entry-task/${'A'.repeat(32)}`)
  expect(missing?.status()).toBe(404)
  await expect(page.locator('main')).toContainText('Ссылка на задание не найдена')
})

test('на телефоне нет горизонтальной прокрутки, форма помещается', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(PAGE)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  await page.locator('#apply').scrollIntoViewIfNeeded()
  const box = await page.getByRole('button', { name: 'Оставить заявку' }).last().boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(280)
})
