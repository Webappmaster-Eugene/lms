import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { parseBootcampLead } from '@/lib/bootcamp-leads'
import { CONSENT_VERSION, FACTS, FAQ, LOG, PATH, PROGRAM } from '../../landing/src/data/bootcamp'
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
    expect(parseBootcampLead({ program: 'nodejs', email: 'a@mail.ru', consent: true, consentVersion: CONSENT_VERSION }).consentVersion).toBe(CONSENT_VERSION)
  })

  it('nginx передаёт заявку в LMS с адресом клиента от Traefik и без своего', () => {
    const location = nginx.match(/location = \/api\/bootcamp\/leads \{([\s\S]*?)\n {4}\}/)?.[1] ?? ''
    expect(location).toContain('limit_except POST')
    expect(location).toMatch(/proxy_pass \$lms_app;/)
    expect(location).toContain('proxy_set_header X-Forwarded-For $http_x_forwarded_for;')
    expect(location).not.toContain('$proxy_add_x_forwarded_for')
    expect(location).not.toContain('add_header')
  })
})

describe('лендинг буткемпа: тексты и путь недели', () => {
  // Правило владельца 27.10.2026: в текстах страницы только короткий дефис.
  it('в текстах страницы, политики и формы нет длинного тире', () => {
    const markup = ['src/pages/bootcamp/nodejs.astro', 'src/pages/privacy.astro'].map((path) => readFileSync(landing(path), 'utf8').split('---').slice(2).join('---'))
    const messages = readFileSync(landing('src/scripts/bootcamp-form.ts'), 'utf8').match(/'[^'\n]*'/g) ?? []
    expect(`${JSON.stringify({ FACTS, FAQ, LOG, PATH, PROGRAM })}${markup.join('')}${messages.join('')}`).not.toMatch(/[—–]/)
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

  it('метки шагов стоят внутри скриншота', () => {
    for (const { id, steps } of PATH) {
      expect(steps.length, id).toBeGreaterThan(0)
      for (const { x, y } of steps) expect([x, y].every((value) => value > 0 && value < 100), id).toBe(true)
    }
  })
})
