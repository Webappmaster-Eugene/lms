import { isSpanContextValid, trace, SpanStatusCode, type Span, type Tracer, type Attributes } from '@opentelemetry/api'
import { logs, SeverityNumber } from '@opentelemetry/api-logs'

const TRACER_NAME = 'lms'
const LOGGER_NAME = 'lms'
const SENSITIVE_LOG_ATTRIBUTE = /email|password|token|secret|cookie|authorization|stack|^(?:error\.message|exception\.message)$/i

function safeLogText(value: string): string {
  return value
    .replace(/\b(?:https?|postgres(?:ql)?|redis|rediss):\/\/[^\s"'<>]+/gi, '[redacted URL]')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[redacted email]')
    .replace(/\b(password|token|secret|authorization|cookie|public_key|private_key)\s*[:=]\s*(?:["'][^"']*["']|[^\s,;]+)/gi, '$1=[redacted]')
}

function safeLogAttributes(attributes: Attributes | undefined): Attributes {
  const safe: Attributes = {}
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (SENSITIVE_LOG_ATTRIBUTE.test(key)) continue
    if (typeof value === 'string') safe[key] = safeLogText(value)
    else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) safe[key] = value
  }
  const correlation = trace.getActiveSpan()?.spanContext()
  if (correlation && isSpanContextValid(correlation)) {
    safe.trace_id = correlation.traceId
    safe.span_id = correlation.spanId
  }
  return safe
}

/** Returns a Tracer from the global TracerProvider (set by NodeSDK in instrumentation.node.ts). */
export function getTracer(name: string = TRACER_NAME): Tracer {
  return trace.getTracer(name)
}

/**
 * Wraps an async function in a named span with automatic error recording.
 *
 * @example
 * // Without attributes:
 * await withSpan('hook.awardPoints', async () => { ... })
 *
 * // With attributes:
 * await withSpan('hook.awardPoints', { 'user.id': userId }, async () => { ... })
 */
export async function withSpan<T>(
  spanName: string,
  attributesOrFn: Attributes | (() => Promise<T>),
  maybeFn?: () => Promise<T>,
): Promise<T> {
  const attributes = typeof attributesOrFn === 'function' ? {} : attributesOrFn
  const fn = typeof attributesOrFn === 'function' ? attributesOrFn : maybeFn

  if (!fn) {
    throw new TypeError(`withSpan("${spanName}"): не передана функция для выполнения внутри спана`)
  }

  const tracer = getTracer()
  return tracer.startActiveSpan(spanName, { attributes }, async (span: Span) => {
    try {
      const result = await fn()
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) })
      span.recordException(error instanceof Error ? error : new Error(String(error)))
      throw error
    } finally {
      span.end()
    }
  })
}

/**
 * Structured logger emitting OTel LogRecords.
 * Each log automatically carries trace_id/span_id from the active context.
 *
 * Предупреждения и ошибки дублируются в stderr: сбой фонового хука иначе
 * виден только в собранной телеметрии, а в `docker logs` контейнера — нет,
 * и отладка на проде превращается в гадание.
 */
function emit(severity: SeverityNumber, severityText: string, message: string, attrs?: Attributes): void {
  const safeMessage = safeLogText(message)
  const safeAttributes = safeLogAttributes(attrs)
  const otelLogger = logs.getLogger(LOGGER_NAME)
  otelLogger.emit({
    severityNumber: severity,
    severityText,
    body: safeMessage,
    attributes: safeAttributes,
  })

  if (severity >= SeverityNumber.WARN) {
    const details = Object.keys(safeAttributes).length > 0 ? ` ${JSON.stringify(safeAttributes)}` : ''
    console.error(`[${severityText}] ${safeMessage}${details}`)
  }
}

export const logger = {
  info(message: string, attrs?: Attributes): void {
    emit(SeverityNumber.INFO, 'INFO', message, attrs)
  },

  warn(message: string, attrs?: Attributes): void {
    emit(SeverityNumber.WARN, 'WARN', message, attrs)
  },

  error(message: string, error?: unknown, attrs?: Attributes): void {
    const errorAttrs: Attributes = { ...attrs }
    if (error instanceof Error) {
      errorAttrs['error.type'] = error.name
      errorAttrs['error.message'] = error.message
      errorAttrs['error.stack'] = error.stack ?? ''
    } else if (error !== undefined) {
      errorAttrs['error.message'] = String(error)
    }
    emit(SeverityNumber.ERROR, 'ERROR', message, errorAttrs)
  },
}
