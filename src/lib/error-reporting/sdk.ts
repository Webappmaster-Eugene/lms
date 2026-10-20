import * as SentryNamespace from '@sentry/nextjs'

/**
 * SDK Sentry для серверного кода, который загружается и вне Next.
 *
 * `payload migrate`, `payload run` и сиды грузят конфиг Payload из чистого Node ESM.
 * Там @sentry/nextjs приходит CommonJS-модулем, и его функции видны только
 * в default — именованный импорт `flush` роняет запуск, а `Sentry.captureException`
 * из namespace оказывается undefined. В бандле Next default нет, и берётся namespace.
 */
const fromDefault: unknown = Reflect.get(SentryNamespace, 'default')

export const Sentry: typeof SentryNamespace = fromDefault && typeof fromDefault === 'object' && 'captureException' in fromDefault
  ? (fromDefault as typeof SentryNamespace)
  : SentryNamespace
