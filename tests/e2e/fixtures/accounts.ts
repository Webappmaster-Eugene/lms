import { randomUUID } from 'node:crypto'
import { expect, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test'

import { createUnsubscribeToken } from '@/server/broadcasts/unsubscribe-token'

import { E2E_SECRET } from './data'
import { APP_URL, storageStateOf } from './env'

export type Account = { id: number; email: string; password: string; firstName: string; lastName: string; name: string }

/**
 * Временный ученик для сценария, который меняет его состояние. Удаление аккаунта через REST
 * уносит прогресс, сертификаты, уведомления и комнаты собеседований (cleanupUserRelations).
 */
export async function createAccount(admin: APIRequestContext, fields: Record<string, unknown> = {}): Promise<Account> {
  const email = `e2e-${randomUUID()}@lms.test`
  const password = 'Temp-Student-Pass-1'
  const firstName = typeof fields.firstName === 'string' ? fields.firstName : 'Временный'
  const lastName = typeof fields.lastName === 'string' ? fields.lastName : 'Ученик'
  const response = await admin.post('/api/users', { data: {
    email, password, role: 'student', isActive: true,
    learningAccessMode: 'all', learningCatalogVisibility: 'catalog', trainerAccessMode: 'all',
    ...fields, firstName, lastName,
  } })
  expect(response.status(), await response.text()).toBe(201)
  const { doc } = await response.json() as { doc: { id: number } }
  return { id: doc.id, email, password, firstName, lastName, name: `${firstName} ${lastName}` }
}

export async function deleteAccount(admin: APIRequestContext, account: Account | undefined): Promise<void> {
  if (!account) return
  expect((await admin.delete(`/api/users/${account.id}`)).status()).toBe(200)
}

/** Отдельный браузерный профиль, вошедший тем же REST-входом, что и auth.setup. */
export async function signedInContext(browser: Browser, account: Account, options: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: APP_URL, extraHTTPHeaders: { Origin: APP_URL }, ...options, storageState: { cookies: [], origins: [] } })
  const login = await context.request.post('/api/users/login', { data: { email: account.email, password: account.password } })
  expect(login.status(), await login.text()).toBe(200)
  return context
}

/** REST-клиент администратора: заводит и удаляет данные сценария. */
export async function adminContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ baseURL: APP_URL, extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('admin') })
}

/**
 * Ссылка отписки из письма рассылки. SMTP в e2e выключен, письма не уходят, поэтому токен
 * подписывается тем же кодом и секретом одноразового сервера, что и в настоящем письме.
 */
export function unsubscribeLinkOf(userId: number): string {
  const previous = process.env.PAYLOAD_SECRET
  process.env.PAYLOAD_SECRET = E2E_SECRET
  try {
    return `/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(userId))}`
  } finally {
    if (previous === undefined) delete process.env.PAYLOAD_SECRET
    else process.env.PAYLOAD_SECRET = previous
  }
}
