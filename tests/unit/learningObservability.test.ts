import { metrics, trace } from '@opentelemetry/api'
import { logs } from '@opentelemetry/api-logs'
import { InMemoryLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { AggregationTemporality, DataPointType, InMemoryMetricExporter, MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { tracing } from '@opentelemetry/sdk-node'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let exporter: InMemoryMetricExporter
let provider: MeterProvider
let logExporter: InMemoryLogRecordExporter
let logProvider: LoggerProvider
let observability: typeof import('@/lib/learning-observability')

beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '')
  exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
  provider = new MeterProvider({ readers: [new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: 3600000,
  })] })
  logExporter = new InMemoryLogRecordExporter()
  logProvider = new LoggerProvider({ processors: [new SimpleLogRecordProcessor({ exporter: logExporter })] })
  vi.spyOn(metrics, 'getMeter').mockImplementation((name) => provider.getMeter(name))
  vi.spyOn(logs, 'getLogger').mockImplementation((name) => logProvider.getLogger(name))
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  observability = await import('@/lib/learning-observability')
})

afterEach(async () => {
  await provider.shutdown()
  await logProvider.shutdown()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

async function metric(name: string) {
  await provider.forceFlush()
  const snapshots = exporter.getMetrics()
  const latest = snapshots.at(-1)
  const found = latest?.scopeMetrics.flatMap((scope) => scope.metrics).find((entry) => entry.descriptor.name === name)
  if (!found) throw new Error(`Metric ${name} was not exported by the real SDK`)
  return found
}

describe('learning observability: real in-memory OpenTelemetry export', () => {
  it('rebinds metrics when collection hooks load or run before the real SDK starts', async () => {
    const beforeSdk = metrics.getMeterProvider()
    vi.mocked(metrics.getMeter).mockReturnValueOnce(beforeSdk.getMeter('before-sdk'))
    observability.recordLearningAccess({ resource: 'course', outcome: 'allow', reason: 'assigned' })
    vi.spyOn(metrics, 'getMeterProvider').mockReturnValue(provider)
    observability.recordLearningAccess({ resource: 'course', outcome: 'allow', reason: 'assigned' })
    const result = await metric('lms_learning_access_total')
    expect(result.dataPoints[0]?.value).toBe(1)
  })
  it('aggregates different users into bounded dimensions and preserves numeric IDs only in logs', async () => {
    for (let userId = 1; userId <= 1000; userId += 1) {
      observability.recordLearningAccess({ resource: 'lesson', outcome: 'deny', reason: 'unassigned', userId, resourceId: userId + 1 })
    }
    const result = await metric('lms_learning_access_total')
    expect(result.dataPointType).toBe(DataPointType.SUM)
    expect(result.dataPoints).toHaveLength(1)
    expect(result.dataPoints[0]?.attributes).toEqual({ resource: 'lesson', outcome: 'deny', reason: 'unassigned' })
    expect(result.dataPoints[0]?.value).toBe(1000)
    await logProvider.forceFlush()
    expect(logExporter.getFinishedLogRecords().at(-1)?.attributes).toEqual({
      resource: 'lesson', outcome: 'deny', reason: 'unassigned', 'user.id': 1000, 'resource.id': 1001,
    })
  })

  it('discards unknown reasons and invalid IDs instead of exporting secrets', async () => {
    const secret = 'https://example.test/video?token=never-export&email=student@example.test'
    observability.recordLearningAccess({ resource: 'media', outcome: 'error', reason: secret, userId: Number.NaN, resourceId: -7 })
    const result = await metric('lms_learning_access_total')
    expect(result.dataPoints[0]?.attributes).toEqual({ resource: 'media', outcome: 'error', reason: 'other' })
    await logProvider.forceFlush()
    const records = logExporter.getFinishedLogRecords()
    expect(records[0]?.attributes).toEqual({ resource: 'media', outcome: 'error', reason: 'other' })
    expect(JSON.stringify(records)).not.toContain('never-export')
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).not.toContain('never-export')
  })

  it('exports only valid bounded durations and excludes reason/IDs from histogram dimensions', async () => {
    for (const durationMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      observability.recordLearningAccess({ resource: 'course', outcome: 'allow', reason: 'assigned', durationMs })
    }
    observability.recordLearningAccess({ resource: 'course', outcome: 'allow', reason: 'assigned', durationMs: 10, userId: 8 })
    observability.recordLearningAccess({ resource: 'course', outcome: 'allow', reason: 'inherited', durationMs: 900000, userId: 9 })
    const result = await metric('lms_learning_access_duration')
    expect(result.dataPointType).toBe(DataPointType.HISTOGRAM)
    if (result.dataPointType !== DataPointType.HISTOGRAM) throw new Error('Expected SDK histogram')
    expect(result.dataPoints).toHaveLength(1)
    expect(result.dataPoints[0]?.attributes).toEqual({ resource: 'course', outcome: 'allow' })
    expect(result.dataPoints[0]?.value.count).toBe(2)
    expect(result.dataPoints[0]?.value.sum).toBe(300.01)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('emits validated assignment events with actor and target IDs, not high cardinality metric labels', async () => {
    observability.recordLearningAssignment({ actorId: 1, userId: 25, operation: 'create', targetType: 'roadmap', targetId: 4, effect: 'allow' })
    observability.recordLearningAssignment({ actorId: 1, userId: 26, operation: 'create', targetType: 'roadmap', targetId: 5, effect: 'allow' })
    const result = await metric('lms_learning_assignment_total')
    expect(result.dataPoints).toHaveLength(1)
    expect(result.dataPoints[0]?.value).toBe(2)
    expect(result.dataPoints[0]?.attributes).toEqual({ operation: 'create', target_type: 'roadmap', effect: 'allow' })
    await logProvider.forceFlush()
    expect(logExporter.getFinishedLogRecords()[0]?.attributes).toMatchObject({ 'actor.id': 1, 'user.id': 25, 'resource.id': 4 })
    expect(console.error).toHaveBeenCalledTimes(2)
  })

  it('normalizes Payload collection names and drops arbitrary assignment targets before logging', async () => {
    observability.recordLearningAssignment({ actorId: 1, userId: 2, operation: 'update', targetType: 'roadmap-nodes', targetId: 3, effect: 'deny' })
    observability.recordLearningAssignment({ actorId: -1, userId: Number.POSITIVE_INFINITY, operation: 'delete', targetType: 'https://example.test?token=secret', targetId: 3, effect: 'deny' })
    const result = await metric('lms_learning_assignment_total')
    expect(result.dataPoints.map((point) => point.attributes.target_type)).toEqual(['node', 'other'])
    await logProvider.forceFlush()
    expect(logExporter.getFinishedLogRecords()[1]?.attributes).toEqual({
      operation: 'delete', target_type: 'other', effect: 'deny', 'audit.stage': 'validated', 'resource.id': 3,
    })
    expect(JSON.stringify(logExporter.getFinishedLogRecords())).not.toContain('token=secret')
  })

  it('correlates JSON denial logs with the active valid trace and adds a sanitized span event', () => {
    const span = trace.wrapSpanContext({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 })
    const event = vi.spyOn(span, 'addEvent')
    const status = vi.spyOn(span, 'setStatus')
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue(span)
    observability.recordLearningAccess({ resource: 'media', outcome: 'error', reason: 'upstream_timeout', userId: 7, resourceId: 12 })
    expect(event).toHaveBeenCalledWith('learning.access', expect.objectContaining({ reason: 'upstream_timeout', 'user.id': 7 }))
    expect(status).toHaveBeenCalledWith(expect.objectContaining({ message: 'upstream_timeout' }))
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).toContain(`"trace_id":"${'a'.repeat(32)}"`)
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).toContain(`"span_id":"${'b'.repeat(16)}"`)
  })

  it('sanitized span wrapper rethrows original failures without exporting signed URL error details', async () => {
    const span = trace.wrapSpanContext({ traceId: 'c'.repeat(32), spanId: 'd'.repeat(16), traceFlags: 1 })
    const status = vi.spyOn(span, 'setStatus')
    const exception = vi.spyOn(span, 'recordException')
    const event = vi.spyOn(span, 'addEvent')
    const end = vi.spyOn(span, 'end')
    const tracer = trace.getTracer('test')
    vi.spyOn(tracer, 'startActiveSpan').mockImplementation((...args) => {
      const fn = args.at(-1)
      if (typeof fn !== 'function') throw new Error('Expected active span callback')
      return fn(span)
    })
    vi.spyOn(trace, 'getTracer').mockReturnValue(tracer)
    const failure = new Error('https://cdn.example.test/file?token=secret')
    await expect(observability.withLearningSpan('media', 'stream', async () => { throw failure })).rejects.toBe(failure)
    expect(status).toHaveBeenCalledWith(expect.objectContaining({ message: 'internal_error' }))
    expect(event).toHaveBeenCalledWith('learning.failure', { reason: 'internal_error' })
    expect(exception).not.toHaveBeenCalled()
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('redacts Next request queries, signed URLs, SQL, email and raw exception details from real exported spans', async () => {
    const { sanitizeTelemetrySpan } = await import('@/instrumentation.node')
    const spanExporter = new tracing.InMemorySpanExporter()
    const tracerProvider = new tracing.BasicTracerProvider({
      resource: resourceFromAttributes({ 'service.name': 'lms-platform', 'process.command_line': 'node --token=secret' }),
      spanProcessors: [new tracing.SimpleSpanProcessor(spanExporter)],
    })
    const span = tracerProvider.getTracer('test').startSpan('GET /reset-password?token=secret')
    span.setAttributes({
      'http.target': '/reset-password?token=secret',
      'http.route': '/reset-password',
      'lesson.id': 37,
      'user.email': 'student@example.test',
      'db.statement': "SELECT * FROM users WHERE email = 'student@example.test'",
      'signed.source': 'https://cdn.example.test/file?token=secret',
    })
    span.recordException(new Error('https://cdn.example.test/file?token=secret'))
    span.end()
    await tracerProvider.forceFlush()
    const original = spanExporter.getFinishedSpans()[0]
    if (!original) throw new Error('Real span was not exported')
    const sanitized = sanitizeTelemetrySpan(original)
    expect(sanitized.name).toBe('GET /reset-password')
    expect(sanitized.attributes).toEqual({ 'http.route': '/reset-password', 'lesson.id': 37 })
    expect(sanitized.resource.attributes).toEqual({ 'service.name': 'lms-platform' })
    expect(sanitized.spanContext()).toEqual(original.spanContext())
    expect(JSON.stringify(sanitized)).not.toContain('token=secret')
    expect(JSON.stringify(sanitized)).not.toContain('student@example.test')
    expect(JSON.stringify(sanitized)).not.toContain('cdn.example.test')
    await tracerProvider.shutdown()
  })

  it('redacts existing logger raw error attributes and object bodies at the OTLP export boundary', async () => {
    const { sanitizeTelemetryLog } = await import('@/instrumentation.node')
    logProvider.getLogger('test').emit({ body: { password: 'never-export' }, attributes: {
      'error.message': 'secret password never-export',
      'error.stack': 'https://cdn.example.test/file?token=secret',
      'actor.id': 9,
      'arbitrary.object': { password: 'never-export' },
    } })
    await logProvider.forceFlush()
    const original = logExporter.getFinishedLogRecords()[0]
    if (!original) throw new Error('Real log was not exported')
    const sanitized = sanitizeTelemetryLog(original)
    expect(sanitized.body).toBe('redacted.telemetry')
    expect(sanitized.attributes).toEqual({ 'actor.id': 9 })
    expect(JSON.stringify(sanitized)).not.toContain('never-export')
    expect(JSON.stringify(sanitized)).not.toContain('token=secret')
  })

  it('redacts legacy logger stderr and log records before they can expose signed URLs and emails', async () => {
    const { logger } = await import('@/lib/telemetry')
    logger.error('YD Import упал: https://cdn.example.test/file?token=never-export password=never-export', new Error('Signed source never-export'), {
      'user.id': 17, 'user.email': 'student@example.test', source: 'https://cdn.example.test/file?token=never-export',
    })
    await logProvider.forceFlush()
    const encoded = JSON.stringify(logExporter.getFinishedLogRecords())
    const stderr = String(vi.mocked(console.error).mock.calls[0]?.[0])
    for (const output of [encoded, stderr]) {
      expect(output).not.toContain('never-export')
      expect(output).not.toContain('student@example.test')
      expect(output).not.toContain('cdn.example.test')
      expect(output).toContain('17')
    }
  })
})
