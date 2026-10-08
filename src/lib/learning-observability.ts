import { context, isSpanContextValid, metrics, SpanStatusCode, trace, type Attributes } from '@opentelemetry/api'
import { logs, SeverityNumber } from '@opentelemetry/api-logs'

export const LEARNING_RESOURCES = ['roadmap', 'node', 'course', 'section', 'lesson', 'media'] as const
export const LEARNING_ACCESS_REASONS = [
  'admin', 'assigned', 'inherited', 'unrestricted', 'restricted', 'explicit_deny',
  'unassigned', 'unauthenticated', 'unpublished', 'not_found', 'invalid_request',
  'invalid_origin', 'invalid_range', 'invalid_source', 'rate_limited',
  'upstream_unavailable', 'upstream_error', 'upstream_timeout', 'stream_error',
  'internal_error', 'other',
] as const

type LearningResource = typeof LEARNING_RESOURCES[number]
type LearningOutcome = 'allow' | 'deny' | 'error'
type AssignmentOperation = 'create' | 'update' | 'delete'

export interface LearningAccessEvent {
  resource: LearningResource
  outcome: LearningOutcome
  reason: string
  userId?: number
  resourceId?: number
  durationMs?: number
}

export interface LearningAssignmentEvent {
  actorId: number
  userId: number
  operation: AssignmentOperation
  targetType: string
  targetId: number
  effect: 'allow' | 'deny'
}

const METER_NAME = 'lms.learning'
const assignmentTargetNames = new Map<string, string>([
  ['roadmaps', 'roadmap'], ['roadmap-nodes', 'node'], ['courses', 'course'],
  ['sections', 'section'], ['lessons', 'lesson'],
])
function createInstruments() {
  const meter = metrics.getMeter(METER_NAME)
  return {
    accessCount: meter.createCounter('lms_learning_access_total', {
      description: 'Learning access decisions and media outcomes',
    }),
    accessDuration: meter.createHistogram('lms_learning_access_duration', {
      description: 'Learning access decision or media request duration', unit: 's',
      advice: { explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15, 30] },
    }),
    assignmentCount: meter.createCounter('lms_learning_assignment_total', {
      description: 'Validated learning assignment mutations before transaction commit',
    }),
  }
}

let instrumentProvider: ReturnType<typeof metrics.getMeterProvider> | undefined
let cachedInstruments: ReturnType<typeof createInstruments> | undefined

function instruments() {
  const provider = metrics.getMeterProvider()
  // Metrics API instruments created before SDK startup stay no-op; rebind on startup.
  if (!cachedInstruments || instrumentProvider !== provider) {
    instrumentProvider = provider
    cachedInstruments = createInstruments()
  }
  return cachedInstruments
}

function boundedValue(value: string, allowed: readonly string[], fallback: string): string {
  return allowed.includes(value) ? value : fallback
}

function safeId(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function withIds(attributes: Attributes, ids: Record<string, number | undefined>): Attributes {
  for (const [key, value] of Object.entries(ids)) {
    const id = safeId(value)
    if (id !== undefined) attributes[key] = id
  }
  return attributes
}

function emit(event: string, severity: 'INFO' | 'WARN' | 'ERROR', attributes: Attributes): void {
  const activeSpan = trace.getActiveSpan()
  const spanContext = activeSpan?.spanContext()
  const correlation = spanContext && isSpanContextValid(spanContext)
    ? { trace_id: spanContext.traceId, span_id: spanContext.spanId }
    : {}

  logs.getLogger(METER_NAME).emit({
    severityNumber: SeverityNumber[severity],
    severityText: severity,
    body: event,
    attributes,
    context: context.active(),
  })

  // Keep audit/denial events usable in Docker logs even without an OTLP collector.
  const line = JSON.stringify({ event, severity, ...attributes, ...correlation })
  console.error(line)
}

export function recordLearningAccess(event: LearningAccessEvent): void {
  const { accessCount, accessDuration } = instruments()
  const labels = {
    resource: boundedValue(event.resource, LEARNING_RESOURCES, 'other'),
    outcome: boundedValue(event.outcome, ['allow', 'deny', 'error'], 'error'),
    reason: boundedValue(event.reason, LEARNING_ACCESS_REASONS, 'other'),
  }
  accessCount.add(1, labels)
  if (typeof event.durationMs === 'number' && Number.isFinite(event.durationMs) && event.durationMs >= 0) {
    accessDuration.record(Math.min(event.durationMs, 300000) / 1000, {
      resource: labels.resource,
      outcome: labels.outcome,
    })
  }

  const attributes = withIds({ ...labels }, { 'user.id': event.userId, 'resource.id': event.resourceId })
  trace.getActiveSpan()?.addEvent('learning.access', attributes)
  if (labels.outcome === 'error') {
    trace.getActiveSpan()?.setStatus({ code: SpanStatusCode.ERROR, message: labels.reason })
  }
  if (labels.outcome !== 'allow') {
    emit('learning.access', labels.outcome === 'error' ? 'ERROR' : 'WARN', attributes)
  }
}

/** Validated mutation event; the transactional Payload audit is the committed source of truth. */
export function recordLearningAssignment(event: LearningAssignmentEvent): void {
  const { assignmentCount } = instruments()
  const labels = {
    operation: boundedValue(event.operation, ['create', 'update', 'delete'], 'other'),
    target_type: boundedValue(assignmentTargetNames.get(event.targetType) ?? event.targetType, LEARNING_RESOURCES, 'other'),
    effect: boundedValue(event.effect, ['allow', 'deny'], 'other'),
  }
  assignmentCount.add(1, labels)
  const attributes = withIds({ ...labels, 'audit.stage': 'validated' }, {
    'actor.id': event.actorId,
    'user.id': event.userId,
    'resource.id': event.targetId,
  })
  trace.getActiveSpan()?.addEvent('learning.assignment', attributes)
  emit('learning.assignment', 'INFO', attributes)
}

/** Error details can contain signed media URLs; only a fixed reason enters telemetry. */
export async function withLearningSpan<T>(
  resource: LearningResource,
  operation: 'access' | 'assignment' | 'stream',
  fn: () => Promise<T>,
): Promise<T> {
  const safeResource = boundedValue(resource, LEARNING_RESOURCES, 'other')
  const safeOperation = boundedValue(operation, ['access', 'assignment', 'stream'], 'other')
  return trace.getTracer(METER_NAME).startActiveSpan(`learning.${safeOperation}`, {
    attributes: { resource: safeResource },
  }, async (span) => {
    try {
      return await fn()
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'internal_error' })
      span.addEvent('learning.failure', { reason: 'internal_error' })
      throw error
    } finally {
      span.end()
    }
  })
}
