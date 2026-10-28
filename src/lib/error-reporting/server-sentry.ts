import * as Sentry from '@sentry/nextjs'
import { serverSentryDsn } from '@/lib/error-reporting/dsn'
import { scrubBreadcrumb, scrubEvent } from '@/lib/error-reporting/scrub-event'
import { DATA_COLLECTION, sentryEnvironment } from '@/lib/error-reporting/sentry-options'

/**
 * Sentry на сервере Node. Вызывается после старта OpenTelemetry: трассы и метрики
 * остаются в своём конвейере (collector → Tempo/Prometheus), Sentry спанов не шлёт
 * и своего провайдера не регистрирует, а события ошибок привязывает к активному
 * спану OTel — по trace_id из Sentry находится трасса запроса в Tempo.
 */
/** `transport` подменяется только в тестах: так проверяется настоящий конверт, а не моки SDK. */
export function initServerSentry(overrides: Pick<Sentry.NodeOptions, 'transport'> = {}): boolean {
  const dsn = serverSentryDsn()
  if (!dsn) {
    if (process.env.SENTRY_DSN?.trim()) console.error('[sentry] SENTRY_DSN задан в неверном формате - отчёты об ошибках выключены')
    return false
  }

  Sentry.init({
    dsn: dsn.dsn,
    environment: sentryEnvironment(),
    enableOpenTelemetrySetup: false,
    dataCollection: DATA_COLLECTION,
    integrations: (defaults) => [...defaults, Sentry.openTelemetryIntegration()],
    maxBreadcrumbs: 50,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
    ...overrides,
  })
  return true
}
