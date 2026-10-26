import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Страница под loading.tsx отвечает потоком: заглушка загрузки уходит раньше, чем страница
 * дорендерится. redirect() в ней срабатывает уже после этого — сервер отдаёт 200, браузер
 * показывает заглушку и только потом переходит. Так было с /bootcamp 26.10.2026: e2e смотрел
 * на итоговый адрес и дефекта не видел. Страница, которая перенаправляет, живёт вне такого сегмента.
 */

const APP_DIR = fileURLToPath(new URL('../../src/app', import.meta.url))
const REDIRECT = /\b(?:permanentRedirect|redirect)\(\s*(['"`])(.*?)\1/g

/** Перенаправление, которое под заглушкой допустимо, — с причиной. */
const ALLOWED: Record<string, string> = {
  '(frontend)/(lists)/learning-history/page.tsx': 'испорченные page/course в адресе вручную — клиентский переход приемлем',
}

/** На /login уводит layout (frontend) раньше страницы — её собственная ветка не срабатывает. */
const toLogin = (target: string) => target === '/login' || target.startsWith('/login?')

function streamedPages(dir: string, underLoading = false): string[] {
  const loading = underLoading || existsSync(path.join(dir, 'loading.tsx'))
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return streamedPages(full, loading)
    return loading && name === 'page.tsx' ? [path.relative(APP_DIR, full).split(path.sep).join('/')] : []
  })
}

describe('перенаправления под loading.tsx', () => {
  const pages = streamedPages(APP_DIR)
  const redirecting = pages.flatMap((page) => {
    const targets = [...readFileSync(path.join(APP_DIR, page), 'utf8').matchAll(REDIRECT)].map((match) => match[2] ?? '').filter((target) => !toLogin(target))
    return targets.length ? [{ page, targets }] : []
  })

  it('находит страницы под заглушкой загрузки', () => {
    expect(pages).toContain('(frontend)/(lists)/courses/page.tsx')
  })

  it('страница, которая перенаправляет, не стоит под заглушкой', () => {
    expect(redirecting.filter(({ page }) => !(page in ALLOWED))).toEqual([])
  })

  it('буткемп перенаправляет на свою программу настоящим 307', () => {
    expect(pages.some((page) => page.includes('/bootcamp/'))).toBe(false)
  })

  it('в списке исключений нет устаревших строк', () => {
    expect(Object.keys(ALLOWED).filter((page) => !redirecting.some((item) => item.page === page))).toEqual([])
  })
})
