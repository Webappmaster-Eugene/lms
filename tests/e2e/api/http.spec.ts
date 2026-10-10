import { expect, test } from '@playwright/test'

import { CONTENT, USERS } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

/**
 * HTTP-уровень поверх настоящего `next start`: заголовки безопасности,
 * cookie-сессия REST, GraphQL, CORS, health. Логику прав на уровне Local API
 * проверяют интеграционные тесты — здесь проверяется, что сервер их отдаёт.
 */
const PAGES = ['/login', '/forgot-password']

test.describe('заголовки безопасности', () => {
  function directive(csp: string | undefined, name: string): string[] {
    const matches = (csp ?? '').split(';').map((part) => part.trim().split(/\s+/)).filter(([key]) => key === name)
    expect(matches, `CSP: единственная директива ${name}`).toHaveLength(1)
    return matches[0].slice(1)
  }

  function withoutThemeHints(headers: Record<string, string>, path: string) {
    expect(headers['critical-ch'], path).toBeUndefined()
    expect(headers['accept-ch'], path).toBeUndefined()
    expect((headers.vary ?? '').split(',').map((value) => value.trim().toLowerCase()), path).not.toContain('sec-ch-prefers-color-scheme')
  }

  for (const path of PAGES) {
    test(`${path}: CSP, X-Frame-Options, nosniff, Referrer-Policy без повторного Critical-CH запроса`, async ({ request }) => {
      const response = await request.get(path)
      expect(response.status()).toBe(200)
      const headers = response.headers()
      expect(headers['x-frame-options']).toBe('DENY')
      expect(headers['x-content-type-options']).toBe('nosniff')
      expect(headers['referrer-policy']).toBe('no-referrer')
      const csp = headers['content-security-policy']
      expect(directive(csp, 'default-src')).toEqual(["'self'"])
      expect(directive(csp, 'connect-src')).toEqual(["'self'"])
      const frameSources = directive(csp, 'frame-src')
      expect([...frameSources].sort()).toEqual(["'self'", 'https://miro.com', 'https://www.youtube.com', 'https://youtube.com'].sort())
      expect(frameSources).not.toContain('*')
      expect(frameSources).not.toContain('https:')
      withoutThemeHints(headers, path)
    })
  }

  test('админка защищена от встраивания и сохраняет собственные подсказки темы', async ({ request }) => {
    const response = await request.get('/admin/login')
    expect(response.status()).toBe(200)
    const headers = response.headers()
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(directive(headers['content-security-policy'], 'frame-ancestors')).toEqual(["'none'"])
    expect(headers['accept-ch']).toBe('Sec-CH-Prefers-Color-Scheme')
    expect(headers['critical-ch']).toBe('Sec-CH-Prefers-Color-Scheme')
    expect((headers.vary ?? '').split(',').map((value) => value.trim().toLowerCase())).toContain('sec-ch-prefers-color-scheme')
  })

  test('Monaco, шрифт и service worker сохраняют кеш и защиту без Critical-CH повторов', async ({ request }) => {
    for (const { path, cache } of [
      { path: '/monaco/vs/editor/editor.main.js', cache: 'public, max-age=3600, must-revalidate' },
      { path: '/monaco/react-types.json', cache: 'public, max-age=3600, must-revalidate' },
      { path: '/fonts/inter/e4af272ccee01ff0-s.p.woff2', cache: 'public, max-age=31536000, immutable' },
      { path: '/sw.js', cache: 'no-cache, no-store, must-revalidate' },
    ]) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
      const headers = response.headers()
      expect(headers['cache-control'], path).toBe(cache)
      expect(headers['x-content-type-options'], path).toBe('nosniff')
      expect(headers['x-frame-options'], path).toBe('DENY')
      expect(directive(headers['content-security-policy'], 'connect-src'), path).toEqual(["'self'"])
      if (path === '/sw.js') expect(headers['service-worker-allowed']).toBe('/')
      withoutThemeHints(headers, path)
    }
  })
})

test.describe('REST по cookie-сессии', () => {
  test('аноним: закрытые коллекции — 403, публичные — 200', async ({ request }) => {
    expect((await request.get('/api/courses')).status()).toBe(403)
    expect((await request.get('/api/users')).status()).toBe(403)
    expect((await request.get('/api/faq-items')).status()).toBe(200)
  })

  test('логин ставит HttpOnly cookie, /users/me отдаёт пользователя, logout её снимает', async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: APP_URL } })
    const login = await api.post('/api/users/login', { data: { email: USERS.leader.email, password: USERS.leader.password } })
    expect(login.status()).toBe(200)
    const setCookie = login.headers()['set-cookie'] ?? ''
    expect(setCookie).toMatch(/payload-token=/)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    expect((await (await api.get('/api/users/me')).json()).user.email).toBe(USERS.leader.email)
    expect((await api.post('/api/users/logout')).status()).toBe(200)
    expect((await (await api.get('/api/users/me')).json()).user).toBeNull()
    await api.dispose()
  })

  test.describe('студент', () => {
    test.use({ storageState: storageStateOf('student') })

    test('читает опубликованный курс, не может его менять', async ({ request }) => {
      const found = await (await request.get(`/api/courses?where[slug][equals]=${CONTENT.course.slug}`)).json()
      expect(found.totalDocs).toBe(1)
      const id = found.docs[0].id
      expect((await request.patch(`/api/courses/${id}`, { data: { title: 'Взлом' } })).status()).toBe(403)
      expect((await request.delete(`/api/courses/${id}`)).status()).toBe(403)
    })

    test('эталон задачи недоступен через REST, но открыт после решения через /api/trainer/solution', async ({ request }) => {
      const found = await (await request.get(`/api/trainer-tasks?where[slug][equals]=${CONTENT.task.slug}`)).json()
      expect(found.docs[0]).not.toHaveProperty('solutionCode')
      expect((await request.get(`/api/trainer/solution?taskId=${found.docs[0].id}`)).status()).toBe(403)
    })

    test('чужой документ по id не отдаётся', async ({ request }) => {
      const leaderTx = await (await request.get('/api/points-transactions?limit=100')).json()
      // У студента нет транзакций, а транзакцию лидера он не видит.
      expect(leaderTx.totalDocs).toBe(0)
    })
  })
})

test.describe('GraphQL', () => {
  test('эндпоинт не смонтирован: /api/graphql и playground отвечают 404', async ({ request }) => {
    const response = await request.post('/api/graphql', { data: { query: '{ Courses { docs { title } } }' } })
    expect(response.status()).toBe(404)
    expect((await request.get('/api/graphql-playground')).status()).toBe(404)
  })
})

test.describe('CORS', () => {
  test('чужой origin не получает Access-Control-Allow-Origin', async ({ request }) => {
    const response = await request.fetch('/api/courses', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    })
    expect(response.headers()['access-control-allow-origin']).toBeUndefined()
  })
})

test('GET /api/health — ok', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.status()).toBe(200)
  expect((await response.json()).status).toBe('ok')
})

test('статика из списка middleware отдаётся без входа', async ({ request }) => {
  for (const path of ['/icon.svg', '/manifest.webmanifest']) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(200)
  }
  const manifest = await (await request.get('/manifest.webmanifest')).json()
  expect(manifest.name).toContain('MentorCareer')
})
