import { createInterface } from 'node:readline'
import { mkdir, writeFile, symlink } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import http from 'node:http'
import { chromium } from 'playwright'
import { createNativeStyleReader } from './native-style.mjs'

const MAX_REQUEST_BODY = 2 * 1024 * 1024
const MAX_RESPONSE_BODY = 8 * 1024 * 1024
const PREVIEW_CSP = "default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; sandbox allow-scripts"
const hardTimer = setTimeout(() => { nextProcess?.kill('SIGKILL'); process.exit(124) }, 180_000)
hardTimer.unref()
const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
const requests = new Map()
let initialized = false
let nextProcess
let previewBasePath = ''
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n')

class StartupError extends Error {
  constructor(message, kind = 'compile_error') { super(message); this.kind = kind }
}

class HttpTimeoutError extends Error {}

input.on('line', (line) => {
  let message
  try { message = JSON.parse(line) } catch { send({ error: 'Некорректная команда runtime' }); return }
  if (!initialized) {
    initialized = true
    if (message.mode === 'browser') {
      void browserJob(message).then((result) => { send({ result }); process.exit(0) }).catch((error) => {
        send({ error: String(error.message).slice(0, 1000) })
        process.exit(1)
      })
    } else {
      void startNext(message).then(() => send({ ready: true })).catch((error) => {
        send({ error: String(error.message).slice(0, 1000), kind: error.kind ?? 'compile_error' })
        process.exit(1)
      })
    }
    return
  }
  if (message.rpcResult) {
    const waiting = requests.get(message.rpcResult.id)
    if (waiting) { requests.delete(message.rpcResult.id); waiting.resolve(message.rpcResult) }
    return
  }
  if (typeof message.id === 'string') {
    void localRequest(message).then((response) => send({ id: message.id, ...response })).catch((error) => {
      send({ id: message.id, error: String(error.message).slice(0, 1000) })
    })
  }
})

input.on('close', () => { nextProcess?.kill('SIGKILL'); process.exit(0) })

