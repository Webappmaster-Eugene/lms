/**
 * Снимки платформы для инструкции на лендинге (landing/public/guide) и координаты меток-шагов к ним.
 *
 *   E2E_APP_PORT=<порт> node scripts/e2e-server.mjs      # в другом терминале: свежий сид
 *   pnpm exec tsx scripts/brand/guide-screens.ts         # снимки, размеры и метки шагов в guide.ts
 *
 * Пересъёмка нужна после заметной смены интерфейса: иначе инструкция показывает не ту платформу,
 * которую ученик видит после входа. Метки ищутся по элементам страницы, а не задаются на глаз,
 * поэтому сдвиг меню или кнопок их не ломает. Браузер по умолчанию установленный Chrome, другой
 * задаётся путём в BRAND_BROWSER, как в scripts/brand/og.ts. После съёмки - og.ts: картинка
 * лендинга для соцсетей построена на снимке дашборда.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Locator, type Page } from '@playwright/test'
import sharp from 'sharp'

import { CONTENT, USERS } from '../../tests/e2e/fixtures/data'
import { APP_URL } from '../../tests/e2e/fixtures/env'
import { markPoint, patchSteps, type Point } from './screen-steps'

const OUT = 'landing/public/guide'
const SCREENS_JSON = 'landing/src/data/screens.json'
const GUIDE_TS = 'landing/src/data/guide.ts'

const [html, css] = CONTENT.lessons
const NOTE = 'HTML описывает структуру страницы.\nПовторить: теги, атрибуты и вложенность элементов.'

type Shot = {
  path: string
  height: number
  mobile?: boolean
  guest?: boolean
  prepare?: (page: Page) => Promise<void>
  /** Элементы, на которые указывают метки шагов, в порядке шагов в landing/src/data/guide.ts. */
  targets?: (page: Page) => Locator[]
}

const sidebar = (page: Page, name: string) => page.getByRole('navigation', { name: 'Меню платформы' }).getByRole('link', { name, exact: true })
const resume = (page: Page) => page.getByRole('link', { name: /^Продолжить с того места/ }).getByText('Продолжить', { exact: true })

const SHOTS: Record<string, Shot> = {
  login: {
    path: '/login',
    height: 1000,
    guest: true,
    targets: (page) => [page.getByRole('textbox', { name: 'Email' }), page.getByRole('button', { name: 'Войти' }), page.getByRole('link', { name: 'Забыли пароль?' })],
  },
  dashboard: {
    path: '/',
    height: 1000,
    targets: (page) => [sidebar(page, 'Роадмапы'), page.getByRole('combobox', { name: /^Поиск/ }), resume(page)],
  },
  roadmap: {
    path: `/roadmaps/${CONTENT.roadmap.slug}`,
    height: 1180,
    targets: (page) => [
      page.getByRole('link', { name: /^(Начать|Продолжить)$/ }).first(),
      page.getByRole('tablist', { name: 'Вид роадмапа' }),
      page.getByRole('button', { name: 'Открыть тему «Веб-основы»' }),
    ],
  },
  courses: {
    path: '/courses',
    height: 680,
    targets: (page) => [page.getByRole('searchbox', { name: 'Найти курс по названию' }), page.getByRole('button', { name: /^В процессе/ }), page.getByRole('main').getByRole('link', { name: new RegExp(`^${CONTENT.course.title}`) })],
  },
  course: { path: `/courses/${CONTENT.course.slug}`, height: 728 },
  lesson: {
    path: `/lessons/${css.slug}`,
    height: 876,
    targets: (page) => [page.getByText('ключевые понятия урока'), page.getByRole('button', { name: 'Отметить пройденным' }), page.getByRole('link', { name: /^Следующий урок/ })],
  },
  'lesson-notes': {
    path: `/lessons/${css.slug}`,
    height: 1120,
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Мои заметки' }).click()
      await page.getByRole('textbox', { name: /заметк/i }).first().fill('Каскад: важность, специфичность, порядок.\nПроверить в DevTools, какое правило победило.')
    },
    targets: (page) => [page.getByRole('button', { name: 'Сохранить' }).first(), page.getByRole('button', { name: 'В сохранённое' }), page.getByRole('textbox', { name: 'Вопрос к уроку' })],
  },
  notes: { path: '/notes', height: 680 },
  saved: { path: '/saved', height: 680 },
  trainer: {
    path: `/trainer/${CONTENT.topic.slug}/${CONTENT.task.slug}`,
    height: 1000,
    prepare: async (page) => {
      await page.locator('.monaco-editor').first().waitFor()
    },
    targets: (page) => [page.getByRole('button', { name: 'Условие', exact: true }), page.getByRole('button', { name: 'Запустить', exact: true }), page.getByRole('button', { name: 'Отправить', exact: true })],
  },
  profile: {
    path: '/profile',
    height: 1000,
    targets: (page) => [page.getByText('Баллов', { exact: true }), page.getByRole('img', { name: /^Календарь занятий/ }), sidebar(page, 'Сертификаты')],
  },
  help: {
    path: '/help',
    height: 934,
    targets: (page) => [page.getByRole('textbox', { name: 'Тема' }), page.getByRole('textbox', { name: 'Сообщение' }), page.getByRole('button', { name: 'Отправить', exact: true })],
  },
  mobile: {
    path: '/',
    height: 844,
    mobile: true,
    targets: (page) => [
      page.getByRole('navigation', { name: 'Основная навигация' }),
      page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Ещё' }),
      resume(page),
    ],
  },
}

