import * as Sentry from '@sentry/nextjs'
import { scrubBreadcrumb, scrubEvent } from '@/lib/error-reporting/scrub-event'
import {
  BROWSER_DENY_URLS,
  BROWSER_IGNORED_ERRORS,
  BROWSER_PLACEHOLDER_DSN,
  SENTRY_TUNNEL_PATH,
  sentryEnvironment,
  DATA_COLLECTION,
} from '@/lib/error-reporting/sentry-options'

Sentry.init({
  dsn: BROWSER_PLACEHOLDER_DSN,
  tunnel: SENTRY_TUNNEL_PATH,
  // В dev ошибки видны в оверлее Next; отчёты нужны только с собранного сайта.
  enabled: process.env.NODE_ENV === 'production',
  environment: sentryEnvironment(),
  dataCollection: DATA_COLLECTION,
  // Сессии отправлялись бы на каждое открытие страницы — это нагрузка на туннель без пользы для разбора ошибок.
  integrations: (defaults) => defaults.filter((integration) => integration.name !== 'BrowserSession'),
  ignoreErrors: BROWSER_IGNORED_ERRORS,
  denyUrls: BROWSER_DENY_URLS,
  maxBreadcrumbs: 50,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
})