async function startNext(job) {
  if (!job.files || typeof job.files !== 'object' || Array.isArray(job.files)) throw new Error('Ожидается объект файлов Next.js')
  if (!/^\/api\/trainer\/preview\/[a-f0-9]{64}$/.test(job.basePath)) throw new Error('Недопустимый путь предпросмотра')
  previewBasePath = job.basePath
  const entries = Object.entries(job.files)
  if (entries.length === 0 || entries.length > 32) throw new Error('Допускается от 1 до 32 файлов')
  const project = '/tmp/next-project'
  await mkdir(project, { recursive: true })
  for (const [name, source] of entries) {
    if (!/^(?:app|components|lib|hooks|public|styles|src\/(?:app|components|lib|hooks|styles))\/[a-zA-Z0-9_@()[\].-]+(?:\/[a-zA-Z0-9_@()[\].-]+)*\.(?:html|css|js|jsx|ts|tsx|json)$/.test(name) || name.split('/').some((segment) => segment.startsWith('.')) || typeof source !== 'string' || name.length > 150) {
      throw new Error(`Недопустимый файл Next.js: ${name.slice(0, 150)}. Используйте app/, components/ или lib/`)
    }
    const target = path.join(project, name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, source)
  }
  const appRoot = entries.some(([name]) => name.startsWith('app/')) ? 'app' : 'src/app'
  if (!entries.some(([name]) => new RegExp(`^${appRoot}/page\\.(tsx|jsx|js|ts)$`).test(name))) throw new Error('Добавьте app/page.tsx с default export страницы')
  if (!entries.some(([name]) => new RegExp(`^${appRoot}/layout\\.(tsx|jsx|js|ts)$`).test(name))) {
    await writeFile(path.join(project, appRoot, 'layout.tsx'), 'export default function Layout({children}: {children: React.ReactNode}) { return <html lang="ru"><body>{children}</body></html> }')
  }
  await symlink('/runtime/node_modules', path.join(project, 'node_modules'))
  await writeFile(path.join(project, 'package.json'), JSON.stringify({ private: true, dependencies: { next: '15.5.27', react: '19.2.4', 'react-dom': '19.2.4' } }))
  await writeFile(path.join(project, 'next.config.mjs'), `export default ${JSON.stringify({
    basePath: job.basePath,
    skipTrailingSlashRedirect: true,
    poweredByHeader: false,
    devIndicators: false,
    images: { unoptimized: true },
    experimental: { cpus: 1, workerThreads: false },
    typescript: { ignoreBuildErrors: false },
  })}`)
  await writeFile(path.join(project, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', lib: ['dom', 'dom.iterable', 'esnext'], strict: true, noEmit: true, module: 'esnext', moduleResolution: 'bundler', jsx: 'preserve', esModuleInterop: true, resolveJsonModule: true, isolatedModules: true, plugins: [{ name: 'next' }], paths: { '@/*': [appRoot === 'src/app' ? './src/*' : './*'] } },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'], exclude: ['node_modules'],
  }))
  let logs = ''
  nextProcess = spawn(process.execPath, ['/runtime/node_modules/next/dist/bin/next', 'dev', project, '--hostname', '127.0.0.1', '--port', '3000'], {
    cwd: project,
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '--max-old-space-size=640' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  nextProcess.on('error', (error) => { logs = String(error.message).slice(-3000) })
  for (const stream of [nextProcess.stdout, nextProcess.stderr]) {
    stream.on('data', (chunk) => { logs = (logs + String(chunk)).slice(-3000) })
  }
  const deadline = performance.now() + 75_000
  while (performance.now() < deadline) {
    if (nextProcess.exitCode !== null || nextProcess.signalCode !== null) throw new StartupError(`Next.js завершился: ${nextProcess.signalCode ?? nextProcess.exitCode}\n${logs}`, 'error')
    try {
      const response = await localRequest({ path: `${job.basePath}/`, method: 'GET', headers: {}, timeoutMs: Math.min(60_000, Math.max(1, deadline - performance.now())) })
      if (response.status >= 500) throw new StartupError(`HTTP ${response.status}: ${logs || Buffer.from(response.bodyBase64, 'base64').toString().replace(/<[^>]*>/g, ' ').slice(0, 1000)}`)
      return
    } catch (error) {
      if (error.code !== 'ECONNREFUSED') {
        throw new StartupError(`${error.message}\n${logs}`, error instanceof HttpTimeoutError ? 'timeout' : error.kind ?? 'error')
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new StartupError(`Next.js не успел запуститься за 75 секунд\n${logs}`, 'timeout')
}

function localRequest(message) {
  return new Promise((resolve, reject) => {
    if (typeof message.path !== 'string' || !message.path.startsWith('/') || message.path.startsWith('//') || message.path.length > 4000) { reject(new Error('Недопустимый путь HTTP')); return }
    const body = Buffer.from(message.bodyBase64 ?? '', 'base64')
    if (body.length > MAX_REQUEST_BODY) { reject(new Error('Запрос слишком большой')); return }
    const request = http.request({ hostname: '127.0.0.1', port: 3000, path: message.path, method: message.method ?? 'GET', headers: { ...message.headers, host: 'localhost:3000', ...(message.method === 'POST' ? { origin: 'http://localhost:3000' } : {}), ...(body.length ? { 'content-length': String(body.length) } : {}) } }, (response) => {
      let size = 0
      const chunks = []
      response.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_RESPONSE_BODY) { request.destroy(new Error('Ответ Next.js превышает 8 МБ')); return }
        chunks.push(chunk)
      })
      response.on('end', () => {
        let output = Buffer.concat(chunks)
        if (String(response.headers['content-type']).startsWith('text/html')) {
          const bootstrap = `<script>(function(){const prefix=${JSON.stringify(previewBasePath)};const origin=new URL(location.href).origin;const mapped=(value)=>{const url=new URL(String(value),location.href);if(url.origin===origin&&url.pathname!==prefix&&!url.pathname.startsWith(prefix+'/'))url.pathname=prefix+url.pathname;return url.href};const original=window.fetch.bind(window);window.fetch=(input,init)=>original(input instanceof Request?new Request(mapped(input.url),input):mapped(input),init);const open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url,...rest){return open.call(this,method,mapped(url),...rest)}})();</script>`
          output = Buffer.from(output.toString('utf8').replace(/<head(?:\s[^>]*)?>/i, (head) => head + bootstrap))
        }
        resolve({ status: response.statusCode ?? 502, headers: response.headers, bodyBase64: output.toString('base64') })
      })
      response.on('error', reject)
    })
    request.setTimeout(message.timeoutMs ?? 30_000, () => request.destroy(new HttpTimeoutError('Превышен лимит HTTP-запроса Next.js')))
    request.on('error', reject)
    request.end(body)
  })
}

async function browserJob(job) {
  const started = performance.now()
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--disable-background-networking'] })
  const tests = []
  let requestSequence = 0
  try {
    for (const [index, item] of job.cases.entries()) {
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: item.viewport ?? { width: 1280, height: 720 } })
      await context.routeWebSocket('**/*', (socket) => socket.close())
      await context.route('**/*', async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        if (url.href === 'http://preview.invalid/__harness') {
          await route.fulfill({ contentType: 'text/html', body: '<style>html,body{margin:0}#solution{display:block;width:100vw;height:100vh;border:0}</style><iframe id="solution" sandbox="allow-scripts"></iframe>' })
          return
        }
        if (url.hostname !== 'preview.invalid' || !(url.pathname === job.basePath || url.pathname.startsWith(job.basePath + '/'))) { await route.abort(); return }
        if (request.method() === 'OPTIONS') {
          await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': 'null', 'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type,rsc,next-action,next-router-state-tree,next-router-prefetch,next-url,x-nextjs-data' } })
          return
        }
        const id = String(++requestSequence)
        let timer
        try {
          const response = await new Promise((resolve, reject) => {
            requests.set(id, { resolve })
            timer = setTimeout(() => { requests.delete(id); reject(new Error('Превышен лимит прокси')) }, 35_000)
            send({ rpc: { id, path: url.pathname + url.search, method: request.method(), headers: request.headers(), bodyBase64: request.postDataBuffer()?.toString('base64') ?? '' } })
          })
          if (response.error) { await route.abort(); return }
          const headers = Object.fromEntries(Object.entries(response.headers ?? {}).filter(([name]) => !['content-length', 'transfer-encoding', 'content-encoding', 'set-cookie', 'connection'].includes(name.toLowerCase())).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : String(value)]))
          headers['access-control-allow-origin'] = 'null'
          headers['content-security-policy'] = PREVIEW_CSP
          headers['x-content-type-options'] = 'nosniff'
          headers['referrer-policy'] = 'no-referrer'
          await route.fulfill({ status: response.status, headers, body: Buffer.from(response.bodyBase64 ?? '', 'base64') })
        } catch { await route.abort().catch(() => {}) } finally { clearTimeout(timer) }
      })
      const page = await context.newPage()
      const pageErrors = []
      page.on('pageerror', (error) => { if (pageErrors.length < 3) pageErrors.push(String(error.message).slice(0, 300)) })
      page.setDefaultTimeout(job.timeLimitMs)
      const caseStarted = performance.now()
      let timer
      try {
        const url = new URL(`http://preview.invalid${job.basePath}${item.path ?? '/'}`)
        await page.goto('http://preview.invalid/__harness')
        await page.locator('#solution').evaluate((frame, url) => new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Next.js не успел загрузиться')), 60_000)
          frame.onload = () => { clearTimeout(timeout); resolve() }
          frame.src = url
        }), url.href)
        const frame = page.frameLocator('#solution')
        const readStyle = createNativeStyleReader(context, page)
        const deadline = performance.now() + job.timeLimitMs
        const checked = async () => {
          for (const check of item.checks) {
            const locator = frame.locator(check.selector)
            if (check.action === 'click') await locator.click()
            if (check.action === 'fill') await locator.fill(check.value ?? '')
            let error
            do {
              error = await mismatch(locator, check, readStyle)
              if (!error) break
              await new Promise((resolve) => setTimeout(resolve, 20))
            } while (performance.now() < deadline)
            if (error) throw new Error(error)
          }
        }
        await Promise.race([checked(), new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Превышен лимит времени теста')), job.timeLimitMs) })])
        tests.push({ name: item.hidden ? `Скрытый тест ${index + 1}` : item.name, hidden: item.hidden, passed: true, durationMs: performance.now() - caseStarted })
      } catch (error) {
        tests.push({ name: item.hidden ? `Скрытый тест ${index + 1}` : item.name, hidden: item.hidden, passed: false, durationMs: performance.now() - caseStarted, message: item.hidden ? 'Скрытая проверка не пройдена' : [String(error.message), ...pageErrors].join('\n').slice(0, 600) })
      } finally { clearTimeout(timer); await context.close() }
    }
  } finally { await browser.close() }
  const passedCount = tests.filter((item) => item.passed).length
  return { status: passedCount === tests.length && (tests.length > 0 || job.allowNoTests) ? 'passed' : 'failed', tests, passedCount, totalCount: tests.length, consoleOutput: [], totalMs: performance.now() - started }
}

async function mismatch(locator, check, readStyle) {
  if (check.count !== undefined && await locator.count() !== check.count) return `Количество элементов ${check.selector} должно быть ${check.count}`
  if (check.visible !== undefined && await locator.first().isVisible() !== check.visible) return `Видимость ${check.selector} не соответствует условию`
  if (check.text !== undefined && (await locator.first().textContent())?.trim() !== check.text.trim()) return `Текст ${check.selector} должен быть: ${check.text}`
  if (check.attribute && await locator.first().getAttribute(check.attribute.name) !== check.attribute.value) return `Атрибут ${check.attribute.name} у ${check.selector} должен быть: ${check.attribute.value}`
  if (check.css) {
    await locator.first().waitFor({ state: 'attached' })
    for (const [name, value] of Object.entries(check.css)) {
      const actual = await readStyle(check.selector, name)
      if (actual?.trim() !== value.trim()) return `CSS ${name} у ${check.selector} должен быть: ${value}`
    }
  }
  return null
}
