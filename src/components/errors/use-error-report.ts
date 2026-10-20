'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

const eventIds = new WeakMap<Error, string>()

/** Формат id события Sentry — 32 hex-символа; crypto.randomUUID есть только в защищённом контексте. */
function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID().replace(/-/g, '')
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

/** Один id на объект ошибки: повторный рендер границы не порождает нового кода для ученика. */
function eventIdFor(error: Error): string {
  const existing = eventIds.get(error)
  if (existing) return existing
  const created = newEventId()
  eventIds.set(error, created)
  return created
}

/**
 * Отправляет ошибку из error boundary и возвращает код для ученика.
 *
 * Серверная ошибка приходит в браузер обезличенной, с одним digest: сервер
 * уже отправил её с настоящим стеком и тегом digest (onRequestError), поэтому
 * второй, пустой отчёт из браузера не нужен — достаточно показать digest.
 * Для ошибки браузера id события задаётся заранее, чтобы показать его сразу.
 */
export function useErrorReport(error: Error & { digest?: string }): string | undefined {
  const eventId = error.digest ? undefined : eventIdFor(error)

  useEffect(() => {
    if (!eventId) return
    Sentry.captureException(error, { event_id: eventId, mechanism: { handled: false, type: 'auto.react.error_boundary' } })
  }, [error, eventId])

  return error.digest ?? eventId
}

/** Ссылка на форму поддержки с уже вписанными кодом ошибки и адресом страницы. */
export function supportHref(reference: string | undefined, pathname: string | null): string {
  const params = new URLSearchParams({ topic: 'error' })
  if (reference) params.set('ref', reference)
  if (pathname) params.set('from', pathname)
  return `/help?${params.toString()}#support`
}
