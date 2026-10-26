import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Запуск OpenTelemetry на сервере. SDK, автоинструментация и OTLP-экспортёры —
 * внешние границы: подменяются, чтобы увидеть, что и куда ушло бы, без сети.
 */
const otel = vi.hoisted(() => ({
  sdks: [] as { config: Record<string, unknown>; start: ReturnType<typeof vi.fn>; shutdown: ReturnType<typeof vi.fn> }[],
  exporters: [] as { kind: string; options: { url?: string }; exported: unknown[][]; instance: { export: (items: unknown[], done: (result: { code: number }) => void) => void } }[],
  auto: vi.fn((config: Record<string, unknown>) => [{ autoConfig: config }]),
  sentry: vi.fn(),
}))

function exporter(kind: string) {
  return class {
    exported: unknown[][] = []
    constructor(readonly options: { url?: string }) { otel.exporters.push({ kind, options, exported: this.exported, instance: this }) }
    export(items: unknown[], done: (result: { code: number }) => void) { this.exported.push(items); done({ code: 0 }) }
  }
}

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: class {
    start = vi.fn()
    shutdown = vi.fn(async () => undefined)
    constructor(readonly config: Record<string, unknown>) { otel.sdks.push(this) }
  },
}))
vi.mock('@opentelemetry/auto-instrumentations-node', () => ({ getNodeAutoInstrumentations: otel.auto }))
vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({ OTLPTraceExporter: exporter('traces') }))
vi.mock('@opentelemetry/exporter-logs-otlp-http', () => ({ OTLPLogExporter: exporter('logs') }))
vi.mock('@opentelemetry/exporter-metrics-otlp-http', async (original) => ({
  ...await original<typeof import('@opentelemetry/exporter-metrics-otlp-http')>(),
  OTLPMetricExporter: exporter('metrics'),
}))
vi.mock('@/lib/error-reporting/server-sentry', () => ({ initServerSentry: otel.sentry }))

type Signal = 'SIGTERM' | 'SIGINT'
let handlers: Partial<Record<Signal, () => void>>

async function start(env: Record<string, string>) {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
  vi.resetModules()
  return import('@/instrumentation.node')
}

const context = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1, isRemote: false, traceState: { secret: 'state' } }

