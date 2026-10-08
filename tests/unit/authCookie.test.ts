import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateExpiredPayloadCookie, generatePayloadCookie } from 'payload/shared'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function authConfig(serverURL: string | undefined) {
  vi.stubEnv('NEXT_PUBLIC_SERVER_URL', serverURL)
  vi.stubEnv('SMTP_HOST', '')
  vi.stubEnv('PAYLOAD_SECRET', 'auth-cookie-test-secret-not-for-production')
  vi.resetModules()
  const { default: config } = await import('@payload-config')
  const sanitized = await config
  const users = sanitized.collections.find(({ slug }) => slug === 'users')
  if (!users) throw new Error('Коллекция users отсутствует в настоящем Payload config')
  return { auth: users.auth, cookiePrefix: sanitized.cookiePrefix }
}

describe('cookie входа: настоящий Payload config и cookie serializer', () => {
  it.each([
    ['HTTPS платформа', 'https://learn.mentorcareer.ru', true],
    ['HTTP локальная платформа', 'http://localhost:3100', false],
    ['локальное окружение без URL', undefined, false],
    ['локальное окружение с пустым URL', '', false],
  ])('%s: Secure соответствует HTTPS, cookie постоянная и HttpOnly', async (_label, serverURL, secure) => {
    const { auth, cookiePrefix } = await authConfig(serverURL)
    const before = Date.now()
    const cookie = generatePayloadCookie({
      collectionAuthConfig: auth,
      cookiePrefix,
      token: 'auth-cookie-test-token',
    })
    const headers = new Headers({ 'Set-Cookie': cookie })
    const setCookie = headers.get('set-cookie') ?? ''
    expect(setCookie.includes('; Secure')).toBe(secure)
    expect(setCookie).toContain('; HttpOnly')
    expect(setCookie).toContain('; SameSite=Lax')
    expect(setCookie).toContain('; Path=/')
    const expires = Date.parse(/Expires=([^;]+)/.exec(setCookie)?.[1] ?? '')
    expect(expires).toBeGreaterThanOrEqual(before + 30 * 24 * 60 * 60 * 1000 - 1000)
    expect(expires).toBeLessThanOrEqual(Date.now() + 30 * 24 * 60 * 60 * 1000)

    const expired = generateExpiredPayloadCookie({ collectionAuthConfig: auth, cookiePrefix })
    expect(expired.includes('; Secure')).toBe(secure)
    expect(expired).toMatch(/^payload-token=;/)
    expect(Date.parse(/Expires=([^;]+)/.exec(expired)?.[1] ?? '')).toBeLessThan(Date.now())
  })
})
