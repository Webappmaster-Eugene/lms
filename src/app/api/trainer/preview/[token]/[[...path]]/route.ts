import { proxyRuntimeRequest } from '@/server/trainer/runtime'
import { logger } from '@/lib/telemetry'

type Context = { params: Promise<{ token: string; path?: string[] }> }

const CSP = [
  "default-src 'none'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self' data:", "connect-src 'self'", "frame-ancestors 'self'",
  "base-uri 'none'", "form-action 'self'", 'sandbox allow-scripts',
].join('; ')

/** Короткоживущий capability: создаётся только авторизованным запуском задачи/комнаты. */
async function proxy(request: Request, context: Context): Promise<Response> {
  const { token, path = [] } = await context.params
  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(token) || path.some((segment) => segment === '.' || segment === '..' || /[\\/]/.test(segment) || segment.includes(String.fromCharCode(0)))) {
    return new Response('Предпросмотр не найден', { status: 404 })
  }
  const headers = new Headers({
    'Cache-Control': 'no-store', 'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Access-Control-Allow-Origin': 'null', Vary: 'Origin',
  })
  if (request.method === 'OPTIONS') {
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Content-Type, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url, Next-Action')
    return new Response(null, { status: 204, headers })
  }
  try {
    const response = await proxyRuntimeRequest(token, `/${path.map(encodeURIComponent).join('/')}${new URL(request.url).search}`, request)
    const contentType = response.headers.get('content-type')
    headers.set('Content-Type', contentType ?? 'application/octet-stream')
    const location = response.headers.get('location')
    if (location) {
      // Пользовательский проект может перенаправлять только в пределах своего lease.
      const prefix = `/api/trainer/preview/${token}`
      let target: URL
      try { target = new URL(location, request.url) } catch { return new Response('Недопустимое перенаправление проекта', { status: 400, headers }) }
      if (target.origin !== new URL(request.url).origin || (target.pathname !== prefix && !target.pathname.startsWith(`${prefix}/`)) || location.includes('\\')) return new Response('Недопустимое перенаправление проекта', { status: 400, headers })
      headers.set('Location', target.pathname + target.search + target.hash)
    }
    if (request.method === 'HEAD' || [204, 304].includes(response.status)) return new Response(null, { status: response.status, headers })
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    if (reader) {
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          size += chunk.value.byteLength
          if (size > 8 * 1024 * 1024) { await reader.cancel(); return new Response('Ответ проекта превышает лимит', { status: 413, headers }) }
          chunks.push(chunk.value)
        }
      } finally { reader.releaseLock() }
    }
    return new Response(Buffer.concat(chunks), { status: response.status, headers })
  } catch (error) {
    logger.error('Временный предпросмотр Next.js недоступен', error)
    return new Response('Предпросмотр недоступен или истёк. Нажмите «Запустить» ещё раз.', { status: 503, headers })
  }
}

export const GET = proxy
export const HEAD = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
export const OPTIONS = proxy
