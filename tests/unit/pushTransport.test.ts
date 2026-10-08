import { createECDH, createHmac, createDecipheriv, randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { RequestOptions } from 'node:https'
import { afterEach, describe, expect, it, vi } from 'vitest'
import webPush from 'web-push'

const provider = vi.hoisted(() => ({ status: 201, body: Buffer.alloc(0) as Buffer, headers: {} as Record<string, unknown>, hostname: '', addresses: [{ address: '8.8.8.8', family: 4 }] }))
vi.mock('node:dns/promises', () => ({ lookup: vi.fn(async () => provider.addresses) }))
vi.mock('node:https', () => ({ request: (url: URL, options: RequestOptions, callback: (response: EventEmitter & { statusCode: number; destroy: () => void }) => void) => {
  provider.headers = options.headers as Record<string, unknown>
  provider.hostname = url.hostname
  const outgoing = new EventEmitter() as EventEmitter & { end: (body: Buffer) => void }
  outgoing.end = (body) => {
    provider.body = body
    const response = Object.assign(new EventEmitter(), { statusCode: provider.status, destroy: vi.fn() })
    callback(response)
  }
  return outgoing
} }))

import { publicPushAddress, sendEncryptedPush, vapidConfiguration } from '@/server/push-transport'

function decryptPush(body: Buffer, recipient: ReturnType<typeof createECDH>, auth: Buffer): string {
  const salt = body.subarray(0, 16)
  const keyLength = body[20] ?? 0
  const sender = body.subarray(21, 21 + keyLength)
  const encrypted = body.subarray(21 + keyLength)
  const authPrk = createHmac('sha256', auth).update(recipient.computeSecret(sender)).digest()
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), recipient.getPublicKey(), sender, Buffer.from([1])])
  const ikm = createHmac('sha256', authPrk).update(info).digest()
  const prk = createHmac('sha256', salt).update(ikm).digest()
  const key = createHmac('sha256', prk).update(Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).digest().subarray(0, 16)
  const nonce = createHmac('sha256', prk).update(Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).digest().subarray(0, 12)
  const cipher = createDecipheriv('aes-128-gcm', key, nonce)
  cipher.setAuthTag(encrypted.subarray(-16))
  const plain = Buffer.concat([cipher.update(encrypted.subarray(0, -16)), cipher.final()])
  expect(plain.at(-1)).toBe(2)
  return plain.subarray(0, -1).toString('utf8')
}

describe('encrypted Web Push transport', () => {
  afterEach(() => { vi.unstubAllEnvs(); provider.status = 201; provider.addresses = [{ address: '8.8.8.8', family: 4 }] })
  const configure = () => {
    const keys = webPush.generateVAPIDKeys()
    vi.stubEnv('PUSH_VAPID_PUBLIC_KEY', keys.publicKey)
    vi.stubEnv('PUSH_VAPID_PRIVATE_KEY', keys.privateKey)
    vi.stubEnv('PUSH_VAPID_SUBJECT', 'mailto:push@example.test')
  }
  const subscription = () => {
    const recipient = createECDH('prime256v1')
    recipient.generateKeys()
    const auth = randomBytes(16)
    return { recipient, auth, data: { endpoint: 'https://fcm.googleapis.com/fcm/send/test-device', p256dh: recipient.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } }
  }
  it('sends actual aes128gcm ciphertext that only the recipient key decrypts, with VAPID auth', async () => {
    configure()
    const device = subscription()
    const status = await sendEncryptedPush(device.data, { title: 'Продолжим обучение?', body: 'Пора сделать небольшой шаг', url: '/dashboard', tag: 'lms-123' })
    expect(status).toBe(201)
    expect(provider.hostname).toBe('fcm.googleapis.com')
    expect(provider.headers['Content-Encoding']).toBe('aes128gcm')
    expect(String(provider.headers.Authorization)).toMatch(/^vapid t=.+, k=/)
    expect(provider.body.includes(Buffer.from('небольшой'))).toBe(false)
    expect(JSON.parse(decryptPush(provider.body, device.recipient, device.auth))).toEqual({ title: 'Продолжим обучение?', message: 'Пора сделать небольшой шаг', link: '/dashboard', tag: 'lms-123' })
    const attacker = createECDH('prime256v1'); attacker.generateKeys()
    expect(() => decryptPush(provider.body, attacker, device.auth)).toThrow()
  })
  it('rejects unexpected providers, DNS private addresses and missing configuration without sending', async () => {
    configure()
    const device = subscription()
    const message = { title: 'Hi', body: '', url: '/', tag: 'lms-1' }
    expect(await sendEncryptedPush({ ...device.data, endpoint: 'https://evil.example/x' }, message)).toBe(400)
    provider.addresses = [{ address: '127.0.0.1', family: 4 }]
    expect(await sendEncryptedPush(device.data, message)).toBe(400)
    vi.stubEnv('PUSH_VAPID_PRIVATE_KEY', '')
    expect(vapidConfiguration()).toBeNull()
    expect(await sendEncryptedPush(device.data, message)).toBe(400)
  })
  it('returns provider failures as codes for bounded retry and never follows a redirect', async () => {
    configure()
    const device = subscription()
    provider.status = 302
    expect(await sendEncryptedPush(device.data, { title: 'Hi', body: '', url: '/', tag: 'lms-1' })).toBe(302)
    provider.status = 410
    expect(await sendEncryptedPush(device.data, { title: 'Hi', body: '', url: '/', tag: 'lms-1' })).toBe(410)
  })
  it.each(['127.0.0.1', '10.0.0.2', '172.16.0.5', '169.254.169.254', '192.168.1.1', '100.64.1.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1'])('rejects private or non-global network %s', (ip) => { expect(publicPushAddress(ip)).toBe(false) })
})
