/**
 * Два снимка учебного кабинета для страницы буткемпа (landing/public/bootcamp/path/bc-lms-*.webp)
 * и координаты меток к ним в landing/src/data/bootcamp.ts.
 *
 *   pnpm exec tsx scripts/brand/bootcamp-screens.ts
 *
 * Снимает прод: программу буткемпа с методичками локально не повторить. Ученик временный
 * (scripts/prod-test-accounts.mjs, домен .invalid, письма не уходят): ему открывается курс буткемпа
 * и проходится первый урок. Учётки удаляются вместе с прогрессом и назначением в конце, даже если
 * съёмка упала. Браузер как в guide-screens.ts: установленный Chrome или путь в BRAND_BROWSER.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { chromium, type Page } from '@playwright/test'
import sharp from 'sharp'

import { markPoint, patchSteps, type Point } from './screen-steps'

const BASE_URL = process.env.PROD_BASE_URL ?? 'https://learn.mentorcareer.ru'
const ENV_FILE = process.env.PROD_TEST_ENV ?? path.join(homedir(), '.config/lms-prod-test/accounts.env')
const OUT = 'landing/public/bootcamp/path'
const SCREENS_JSON = 'landing/src/data/screens.json'
const BOOTCAMP_TS = 'landing/src/data/bootcamp.ts'
const WIDTH = 1440
const HEIGHT = 900

function accounts(command: 'create' | 'delete') {
  const result = spawnSync('node', ['scripts/prod-test-accounts.mjs', command], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`prod-test-accounts ${command}: код ${result.status}`)
}

function readEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(ENV_FILE, 'utf8')
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  )
}

async function api<T>(route: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init
  const res = await fetch(`${BASE_URL}${route}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `JWT ${token}` } : {}) },
  })
  if (!res.ok) throw new Error(`${rest.method ?? 'GET'} ${route}: ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

/** Открывает ученику единственный опубликованный буткемп; имя курса нужно для проверки кадра. */
async function grantBootcamp(env: Record<string, string>) {
  const { token } = await api<{ token: string }>('/api/users/login', { method: 'POST', body: JSON.stringify({ email: env.PROD_ADMIN_EMAIL, password: env.PROD_ADMIN_PASSWORD }) })
  const { docs } = await api<{ docs: { id: number; slug: string; title: string }[] }>('/api/courses?where[isBootcamp][equals]=true&where[isPublished][equals]=true&depth=0&limit=10', { token })
  const [course] = docs
  if (!course || docs.length > 1) throw new Error(`Ожидался один опубликованный буткемп, найдено ${docs.length}: снимок показал бы выбор, а не программу`)
  await api('/api/learning-access-grants', { method: 'POST', token, body: JSON.stringify({ user: Number(env.PROD_STUDENT_ID), target: { relationTo: 'courses', value: course.id }, effect: 'allow', note: 'Съёмка лендинга, учётка удаляется' }) })
  await api('/api/users/logout', { method: 'POST', token })
  return course
}

async function frame(page: Page, file: string) {
  await page.waitForLoadState('networkidle')
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }' })
  await page.evaluate(() => document.fonts.ready)
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } })
  writeFileSync(path.join(OUT, `${file}.webp`), await sharp(png).webp({ quality: 82 }).toBuffer())
  process.stdout.write(`${OUT}/${file}.webp\n`)
}

const hotspots: Record<string, Point[]> = {}
accounts('create')
try {
  const env = readEnv()
  const course = await grantBootcamp(env)
  const browser = await chromium.launch(process.env.BRAND_BROWSER ? { executablePath: process.env.BRAND_BROWSER } : { channel: 'chrome' })
  try {
    const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: WIDTH, height: HEIGHT }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', reducedMotion: 'reduce' })
    // Лендинг светлый; окно установки приложения перекрыло бы экран.
    await context.addInitScript(() => {
      try {
        localStorage.setItem('theme', 'light')
        localStorage.setItem('lms:pwa-install-explained:v1', '1')
      } catch {
        // без хранилища останется светлая тема контекста
      }
    })
    const login = await context.request.post('/api/users/login', { data: { email: env.PROD_STUDENT_EMAIL, password: env.PROD_STUDENT_PASSWORD }, headers: { Origin: BASE_URL } })
    if (!login.ok()) throw new Error(`Вход ученика: ${login.status()}`)
    const page = await context.newPage()

    // Ученик после первой методички: прогресс не нулевой, у следующего урока метка «Следующий».
    const main = page.getByRole('main')
    // Ссылка на методичку недели; свёрнутую неделю сначала раскрываем.
    const manualHref = async (week: string) => {
      const link = main.getByRole('link', { name: new RegExp(`^Методичка ${week}`) }).first()
      if (!(await link.isVisible())) await main.getByRole('button', { name: new RegExp(`^${week}\\.`) }).first().click()
      const href = await link.getAttribute('href')
      if (!href) throw new Error(`В программе ${course.title} нет методички ${week}`)
      return href
    }
    await page.goto(`/bootcamp/${course.slug}`)
    await page.waitForLoadState('networkidle')
    await page.goto(await manualHref('00'))
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Отметить пройденным' }).click()
    await page.getByText('Урок пройден').first().waitFor()

    await page.goto(`/bootcamp/${course.slug}`)
    await page.getByRole('heading', { level: 1, name: course.title }).waitFor()
    await frame(page, 'bc-lms-program')
    // Метки по порядку шагов главы path-manual: пункт меню, неделя-раздел, кнопка следующего урока.
    // Пункт меню и кнопку метка не закрывает: она у края пункта и слева от кнопки.
    const resume = main.getByText('Продолжить', { exact: true }).first().locator('xpath=ancestor::*[self::a or self::button][1]')
    hotspots['bc-lms-program'] = await Promise.all([
      markPoint(page, page.getByRole('navigation', { name: 'Меню платформы' }).getByRole('link', { name: 'Буткемпы', exact: true }), WIDTH, HEIGHT, 'end'),
      markPoint(page, main.getByText(/^00\. /).first(), WIDTH, HEIGHT),
      markPoint(page, resume, WIDTH, HEIGHT, 'before'),
    ])

    await page.goto(await manualHref('01'))
    await page.getByRole('heading', { level: 1, name: /^Методичка 01/ }).waitFor()
    await frame(page, 'bc-lms-manual')
    await context.close()
  } finally {
    await browser.close()
  }
} finally {
  accounts('delete')
}

const screens = JSON.parse(readFileSync(SCREENS_JSON, 'utf8')) as Record<string, { width: number; height: number }>
screens['bc-lms-program'] = { width: WIDTH, height: HEIGHT }
screens['bc-lms-manual'] = { width: WIDTH, height: HEIGHT }
writeFileSync(SCREENS_JSON, `${JSON.stringify(screens, null, 2)}\n`)
writeFileSync(BOOTCAMP_TS, patchSteps(readFileSync(BOOTCAMP_TS, 'utf8'), hotspots, BOOTCAMP_TS))
process.stdout.write(`${SCREENS_JSON}\n${BOOTCAMP_TS}\n`)
