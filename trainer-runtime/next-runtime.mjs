import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { sandboxArgs, InfrastructureError } from './gateway.mjs'
import { runtimeConcurrency } from './runtime-limits.mjs'

const IMAGE = process.env.TRAINER_NEXT_JOB_IMAGE || 'lms-trainer-next:local'
const MAX_SESSIONS = runtimeConcurrency()
const MAX_BODY = 2 * 1024 * 1024
const MAX_RESPONSE = 8 * 1024 * 1024
const MAX_LINE = 12 * 1024 * 1024
const sessions = new Map()
const allowedHeaders = new Set(['accept', 'content-type', 'rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-url', 'next-action', 'x-nextjs-data'])
const responseHeaders = new Set(['content-type', 'location', 'vary'])

class BuildError extends Error {
  constructor(message, status = 'compile_error') { super(message); this.status = status }
}

class DeadlineError extends InfrastructureError {}

function cleanHeaders(headers) {
  return Object.fromEntries(Object.entries(headers ?? {}).filter(([name, value]) => allowedHeaders.has(name.toLowerCase()) && typeof value === 'string' && value.length <= 16000).map(([name, value]) => [name.toLowerCase(), value]))
}

async function removeContainer(name) {
  await new Promise((resolve) => {
    const child = spawn('docker', ['rm', '-f', name], { stdio: 'ignore' })
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 5000)
    child.on('error', () => { clearTimeout(timer); resolve() })
    child.on('close', () => { clearTimeout(timer); resolve() })
  })
}

function worker(first, timeoutMs, onMessage) {
  const name = `lms-trainer-next-${randomUUID()}`
  const child = spawn('docker', sandboxArgs(name, IMAGE, '1024m'), { stdio: ['pipe', 'pipe', 'pipe'] })
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  let buffer = ''
  let bytes = 0
  let stderr = ''
  let stopped = false
  let closePromise
  let failure = () => {}
  const stop = () => {
    if (closePromise) return closePromise
    stopped = true
    clearTimeout(timer)
    child.kill('SIGKILL')
    closePromise = removeContainer(name)
    return closePromise
  }
  const fail = (error) => { failure(error); void stop() }
  const timer = setTimeout(() => fail(new DeadlineError('Превышен общий лимит времени Next.js')), timeoutMs)
  child.stdin.on('error', () => {})
  child.stderr.on('data', (chunk) => { stderr = (stderr + String(chunk)).slice(-3000) })
  child.stdout.on('data', (chunk) => {
    bytes += Buffer.byteLength(chunk)
    buffer += chunk
    if (bytes > 128 * 1024 * 1024 || buffer.length > MAX_LINE) { fail(new InfrastructureError('Превышен лимит результата Next.js')); return }
    while (buffer.includes('\n')) {
      const index = buffer.indexOf('\n')
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      let message
      try { message = JSON.parse(line) } catch { fail(new InfrastructureError('Некорректный протокол Next.js')); return }
      if (message && typeof message === 'object') onMessage(message)
      else { fail(new InfrastructureError('Некорректный протокол Next.js')); return }
    }
  })
  child.on('error', () => fail(new InfrastructureError('Не удалось запустить Docker Next.js')))
  child.on('close', (code) => {
    clearTimeout(timer)
    if (!stopped) failure(new InfrastructureError([125, 126, 127].includes(code) ? 'Образ Next.js недоступен' : stderr || 'Процесс Next.js завершился'))
    void stop()
  })
  const write = (message) => {
    if (stopped || child.stdin.destroyed) throw new InfrastructureError('Сессия Next.js закрыта')
    child.stdin.write(JSON.stringify(message) + '\n')
  }
  write(first)
  return { write, stop, onFailure: (handler) => { failure = handler } }
}

