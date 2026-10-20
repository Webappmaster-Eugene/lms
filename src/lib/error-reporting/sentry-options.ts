/**
 * Общие настройки Sentry для браузера, сервера и edge.
 *
 * Браузер не знает настоящего DSN: события идут в туннель `/api/monitoring`,
 * а сервер подставляет DSN из SENTRY_DSN. Так CSP остаётся `connect-src 'self'`,
 * блокировщики рекламы не режут отчёты, а включить, выключить или перенести
 * трекер можно переменной окружения без пересборки образа.
 */

import type { BrowserOptions } from '@sentry/nextjs'

export const SENTRY_TUNNEL_PATH = '/api/monitoring'

/** DSN-заглушка браузера: туннель заменяет её настоящим перед отправкой. */
export const BROWSER_PLACEHOLDER_DSN = 'https://lms@sentry.invalid/1'

export function sentryEnvironment(): string {
  return process.env.SENTRY_ENVIRONMENT?.trim() || (process.env.NODE_ENV === 'production' ? 'production' : 'development')
}

/** Ошибки, которые не говорят о дефекте платформы и только расходуют квоту. */
export const BROWSER_IGNORED_ERRORS: Array<string | RegExp> = [
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
  // Обрыв сети на телефоне: ученик видит сообщение об ошибке от самой формы.
  /^TypeError: (?:Failed to fetch|NetworkError when attempting to fetch resource\.|Load failed|cancelled|отменено)$/i,
  /^(?:Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.)$/,
  /AbortError/,
  'Non-Error promise rejection captured',
]

/** Скрипты расширений браузера падают внутри страницы, но к платформе отношения не имеют. */
export const BROWSER_DENY_URLS: RegExp[] = [/^chrome-extension:\/\//i, /^moz-extension:\/\//i, /^safari-(?:web-)?extension:\/\//i, /^webkit-masked-url:/i]

/**
 * Что SDK собирает сам. Почти всё выключено: cookie и заголовки авторизации
 * открывают сессию ученика, query и тела запросов несут токены сброса пароля,
 * а значения SQL-параметров — что угодно. beforeSend чистит ещё раз на случай,
 * если данные попадут в событие другим путём.
 */
export const DATA_COLLECTION: NonNullable<BrowserOptions['dataCollection']> = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ['user-agent', 'accept-language', 'content-type', 'sec-fetch-site'] }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  stackFrameVariables: false,
}
