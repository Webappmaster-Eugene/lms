import { describe, expect, it } from 'vitest'
import type { ErrorEvent } from '@sentry/nextjs'
import { redactData, redactText, redactUrlPath } from '@/lib/error-reporting/redact'
import { scrubBreadcrumb, scrubEvent } from '@/lib/error-reporting/scrub-event'

describe('очистка текста ошибок', () => {
  it.each([
    ['student@example.test не найден', 'student@example.test'],
    ['Failed query: select "id" from "users" where "reset_password_token" = $1\nparams: syntheticResetSecret', 'syntheticResetSecret'],
    ['connect ECONNREFUSED postgres://lms:dbSecretPass@lms-mentor-db:5432/lms_platform', 'dbSecretPass'],
    ['GET https://disk.yandex.ru/file?sign=signedSecret&ts=1 failed', 'signedSecret'],
    ['Authorization: Bearer abc.def.ghi', 'abc.def.ghi'],
    ['cookie=payload-token=eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.c2lnbmF0dXJl', 'eyJhbGciOiJIUzI1NiJ9'],
    ['resetPasswordToken: plainResetToken', 'plainResetToken'],
    ['body {"email":"x","password":"jsonPassword"}', 'jsonPassword'],
    ["{'refresh_token': 'quotedRefresh'}", 'quotedRefresh'],
    ['GET /callback access_token=oauthAccess', 'oauthAccess'],
    ['x-api-key: headerApiKey', 'headerApiKey'],
  ])('убирает секрет из «%s»', (input, secret) => {
    expect(redactText(input)).not.toContain(secret)
  })

  it('длинный текст без пробелов чистится за линейное время, а не блокирует процесс', () => {
    for (const input of ['a'.repeat(200_000), `${'a'.repeat(100_000)}@${'b'.repeat(100_000)}`, 'a.'.repeat(100_000), `token="${'a'.repeat(200_000)}`]) {
      const started = performance.now()
      redactText(input)
      expect(performance.now() - started).toBeLessThan(1_000)
    }
  })

  it('обычный текст ошибки не портит', () => {
    expect(redactText('Cannot read properties of undefined (reading "design")')).toBe('Cannot read properties of undefined (reading "design")')
    expect(redactText('Письмо ученику student@example.test не ушло')).toBe('Письмо ученику [redacted email] не ушло')
  })

  it('оставляет из SQL сам запрос: по нему находится место в коде', () => {
    const text = redactText('Failed query: select "id" from "users" where "email" = $1\nparams: a@b.ru')
    expect(text).toContain('select "id" from "users"')
    expect(text).toContain('params: [redacted]')
  })

  it('из адреса страницы убирает query и hash, путь оставляет', () => {
    expect(redactUrlPath('/reset-password?token=secretToken#x')).toBe('/reset-password?[redacted]')
    expect(redactUrlPath('https://learn.mentorcareer.ru/courses/react?utm=1')).toBe('https://learn.mentorcareer.ru/courses/react?[redacted]')
    expect(redactUrlPath('/courses/react')).toBe('/courses/react')
  })

  it('прячет токены в самом пути: комната собеседования пускает любого, кто знает ссылку', () => {
    expect(redactUrlPath('/trainer/interview/3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b')).toBe('/trainer/interview/[token]')
    expect(redactUrlPath('/api/trainer/preview/Xk9aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT/index.html')).toBe('/api/trainer/preview/[token]/index.html')
    expect(redactText('GET https://learn.mentorcareer.ru/trainer/interview/3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b failed')).toBe('GET https://learn.mentorcareer.ru/trainer/interview/[token] failed')
  })

  it('слаги курсов и уроков в пути не трогает', () => {
    for (const path of ['/courses/react-hooks-advanced-patterns-for-production', '/lessons/lesson-12-state-management-2024', '/trainer/go-programming/go-sum-json', '/manage/broadcasts/12/edit']) {
      expect(redactUrlPath(path)).toBe(path)
    }
  })

  it('в данных контекста вырезает чувствительные ключи целиком и чистит строки', () => {
    expect(redactData({ password: 'p', nested: { email: 'a@b.ru', note: 'write to a@b.ru' }, count: 3 })).toEqual({
      password: '[redacted]',
      nested: { email: '[redacted]', note: 'write to [redacted email]' },
      count: 3,
    })
  })
})

describe('beforeSend Sentry', () => {
  function event(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
    return {
      type: undefined,
      message: 'Письмо для student@example.test не ушло',
      exception: { values: [{ type: 'Error', value: 'token=leakedToken', stacktrace: { frames: [{ filename: 'a.js', vars: { password: 'x' }, abs_path: 'https://learn.mentorcareer.ru/_next/a.js?v=1' }] } }] },
      request: {
        url: 'https://learn.mentorcareer.ru/reset-password?token=leaked',
        query_string: 'token=leaked',
        cookies: { 'payload-token': 'leaked' },
        data: { password: 'leaked' },
        headers: { 'User-Agent': 'UA', cookie: 'payload-token=leaked', authorization: 'JWT leaked' },
      },
      user: { id: 7, email: 'student@example.test', ip_address: '1.2.3.4', username: 'Аня' },
      breadcrumbs: [{ category: 'fetch', data: { url: '/api/users/reset?token=leaked', status_code: 500 } }],
      ...overrides,
    }
  }

  it('убирает cookie, тело, query, чужие заголовки и всё о пользователе, кроме id', () => {
    const result = scrubEvent(event())
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('leaked')
    expect(serialized).not.toContain('student@example.test')
    expect(serialized).not.toContain('1.2.3.4')
    expect(result?.user).toEqual({ id: 7 })
    expect(result?.request?.headers).toEqual({ 'User-Agent': 'UA' })
    expect(result?.exception?.values?.[0]?.stacktrace?.frames?.[0]?.vars).toBeUndefined()
    expect(result?.breadcrumbs?.[0]?.data).toEqual({ url: '/api/users/reset?[redacted]', status_code: 500 })
  })

  it('метит серверную ошибку digest-ом, который ученик видит на странице ошибки', () => {
    const error = Object.assign(new Error('boom'), { digest: '2913870412' })
    expect(scrubEvent(event(), { originalException: error })?.tags).toEqual({ digest: '2913870412' })
  })

  it('не отправляет redirect() и notFound(): это управление потоком Next, а не сбой', () => {
    expect(scrubEvent(event(), { originalException: Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/login;307;' }) })).toBeNull()
    expect(scrubEvent(event(), { originalException: Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK;404'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }) })).toBeNull()
  })

  it('чистит адрес в хлебных крошках навигации', () => {
    expect(scrubBreadcrumb({ category: 'navigation', data: { from: '/login?redirect=/x', to: '/reset-password?token=abc' } })?.data).toEqual({
      from: '/login?[redacted]',
      to: '/reset-password?[redacted]',
    })
  })
})