async function openSession(job) {
  if (sessions.size >= MAX_SESSIONS) throw new InfrastructureError('Предпросмотр Next.js перегружен; закройте предыдущий предпросмотр или повторите позже')
  const token = randomBytes(32).toString('hex')
  const basePath = `/api/trainer/preview/${token}`
  const pending = new Map()
  const frameworkAssets = new Map()
  let sequence = 0
  let readyResolve
  let readyReject
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject })
  const session = { token, basePath, pending, ready: false, expiresAt: Date.now() + 175_000, deadline: Date.now() + 175_000 }
  const instance = worker({ files: JSON.parse(job.code), basePath }, 175_000, (message) => {
    if (message.ready === true) { session.ready = true; session.deadline = Math.min(session.deadline, Date.now() + 120_000); readyResolve(); return }
    if (message.error && !session.ready) { readyReject(new BuildError(String(message.error), message.kind === 'timeout' || message.kind === 'error' ? message.kind : 'compile_error')); return }
    if (typeof message.id === 'string') {
      const waiting = pending.get(message.id)
      if (!waiting) return
      pending.delete(message.id)
      clearTimeout(waiting.timer)
      if (message.error) waiting.reject(new Error(String(message.error)))
      else if (!Number.isInteger(message.status) || message.status < 100 || message.status > 599 || typeof message.bodyBase64 !== 'string' || message.bodyBase64.length > Math.ceil(MAX_RESPONSE * 4 / 3) + 4) waiting.reject(new InfrastructureError('Некорректный HTTP-ответ Next.js'))
      else waiting.resolve(message)
    }
  })
  const close = async () => {
    sessions.delete(token)
    clearTimeout(session.timer)
    for (const waiting of pending.values()) { clearTimeout(waiting.timer); waiting.reject(new Error('Сессия Next.js закрыта')) }
    pending.clear()
    await instance.stop()
  }
  session.close = close
  session.request = (message) => new Promise((resolve, reject) => {
    const pathname = message.path.split('?')[0]
    const cacheKey = message.method === 'GET' && pathname === `${basePath}/_next/static/chunks/main-app.js` ? pathname : null
    if (cacheKey && frameworkAssets.has(cacheKey)) { resolve(frameworkAssets.get(cacheKey)); return }
    if (pending.size >= 24) { reject(new Error('Слишком много запросов предпросмотра')); return }
    const id = String(++sequence)
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Превышен лимит HTTP-запроса Next.js')) }, 35_000)
    pending.set(id, { resolve: (response) => {
      // Only the framework bootstrap is immutable; page code, CSS and route responses stay fresh.
      if (cacheKey && response.status === 200) frameworkAssets.set(cacheKey, response)
      resolve(response)
    }, reject, timer })
    try { instance.write({ ...message, id, headers: cleanHeaders(message.headers) }) } catch (error) { pending.delete(id); clearTimeout(timer); reject(error) }
  })
  instance.onFailure((error) => { readyReject(error); void close() })
  sessions.set(token, session)
  session.timer = setTimeout(() => { void close() }, 175_000)
  try { await ready; return session } catch (error) { await close(); throw error }
}

function keepSession(session) {
  session.expiresAt = Math.min(Date.now() + 60_000, session.deadline)
  clearTimeout(session.timer)
  session.timer = setTimeout(() => { void session.close() }, Math.max(1, session.expiresAt - Date.now()))
  return { leaseToken: session.token, expiresAt: session.expiresAt, previewPath: `${session.basePath}/` }
}

async function browserRun(job, session, remainingMs) {
  let resolveResult
  let rejectResult
  const result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject })
  const instance = worker({ mode: 'browser', cases: job.cases, timeLimitMs: job.timeLimitMs, basePath: session.basePath, allowNoTests: job.allowNoTests }, Math.max(1, Math.min(115_000, remainingMs)), (message) => {
    if (message.result) { resolveResult(message.result); return }
    if (message.error) { rejectResult(new InfrastructureError(String(message.error))); return }
    if (message.rpc && typeof message.rpc.id === 'string') {
      void session.request(message.rpc).then((response) => instance.write({ rpcResult: { ...response, id: message.rpc.id } })).catch((error) => {
        try { instance.write({ rpcResult: { id: message.rpc.id, error: String(error.message) } }) } catch { rejectResult(new InfrastructureError('Браузерная сессия Next.js закрыта')) }
      })
    }
  })
  instance.onFailure(rejectResult)
  try {
    const outcome = await result
    if (!outcome || !Array.isArray(outcome.tests) || outcome.tests.length !== job.cases.length) throw new InfrastructureError('Браузер Next.js вернул некорректный результат')
    return outcome
  } finally { await instance.stop() }
}

