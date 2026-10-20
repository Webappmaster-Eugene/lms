import { createHmac, timingSafeEqual } from 'node:crypto'

const PURPOSE = 'lms-email-unsubscribe-v1'

function signature(userId: number): Buffer {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) throw new Error('PAYLOAD_SECRET is required to sign unsubscribe links')
  return createHmac('sha256', secret).update(`${PURPOSE}:${userId}`).digest()
}

/**
 * Ссылка отписки работает без входа: письмо открывают на телефоне, где сессии нет.
 * Токен бессрочный и меняет только согласие на рассылки, поэтому хранить его не нужно.
 */
export function createUnsubscribeToken(userId: number): string {
  return `${userId}.${signature(userId).toString('base64url')}`
}

export function verifyUnsubscribeToken(token: unknown): number | null {
  if (typeof token !== 'string' || token.length > 100) return null
  const match = /^([1-9]\d{0,15})\.([A-Za-z0-9_-]{43})$/.exec(token)
  if (!match) return null
  const userId = Number(match[1])
  if (!Number.isSafeInteger(userId)) return null
  const given = Buffer.from(match[2], 'base64url')
  const expected = signature(userId)
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null
}
