/**
 * OpenTelemetry Node SDK initialization.
 * Imported dynamically from instrumentation.ts (only in Node.js runtime, not edge).
 *
 * Auto-instruments: HTTP requests/responses, PostgreSQL queries (pg driver).
 * Manual spans are created via withSpan() from @/lib/telemetry.
 *
 * To enable, set OTEL_EXPORTER_OTLP_ENDPOINT (e.g. http://otel-collector:4318).
 * Without the env var, telemetry is completely disabled (zero overhead).
 */

import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions'

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()

if (OTEL_ENDPOINT) {
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'lms-platform',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
  })

  const traceExporter = new OTLPTraceExporter({
    url: `${OTEL_ENDPOINT}/v1/traces`,
  })

  const logExporter = new OTLPLogExporter({
    url: `${OTEL_ENDPOINT}/v1/logs`,
  })

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    logRecordProcessors: [new SimpleLogRecordProcessor(logExporter)],
    instrumentations: [
      getNodeAutoInstrumentations({
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
