import { createServer } from 'node:http'
import type { Payload } from 'payload'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execute = vi.hoisted(() => vi.fn())
const payload = { db: { drizzle: { execute } } } as unknown as Payload

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/telemetry', () => ({ logger }))

const { adminTelegramTransport, excerpt, formatAdminEvent, notifyAdmins } = await import('@/server/admin-telegram')

const TOKEN = `123456:${'b'.repeat(35)}`
const WINDOW = Symbol.for('lms.adminTelegram.sent')

beforeEach(() => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', TOKEN)
  vi.stubEnv('TELEGRAM_ADMIN_CHAT_ID', '42, -100500')
  vi.stubEnv('TELEGRAM_PROXY_URL', '')
  delete (globalThis as Record<symbol, unknown>)[WINDOW]
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('уведомления администратору в Telegram', () => {
  it('текст: заголовок, непустые строки, ссылка последней строкой', () => {
    expect(formatAdminEvent({ title: 'Новая заявка', lines: ['Иван', null, '', false, 'Откуда: habr'], link: 'https://lms.test/admin/x' }))
      .toBe('Новая заявка\nИван\nОткуда: habr\nhttps://lms.test/admin/x')
    const long = formatAdminEvent({ title: 'Т', lines: ['я'.repeat(5000)], link: 'https://lms.test/l' })
    expect(long.length).toBeLessThan(4096)
    expect(long.endsWith('…\nhttps://lms.test/l')).toBe(true)
    expect(excerpt('  текст  ')).toBe('текст')
    expect(excerpt('а'.repeat(10), 5)).toBe('аааа…')
  })

  it('без токена или чата молчит', async () => {
    const send = vi.spyOn(adminTelegramTransport, 'send').mockResolvedValue()
    vi.stubEnv('TELEGRAM_ADMIN_CHAT_ID', '')
    await notifyAdmins(payload, { title: 'Событие' })
    vi.stubEnv('TELEGRAM_ADMIN_CHAT_ID', '42')
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'not-a-token')
    await notifyAdmins(payload, { title: 'Событие' })
    expect(send).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('сбой записи в очередь не раскрывает содержимое сообщения в логе', async () => {
    execute.mockRejectedValueOnce(new Error('Частный текст сообщения'))
    await expect(notifyAdmins(payload, { title: 'Частный текст сообщения' })).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalledOnce()
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('Частный текст')
  })

  it('с прокси TLS к Telegram идёт внутри CONNECT, а не напрямую', async () => {
    const tunnels: string[] = []
    let tlsThroughProxy = 0
    const proxy = createServer()
    proxy.on('connect', (request, socket) => {
      tunnels.push(String(request.url))
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      // Первый байт ClientHello TLS - 0x16: значит, рукопожатие пошло через туннель.
      socket.once('data', (chunk: Buffer) => {
        if (chunk[0] === 0x16) tlsThroughProxy += 1
        socket.destroy()
      })
    })
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
    try {
      const { port } = proxy.address() as AddressInfo
      const cfg = { token: TOKEN, chats: ['42'], proxy: new URL(`http://127.0.0.1:${port}`) }
      await expect(adminTelegramTransport.send(cfg, '42', 'Событие')).rejects.toThrow()
      expect(tunnels).toEqual(['api.telegram.org:443', 'api.telegram.org:443', 'api.telegram.org:443'])
      expect(tlsThroughProxy).toBe(3)
    } finally {
      proxy.close()
    }
  })

})
