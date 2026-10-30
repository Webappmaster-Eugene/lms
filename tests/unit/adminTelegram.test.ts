import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('шлёт в каждый чат из списка', async () => {
    const send = vi.spyOn(adminTelegramTransport, 'send').mockResolvedValue()
    await notifyAdmins({ title: 'Событие' })
    expect(send.mock.calls.map(([, chat, text]) => [chat, text])).toEqual([['42', 'Событие'], ['-100500', 'Событие']])
  })

  it('без токена или чата молчит', async () => {
    const send = vi.spyOn(adminTelegramTransport, 'send').mockResolvedValue()
    vi.stubEnv('TELEGRAM_ADMIN_CHAT_ID', '')
    await notifyAdmins({ title: 'Событие' })
    vi.stubEnv('TELEGRAM_ADMIN_CHAT_ID', '42')
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'not-a-token')
    await notifyAdmins({ title: 'Событие' })
    expect(send).not.toHaveBeenCalled()
  })

  it('сбой доставки не бросает, а токен в журнал не попадает', async () => {
    vi.spyOn(adminTelegramTransport, 'send').mockRejectedValue(new Error(`connect failed for /bot${TOKEN}/sendMessage`))
    await expect(notifyAdmins({ title: 'Событие' })).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalled()
    const logged = JSON.stringify(logger.error.mock.calls.map(([message, error]) => [message, (error as Error).message]))
    expect(logged).not.toContain(TOKEN)
    expect(logged).toContain('/bot<token>/sendMessage')
  })

  it('больше 40 сообщений в минуту не отправляет', async () => {
    vi.stubEnv('TELEGRAM_ADMIN_CHAT_ID', '42')
    const send = vi.spyOn(adminTelegramTransport, 'send').mockResolvedValue()
    for (let index = 0; index < 45; index += 1) await notifyAdmins({ title: `Событие ${index}` })
    expect(send).toHaveBeenCalledTimes(40)
    expect(logger.warn).toHaveBeenCalledTimes(5)
  })
})
