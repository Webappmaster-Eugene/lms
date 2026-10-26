#!/usr/bin/env node
/**
 * Статическая сборка лендинга (landing/, отдельный npm-пакет) и её раздача
 * для e2e/скриншотных тестов. Порт — E2E_LANDING_PORT (по умолчанию 3101).
 * Сборка пересобирается, если её нет, если исходники новее или при E2E_BUILD=1.
 */
import { spawnSync } from 'node:child_process'
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const LANDING = fileURLToPath(new URL('../landing/', import.meta.url))
const PORT = process.env.E2E_LANDING_PORT ?? '3101'
// LMS для формы предзаписи: в проде её проксирует nginx лендинга (location /api/bootcamp/leads).
const APP_URL = process.env.E2E_APP_URL ?? `http://localhost:${process.env.E2E_APP_PORT ?? '3100'}`

function newest(dir) {
  let max = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    max = Math.max(max, entry.isDirectory() ? newest(full) : statSync(full).mtimeMs)
  }
  return max
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: LANDING, stdio: 'inherit', env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' } })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (!existsSync(join(LANDING, 'node_modules'))) run('npm', ['ci'])

const index = join(LANDING, 'dist', 'index.html')
const stale =
  !existsSync(index) ||
  statSync(index).mtimeMs < Math.max(newest(join(LANDING, 'src')), newest(join(LANDING, 'public')), statSync(join(LANDING, 'astro.config.mjs')).mtimeMs)

if (process.env.E2E_BUILD === '1' || stale) run('npm', ['run', 'build'])

// Отдаём dist/ так же, как nginx.conf в проде: try_files $uri $uri/ =404,
// error_page 404 /404.html, charset utf-8 и те же security-заголовки. Свой
// сервер вместо `astro preview`: у Astro 7 он держит lock-файл на весь проект
// и не стартует рядом с чужим запущенным предпросмотром.
const DIST = join(LANDING, 'dist')
// Заголовки читаются из nginx.conf, а не копируются: тесты лендинга идут под той же CSP, что и прод.
const SECURITY_HEADERS = Object.fromEntries(
  [...readFileSync(join(LANDING, 'nginx.conf'), 'utf8').matchAll(/^\s*add_header ([\w-]+) "([^"]+)" always;$/gm)].map((m) => [m[1], m[2]]),
)
if (!SECURITY_HEADERS['Content-Security-Policy']) throw new Error('В landing/nginx.conf не найден Content-Security-Policy')
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json',
}

function resolveFile(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  const candidates = [join(DIST, safe), join(DIST, safe, 'index.html')]
  return candidates.find((file) => file.startsWith(DIST) && existsSync(file) && statSync(file).isFile())
}

// Те же редиректы дублей, что в nginx.conf: /index.html и //… → чистый адрес, страница-каталог → с косой чертой.
function duplicateRedirect(url) {
  if (/^\/index\.html(?:\?|$)/.test(url)) return `/${url.slice('/index.html'.length)}`.replace(/^\/\?$/, '/')
  if (/^\/{2,}/.test(url)) return url.replace(/^\/+/, '/')
  const page = url.match(/^\/(bootcamp\/nodejs|privacy)(\?.*)?$/)
  if (page) return `/${page[1]}/${page[2] ?? ''}`
  return null
}

// Как location /api/bootcamp/leads в nginx.conf: только POST, заголовки клиента как есть.
function proxyLead(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(403, SECURITY_HEADERS)
    return res.end()
  }
  const upstream = httpRequest(new URL('/api/bootcamp/leads', APP_URL), { method: 'POST', headers: { ...req.headers, 'x-forwarded-host': req.headers.host } }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, { 'Content-Type': answer.headers['content-type'] ?? 'application/json', ...SECURITY_HEADERS, 'Cache-Control': 'no-store' })
    answer.pipe(res)
  })
  upstream.on('error', (error) => {
    console.error(`LMS для формы недоступна (${APP_URL}): ${error.message}`)
    res.writeHead(502, SECURITY_HEADERS)
    res.end()
  })
  req.pipe(upstream)
}

const server = createServer((req, res) => {
  const location = duplicateRedirect(req.url ?? '/')
  if (location !== null) {
    res.writeHead(301, { Location: location, ...SECURITY_HEADERS })
    return res.end()
  }
  const { pathname } = new URL(req.url ?? '/', 'http://landing')
  if (pathname === '/api/bootcamp/leads') return proxyLead(req, res)
  const file = resolveFile(pathname)
  const status = file ? 200 : 404
  const body = file ?? join(DIST, '404.html')
  res.writeHead(status, {
    'Content-Type': TYPES[extname(body)] ?? 'application/octet-stream',
    ...SECURITY_HEADERS,
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(body).pipe(res)
})

server.listen(Number(PORT), '0.0.0.0', () => console.log(`Лендинг: http://localhost:${PORT}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
