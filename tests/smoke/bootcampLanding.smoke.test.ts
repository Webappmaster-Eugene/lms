import { readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { ENTRY_TASK_REVIEW_DAYS } from '@/lib/bootcamp-entry-task'
import { BOOTCAMP_LEAD_HOURS, BOOTCAMP_LEAD_REASONS, BOOTCAMP_LEAD_URGENCIES, LEAD_ANSWER_LIMITS, LEAD_LINKS_MAX, LEAD_RESUME_MAX_BYTES, parseBootcampLead } from '@/lib/bootcamp-leads'
import { LEAD_ANSWERS } from '../fixtures/bootcampLead'
import * as leadForm from '../../landing/src/data/bootcamp-form'
import { AUDIENCE, CONSENT_VERSION, ENTRY_REVIEW_DAYS, FACTS, FAQ, LOG, OFFER_VERSION, PAINS, PATH, PRICE, PROGRAM, PROGRAM_KEY, SAMPLE_MANUAL, SAMPLE_QUESTIONS } from '../../landing/src/data/bootcamp'
import { AUTHOR_PROFILES } from '../../landing/src/config'
import { OPERATOR } from '../../landing/src/data/privacy'
import screens from '../../landing/src/data/screens.json'

const landing = (path: string) => new URL(`../../landing/${path}`, import.meta.url)
const nginx = readFileSync(landing('nginx.conf'), 'utf8')

/** Ширина и высота WebP из заголовка: с потерями (VP8), без потерь (VP8L) и расширенный (VP8X). */
function webpSize(file: Buffer): { width: number; height: number } {
  const chunk = file.toString('ascii', 12, 16)
  if (chunk === 'VP8 ') return { width: file.readUInt16LE(26) & 0x3fff, height: file.readUInt16LE(28) & 0x3fff }
  if (chunk === 'VP8L') {
    const bits = file.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') return { width: file.readUIntLE(24, 3) + 1, height: file.readUIntLE(27, 3) + 1 }
  throw new Error(`не WebP: ${chunk}`)
}

describe('лендинг буткемпа: форма предзаписи', () => {
  // Без оператора в политике собирать заявки нельзя (152-ФЗ, ст. 18.1): тест не пускает выкат.
  it('в политике указан оператор персональных данных', () => {
    for (const key of ['name', 'status', 'inn', 'address', 'email'] as const) {
      expect(OPERATOR[key].trim(), `landing/src/data/privacy.ts: заполните OPERATOR.${key}`).not.toBe('')
    }
    // ИНН физлица — 12 цифр; у организации 10, но тогда в политике нужен ещё ОГРН.
    expect(OPERATOR.inn).toMatch(/^\d{12}$/)
  })

  it('версию согласия со страницы принимает сервер', () => {
    expect(parseBootcampLead({ ...LEAD_ANSWERS, program: PROGRAM_KEY, email: 'a@mail.ru', consent: true, consentVersion: CONSENT_VERSION }).consentVersion).toBe(CONSENT_VERSION)
  })

  // Лендинг - отдельный пакет: варианты и пороги формы записаны в нём ещё раз.
  it('варианты и пороги анкеты совпадают с тем, что принимает сервер', () => {
    expect(leadForm.LEAD_REASONS).toEqual(BOOTCAMP_LEAD_REASONS)
    expect(leadForm.LEAD_URGENCIES).toEqual(BOOTCAMP_LEAD_URGENCIES)
    expect(leadForm.LEAD_HOURS).toEqual(BOOTCAMP_LEAD_HOURS)
    expect(leadForm.LEAD_ANSWER_LIMITS).toEqual(LEAD_ANSWER_LIMITS)
    expect(leadForm.LEAD_LINKS_MAX).toBe(LEAD_LINKS_MAX)
    expect(leadForm.LEAD_RESUME_MAX_BYTES).toBe(LEAD_RESUME_MAX_BYTES)
  })

  it('форма ведёт в личный Telegram наставника, тот же адрес, что в профилях автора', () => {
    expect(leadForm.PERSONAL_TELEGRAM.url).toBe(`https://t.me/${leadForm.PERSONAL_TELEGRAM.handle}`)
    expect(AUTHOR_PROFILES).toContain(leadForm.PERSONAL_TELEGRAM.url)
  })

  // Форма шлёт ключ программы, а цену и редакцию оферты LMS берёт из программы в CMS.
  // Программу заводит миграция, новые редакции оферты ставят миграции данных: значения
  // должны совпадать с тем, что видит посетитель.
  it('форма шлёт ключ программы, миграции дают программе цену и оферту страницы', () => {
    const page = readFileSync(landing('src/pages/bootcamp/nodejs.astro'), 'utf8')
    expect(page).toMatch(/data-lead-form data-program=\{PROGRAM_KEY\}/)
    expect(readFileSync(landing('src/scripts/bootcamp-form.ts'), 'utf8')).toContain("data.set('program', form.dataset.program")
    const migrations = new URL('../../src/migrations/', import.meta.url)
    const migration = readFileSync(new URL('20261031_225020_bootcamp_programs.ts', migrations), 'utf8')
    const seed = migration.match(/VALUES \(([\s\S]*?)\) ON CONFLICT/)?.[1] ?? ''
    expect(seed).toContain(`'${PROGRAM_KEY}'`)
    expect(seed).toContain(`, ${PRICE.value * 100}, `)
    // Последняя миграция, которая ставит редакцию оферты, ставит редакцию страницы.
    const ups = readdirSync(migrations).filter((name) => name.endsWith('.ts') && name !== 'index.ts').sort()
      .map((name) => readFileSync(new URL(name, migrations), 'utf8').split('export async function down')[0] ?? '')
      .filter((up) => up.includes('"offer_version"'))
    expect(ups.at(-1)).toContain(`'${OFFER_VERSION}'`)
  })

  it('срок ответа на входное задание тот же, что обещают письмо и страница задания в LMS', () => {
    expect(ENTRY_REVIEW_DAYS).toBe(`${ENTRY_TASK_REVIEW_DAYS} дней`)
  })

  it('nginx передаёт заявку в LMS с адресом клиента от Traefik и без своего', () => {
    const location = nginx.match(/location = \/api\/bootcamp\/leads \{([\s\S]*?)\n {4}\}/)?.[1] ?? ''
    expect(location).toContain('limit_except POST')
    // Анкета и файл резюме до 5 МБ: меньше - nginx оборвёт заявку с резюме.
    expect(location).toContain('client_max_body_size 6m;')
    expect(location).toMatch(/proxy_pass \$lms_app;/)
    expect(location).toContain('proxy_set_header X-Forwarded-For $http_x_forwarded_for;')
    expect(location).not.toContain('$proxy_add_x_forwarded_for')
    expect(location).not.toContain('add_header')
  })
})

describe('лендинг буткемпа: тексты и путь недели', () => {
  // Правило владельца 27.10.2026: в текстах страницы только короткий дефис.
  it('в текстах страницы, политики и формы нет длинного тире', () => {
    const pages = ['src/pages/bootcamp/nodejs.astro', 'src/pages/bootcamp/nodejs/payment.astro', 'src/pages/bootcamp/nodejs/offer.astro', 'src/pages/bootcamp/nodejs/quality.astro', 'src/pages/privacy.astro', 'src/pages/consent.astro', 'src/components/BootcampFooter.astro']
    const markup = pages.map((path) => readFileSync(landing(path), 'utf8').split('---').slice(2).join('---'))
    // Во фронтматтере страниц оплаты и ИИ-файла тексты тоже публичные: вопросы, описания, llms.txt.
    const frontmatter = ['src/pages/bootcamp/nodejs/payment.astro', 'src/pages/bootcamp/nodejs/offer.astro', 'src/pages/llms.txt.ts'].map((path) => (readFileSync(landing(path), 'utf8').match(/'[^'\n]*'|`[^`]*`/g) ?? []).join(''))
    markup.push(...frontmatter)
    const messages = readFileSync(landing('src/scripts/bootcamp-form.ts'), 'utf8').match(/'[^'\n]*'/g) ?? []
    expect(`${JSON.stringify({ AUDIENCE, FACTS, FAQ, LOG, PAINS, PATH, PROGRAM, SAMPLE_QUESTIONS })}${markup.join('')}${messages.join('')}`).not.toMatch(/[—–]/)
  })

  it('методичка-пример лежит в public, это PDF и лёгкий для телефона', () => {
    const file = landing(`public${SAMPLE_MANUAL.href}`)
    expect(readFileSync(file).subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(statSync(file).size).toBeLessThan(3 * 1024 * 1024)
  })

  it('у каждого скриншота пути есть файл с размерами из screens.json и нет лишних файлов', () => {
    const sizes: Record<string, { width: number; height: number }> = screens
    const names = PATH.flatMap((chapter) => [chapter.screen, ...(chapter.extra ? [chapter.extra.screen] : [])])
    for (const name of names) {
      expect(sizes[name], `screens.json: нет размеров ${name}`).toBeDefined()
      expect(webpSize(readFileSync(landing(`public/bootcamp/path/${name}.webp`))), name).toEqual(sizes[name])
    }
    expect(readdirSync(landing('public/bootcamp/path')).sort()).toEqual(names.map((name) => `${name}.webp`).sort())
  })

  // Страница-каталог отвечает только адресом со слешем: nginx и тестовый сервер уводят 301 с адреса без него.
  it('каждая страница из карты сайта перенаправляется со слешем и в nginx, и в тестовом сервере', () => {
    const sitemap = readFileSync(landing('src/pages/sitemap.xml.ts'), 'utf8')
    const pages = [...(sitemap.match(/const PAGES = \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'\/([^']+)\/'/g)].map((match) => match[1] ?? '')
    expect(pages).toEqual(expect.arrayContaining(['bootcamp/nodejs', 'bootcamp/nodejs/payment', 'bootcamp/nodejs/offer', 'bootcamp/nodejs/quality', 'privacy', 'consent']))
    const nginxPages = nginx.match(/location ~ \^\/\(([^)]*)\)\$/)?.[1]?.split('|') ?? []
    const serverPages = readFileSync(new URL('../../scripts/landing-server.mjs', import.meta.url), 'utf8').match(/url\.match\(\/\^\\\/\(([^)]*)\)/)?.[1]?.replaceAll('\\/', '/').split('|') ?? []
    expect(nginxPages.sort()).toEqual([...pages].sort())
    expect(serverPages.sort()).toEqual([...pages].sort())
  })

  it('nginx не пишет журнал запросов с IP посетителей: политика обещает только журнал Traefik', () => {
    expect(nginx).toMatch(/^\s*access_log off;/m)
  })

  it('метки шагов стоят внутри скриншота', () => {
    for (const { id, steps } of PATH) {
      expect(steps.length, id).toBeGreaterThan(0)
      for (const { x, y } of steps) expect([x, y].every((value) => value > 0 && value < 100), id).toBe(true)
    }
  })
})
