/**
 * OpenTelemetry Node SDK initialization.
 * Imported dynamically from instrumentation.ts (only in Node.js runtime, not edge).
 *
 * Auto-instruments: PostgreSQL queries (pg driver).
 * Manual spans are created via withSpan() from @/lib/telemetry.
 *
 * To enable, set OTEL_EXPORTER_OTLP_ENDPOINT (e.g. http://otel-collector:4318).
 * Without the env var, the SDK and network export remain disabled.
 */

import { NodeSDK } from '@opentelemetry/sdk-node'
import { type Attributes, type SpanContext } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { AggregationTemporalityPreference, OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { createAllowListAttributesProcessor, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions'

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim().replace(/\/+$/, '')

type ExportedSpan = Parameters<OTLPTraceExporter['export']>[0][number]
type ExportedLog = Parameters<OTLPLogExporter['export']>[0][number]

const SENSITIVE_ATTRIBUTE = /(?:url|uri|email|password|token|secret|cookie|authorization|stack|statement|query)|^(?:http\.target|error\.message|exception\.message|process\.command.*)$/i
const SENSITIVE_TEXT = /:\/\/|\?|[^\s@]+@[^\s@]+\.[^\s@]+|\b(?:failed\s+query|query\s+failed|params|parameters)\s*:|\b(?:select\b[\s\S]*?\bfrom|insert\s+into|update\s+\S+\s+set|delete\s+from)\b|\b(?:reset[-_]?(?:password[-_]?)?token|invite[-_]?token|invitation[-_]?token|password|token|secret|authorization|cookie)\s*[:=]\s*\S+/i

function safeSpanContext(value: SpanContext): SpanContext {
  return { traceId: value.traceId, spanId: value.spanId, traceFlags: value.traceFlags, isRemote: value.isRemote }
}

/** Next also emits http.target without HTTP auto-instrumentation; redact before export. */
export function sanitizeTelemetryAttributes(attributes: Readonly<Record<string, unknown>>): Attributes {
  const safe: Attributes = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (SENSITIVE_ATTRIBUTE.test(key)) continue
    if (typeof value === 'string') {
      if (!SENSITIVE_TEXT.test(value)) safe[key] = value
    } else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      safe[key] = value
    }
  }
  return safe
}

export function sanitizeTelemetrySpan(span: ExportedSpan): ExportedSpan {
  return {
    spanContext: () => safeSpanContext(span.spanContext()),
    parentSpanContext: span.parentSpanContext ? safeSpanContext(span.parentSpanContext) : undefined,
    kind: span.kind,
    startTime: span.startTime,
    endTime: span.endTime,
    duration: span.duration,
    ended: span.ended,
    instrumentationScope: { name: span.instrumentationScope.name, version: span.instrumentationScope.version },
    droppedAttributesCount: span.droppedAttributesCount,
    droppedEventsCount: span.droppedEventsCount,
    droppedLinksCount: span.droppedLinksCount,
    name: SENSITIVE_TEXT.test(span.name.split('?')[0]) ? 'redacted.request' : span.name.split('?')[0],
    attributes: sanitizeTelemetryAttributes(span.attributes),
    status: { code: span.status.code },
    resource: resourceFromAttributes(sanitizeTelemetryAttributes(span.resource.attributes)),
    events: span.events.map((event) => ({ ...event, attributes: sanitizeTelemetryAttributes(event.attributes ?? {}) })),
    links: span.links.map((link) => ({ ...link, context: safeSpanContext(link.context), attributes: sanitizeTelemetryAttributes(link.attributes ?? {}) })),
  }
}

export function sanitizeTelemetryLog(record: ExportedLog): ExportedLog {
  return {
    hrTime: record.hrTime,
    hrTimeObserved: record.hrTimeObserved,
    spanContext: record.spanContext ? safeSpanContext(record.spanContext) : undefined,
    severityNumber: record.severityNumber,
    severityText: record.severityText,
    eventName: record.eventName,
    instrumentationScope: { name: record.instrumentationScope.name, version: record.instrumentationScope.version },
    droppedAttributesCount: record.droppedAttributesCount,
    body: typeof record.body === 'string' && !SENSITIVE_TEXT.test(record.body) ? record.body : 'redacted.telemetry',
    attributes: sanitizeTelemetryAttributes(record.attributes),
    resource: resourceFromAttributes(sanitizeTelemetryAttributes(record.resource.attributes)),
  }
}

class SanitizedOTLPTraceExporter extends OTLPTraceExporter {
  override export(...args: Parameters<OTLPTraceExporter['export']>): void {
    super.export(args[0].map(sanitizeTelemetrySpan), args[1])
  }
}

class SanitizedOTLPLogExporter extends OTLPLogExporter {
  override export(...args: Parameters<OTLPLogExporter['export']>): void {
    super.export(args[0].map(sanitizeTelemetryLog), args[1])
  }
}

if (OTEL_ENDPOINT) {
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'lms-platform',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
  })

  const traceExporter = new SanitizedOTLPTraceExporter({
    url: `${OTEL_ENDPOINT}/v1/traces`,
  })

  const logExporter = new SanitizedOTLPLogExporter({
    url: `${OTEL_ENDPOINT}/v1/logs`,
  })

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    logRecordProcessors: [new BatchLogRecordProcessor({
      exporter: logExporter,
      maxQueueSize: 2048,
      maxExportBatchSize: 256,
      scheduledDelayMillis: 1000,
      exportTimeoutMillis: 5000,
    })],
    metricReaders: [new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${OTEL_ENDPOINT}/v1/metrics`, timeoutMillis: 5000,
        temporalityPreference: AggregationTemporalityPreference.CUMULATIVE,
      }),
      exportIntervalMillis: 15000,
      exportTimeoutMillis: 5000,
    })],
    views: [
      {
        meterName: 'lms.learning',
        instrumentName: 'lms_learning_access_total',
        aggregationCardinalityLimit: 512,
        attributesProcessors: [createAllowListAttributesProcessor(['resource', 'outcome', 'reason'])],
      },
      {
        meterName: 'lms.learning',
        instrumentName: 'lms_learning_access_duration',
        aggregationCardinalityLimit: 32,
        attributesProcessors: [createAllowListAttributesProcessor(['resource', 'outcome'])],
      },
      {
        meterName: 'lms.learning',
        instrumentName: 'lms_learning_assignment_total',
        aggregationCardinalityLimit: 128,
        attributesProcessors: [createAllowListAttributesProcessor(['operation', 'target_type', 'effect'])],
      },
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        // HTTP client/server URLs may contain reset tokens and signed media URLs.
        // Next.js request spans and opaque-ID manual spans remain available.
        '@opentelemetry/instrumentation-http': { enabled: false },
        '@opentelemetry/instrumentation-undici': { enabled: false },
        '@opentelemetry/instrumentation-pg': { enhancedDatabaseReporting: false },
        // Disable noisy instrumentations that produce no actionable data with Next.js
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      }),
    ],
  })

  sdk.start()

  const shutdown = async (): Promise<void> => {
    try {
      await sdk.shutdown()
    } catch {
      // Best-effort shutdown
    }
  }

  process.on('SIGTERM', () => void shutdown())
  process.on('SIGINT', () => void shutdown())
}
