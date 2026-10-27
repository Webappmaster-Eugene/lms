import { expect, test, type APIRequestContext } from '@playwright/test'

import { USERS } from '../fixtures/data'
import { APP_URL, LANDING_URL, LANDING_USE } from '../fixtures/env'

/**
 * Страница буткемпа и форма предзаписи: заявка идёт через тот же путь, что в проде
 * (лендинг → /api/bootcamp/leads → LMS), и сохраняется в базе e2e.
 */
const SITE = 'https://info.mentorcareer.ru'
const PAGE = '/bootcamp/nodejs/'

test.use(LANDING_USE)

async function adminLeads(request: APIRequestContext, email: string) {
  const login = await request.post(`${APP_URL}/api/users/login`, { headers: { Origin: APP_URL }, data: { email: USERS.admin.email, password: USERS.admin.password } })
  const { token } = await login.json() as { token: string }
  const found = await request.get(`${APP_URL}/api/bootcamp-leads?where[email][equals]=${encodeURIComponent(email)}&depth=0`, { headers: { Authorization: `JWT ${token}` } })
  expect(found.status()).toBe(200)
  return (await found.json() as { docs: { email: string; name: string | null; submissionCount: number; source: { utmSource: string | null } }[] }).docs
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
  await expect(page.locator('h1')).toHaveText('Буткемп Node.js: backend сервиса проката')
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

test('форма с клавиатуры: ошибки рядом с полями, заявка сохраняется, повтор не плодит дубль', async ({ page, request }) => {
  const email = `lead-${Date.now()}@mail.test`
  await page.goto(`${PAGE}?utm_source=e2e&utm_medium=test`)
  const submit = page.getByRole('button', { name: 'Оставить заявку' })

  await submit.click()
  const emailField = page.getByRole('textbox', { name: 'Email' })
  await expect(emailField).toBeFocused()
  await expect(emailField).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#lead-email-error')).toHaveText(/Укажите email/)
  await expect(page.locator('#lead-consent-error')).toHaveText(/Отметьте согласие/)

  await emailField.fill(email.toUpperCase())
  await page.keyboard.press('Tab')
  await page.keyboard.type('Иван')
  // Скрытое поле для роботов в порядок Tab не входит: следующим идёт согласие.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('checkbox')).toBeFocused()
  await page.keyboard.press('Space')
  // Дальше — ссылка на политику в подписи согласия, затем кнопка.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(submit).toBeFocused()
  await page.keyboard.press('Enter')

  const done = page.locator('[data-done]')
  await expect(done).toBeVisible()
  await expect(done).toBeFocused()
  await expect(done).toContainText(`Заявка сохранена`)
  await expect(done).toContainText(email.toUpperCase())

  const [lead] = await adminLeads(request, email)
  expect(lead).toMatchObject({ email, name: 'Иван', submissionCount: 1, source: { utmSource: 'e2e' } })

  await page.goto(PAGE)
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Оставить заявку' }).click()
  await expect(page.locator('[data-done]')).toBeVisible()
  const again = await adminLeads(request, email)
  expect(again).toHaveLength(1)
  expect(again[0]?.submissionCount).toBe(2)
})

test('сбой сети и ошибка сервера: введённое остаётся, ложного успеха нет', async ({ page }) => {
  await page.goto(PAGE)
  await page.getByRole('textbox', { name: 'Email' }).fill(`lead-offline-${Date.now()}@mail.test`)
  await page.getByRole('checkbox').check()
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

test('оплата, качество, политика и согласие: свои адреса в карте сайта, ссылки со страницы буткемпа, реквизиты', async ({ page, request }) => {
  await page.goto(PAGE)
  await expect(page.locator('#lead-consent + label a')).toHaveAttribute('href', '/consent/')
  for (const path of ['/bootcamp/nodejs/payment/', '/bootcamp/nodejs/quality/']) await expect(page.locator(`main a[href="${path}"]`)).toHaveCount(1)
  const origin = new URL(LANDING_URL).origin
  const sitemap = await (await request.get(`${origin}/sitemap.xml`)).text()
  for (const path of ['/bootcamp/nodejs/payment/', '/bootcamp/nodejs/quality/', '/privacy/', '/consent/']) {
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
  expect(llms).not.toMatch(/[—–]/)
})

test('на телефоне нет горизонтальной прокрутки, форма помещается', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(PAGE)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  await page.locator('#apply').scrollIntoViewIfNeeded()
  const box = await page.getByRole('button', { name: 'Оставить заявку' }).last().boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(280)
})