/** Состояние ученика как у человека после первого урока: пройденный урок, заметка, закладка, начатый второй урок. */
// Повторный запуск на той же базе ничего не ломает: уже сделанные шаги пропускаются.
async function prepareStudent(page: Page) {
  await page.goto(`/lessons/${html.slug}`)
  await page.waitForLoadState('networkidle')
  const bookmark = page.getByRole('button', { name: 'В сохранённое', exact: true })
  if (await bookmark.isVisible()) await bookmark.click()
  await page.getByRole('button', { name: 'Мои заметки' }).click()
  await page.getByRole('textbox', { name: /заметк/i }).first().fill(NOTE)
  const save = page.getByRole('button', { name: 'Сохранить' }).first()
  // Кнопка неактивна, если такой текст уже сохранён.
  if (await save.isEnabled()) {
    await save.click()
    await page.getByText(/Сохранено/).first().waitFor()
  }
  const complete = page.getByRole('button', { name: 'Отметить пройденным' })
  if (await complete.isVisible()) await complete.click()
  await page.getByText('Урок пройден').first().waitFor()
  await page.goto(`/lessons/${css.slug}`)
  await page.waitForLoadState('networkidle')
}

const browser = await chromium.launch(process.env.BRAND_BROWSER ? { executablePath: process.env.BRAND_BROWSER } : { channel: 'chrome' })
const screens = JSON.parse(readFileSync(SCREENS_JSON, 'utf8')) as Record<string, { width: number; height: number }>
const hotspots: Record<string, Point[]> = {}
mkdirSync(OUT, { recursive: true })

try {
  const contextOptions = { baseURL: APP_URL, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light' as const, reducedMotion: 'reduce' as const }
  const student = await browser.newContext({ ...contextOptions, viewport: { width: 1440, height: 1000 } })
  const login = await student.request.post('/api/users/login', { data: { email: USERS.student.email, password: USERS.student.password }, headers: { Origin: APP_URL } })
  if (!login.ok()) throw new Error(`Вход ученика: ${login.status()} ${await login.text()}`)
  await prepareStudent(await student.newPage())
  const cookies = await student.cookies()

  for (const [name, shot] of Object.entries(SHOTS)) {
    const width = shot.mobile ? 390 : 1440
    const context = await browser.newContext({ ...contextOptions, viewport: { width, height: shot.height }, isMobile: shot.mobile, hasTouch: shot.mobile })
    if (!shot.guest) await context.addCookies(cookies)
    // Лендинг светлый, поэтому и снимки в светлой теме. Окно установки приложения перекрыло бы экран.
    await context.addInitScript(() => {
      try {
        localStorage.setItem('theme', 'light')
        localStorage.setItem('lms:pwa-install-explained:v1', '1')
      } catch {
        // без хранилища останется системная тема, её задаёт colorScheme контекста
      }
    })
    const page = await context.newPage()
    await page.goto(shot.path)
    await page.waitForLoadState('networkidle')
    await shot.prepare?.(page)
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }' })
    await page.evaluate(() => document.fonts.ready)
    const png = await page.screenshot({ clip: { x: 0, y: 0, width, height: shot.height } })
    const file = path.join(OUT, `${name}.webp`)
    writeFileSync(file, await sharp(png).webp({ quality: 82 }).toBuffer())
    screens[name] = { width, height: shot.height }
    if (shot.targets) hotspots[name] = await Promise.all(shot.targets(page).map((target) => markPoint(page, target, width, shot.height)))
    process.stdout.write(`${file}\n`)
    await context.close()
  }
} finally {
  await browser.close()
}

writeFileSync(SCREENS_JSON, `${JSON.stringify(screens, null, 2)}\n`)
writeFileSync(GUIDE_TS, patchSteps(readFileSync(GUIDE_TS, 'utf8'), hotspots, GUIDE_TS))
process.stdout.write(`${SCREENS_JSON}\n${GUIDE_TS}\n`)
