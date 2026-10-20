import type { Breadcrumb, ErrorEvent, EventHint } from '@sentry/nextjs'
import { redactData, redactText, redactUrlPath } from '@/lib/error-reporting/redact'

/** Заголовки, по которым можно разбирать ошибку и которые не несут сессию или адрес. */
const SAFE_HEADERS = new Set(['user-agent', 'accept', 'accept-language', 'content-type', 'content-length', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'x-request-id'])

/** Ошибки управления потоком Next: redirect() и notFound() — штатное поведение, а не сбой. */
const NEXT_CONTROL_FLOW = /^NEXT_(?:REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/

function digestOf(hint: EventHint | undefined): string | undefined {
  const original = hint?.originalException
  if (original && typeof original === 'object' && 'digest' in original && typeof original.digest === 'string') return original.digest
  return undefined
}

function isNextControlFlow(hint: EventHint | undefined): boolean {
  const digest = digestOf(hint)
  if (digest && NEXT_CONTROL_FLOW.test(digest)) return true
  const original = hint?.originalException
  return original instanceof Error && NEXT_CONTROL_FLOW.test(original.message)
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const scrubbed: Breadcrumb = { ...breadcrumb }
  if (scrubbed.message) scrubbed.message = redactText(scrubbed.message)
  if (scrubbed.data) {
    const data = { ...scrubbed.data }
    for (const key of ['url', 'from', 'to']) {
      if (typeof data[key] === 'string') data[key] = redactUrlPath(data[key])
    }
    scrubbed.data = redactData(data) as Breadcrumb['data']
  }
  return scrubbed
}

/**
 * Общий beforeSend для браузера, сервера и edge. Режет всё, что может опознать
 * ученика или открыть его сессию, и помечает событие digest-ом Next: по нему
 * поддержка находит серверную ошибку, код которой ученик видит на странице.
 */
export function scrubEvent(event: ErrorEvent, hint?: EventHint): ErrorEvent | null {
  if (isNextControlFlow(hint)) return null

  const digest = digestOf(hint)
  if (digest) event.tags = { ...event.tags, digest }

  if (event.message) event.message = redactText(event.message)
  if (event.logentry?.message) event.logentry = { ...event.logentry, message: redactText(event.logentry.message) }
  if (event.logentry?.params) event.logentry = { ...event.logentry, params: redactData(event.logentry.params) as unknown[] }

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactText(exception.value)
    for (const frame of exception.stacktrace?.frames ?? []) {
      // Локальные переменные и строки кода вокруг падения могут содержать данные ученика.
      delete frame.vars
      if (frame.abs_path) frame.abs_path = redactUrlPath(frame.abs_path)
      if (frame.context_line) frame.context_line = redactText(frame.context_line)
      if (frame.pre_context) frame.pre_context = frame.pre_context.map(redactText)
      if (frame.post_context) frame.post_context = frame.post_context.map(redactText)
    }
  }

  if (event.request) {
    const request = event.request
    delete request.cookies
    delete request.data
    delete request.query_string
    if (request.url) request.url = redactUrlPath(request.url)
    if (request.headers) {
      request.headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => SAFE_HEADERS.has(name.toLowerCase())))
    }
  }

  // В трекер уходит только числовой id: имя, почта и IP ученика там не нужны.
  if (event.user) event.user = event.user.id === undefined ? undefined : { id: event.user.id }

  if (event.extra) event.extra = redactData(event.extra) as ErrorEvent['extra']
  if (event.contexts) {
    const nextjs = event.contexts.nextjs
    if (nextjs && typeof nextjs.request_path === 'string') event.contexts.nextjs = { ...nextjs, request_path: redactUrlPath(nextjs.request_path) }
    event.contexts = redactData(event.contexts) as ErrorEvent['contexts']
  }
  if (event.fingerprint) event.fingerprint = event.fingerprint.map(redactText)
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((breadcrumb) => scrubBreadcrumb(breadcrumb))
      .filter((breadcrumb): breadcrumb is Breadcrumb => breadcrumb !== null)
  }
  if (event.transaction) event.transaction = redactText(event.transaction.split('?')[0] ?? '')

  return event
}
