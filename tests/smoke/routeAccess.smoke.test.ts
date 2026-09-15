import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NextRequest } from 'next/server'

import { middleware } from '@/middleware'

/**
 * Контентные страницы получают `user`, но при `null` не редиректят и рендерят
 * контент дальше — middleware для них единственный заслон. Маршруты берутся
 * с диска, поэтому новая страница попадает под проверку без правки теста.
 */

const APP_DIR = fileURLToPath(new URL('../../src/app', import.meta.url))

const ROUTE_GROUP = /^\(.+\)$/

/** Админка Payload — CMS со своей авторизацией, её проверяет accessControl.smoke. */
const CMS_GROUP = '(payload)'

/** Должен совпадать с PUBLIC_PATHS в middleware. */
const PUBLIC_PAGES = new Set(['/login', '/forgot-password', '/reset-password'])

/**
 * Пропускаются по префиксу `/admin`, отданному админке Payload, поэтому
 * обязаны проверять доступ сами — и строже: middleware видит только куку.
 */
const SELF_GUARDED_PAGES = new Set(['/admin/import-yandex'])

/** Слаг с точкой обязателен: по суффиксу он неотличим от статики. */
const SEGMENT_SAMPLES: Record<string, readonly string[]> = {
  slug: ['deep-react', 'next.js'],
  topicSlug: ['js-core', 'node.js'],
  taskSlug: ['create-counter', 'array.map'],
}

function collectPageRoutes(dir: string, urlPrefix = ''): string[] {
  const routes: string[] = []

  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (!statSync(full).isDirectory()) continue
    if (name === CMS_GROUP) continue

    const segment = ROUTE_GROUP.test(name) ? '' : `/${name}`
    const nested = `${urlPrefix}${segment}`

    if (readdirSync(full).includes('page.tsx')) routes.push(nested || '/')
    routes.push(...collectPageRoutes(full, nested))
  }

  return routes
}

function expand(route: string): string[] {
  const dynamic = route.match(/\[(\w+)\]/)
  if (!dynamic) return [route]

  const samples = SEGMENT_SAMPLES[dynamic[1]]
  if (!samples) throw new Error(`Нет примера значения для сегмента [${dynamic[1]}] в ${route}`)

  return samples.flatMap((sample) => expand(route.replace(dynamic[0], sample)))
}

function visit(pathname: string): 'passed' | 'redirected' {
  const response = middleware(new NextRequest(new URL(`https://learn.mentorcareer.ru${pathname}`)))
  return response.headers.get('location') ? 'redirected' : 'passed'
}

function visitWithToken(pathname: string): 'passed' | 'redirected' {
  const request = new NextRequest(new URL(`https://learn.mentorcareer.ru${pathname}`))
  request.cookies.set('payload-token', 'session-value')
  return middleware(request).headers.get('location') ? 'redirected' : 'passed'
}

const pageRoutes = collectPageRoutes(APP_DIR).sort()
const protectedRoutes = pageRoutes.filter(
  (route) => !PUBLIC_PAGES.has(route) && !SELF_GUARDED_PAGES.has(route),
)

describe('доступ ко всем страницам приложения', () => {
  it('страницы вообще найдены — иначе тест бесполезен', () => {
    expect(pageRoutes.length).toBeGreaterThan(10)
    expect(pageRoutes).toContain('/login')
    expect(pageRoutes).toContain('/profile')
  })

  it('список публичных страниц не разошёлся с реальностью', () => {
    for (const page of PUBLIC_PAGES) {
      expect(pageRoutes, `страница ${page} объявлена публичной, но её нет в src/app`).toContain(page)
    }
  })

  it.each(protectedRoutes)('без токена закрыта: %s', (route) => {
    for (const pathname of expand(route)) {
      expect(visit(pathname), `${pathname} отдаётся без авторизации`).toBe('redirected')
    }
  })

  it.each([...PUBLIC_PAGES])('без токена открыта: %s', (route) => {
    expect(visit(route)).toBe('passed')
  })

  it.each(protectedRoutes)('с токеном открыта: %s', (route) => {
    for (const pathname of expand(route)) {
      expect(visitWithToken(pathname), `${pathname} не пускает даже с сессией`).toBe('passed')
    }
  })

  it.each([...SELF_GUARDED_PAGES])('проверяет доступ сама: %s', (route) => {
    const file = path.join(APP_DIR, '(frontend)', route, 'page.tsx')
    const source = readFileSync(file, 'utf8')

    expect(source, `${route} не запрашивает пользователя`).toMatch(/payload\.auth\(/)
    expect(source, `${route} не проверяет роль — префикс /admin открыт для всех`).toMatch(
      /role !== 'admin'|role === 'admin'/,
    )
    expect(source, `${route} не уводит постороннего со страницы`).toMatch(
      /redirect\(|notFound\(/,
    )
  })

  it('исходный путь сохраняется, чтобы вернуть пользователя после входа', () => {
    const response = middleware(
      new NextRequest(new URL('https://learn.mentorcareer.ru/courses/next.js')),
    )
    const location = new URL(response.headers.get('location') ?? '')

    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('redirect')).toBe('/courses/next.js')
  })
})

describe('статика и служебные пути остаются доступны', () => {
  const alwaysOpen = [
    '/_next/static/chunks/main.js',
    '/images/logo.png',
    '/monaco/vs/loader.js',
    '/favicon.ico',
    '/icon.svg',
    '/manifest.webmanifest',
    '/api/trainer/submit',
    '/admin',
    '/admin/collections/users',
  ]

  it.each(alwaysOpen)('пропускается без токена: %s', (pathname) => {
    expect(visit(pathname)).toBe('passed')
  })
})

describe('регрессия: точка в пути больше не отключает авторизацию', () => {
  const dotted = [
    '/courses/next.js',
    '/lessons/node.js-basics',
    '/roadmaps/frontend.react',
    '/trainer/js-core/array.map',
    '/profile/edit.backup',
  ]

  it.each(dotted)('требует авторизации: %s', (pathname) => {
    expect(visit(pathname)).toBe('redirected')
  })

  it('подделать статику добавлением расширения нельзя', () => {
    expect(visit('/certificates/all.js')).toBe('redirected')
    expect(visit('/leaderboard.css')).toBe('redirected')
  })
})
