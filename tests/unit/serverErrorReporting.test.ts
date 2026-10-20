import { EventEmitter } from 'node:events'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/nextjs'
import type { ErrorEvent, NodeOptions } from '@sentry/nextjs'

// @sentry/core не прямая зависимость: тип конверта берётся из сигнатуры транспорта.
type Envelope = Parameters<ReturnType<NonNullable<NodeOptions['transport']>>['send']>[0]

/**
 * Настоящий SDK Sentry с подменённым транспортом: проверяется то, что реально
 * ушло бы в Sentry, — после beforeSend, группировки и хлебных крошек.
 */
const envelopes: Envelope[] = []

/** Строки исходника вокруг кадра стека — это код самого теста с литералами, а не данные события. */
function withoutSourceContext(event: ErrorEvent | undefined): unknown {
  return JSON.parse(JSON.stringify(event ?? {}), (key, value) => (['pre_context', 'context_line', 'post_context'].includes(key) ? undefined : value))
}

function sentEvents(): ErrorEvent[] {
  return envelopes.flatMap((envelope) => envelope[1].filter(([header]) => header.type === 'event').map(([, payload]) => payload as ErrorEvent))
}

async function flushed(): Promise<ErrorEvent[]> {
  await Sentry.flush(2000)
  return sentEvents()
}

beforeAll(async () => {
  vi.stubEnv('SENTRY_DSN', 'https://publicKey123@o42.ingest.de.sentry.io/4507')
  const { initServerSentry } = await import('@/lib/error-reporting/server-sentry')
  const started = initServerSentry({
    transport: () => ({
      send: async (envelope) => {
        envelopes.push(envelope)
        return {}
      },
      flush: async () => true,
    }),
  })
  expect(started).toBe(true)
})

afterAll(async () => {
  await Sentry.close(2000)
  vi.unstubAllEnvs()
})

