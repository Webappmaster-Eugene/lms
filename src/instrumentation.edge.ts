import * as Sentry from '@sentry/nextjs'
import { serverSentryDsn } from '@/lib/error-reporting/dsn'
import { scrubBreadcrumb, scrubEvent } from '@/lib/error-reporting/scrub-event'
import { DATA_COLLECTION, sentryEnvironment } from '@/lib/error-reporting/sentry-options'

const dsn = serverSentryDsn()

// В edge работает только middleware; без DSN SDK не поднимаем вовсе.
if (dsn) {
  Sentry.init({
    dsn: dsn.dsn,
    environment: sentryEnvironment(),
    dataCollection: DATA_COLLECTION,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  })
}
