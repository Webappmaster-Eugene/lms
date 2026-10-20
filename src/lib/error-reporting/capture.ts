import { Sentry } from '@/lib/error-reporting/sdk'
import { redactText } from '@/lib/error-reporting/redact'

export type CaptureOptions = {
  /** Что делал код, когда случилась ошибка: заголовок события, если ошибка не Error. */
  readonly message?: string
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly level?: 'fatal' | 'error' | 'warning'
  /** Свой ключ группировки — для сбоев инфраструктуры, где стек у каждого вызова свой. */
  readonly fingerprint?: string[]
  /** Короткие значения с малой мощностью: по ним фильтруют в Sentry. */
  readonly tags?: Readonly<Record<string, string>>
}

const reportedAt = new Map<string, number>()
// Ключи бывают из текста ошибок: без предела уникальные сообщения медленно съели бы память.
const MAX_THROTTLE_KEYS = 500

/**
 * Отправляет ошибку сервера в Sentry. Без DSN SDK не инициализирован, и вызов
 * ничего не делает, поэтому функцию можно звать из любого серверного кода.
 */
export function captureServerError(error: unknown, options: CaptureOptions = {}): string | undefined {
  const contexts = { lms: { ...(options.message ? { message: options.message } : {}), ...options.attributes } }
  const hint = { level: options.level ?? 'error', fingerprint: options.fingerprint, tags: options.tags, contexts }

  if (error instanceof Error) return Sentry.captureException(error, hint)

  const detail = error === undefined ? undefined : redactText(typeof error === 'string' ? error : safeStringify(error))
  const message = options.message ?? detail ?? 'Неизвестная ошибка'
  return Sentry.captureMessage(message, { ...hint, extra: detail && detail !== message ? { detail } : undefined })
}

/**
 * Не чаще одного события за интервал на ключ. Нужна для сбоев, которые
 * повторяются на каждый запрос (лежит Redis, БД, почта): событие о них
 * нужно одно, а не тысяча, съедающая квоту Sentry.
 */
export function captureThrottled(key: string, intervalMs: number, error: unknown, options: CaptureOptions = {}): string | undefined {
  const now = Date.now()
  const last = reportedAt.get(key)
  if (last !== undefined && now - last < intervalMs) return undefined
  if (last === undefined && reportedAt.size >= MAX_THROTTLE_KEYS) {
    const oldest = reportedAt.keys().next().value
    if (oldest !== undefined) reportedAt.delete(oldest)
  }
  reportedAt.delete(key)
  reportedAt.set(key, now)
  return captureServerError(error, options)
}

/**
 * Ошибка с тем же классом и стеком, но без текста. Для мест, где текст ошибки
 * может содержать то, что нельзя хранить даже очищенным: стенограммы собеседований,
 * данные валидации с паролем. Место падения в Sentry при этом остаётся видно.
 */
export function stackOnly(error: unknown): Error | undefined {
  if (!(error instanceof Error)) return undefined
  const safe = new Error(error.name)
  safe.name = error.name
  const frames = error.stack?.split('\n').filter((line) => /^\s+at /.test(line)) ?? []
  safe.stack = [`${error.name}: [скрыто]`, ...frames].join('\n')
  return safe
}

/** Хлебные крошки: что происходило в запросе перед ошибкой. Отдельным событием не уходят. */
export function addLogBreadcrumb(level: 'info' | 'warning', message: string, data?: Readonly<Record<string, unknown>>): void {
  Sentry.addBreadcrumb({ category: 'log', level, message, data: data ? { ...data } : undefined })
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
