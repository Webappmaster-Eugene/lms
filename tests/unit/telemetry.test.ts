import { context, SpanStatusCode, trace } from '@opentelemetry/api'
import { logs } from '@opentelemetry/api-logs'
import { InMemoryLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { node, tracing } from '@opentelemetry/sdk-node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Логгер и спаны на настоящем SDK OpenTelemetry в памяти. Sentry — граница:
 * подменяется, чтобы видеть, что именно ему передано.
 */

const reporting = vi.hoisted(() => ({
  captureServerError: vi.fn(),
  addLogBreadcrumb: vi.fn(),
}))

vi.mock('@/lib/error-reporting/capture', () => reporting)

const spanExporter = new tracing.InMemorySpanExporter()
const tracerProvider = new node.NodeTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(spanExporter)] })
let logExporter: InMemoryLogRecordExporter
let logProvider: LoggerProvider

beforeAll(() => {
  // Регистрация ставит и контекст-менеджер: без него активный спан внутри withSpan не виден.
  tracerProvider.register()
})

afterAll(async () => {
  await tracerProvider.shutdown()
  trace.disable()
  context.disable()
})

beforeEach(() => {
  vi.clearAllMocks()
  spanExporter.reset()
  logExporter = new InMemoryLogRecordExporter()
  logProvider = new LoggerProvider({ processors: [new SimpleLogRecordProcessor({ exporter: logExporter })] })
  vi.spyOn(logs, 'getLogger').mockImplementation((name) => logProvider.getLogger(name))
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(async () => {
  await logProvider.shutdown()
  vi.restoreAllMocks()
})

async function exportedLogs() {
  await logProvider.forceFlush()
  return logExporter.getFinishedLogRecords()
}

describe('связь логов с трассой', () => {
  it('лог внутри спана несёт trace_id и span_id этого спана — в OTel и в хлебных крошках', async () => {
    const { logger, withSpan } = await import('@/lib/telemetry')

    await withSpan('hook.awardPoints', { 'user.id': 7 }, async () => {
      logger.info('Начислены баллы', { 'user.id': 7 })
    })

    const [span] = spanExporter.getFinishedSpans()
    const [record] = await exportedLogs()
    expect(record?.attributes).toEqual({ 'user.id': 7, trace_id: span?.spanContext().traceId, span_id: span?.spanContext().spanId })
    expect(reporting.addLogBreadcrumb).toHaveBeenCalledWith('info', 'Начислены баллы', expect.objectContaining({ trace_id: span?.spanContext().traceId }))
  })

  it('вне спана лог не получает выдуманных идентификаторов трассы', async () => {
    const { logger } = await import('@/lib/telemetry')

    logger.info('Фоновая очистка завершена', { removed: 3 })

    const [record] = await exportedLogs()
    expect(record?.attributes).toEqual({ removed: 3 })
  })
})

describe('спаны', () => {
  it('без функции вызов отклоняется понятной ошибкой с именем спана', async () => {
    const { withSpan } = await import('@/lib/telemetry')

    await expect(withSpan('hook.broken', { 'user.id': 1 })).rejects.toThrow(new TypeError('withSpan("hook.broken"): не передана функция для выполнения внутри спана'))
    expect(spanExporter.getFinishedSpans()).toHaveLength(0)
  })

  it('ошибка внутри помечает спан как ERROR, сохраняет исключение и пробрасывается вызывающему', async () => {
    const { withSpan } = await import('@/lib/telemetry')
    const failure = new Error('БД недоступна')

    await expect(withSpan('hook.awardPoints', async () => { throw failure })).rejects.toBe(failure)

    const [span] = spanExporter.getFinishedSpans()
    expect(span?.status).toEqual({ code: SpanStatusCode.ERROR, message: 'Error: БД недоступна' })
    expect(span?.events.map((event) => [event.name, event.attributes?.['exception.message']])).toEqual([['exception', 'БД недоступна']])
  })

  it('брошенная строка тоже записывается исключением, а не теряется', async () => {
    const { withSpan } = await import('@/lib/telemetry')

    await expect(withSpan('job.digest', async () => { throw 'таймаут SMTP' })).rejects.toBe('таймаут SMTP')

    const [span] = spanExporter.getFinishedSpans()
    expect(span?.events[0]?.attributes?.['exception.message']).toBe('таймаут SMTP')
    expect(span?.ended).toBe(true)
  })
})

describe('logger.error с причиной не объектом Error', () => {
  it('текст причины не попадает в OTel-лог и stderr, но целиком передаётся в Sentry, где его очищают', async () => {
    const { logger } = await import('@/lib/telemetry')

    logger.error('Импорт урока упал', 'ECONNRESET при скачивании, token=leaked', { 'lesson.id': 3 })

    const [record] = await exportedLogs()
    expect(record?.attributes).toEqual({ 'lesson.id': 3 })
    const stderr = String(vi.mocked(console.error).mock.calls[0]?.[0])
    expect(stderr).toBe('[ERROR] Импорт урока упал {"lesson.id":3}')
    expect(reporting.captureServerError).toHaveBeenCalledWith('ECONNRESET при скачивании, token=leaked', {
      message: 'Импорт урока упал',
      attributes: { 'lesson.id': 3 },
    })
  })
})
