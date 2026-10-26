import { createHash } from 'node:crypto'
import { browserSentryDsn, type SentryDsn } from '@/lib/error-reporting/dsn'
import { logger } from '@/lib/telemetry'
import { trustedClientIp } from '@/server/client-ip'

/** Конверт браузерной ошибки с полусотней хлебных крошек весит десятки килобайт. */
export const MAX_ENVELOPE_BYTES = 256 * 1024
const UPSTREAM_TIMEOUT_MS = 5_000
const WINDOW_MS = 60_000
const PER_CLIENT_LIMIT = 30
const GLOBAL_LIMIT = 300
const MAX_TRACKED_CLIENTS = 5_000

type Window = { startedAt: number; count: number }
const clients = new Map<string, Window>()
let globalWindow: Window = { startedAt: 0, count: 0 }

const NO_STORE = { 'Cache-Control': 'no-store' }

function status(code: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: code, headers: { ...NO_STORE, ...headers } })
}

function take(window: Window | undefined, limit: number, now: number): Window | null {
  const current = !window || now - window.startedAt >= WINDOW_MS ? { startedAt: now, count: 0 } : window
  if (current.count >= limit) return null
  current.count += 1
  return current
}

/**
 * Туннель открыт без входа — ошибки страницы входа тоже нужны. Лимиты защищают
 * квоту Sentry от того, кто начнёт слать мусорные конверты.
 */
export function allowEnvelope(key: string, now = Date.now()): boolean {
  const global = take(globalWindow, GLOBAL_LIMIT, now)
  if (!global) return false
  const client = take(clients.get(key), PER_CLIENT_LIMIT, now)
  if (!client) {
    global.count -= 1
    return false
  }
  globalWindow = global
  if (!clients.has(key) && clients.size >= MAX_TRACKED_CLIENTS) {
    const oldest = clients.keys().next().value
    if (oldest !== undefined) clients.delete(oldest)
  }
  clients.set(key, client)
  return true
}

export function resetTunnelLimits(): void {
  clients.clear()
  globalWindow = { startedAt: 0, count: 0 }
}

function ownOrigins(request: Request): Set<string> {
  const origins = new Set([new URL(request.url).origin])
  const configured = process.env.NEXT_PUBLIC_SERVER_URL
  if (configured) {
    try { origins.add(new URL(configured).origin) } catch { /* неверный адрес в окружении — проверяем по адресу запроса */ }
  }
  return origins
}

/**
 * Только свои страницы: чужой сайт не должен писать в наш проект Sentry через туннель.
 * Браузер всегда шлёт Origin с POST, поэтому запрос без него — не наш SDK.
 */
export function sameOriginRequest(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site === 'cross-site' || site === 'same-site') return false
  const origin = request.headers.get('origin')
  return origin !== null && ownOrigins(request).has(origin)
}

/**
 * Ключ лимита. За Traefik без LMS_TRUST_PROXY IP один на всех, поэтому для
 * вошедших учеников берётся отпечаток сессионной cookie: один шумный ученик
 * не забирает лимит у остальных. Подделка cookie упирается в общий лимит.
 */
function clientKey(request: Request): string {
  const ip = trustedClientIp(request.headers)
  if (ip) return `ip:${ip}`
  const session = request.headers.get('cookie')?.match(/(?:^|;\s*)payload-token=([^;]+)/)?.[1]
  return session ? `session:${createHash('sha256').update(session).digest('hex').slice(0, 16)}` : 'anonymous'
}

/** Браузеру нужны только отчёты об ошибках; вложения, сессии и прочее туннель не пропускает. */
const ALLOWED_ITEMS = new Set(['event', 'client_report'])

function onlyAllowedItems(lines: readonly string[]): boolean {
  // Каждый элемент — строка заголовка и строка содержимого.
  if (lines.length < 2 || lines.length % 2 !== 0) return false
  for (let index = 0; index < lines.length; index += 2) {
    let header: unknown
    try {
      header = JSON.parse(lines[index] ?? '')
    } catch {
      return false
    }
    if (!header || typeof header !== 'object' || !('type' in header) || typeof header.type !== 'string' || !ALLOWED_ITEMS.has(header.type)) return false
    // Длина задаётся у бинарных вложений; у JSON-событий её нет.
    if ('length' in header) return false
  }
  return true
}

async function readEnvelope(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'))
  if (declared > MAX_ENVELOPE_BYTES) return null
  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_ENVELOPE_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/**
 * Подменяет DSN в заголовке конверта: браузер собран с заглушкой, настоящий
 * DSN знает только сервер. Остальное содержимое пересылается как есть.
 */
export function rewriteEnvelope(envelope: string, target: SentryDsn): string | null {
  const newline = envelope.indexOf('\n')
  const headerLine = newline === -1 ? envelope : envelope.slice(0, newline)
  let header: unknown
  try {
    header = JSON.parse(headerLine)
  } catch {
    return null
  }
  if (!header || typeof header !== 'object' || Array.isArray(header)) return null
  const rest = newline === -1 ? '' : envelope.slice(newline)
  const items = rest.split('\n').slice(1)
  while (items.at(-1) === '') items.pop()
  if (!onlyAllowedItems(items)) return null
  return `${JSON.stringify({ ...header, dsn: target.dsn })}${rest}`
}

export async function forwardEnvelope(request: Request): Promise<Response> {
  const target = browserSentryDsn()
  // Трекер не настроен: браузер всё равно шлёт отчёты, молча их принимаем.
  if (!target) return status(204)
  if (!sameOriginRequest(request)) return status(403)
  if (!allowEnvelope(clientKey(request))) return status(429, { 'Retry-After': '60' })

  let envelope: string | null
  try {
    envelope = await readEnvelope(request)
  } catch {
    // Вкладку закрыли посреди отправки — отчёт просто не дошёл.
    return status(400)
  }
  if (envelope === null) return status(413)
  const body = rewriteEnvelope(envelope, target)
  if (body === null) return status(400)

  const url = `${target.envelopeUrl}?sentry_key=${encodeURIComponent(target.publicKey)}&sentry_version=7`
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    // Лимиты Sentry передаём браузеру: SDK сам перестанет слать до их окончания.
    const passthrough: Record<string, string> = {}
    for (const name of ['retry-after', 'x-sentry-rate-limits']) {
      const value = upstream.headers.get(name)
      if (value) passthrough[name] = value
    }
    await upstream.body?.cancel()
    return status(upstream.status, passthrough)
  } catch (error) {
    // warn, а не error: logger.error сам отправляет в Sentry, а Sentry сейчас недоступен.
    logger.warn('[sentry] туннель не смог переслать отчёт браузера', { 'error.type': error instanceof Error ? error.name : 'unknown' })
    return status(502)
  }
}
