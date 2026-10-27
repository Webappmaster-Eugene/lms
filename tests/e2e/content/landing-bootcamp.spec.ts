import { expect, test, type APIRequestContext } from '@playwright/test'

import { USERS } from '../fixtures/data'
import { APP_URL, LANDING_URL, LANDING_USE } from '../fixtures/env'
import { zipOf } from '../../fixtures/zip'

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
  return (await found.json() as { docs: { email: string; name: string | null; submissionCount: number; source: { utmSource: string | null }; entryTaskToken: string | null }[] }).docs
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
  await expect(done).toContainText('письмо с личной ссылкой на входное задание')
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
  const sample = await request.get(`${origin}/bootcamp/samples/nodejs-week-01-node-runtime.pdf`)
  expect(sample.status()).toBe(200)
  expect(sample.headers()['content-type']).toBe('application/pdf')
  expect(llms).not.toMatch(/[—–]/)
})

test('входное задание: личная страница открывается без входа, отдаёт архив и не индексируется', async ({ page, request }) => {
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
    data: { program: 'nodejs', email, name: 'Иван', consent: true, consentVersion: '2026-10-27' },
  })
  expect(sent.status()).toBe(200)
  const [lead] = await adminLeads(request, email)
  const token = lead?.entryTaskToken ?? ''
  expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/)

  const response = await page.goto(`${APP_URL}/entry-task/${token}`)
  expect(response?.status()).toBe(200)
  // Заголовок README не дублирует h1 страницы.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Входное задание буткемпа Node.js')
  await expect(page.locator('main')).toContainText('Иван, ниже условие задания')
  expect(await page.title()).toBe('Входное задание буткемпа - MentorCareer')
  await expect(page.getByRole('heading', { level: 2, name: 'Условие задания' })).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
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