beforeEach(() => {
  otel.sdks.length = 0
  otel.exporters.length = 0
  otel.auto.mockClear()
  otel.sentry.mockClear()
  handlers = {}
  vi.spyOn(process, 'on').mockImplementation(((event: string, handler: () => void) => {
    if (event === 'SIGTERM' || event === 'SIGINT') handlers[event] = handler
    return process
  }) as typeof process.on)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('телеметрия сервера', () => {
  it('без OTEL_EXPORTER_OTLP_ENDPOINT SDK не запускается и в сеть ничего не уходит, Sentry поднимается', async () => {
    await start({ OTEL_EXPORTER_OTLP_ENDPOINT: '' })
    expect(otel.sdks).toEqual([])
    expect(otel.exporters).toEqual([])
    expect(otel.sentry).toHaveBeenCalledTimes(1)
    expect(handlers).toEqual({})
  })

  it('с адресом коллектора запускает SDK с тремя экспортёрами на нормализованные пути, затем Sentry', async () => {
    await start({ OTEL_EXPORTER_OTLP_ENDPOINT: ' http://otel-collector:4318// ', OTEL_SERVICE_NAME: 'lms-test', NODE_ENV: 'production' })
    expect(otel.sdks).toHaveLength(1)
    const [sdk] = otel.sdks
    expect(sdk.start).toHaveBeenCalledTimes(1)
    expect(otel.exporters.map(({ kind, options }) => [kind, options.url])).toEqual([
      ['traces', 'http://otel-collector:4318/v1/traces'],
      ['logs', 'http://otel-collector:4318/v1/logs'],
      ['metrics', 'http://otel-collector:4318/v1/metrics'],
    ])
    const resource = sdk.config.resource as { attributes: Record<string, unknown> }
    expect(resource.attributes).toMatchObject({ 'service.name': 'lms-test', 'service.version': '1.0.0', 'deployment.environment': 'production' })
    expect(otel.sentry.mock.invocationCallOrder[0]).toBeGreaterThan(sdk.start.mock.invocationCallOrder[0])
  })

  it('HTTP-инструментация выключена: URL с токенами сброса и подписанными ссылками не попадают в трассы', async () => {
    await start({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel:4318' })
    expect(otel.auto).toHaveBeenCalledWith(expect.objectContaining({
      '@opentelemetry/instrumentation-http': { enabled: false },
      '@opentelemetry/instrumentation-undici': { enabled: false },
      '@opentelemetry/instrumentation-pg': { enhancedDatabaseReporting: false },
    }))
    const views = otel.sdks[0].config.views as { instrumentName: string; aggregationCardinalityLimit: number }[]
    expect(views.map((view) => [view.instrumentName, view.aggregationCardinalityLimit])).toEqual([
      ['lms_learning_access_total', 512], ['lms_learning_access_duration', 32], ['lms_learning_assignment_total', 128],
    ])
  })

  it('экспортёр трасс получает только очищенные спаны, включая события и связи', async () => {
    await start({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel:4318' })
    const traces = otel.sdks[0].config.traceExporter as { export: (items: unknown[], done: () => void) => void }
    const span = {
      name: 'GET /reset-password?token=secret', kind: 1, startTime: [1, 0], endTime: [2, 0], duration: [1, 0], ended: true,
      spanContext: () => context, parentSpanContext: context,
      instrumentationScope: { name: 'next', version: '15', schemaUrl: 'https://schema.example' },
      droppedAttributesCount: 0, droppedEventsCount: 0, droppedLinksCount: 0,
      attributes: { 'http.route': '/reset-password', 'user.email': 'student@example.test', 'lesson.id': 7 },
      status: { code: 2, message: 'password=hunter2' },
      resource: { attributes: { 'service.name': 'lms', 'process.command_line': 'node --token=secret' } },
      events: [{ name: 'exception', time: [1, 0], attributes: { 'exception.message': 'https://cdn.example/x?token=secret', 'lesson.id': 7 } }],
      links: [{ context, attributes: { 'link.url': 'https://cdn.example/x?token=secret', 'course.id': 3 } }],
    }
    const done = vi.fn()
    traces.export([span], done)
    expect(done).toHaveBeenCalledWith({ code: 0 })
    const [[sent]] = otel.exporters.find((item) => item.kind === 'traces')?.exported as Record<string, unknown>[][]
    expect(sent).toMatchObject({ name: 'GET /reset-password', attributes: { 'http.route': '/reset-password', 'lesson.id': 7 }, status: { code: 2 } })
    expect((sent.events as { attributes: unknown }[])[0].attributes).toEqual({ 'lesson.id': 7 })
    expect((sent.links as { attributes: unknown; context: unknown }[])[0]).toMatchObject({ attributes: { 'course.id': 3 }, context: { traceId: context.traceId, spanId: context.spanId } })
    const text = JSON.stringify(sent)
    for (const secret of ['token=secret', 'student@example.test', 'hunter2', 'traceState', 'schema.example']) expect(text).not.toContain(secret)
  })

  it('экспортёр логов получает только очищенные записи', async () => {
    await start({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel:4318' })
    const logs = otel.exporters.find((item) => item.kind === 'logs')
    // Экспортёр логов создаётся модулем как подкласс OTLP — вызываем его export так же, как процессор пакетов.
    logs?.instance.export([{
      hrTime: [1, 0], hrTimeObserved: [1, 0], severityNumber: 17, severityText: 'ERROR',
      instrumentationScope: { name: 'lms' }, droppedAttributesCount: 0,
      body: 'Reset failed for student@example.test', attributes: { 'user.id': 5, 'error.message': 'secret' },
      resource: { attributes: { 'service.name': 'lms' } },
    }], vi.fn())
    const [[sent]] = logs?.exported as Record<string, unknown>[][]
    expect(sent).toMatchObject({ body: 'redacted.telemetry', attributes: { 'user.id': 5 }, severityText: 'ERROR' })
    expect(JSON.stringify(sent)).not.toContain('student@example.test')
  })

  it('SIGTERM и SIGINT завершают SDK; сбой завершения не роняет процесс', async () => {
    await start({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel:4318' })
    const [sdk] = otel.sdks
    sdk.shutdown.mockRejectedValueOnce(new Error('exporter unreachable'))
    handlers.SIGTERM?.()
    handlers.SIGINT?.()
    await new Promise((resolve) => setImmediate(resolve))
    expect(sdk.shutdown).toHaveBeenCalledTimes(2)
  })
})
