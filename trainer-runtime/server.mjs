import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { InputError, validateRequest } from './validation.mjs'
import { InfrastructureError, runJob } from './gateway.mjs'
import { runtimeConcurrency } from './runtime-limits.mjs'

export function createRuntimeServer({ token, run = runJob, maxConcurrent = 2 } = {}) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('TRAINER_RUNTIME_TOKEN должен содержать минимум 32 символа')
  const expected = Buffer.from(`Bearer ${token}`)
  let active = 0
  return createServer(async (request, response) => {
    const send = (status, data) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(data)) }
    const supplied = Buffer.from(request.headers.authorization || '')
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { send(401, { error: 'Unauthorized' }); request.resume(); return }
    if (request.method === 'DELETE' && /^\/next\/lease\/[a-zA-Z0-9_-]{32,128}$/.test(request.url ?? '')) {
      try {
        const next = await import('./next-runtime.mjs')
        const token = request.url.split('/').at(-1)
        send(200, { released: await next.closeNextLease(token) })
      } catch { send(503, { error: 'Не удалось закрыть предпросмотр' }) }
      request.resume()
      return
    }
    if (request.url?.startsWith('/next/preview/')) {
      try {
        const next = await import('./next-runtime.mjs')
        await next.handleNextProxy(request, response)
      } catch { if (!response.headersSent) send(503, { error: 'Предпросмотр недоступен' }); else response.destroy() }
      return
    }
    if (request.url === '/health' && request.method === 'GET') { send(200, { ok: true }); return }
    if (request.method !== 'POST' || !['/run', '/preview'].includes(request.url)) { send(404, { error: 'Not found' }); request.resume(); return }
    if (active >= maxConcurrent) { send(503, { error: 'Runtime перегружен', overloaded: true }); request.resume(); return }
    active += 1
    try {
      const chunks = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        if (size > 256 * 1024) { send(413, { error: 'Превышен размер запроса' }); request.resume(); return }
        chunks.push(chunk)
      }
      let raw
      try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new InputError('Некорректный JSON') }
      const preview = request.url === '/preview'
      const job = validateRequest(raw, preview)
      send(200, await run(job, preview))
    } catch (error) {
      if (error instanceof InputError) send(400, { error: error.message })
      else { console.error('Trainer runtime infrastructure:', error instanceof InfrastructureError ? error.message : error.name); send(503, { error: 'Runtime временно недоступен' }) }
    } finally { active -= 1 }
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createRuntimeServer({ token: process.env.TRAINER_RUNTIME_TOKEN, maxConcurrent: runtimeConcurrency() })
  server.requestTimeout = 180000
  server.headersTimeout = 10000
  server.listen(Number(process.env.PORT || 3100), '0.0.0.0')
}
