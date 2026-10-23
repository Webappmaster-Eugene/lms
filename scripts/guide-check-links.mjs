#!/usr/bin/env node
/**
 * Проверяет внешние ссылки гайдов LMS: битые (404, 410, нет домена) — ошибка, остальное — отчёт.
 *
 *   pnpm guide:check-links гайд.md папка/с/гайдами   # локальные .md-файлы
 *   LMS_ADMIN_EMAIL=… LMS_ADMIN_PASSWORD=… pnpm guide:check-links   # все гайды с платформы
 *
 * LMS_URL — адрес платформы (по умолчанию прод). Учётные данные — только из окружения.
 * Сайты с защитой от ботов (403, 429) часто отвечают так и живому адресу — они в отчёте
 * отдельной группой «проверить вручную», а не среди битых.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const TIMEOUT_MS = 15_000
const CONCURRENCY = 6
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

/** Ссылки Markdown вне блоков кода: [текст](url), ![картинка](url), <url> и голые https://… */
export function markdownLinks(markdown) {
  const text = markdown.replace(/^(```|~~~)[\s\S]*?^\1[ \t]*$/gm, '').replace(/`[^`\n]*`/g, '')
  const links = new Set()
  for (const match of text.matchAll(/\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g)) links.add(match[1])
  for (const match of text.matchAll(/<(https?:\/\/[^>\s]+)>/g)) links.add(match[1])
  for (const match of text.matchAll(/(?<![(<\w])(https?:\/\/[^\s<>()\]]+[^\s<>()\].,;:!?»"'])/g)) links.add(match[1])
  return [...links]
}

function markdownFiles(path) {
  const full = resolve(process.env.INIT_CWD ?? process.cwd(), path)
  if (!statSync(full).isDirectory()) return [full]
  return readdirSync(full).filter((name) => name.endsWith('.md')).map((name) => join(full, name))
}

async function guidesFromPlatform() {
  const base = (process.env.LMS_URL || 'https://learn.mentorcareer.ru').replace(/\/+$/, '')
  const email = process.env.LMS_ADMIN_EMAIL
  const password = process.env.LMS_ADMIN_PASSWORD
  if (!email || !password) {
    console.error('Укажите .md-файлы или задайте LMS_ADMIN_EMAIL и LMS_ADMIN_PASSWORD, чтобы проверить гайды на платформе')
    process.exit(2)
  }
  const login = await fetch(`${base}/api/users/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const { token } = await login.json().catch(() => ({}))
  if (!token) {
    console.error(`Не удалось войти в ${base}: HTTP ${login.status}`)
    process.exit(1)
  }
  try {
    const sources = []
    for (let page = 1; ; page++) {
      const response = await fetch(`${base}/api/guides?depth=0&limit=50&page=${page}&select[title]=true&select[markdown]=true`, { headers: { Authorization: `JWT ${token}` } })
      if (!response.ok) throw new Error(`GET /api/guides → ${response.status}`)
      const data = await response.json()
      for (const guide of data.docs) sources.push({ name: guide.title, markdown: guide.markdown ?? '' })
      if (!data.hasNextPage) return sources
    }
  } finally {
    await fetch(`${base}/api/users/logout`, { method: 'POST', headers: { Authorization: `JWT ${token}` } }).catch((error) => console.error('Не удалось выйти из LMS', error))
  }
}

async function request(url, method) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { method, redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'ru,en;q=0.8' } })
    await response.body?.cancel().catch((error) => console.error(`Не удалось закрыть ответ ${url}`, error))
    return { status: response.status }
  } catch (error) {
    if (error?.name === 'AbortError') return { error: 'нет ответа за 15 с' }
    return { error: String(error?.cause?.code ?? error?.cause?.message ?? error?.message ?? 'ошибка').slice(0, 60) }
  } finally {
    clearTimeout(timer)
  }
}

async function check(url) {
  let result = await request(url, 'HEAD')
  // Многие сайты не умеют HEAD или отвечают на него иначе, чем на обычный заход.
  if (result.error || result.status >= 400) result = await request(url, 'GET')
  if (result.error) return { url, kind: /ENOTFOUND|EAI_AGAIN/.test(result.error) ? 'broken' : 'manual', note: result.error }
  if (result.status < 400) return { url, kind: 'ok', note: String(result.status) }
  if ([404, 410].includes(result.status)) return { url, kind: 'broken', note: String(result.status) }
  return { url, kind: 'manual', note: String(result.status) }
}

async function main() {
  const args = process.argv.slice(2)
  const sources = args.length
    ? args.flatMap(markdownFiles).map((file) => ({ name: file, markdown: readFileSync(file, 'utf8') }))
    : await guidesFromPlatform()
  const where = new Map()
  for (const source of sources) for (const url of markdownLinks(source.markdown)) where.set(url, [...(where.get(url) ?? []), source.name])
  const urls = [...where.keys()]
  console.log(`Гайдов: ${sources.length}, уникальных внешних ссылок: ${urls.length}`)
  const results = []
  let next = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < urls.length) results.push(await check(urls[next++]))
  }))
  const group = (kind) => results.filter((item) => item.kind === kind)
  for (const [kind, title] of [['broken', 'Битые'], ['manual', 'Проверить вручную (защита от ботов, таймаут, 5xx)']]) {
    const items = group(kind)
    if (!items.length) continue
    console.log(`\n${title}: ${items.length}`)
    for (const item of items) console.log(`  ${item.note.padEnd(18)} ${item.url}\n${' '.repeat(21)}в: ${where.get(item.url).join(', ')}`)
  }
  console.log(`\nРаботают: ${group('ok').length}`)
  if (group('broken').length) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Проверка ссылок не удалась', error)
    process.exit(1)
  })
}
