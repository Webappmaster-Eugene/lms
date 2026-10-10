import 'server-only'

import { normalizeRunResult } from '@/lib/trainer/result'
import type { RuntimeCase } from '@/lib/trainer/runtime-spec'
import type { TrainerRunResult } from '@/lib/trainer/types'
import { TrainerRunnerError } from './pool'

type RuntimeLanguage = 'go' | 'python' | 'html' | 'react' | 'next'
type RuntimeInput = { language: RuntimeLanguage; code: string; timeLimitMs: number }
export type RuntimePreview = { html?: string; leaseToken?: string; expiresAt?: number; previewPath?: string }

async function requestRuntime(route: '/run' | '/preview', input: RuntimeInput & { cases?: RuntimeCase[]; allowNoTests?: boolean; includePreview?: boolean }): Promise<unknown> {
  const endpoint = process.env.TRAINER_RUNTIME_URL
  const token = process.env.TRAINER_RUNTIME_TOKEN
  if (!endpoint || !token || token.length < 32) throw new TrainerRunnerError('Runtime Go, Python и frontend не настроен. Обратитесь к администратору')
  let url: URL
  try {
    url = new URL(route, endpoint)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('URL')
  } catch {
    throw new TrainerRunnerError('Неверная конфигурация адреса runtime')
  }
  let response: Response
  try {
    response = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(input), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(input.language === 'next' ? 180000 : 125000) })
  } catch {
    throw new TrainerRunnerError('Runtime не отвечает. Повторите запуск позже')
  }
  if (!response.ok) throw new TrainerRunnerError(response.status === 503 ? 'Runtime занят или временно недоступен. Повторите запуск позже' : 'Runtime отклонил запрос проверки', { overloaded: response.status === 503 })
  try {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Empty runtime response')
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('Runtime response limit') }
      chunks.push(chunk.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new TrainerRunnerError('Runtime вернул некорректный результат')
  }
}

export async function runRuntime(input: RuntimeInput & { cases: RuntimeCase[]; allowNoTests?: boolean }): Promise<TrainerRunResult> {
  return normalizeRunResult(await requestRuntime('/run', input), { allowNoTests: input.allowNoTests })
}

function normalizePreview(raw: unknown): RuntimePreview | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  if ('html' in raw && typeof raw.html === 'string') return { html: raw.html }
  if ('leaseToken' in raw && typeof raw.leaseToken === 'string' && /^[a-zA-Z0-9_-]{32,128}$/.test(raw.leaseToken)) {
    return { leaseToken: raw.leaseToken, previewPath: `/api/trainer/preview/${raw.leaseToken}/`, ...('expiresAt' in raw && typeof raw.expiresAt === 'number' ? { expiresAt: raw.expiresAt } : {}) }
  }
  return undefined
}

export async function runRuntimePreview(input: RuntimeInput & { cases: RuntimeCase[] }): Promise<{ result: TrainerRunResult; preview?: RuntimePreview }> {
  const raw = await requestRuntime('/run', { ...input, includePreview: true })
  if (raw && typeof raw === 'object' && 'result' in raw) {
    return { result: normalizeRunResult(raw.result), preview: 'preview' in raw ? normalizePreview(raw.preview) : undefined }
  }
  return { result: normalizeRunResult(raw) }
}

export async function previewRuntime(input: RuntimeInput): Promise<RuntimePreview> {
  const raw = await requestRuntime('/preview', input)
  const preview = normalizePreview(raw)
  if (preview) return preview
  const message = raw && typeof raw === 'object' && 'error' in raw && typeof raw.error === 'string' ? raw.error : 'Не удалось собрать предпросмотр'
  throw new TrainerRunnerError(message)
}

export async function releaseRuntimePreview(token: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(token)) throw new TrainerRunnerError('Недопустимый токен предпросмотра')
  const endpoint = process.env.TRAINER_RUNTIME_URL
  const authToken = process.env.TRAINER_RUNTIME_TOKEN
  if (!endpoint || !authToken || authToken.length < 32) throw new TrainerRunnerError('Runtime не настроен')
  const url = new URL(`/next/lease/${token}`, endpoint)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new TrainerRunnerError('Неверная конфигурация адреса runtime')
  try {
    const response = await fetch(url, { method: 'DELETE', headers: { authorization: `Bearer ${authToken}` }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error('Runtime release failed')
  } catch {
    throw new TrainerRunnerError('Не удалось закрыть предпросмотр')
  }
}

/** Только фиксированный runtime и токен lease; URL/credentials ученика сюда не передаются. */
export async function proxyRuntimeRequest(token: string, path: string, request: Request): Promise<Response> {
  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(token) || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw new TrainerRunnerError('Недопустимый адрес предпросмотра')
  const endpoint = process.env.TRAINER_RUNTIME_URL
  const authToken = process.env.TRAINER_RUNTIME_TOKEN
  if (!endpoint || !authToken || authToken.length < 32) throw new TrainerRunnerError('Runtime не настроен')
  const url = new URL(`/next/preview/${token}${path}`, endpoint)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new TrainerRunnerError('Неверная конфигурация адреса runtime')
  if (!url.pathname.startsWith(`/next/preview/${token}/`)) throw new TrainerRunnerError('Недопустимый адрес предпросмотра')
  const headers = new Headers({ authorization: `Bearer ${authToken}` })
  for (const name of ['accept', 'content-type', 'rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-url', 'next-action', 'x-nextjs-data']) {
    const value = request.headers.get(name)
    if (value && value.length <= 16000) headers.set(name, value)
  }
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(request.method)) throw new TrainerRunnerError('Метод предпросмотра не поддерживается')
  let body: ArrayBuffer | undefined
  if (!['GET', 'HEAD'].includes(request.method)) {
    const reader = request.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    if (reader) {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > 64 * 1024) { await reader.cancel(); throw new TrainerRunnerError('Запрос предпросмотра слишком большой') }
        chunks.push(chunk.value)
      }
    }
    const bytes = Buffer.concat(chunks)
    body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }
  try {
    return await fetch(url, { method: request.method, headers, body, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(40000) })
  } catch {
    throw new TrainerRunnerError('Предпросмотр не отвечает')
  }
}
