import { trace, SpanStatusCode, type Span, type Tracer, type Attributes } from '@opentelemetry/api'
import { logs, SeverityNumber } from '@opentelemetry/api-logs'

const TRACER_NAME = 'lms'
const LOGGER_NAME = 'lms'

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
  const fn = typeof attributesOrFn === 'function' ? attributesOrFn : maybeFn!

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
 */
function emit(severity: SeverityNumber, severityText: string, message: string, attrs?: Attributes): void {
  const otelLogger = logs.getLogger(LOGGER_NAME)
  otelLogger.emit({
    severityNumber: severity,
    severityText,
    body: message,
    attributes: attrs,
  })
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
