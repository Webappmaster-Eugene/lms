import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Сборка SMTP-транспорта из окружения. Ключевое — requireTLS на submission-порту:
 * без него nodemailer отправит логин и пароль открытым текстом, если сервер
 * не анонсирует STARTTLS.
 */

const createTransport = vi.fn((config: unknown) => ({ __transport: config }))
const nodemailerAdapter = vi.fn((config: unknown) => ({ __adapter: config }))

vi.mock('nodemailer', () => ({ default: { createTransport } }))
vi.mock('@payloadcms/email-nodemailer', () => ({ nodemailerAdapter }))

const { buildEmailAdapter } = await import('@/payload/email/transport')

const SMTP_ENV = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_FROM_ADDRESS',
  'EMAIL_FROM_NAME',
] as const

function configureSmtp(overrides: Partial<Record<(typeof SMTP_ENV)[number], string>> = {}) {
  const base = {
    SMTP_HOST: 'smtp.mail.ru',
    SMTP_USER: 'noreply@mentorcareer.ru',
    SMTP_PASS: 'app-password',
    ...overrides,
  }

  for (const key of SMTP_ENV) {
    const value = (base as Record<string, string | undefined>)[key]
    if (value === undefined) continue
    vi.stubEnv(key, value)
  }
}

function transportConfig(): Record<string, unknown> {
  return createTransport.mock.calls[0][0] as Record<string, unknown>
}

function adapterConfig(): Record<string, unknown> {
  return nodemailerAdapter.mock.calls[0][0] as Record<string, unknown>
}

describe('сборка SMTP-транспорта', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Иначе тест зависит от .env конкретной машины.
    for (const key of SMTP_ENV) vi.stubEnv(key, '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('почта выключена', () => {
    it('без SMTP_HOST адаптер не собирается — это штатный режим разработки', () => {
      expect(buildEmailAdapter()).toBeUndefined()
      expect(createTransport).not.toHaveBeenCalled()
    })

    it('пробелы вместо хоста считаются за «не задан»', () => {
      vi.stubEnv('SMTP_HOST', '   ')

      expect(buildEmailAdapter()).toBeUndefined()
    })
  })

  describe('почта настроена наполовину', () => {
    it.each(['SMTP_USER', 'SMTP_PASS'])('без %s — падаем на старте, а не молчим', (missing) => {
      configureSmtp({ [missing]: '' } as Record<string, string>)

      expect(() => buildEmailAdapter()).toThrow(new RegExp(missing))
    })

    it('в сообщении сказано, что делать', () => {
      configureSmtp({ SMTP_PASS: '' })

      expect(() => buildEmailAdapter()).toThrow(/Set every SMTP_\* variable, or clear SMTP_HOST/)
    })

    it.each(['0', '65536', 'не число', '-1', '12.5'])('порт %j отвергается', (port) => {
      configureSmtp({ SMTP_PORT: port })

      expect(() => buildEmailAdapter()).toThrow(/Invalid SMTP_PORT/)
    })
  })

  describe('шифрование канала', () => {
    it('порт 465 — соединение шифруется сразу', () => {
      configureSmtp({ SMTP_PORT: '465' })
      buildEmailAdapter()

      expect(transportConfig()).toMatchObject({ port: 465, secure: true, requireTLS: false })
    })

    it('порт по умолчанию — тоже 465', () => {
      configureSmtp()
      buildEmailAdapter()

      expect(transportConfig()).toMatchObject({ port: 465, secure: true })
    })

    it.each(['587', '25', '2525'])(
      'на порту %s STARTTLS обязателен — иначе пароль уйдёт открытым текстом',
      (port) => {
        configureSmtp({ SMTP_PORT: port })
        buildEmailAdapter()

        expect(transportConfig()).toMatchObject({
          port: Number(port),
          secure: false,
          requireTLS: true,
        })
      },
    )
  })

  describe('учётные данные и отправитель', () => {
    it('логин и пароль уходят в транспорт', () => {
      configureSmtp()
      buildEmailAdapter()

      expect(transportConfig().auth).toEqual({
        user: 'noreply@mentorcareer.ru',
        pass: 'app-password',
      })
    })

    it('по умолчанию From совпадает с ящиком аутентификации', () => {
      configureSmtp()
      buildEmailAdapter()

      expect(adapterConfig()).toMatchObject({ defaultFromAddress: 'noreply@mentorcareer.ru' })
    })

    it('имя отправителя по умолчанию задано — пустое поле выглядит спамом', () => {
      configureSmtp()
      buildEmailAdapter()

      expect(String(adapterConfig().defaultFromName).length).toBeGreaterThan(0)
    })

    it('явные EMAIL_FROM_* имеют приоритет', () => {
      configureSmtp({
        EMAIL_FROM_ADDRESS: 'noreply@mentorcareer.ru',
        EMAIL_FROM_NAME: 'MentorCareer',
      })
      buildEmailAdapter()

      expect(adapterConfig()).toMatchObject({
        defaultFromAddress: 'noreply@mentorcareer.ru',
        defaultFromName: 'MentorCareer',
      })
    })

    it('несовпадение From и логина предупреждается — почтовики такое отвергают', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      configureSmtp({ EMAIL_FROM_ADDRESS: 'hello@other.ru' })

      buildEmailAdapter()

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('differs from SMTP_USER'))
      warn.mockRestore()
    })

    it('разный регистр адреса несовпадением не считается', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      configureSmtp({ EMAIL_FROM_ADDRESS: 'NoReply@MentorCareer.ru' })

      buildEmailAdapter()

      expect(warn).not.toHaveBeenCalled()
      warn.mockRestore()
    })
  })

  describe('таймауты', () => {
    it('заданы все три — иначе зависший SMTP держит запрос бесконечно', () => {
      configureSmtp()
      buildEmailAdapter()

      const config = transportConfig()
      for (const key of ['connectionTimeout', 'greetingTimeout', 'socketTimeout']) {
        expect(typeof config[key], `${key} не задан`).toBe('number')
        expect(Number(config[key])).toBeGreaterThan(0)
      }
    })
  })
})
