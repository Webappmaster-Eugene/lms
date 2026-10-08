import { beforeAll, describe, expect, it, vi } from 'vitest'
import { handleEndpoints, type Payload } from 'payload'
import config from '@payload-config'

import { createStudent, getTestPayload, type TestUser } from '../helpers/payload'

const SESSION_SECONDS = 30 * 24 * 60 * 60

let payload: Payload
let student: TestUser

beforeAll(async () => {
  payload = await getTestPayload()
  student = await createStudent(payload)
})

async function loginResponse() {
  const response = await handleEndpoints({
    config,
    request: new Request('http://lms.test/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: student.email, password: student.password }),
    }),
  })
  expect(response.status).toBe(200)
  const result = await response.json() as { token: string }
  expect(result.token).toEqual(expect.any(String))
  return { response, token: result.token }
}

async function currentUser(token: string) {
  return payload.auth({ headers: new Headers({ Cookie: `payload-token=${token}` }) })
}

describe('сохранение авторизации на 30 дней', () => {
  it('настоящий login выдаёт постоянную HttpOnly cookie, JWT и серверную сессию с одним сроком', async () => {
    const beforeLogin = Date.now()
    const { response, token } = await loginResponse()
    const afterLogin = Date.now()
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(`payload-token=${token};`)
    expect(cookie).toContain('; HttpOnly')
    expect(cookie).toContain('; SameSite=Lax')
    expect(cookie).toContain('; Path=/')
    const expiresText = /Expires=([^;]+)/.exec(cookie)?.[1]
    expect(expiresText).toBeDefined()
    const cookieExpires = Date.parse(expiresText ?? '')
    expect(cookieExpires).toBeGreaterThanOrEqual(beforeLogin + SESSION_SECONDS * 1000 - 1000)
    expect(cookieExpires).toBeLessThanOrEqual(afterLogin + SESSION_SECONDS * 1000)

    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as {
      iat: number
      exp: number
      sid: string
    }
    expect(claims.exp - claims.iat).toBe(SESSION_SECONDS)
    expect(Math.abs(cookieExpires / 1000 - claims.exp)).toBeLessThanOrEqual(1)
    const user = await payload.findByID({ collection: 'users', id: student.id })
    const session = user.sessions?.find(({ id }) => id === claims.sid)
    expect(session).toBeDefined()
    expect(Date.parse(session?.expiresAt ?? '') - Date.parse(session?.createdAt ?? '')).toBe(SESSION_SECONDS * 1000)
    expect((await currentUser(token)).user?.id).toBe(student.id)
  })

  it('сохранённая cookie работает спустя 29 дней и перестаёт работать после 30 дней', async () => {
    const { token } = await loginResponse()
    const now = Date.now()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(now + 29 * 24 * 60 * 60 * 1000)
      expect((await currentUser(token)).user?.id).toBe(student.id)
      vi.setSystemTime(now + SESSION_SECONDS * 1000 + 1000)
      expect((await currentUser(token)).user).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('выход удаляет cookie и немедленно отзывает сохранённый JWT на сервере', async () => {
    const { token } = await loginResponse()
    const response = await handleEndpoints({
      config,
      request: new Request('http://lms.test/api/users/logout', {
        method: 'POST',
        headers: { Cookie: `payload-token=${token}` },
      }),
    })
    expect(response.status).toBe(200)
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/^payload-token=;/)
    const expiresText = /Expires=([^;]+)/.exec(cookie)?.[1]
    expect(Date.parse(expiresText ?? '')).toBeLessThan(Date.now())
    expect((await currentUser(token)).user).toBeNull()
  })
})