export async function runNext(job) {
  const started = performance.now()
  let session
  try {
    session = await openSession(job)
    const result = await browserRun(job, session, 175_000 - (performance.now() - started))
    result.totalMs = performance.now() - started
    if (job.includePreview) return { result, preview: keepSession(session) }
    await session.close()
    return result
  } catch (error) {
    await session?.close()
    if (!(error instanceof BuildError) && !(error instanceof DeadlineError)) throw error
    const result = { status: error instanceof DeadlineError ? 'timeout' : error.status, tests: [], passedCount: 0, totalCount: 0, consoleOutput: [], error: error.message.slice(0, 1000), totalMs: performance.now() - started }
    return job.includePreview ? { result } : result
  }
}

export async function previewNext(job) {
  const session = await openSession(job)
  return keepSession(session)
}

export async function handleNextProxy(request, response) {
  const raw = request.url ?? ''
  const match = /^\/next\/preview\/([a-f0-9]{64})(\/[^?]*)?(\?[^#]*)?$/.exec(raw)
  const session = match && sessions.get(match[1])
  if (!session || !session.ready || session.expiresAt <= Date.now()) { response.writeHead(404, { 'cache-control': 'no-store' }); response.end('Предпросмотр истёк'); request.resume(); return }
  const suffix = match[2] || '/'
  let decoded
  try { decoded = decodeURIComponent(suffix) } catch { decoded = '' }
  const hasControl = [...decoded].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  if (!decoded || decoded.includes('\\') || hasControl || decoded.split('/').some((segment) => segment === '.' || segment === '..') || decoded.startsWith('//') || !['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(request.method)) {
    response.writeHead(400, { 'cache-control': 'no-store' }); response.end('Недопустимый путь предпросмотра'); request.resume(); return
  }
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY) { response.writeHead(413, { 'cache-control': 'no-store' }); response.end('Превышен размер запроса'); request.resume(); return }
    chunks.push(chunk)
  }
  try {
    const output = await session.request({ path: session.basePath + suffix + (match[3] || ''), method: request.method, headers: request.headers, bodyBase64: Buffer.concat(chunks).toString('base64') })
    const headers = Object.fromEntries(Object.entries(output.headers ?? {}).filter(([name, value]) => responseHeaders.has(name.toLowerCase()) && typeof value === 'string'))
    if (headers.location) {
      let location
      try { location = new URL(headers.location, `http://localhost:3000${session.basePath}/`) } catch { location = null }
      if (!location || location.origin !== 'http://localhost:3000' || !(location.pathname === session.basePath || location.pathname.startsWith(session.basePath + '/'))) {
        response.writeHead(502, { 'cache-control': 'no-store' }); response.end('Внешние переходы в предпросмотре запрещены'); return
      }
      headers.location = location.pathname + location.search + location.hash
    }
    response.writeHead(output.status, { ...headers, 'cache-control': 'no-store', 'access-control-allow-origin': 'null', 'x-content-type-options': 'nosniff' })
    response.end(Buffer.from(output.bodyBase64, 'base64'))
  } catch {
    response.writeHead(502, { 'cache-control': 'no-store' }); response.end('Не удалось получить ответ Next.js')
  }
}

export async function closeNextSessions() {
  await Promise.all([...sessions.values()].map((session) => session.close()))
}

export async function closeNextLease(token) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false
  const session = sessions.get(token)
  if (!session) return false
  await session.close()
  return true
}
