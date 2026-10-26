import { EventEmitter } from 'node:events'
import type { LookupAddress } from 'node:dns'
import type { RequestOptions } from 'node:https'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import webPush from 'web-push'

type Lookup = (hostname: string, options: { all?: boolean }, callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void) => void

const dns = vi.hoisted(() => ({ lookup: vi.fn() }))
vi.mock('node:dns/promises', () => dns)
const https = vi.hoisted(() => ({ lookups: [] as unknown[][], status: 201 }))
vi.mock('node:https', () => ({ request: (_url: URL, options: RequestOptions & { lookup: Lookup }, callback: (response: EventEmitter & { statusCode: number; destroy: () => void }) => void) => {
  // Сокет Node спрашивает адрес у options.lookup: проверяем, что он получает только проверенный ранее ответ DNS.
  options.lookup('fcm.googleapis.com', { all: true }, (...args) => https.lookups.push(args))
  options.lookup('fcm.googleapis.com', {}, (...args) => https.lookups.push(args))
  const outgoing = Object.assign(new EventEmitter(), { end: () => callback(Object.assign(new EventEmitter(), { statusCode: https.status, destroy: vi.fn() })) })
  return outgoing
} }))

import { sendEncryptedPush, vapidConfiguration } from '@/server/push-transport'

const message = { title: 'Привет', body: 'Текст', url: '/', tag: 'lms-1' }
function device() {
  const keys = webPush.generateVAPIDKeys()
  // Ключ получателя — тот же формат P-256, что у VAPID; auth — 16 байт.
  return { endpoint: 'https://fcm.googleapis.com/fcm/send/device', p256dh: keys.publicKey, auth: Buffer.alloc(16, 7).toString('base64url') }
}

beforeEach(() => {
  const keys = webPush.generateVAPIDKeys()
  vi.stubEnv('PUSH_VAPID_PUBLIC_KEY', keys.publicKey)
  vi.stubEnv('PUSH_VAPID_PRIVATE_KEY', keys.privateKey)
  vi.stubEnv('PUSH_VAPID_SUBJECT', 'https://learn.mentorcareer.ru')
  https.lookups = []
  dns.lookup.mockReset()
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

describe('Web Push: закреплённый ответ DNS и конфигурация VAPID', () => {
  it('соединение идёт на тот адрес, который прошёл проверку, а не на повторно разрешённый', async () => {
    dns.lookup.mockResolvedValue([{ address: '142.250.1.1', family: 4 }, { address: '142.250.1.2', family: 4 }])
    expect(await sendEncryptedPush(device(), message)).toBe(201)
    expect(https.lookups).toEqual([
      [null, [{ address: '142.250.1.1', family: 4 }]],
      [null, '142.250.1.1', 4],
    ])
    expect(dns.lookup).toHaveBeenCalledTimes(1)
  })

  it('пустой ответ DNS и хотя бы один частный адрес в ответе — отказ без соединения', async () => {
    dns.lookup.mockResolvedValueOnce([])
    expect(await sendEncryptedPush(device(), message)).toBe(400)
    dns.lookup.mockResolvedValueOnce([{ address: '142.250.1.1', family: 4 }, { address: '10.0.0.5', family: 4 }])
    expect(await sendEncryptedPush(device(), message)).toBe(400)
    expect(https.lookups).toEqual([])
  })

  it('зависший DNS обрывается через 5 секунд ошибкой, а не держит доставку', async () => {
    vi.useFakeTimers()
    dns.lookup.mockReturnValue(new Promise(() => undefined))
    const sending = sendEncryptedPush(device(), message)
    const outcome = expect(sending).rejects.toThrow('Push DNS timeout')
    await vi.advanceTimersByTimeAsync(5000)
    await outcome
    expect(https.lookups).toEqual([])
  })

  it.each([
    ['тема не mailto и не https', { PUSH_VAPID_SUBJECT: 'http://learn.mentorcareer.ru' }],
    ['публичный ключ не 65 байт', { PUSH_VAPID_PUBLIC_KEY: Buffer.alloc(64, 1).toString('base64url') }],
    ['закрытый ключ не 32 байта', { PUSH_VAPID_PRIVATE_KEY: Buffer.alloc(31, 1).toString('base64url') }],
  ])('%s — VAPID выключен', (_, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
    expect(vapidConfiguration()).toBeNull()
  })

  it('корректная конфигурация возвращается как есть', () => {
    expect(vapidConfiguration()).toEqual({ publicKey: process.env.PUSH_VAPID_PUBLIC_KEY, privateKey: process.env.PUSH_VAPID_PRIVATE_KEY, subject: 'https://learn.mentorcareer.ru' })
  })
})