beforeEach(() => {
  envelopes.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('logger.error → Sentry', () => {
  it('отправляет ошибку со стеком, очищенным текстом и атрибутами, а перед ней — хлебные крошки', async () => {
    const { logger } = await import('@/lib/telemetry')
    logger.warn('Повтор отправки письма', { attempt: 2 })
    logger.error('Не удалось отправить письмо student@example.test', new Error('SMTP 451 for student@example.test token=leakedToken'), { 'user.id': 17 })

    const [event] = await flushed()
    expect(event).toBeDefined()
    const serialized = JSON.stringify(withoutSourceContext(event))
    expect(serialized).not.toContain('student@example.test')
    expect(serialized).not.toContain('leakedToken')
    expect(event?.exception?.values?.[0]?.type).toBe('Error')
    expect(event?.exception?.values?.[0]?.stacktrace?.frames?.length).toBeGreaterThan(0)
    expect(event?.contexts?.lms).toMatchObject({ 'user.id': 17 })
    expect(event?.breadcrumbs?.some((crumb) => crumb.message === 'Повтор отправки письма' && crumb.level === 'warning')).toBe(true)
  })

  it('без объекта ошибки отправляет сообщение, а не теряет событие', async () => {
    const { logger } = await import('@/lib/telemetry')
    logger.error('Фоновая задача уведомлений упала')
    const [event] = await flushed()
    expect(event?.message).toBe('Фоновая задача уведомлений упала')
    expect(event?.level).toBe('error')
  })

  it('stackOnly сохраняет место падения, но не текст ошибки', async () => {
    const { stackOnly, captureServerError } = await import('@/lib/error-reporting/capture')
    captureServerError(stackOnly(new TypeError('стенограмма собеседования: секретный ответ')))
    const [event] = await flushed()
    expect(JSON.stringify(withoutSourceContext(event))).not.toContain('секретный ответ')
    expect(event?.exception?.values?.[0]?.type).toBe('TypeError')
    expect(event?.exception?.values?.[0]?.stacktrace?.frames?.length).toBeGreaterThan(0)
  })

  it('повторяющийся сбой инфраструктуры уходит одним событием за интервал', async () => {
    const { captureThrottled } = await import('@/lib/error-reporting/capture')
    for (let index = 0; index < 5; index += 1) captureThrottled('test-redis-down', 60_000, new Error('ECONNREFUSED'), { level: 'warning' })
    expect(await flushed()).toHaveLength(1)
  })
})

describe('Payload → Sentry', () => {
  it('ошибки 4xx (неверный пароль, валидация) не отправляются, 5xx — с коллекцией и пользователем', async () => {
    const { reportPayloadError } = await import('@/payload/hooks/reportPayloadError')
    const req = { user: { id: 5 }, method: 'POST' } as never
    await reportPayloadError({ error: Object.assign(new Error('The email or password provided is incorrect.'), { status: 401 }), req, context: {} })
    await reportPayloadError({ error: new Error('relation "courses" does not exist'), req, context: {}, collection: { slug: 'courses' } as never })
    const events = await flushed()
    expect(events).toHaveLength(1)
    expect(events[0]?.tags).toMatchObject({ source: 'payload', collection: 'courses' })
    expect(events[0]?.contexts?.lms).toMatchObject({ userId: 5, method: 'POST' })
  })

  it('ошибка, уже отправленная afterError, не уходит второй раз из лога Payload', async () => {
    const { reportPayloadError, reportPayloadLog } = await import('@/payload/hooks/reportPayloadError')
    const error = new Error('deadlock detected')
    // Payload сначала пишет лог, потом зовёт afterError — тот же порядок здесь.
    reportPayloadLog([{ err: error }], 50)
    await reportPayloadError({ error, req: { method: 'PATCH' } as never, context: {} })
    await new Promise((resolve) => setImmediate(resolve))
    expect(await flushed()).toHaveLength(1)
  })

  it('ошибки старта из лога Payload (БД, onInit) отправляются, info и warn — нет', async () => {
    const { reportPayloadLog } = await import('@/payload/hooks/reportPayloadError')
    reportPayloadLog([{ msg: 'Error running onInit' }], 50)
    reportPayloadLog([{ msg: 'Reconnecting to postgres' }], 30)
    reportPayloadLog([{ err: new Error('cannot connect to Postgres') }, 'Error: cannot connect to Postgres'], 50)
    await new Promise((resolve) => setImmediate(resolve))
    const events = await flushed()
    // Сообщение и исключение SDK обрабатывает разными цепочками промисов — порядок отправки не гарантирован.
    expect(events.map((event) => event.message ?? event.exception?.values?.[0]?.value).sort()).toEqual(['Error running onInit', 'cannot connect to Postgres'])
  })

  it('логгер Payload пишет как раньше и передаёт ошибки в Sentry', async () => {
    const { payloadLogger } = await import('@/payload/hooks/reportPayloadError')
    if (!payloadLogger || payloadLogger === 'sync' || !('options' in payloadLogger)) throw new Error('ожидался логгер с options')
    const method = vi.fn()
    payloadLogger.options.hooks?.logMethod?.call({} as never, [{ msg: 'Migration failed' }] as never, method as never, 50)
    expect(method).toHaveBeenCalledWith({ msg: 'Migration failed' })
    expect((await flushed()).map((event) => event.message)).toEqual(['Migration failed'])
  })
})

describe('миграции', () => {
  it('упавшая миграция уходит в Sentry до выхода процесса и пробрасывается дальше', async () => {
    const { reportMigrationFailures } = await import('@/payload/hooks/reportPayloadError')
    const failure = new Error('column "x" of relation "users" already exists')
    const [wrapped] = reportMigrationFailures([{ name: '20261020_000000_broken', up: async (_args: unknown) => { throw failure } }])
    await expect(wrapped?.up({} as never)).rejects.toBe(failure)
    // flush уже дождался отправки внутри обёртки — конверт должен лежать в транспорте.
    const [event] = sentEvents()
    expect(event?.level).toBe('fatal')
    expect(event?.tags).toMatchObject({ component: 'migrations' })
    expect(event?.contexts?.lms).toMatchObject({ migration: '20261020_000000_broken' })
  })
})

describe('пул Postgres', () => {
  it('обрыв простаивающего соединения не роняет процесс и попадает в Sentry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { watchPoolErrors } = await import('@/server/secure-postgres-adapter')
    const pool = new EventEmitter()
    watchPoolErrors(pool)
    watchPoolErrors(pool)
    expect(pool.listenerCount('error')).toBe(1)
    expect(() => pool.emit('error', Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' }))).not.toThrow()
    const [event] = await flushed()
    expect(event?.level).toBe('warning')
    expect(event?.tags).toMatchObject({ component: 'postgres' })
  })
})
