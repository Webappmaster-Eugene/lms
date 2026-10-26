import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Обёртка над SDK Sentry: что именно уходит в трекер, когда сервер сообщает
 * о сбое не объектом Error, и как ограничен счётчик частоты событий.
 */

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(() => 'exception-id'),
  captureMessage: vi.fn(() => 'message-id'),
  addBreadcrumb: vi.fn(),
}))

vi.mock('@/lib/error-reporting/sdk', () => ({ Sentry: sentry }))

async function freshCapture() {
  vi.resetModules()
  return import('@/lib/error-reporting/capture')
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ошибка не объектом Error', () => {
  it('объект уходит очищенным JSON в подробностях, а заголовком — описание места', async () => {
    const { captureServerError } = await freshCapture()

    const id = captureServerError({ code: 'SMTP_451', to: 'student@example.test' }, { message: 'Не отправилось письмо', level: 'warning' })

    expect(id).toBe('message-id')
    expect(sentry.captureException).not.toHaveBeenCalled()
    const [title, hint] = sentry.captureMessage.mock.calls[0] as unknown as [string, { level: string; extra?: { detail: string } }]
    expect(title).toBe('Не отправилось письмо')
    expect(hint.level).toBe('warning')
    expect(hint.extra?.detail).toContain('SMTP_451')
    expect(hint.extra?.detail).not.toContain('student@example.test')
  })

  it('циклическая структура не роняет отправку: в подробности уходит её строковое представление', async () => {
    const { captureServerError } = await freshCapture()
    const cyclic: Record<string, unknown> = { reason: 'loop' }
    cyclic.self = cyclic

    expect(() => captureServerError(cyclic, { message: 'Сбой фоновой задачи' })).not.toThrow()

    expect(sentry.captureMessage).toHaveBeenCalledWith('Сбой фоновой задачи', expect.objectContaining({ extra: { detail: '[object Object]' } }))
  })

  it('BigInt из драйвера БД не роняет отправку и виден в событии', async () => {
    const { captureServerError } = await freshCapture()

    captureServerError(9007199254740993n)

    expect(sentry.captureMessage).toHaveBeenCalledWith('9007199254740993', expect.objectContaining({ extra: undefined }))
  })

  it('значение без JSON-представления (символ) становится заголовком события, а не пропадает', async () => {
    const { captureServerError } = await freshCapture()

    captureServerError(Symbol('lock-timeout'))

    expect(sentry.captureMessage).toHaveBeenCalledWith('Symbol(lock-timeout)', expect.objectContaining({ level: 'error' }))
  })

  it('без ошибки и описания событие всё равно уходит с понятным заголовком', async () => {
    const { captureServerError } = await freshCapture()

    captureServerError(undefined)

    expect(sentry.captureMessage).toHaveBeenCalledWith('Неизвестная ошибка', expect.objectContaining({ extra: undefined }))
  })
})

describe('ограничение частоты событий', () => {
  it('память ключей ограничена: при переполнении забывается самый старый ключ', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-26T10:00:00Z'))
    const { captureThrottled } = await freshCapture()
    const interval = 60_000

    for (let index = 0; index < 500; index++) captureThrottled(`ключ-${index}`, interval, new Error('сбой'))
    expect(sentry.captureException).toHaveBeenCalledTimes(500)

    // 501-й уникальный ключ вытесняет самый старый, остальные всё ещё под ограничением.
    captureThrottled('ключ-500', interval, new Error('сбой'))
    captureThrottled('ключ-1', interval, new Error('сбой'))
    expect(sentry.captureException).toHaveBeenCalledTimes(501)

    captureThrottled('ключ-0', interval, new Error('сбой'))
    expect(sentry.captureException).toHaveBeenCalledTimes(502)
  })

  it('повторно отправленный ключ становится самым свежим и не вытесняется первым', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-26T10:00:00Z'))
    const { captureThrottled } = await freshCapture()
    const interval = 60_000

    for (let index = 0; index < 500; index++) captureThrottled(`ключ-${index}`, interval, new Error('сбой'))
    vi.advanceTimersByTime(interval)
    captureThrottled('ключ-0', interval, new Error('сбой снова'))
    expect(sentry.captureException).toHaveBeenCalledTimes(501)

    vi.advanceTimersByTime(1000)
    captureThrottled('ключ-новый', interval, new Error('сбой'))
    captureThrottled('ключ-0', interval, new Error('сбой'))

    // Вытеснен «ключ-1», а недавно отправленный «ключ-0» всё ещё сдерживается.
    expect(sentry.captureException).toHaveBeenCalledTimes(502)
  })
})
