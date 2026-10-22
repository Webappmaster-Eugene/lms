#!/usr/bin/env node
/**
 * Публикует гайд LMS из `.md`-файла: создаёт новый или обновляет существующий.
 *
 *   LMS_ADMIN_EMAIL=… LMS_ADMIN_PASSWORD=… pnpm guide:publish путь/к/гайду.md
 *
 * Файл уходит целиком: шапку `---` (title, summary, slug, order, published) раскладывает сервер,
 * хук applyGuideFile. Существующий гайд ищется по slug из шапки, без него — по точному названию.
 * LMS_URL — адрес платформы (по умолчанию прод). Учётные данные — только из окружения.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const file = process.argv[2]
if (!file) {
  console.error('Укажите файл: pnpm guide:publish путь/к/гайду.md')
  process.exit(2)
}
const BASE = (process.env.LMS_URL || 'https://learn.mentorcareer.ru').replace(/\/+$/, '')
const email = process.env.LMS_ADMIN_EMAIL
const password = process.env.LMS_ADMIN_PASSWORD
if (!email || !password) {
  console.error('Задайте LMS_ADMIN_EMAIL и LMS_ADMIN_PASSWORD — учётку администратора LMS')
  process.exit(2)
}

// pnpm запускает скрипт из корня пакета; относительный путь считаем от каталога, где набрали команду.
const text = readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file), 'utf8')
const header = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''
const headerValue = (key) => new RegExp(`^${key}[ \\t]*:[ \\t]*(.+?)[ \\t]*$`, 'm').exec(header)?.[1].replace(/\s+#.*$/, '').replace(/^(["'])(.*)\1$/, '$2')
const slug = headerValue('slug')
const title = headerValue('title') ?? /^(?:\uFEFF)?(?:---[\s\S]*?\n---[ \t]*\r?\n)?\s*#[ \t]+(.+?)[ \t#]*$/m.exec(text)?.[1]

async function api(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `JWT ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: response.status, json: await response.json().catch(() => null) }
}

function failure(action, result) {
  const messages = (result.json?.errors ?? []).flatMap((error) => [error.message, ...(error.data?.errors ?? []).map((item) => `${item.path}: ${item.message}`)])
  return new Error(`${action}: HTTP ${result.status}${messages.length ? ` — ${messages.join('; ')}` : ''}`)
}

const login = await api('/users/login', { method: 'POST', body: { email, password } })
if (login.status !== 200 || !login.json?.token) throw failure('Вход не удался', login)
const token = login.json.token

try {
  const where = slug ? `where[slug][equals]=${encodeURIComponent(slug)}` : title ? `where[title][equals]=${encodeURIComponent(title)}` : null
  const found = where ? await api(`/guides?${where}&depth=0&limit=1`, { token }) : null
  if (found && found.status !== 200) throw failure('Не удалось найти гайд', found)
  const existing = found?.json?.docs?.[0]

  const saved = existing
    ? await api(`/guides/${existing.id}`, { token, method: 'PATCH', body: { markdown: text } })
    : await api('/guides', { token, method: 'POST', body: { markdown: text } })
  if (saved.status !== 200 && saved.status !== 201) throw failure(existing ? 'Обновление не удалось' : 'Создание не удалось', saved)
  const guide = saved.json.doc
  console.log(`${existing ? 'Обновлён' : 'Создан'} гайд «${guide.title}»: id ${guide.id}, ${BASE}/guides/${guide.slug}, ${guide.isPublished ? 'опубликован' : 'черновик'}`)
  if (!existing) console.log('Ученики увидят гайд, только когда вы выдадите его в «Доступ к обучению».')
} finally {
  const logout = await api('/users/logout', { token, method: 'POST' })
  if (logout.status !== 200) console.error(`Выход: HTTP ${logout.status}`)
}
