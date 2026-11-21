import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { apply: { type: 'boolean' }, 'node-practice': { type: 'string' }, 'react-practice': { type: 'string' } },
})
const root = positionals[0]
if (!root || !values['node-practice'] || !values['react-practice']) {
  throw new Error('Укажите папку экспорта, --node-practice и --react-practice с каталогами lessons обоих пакетов')
}
const manifest = JSON.parse(await readFile(path.join(root, 'meetings.json'), 'utf8'))
const programs = {
  nodejs: { total: 32, practice: values['node-practice'] },
  'react-next': { total: 24, practice: values['react-practice'] },
}
if (manifest.schema !== 'mentorcareer-live-meetings/1' || !Array.isArray(manifest.meetings) || manifest.meetings.length !== 56) {
  throw new Error('Нужен комплект из 56 встреч')
}

const preparations = []
const seen = new Set()
for (const meeting of manifest.meetings) {
  const { program, number, title, homework } = meeting
  if (!Object.hasOwn(programs, program) || !Number.isInteger(number) || number < 1 || number > programs[program].total ||
    typeof title !== 'string' || !title.trim() || title.length > 240 || !Array.isArray(homework) || homework.length < 1 || homework.length > 2) {
    throw new Error('Некорректные данные встречи в экспорте')
  }
  const week = String(Math.ceil(number / 2)).padStart(2, '0')
  const key = `${program}-${week}-${number % 2 ? 'tue' : 'thu'}`
  if (seen.has(key) || meeting.key !== key || meeting.presentation !== `${program}/${key}.pdf` ||
    meeting.instructorNotes !== `instructor/${program}/${key}.md`) throw new Error(`Некорректные пути встречи ${key}`)
  seen.add(key)
  const [pdf, instructorNotes] = await Promise.all([
    readFile(path.join(root, meeting.presentation)),
    readFile(path.join(root, meeting.instructorNotes), 'utf8'),
  ])
  if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-')) || pdf.length > 5_000_000 || !instructorNotes.trim() || instructorNotes.length > 80_000) {
    throw new Error(`Некорректный PDF или заметки ${key}`)
  }
  const stages = new Set()
  const tasks = await Promise.all(homework.map(async item => {
    const slug = new URL(item.practice).pathname.match(/^\/lessons\/((?:nodejs|react-next)-bootcamp-(\d{2}-[a-z0-9-]+)-practice)$/)
    const stage = item.stage
    if (!Number.isInteger(stage) || stage < 0 || stage > 20 || stages.has(stage) || !slug ||
      !slug[1].startsWith(`${program}-bootcamp-${String(stage).padStart(2, '0')}-`) ||
      typeof item.description !== 'string' || !item.description.trim() || item.description.length > 1200) {
      throw new Error(`Некорректное задание встречи ${key}`)
    }
    stages.add(stage)
    const practice = `/lessons/${slug[1]}`
    if (number % 2) return { stage, description: item.description, practice }
    const source = await readFile(path.join(programs[program].practice, slug[2], 'practice.md'), 'utf8')
    const assignment = /^### Основное задание\s*$/m.exec(source)
    const text = assignment ? source.slice(assignment.index).trim() : ''
    if (!text || text.length > 50_000) throw new Error(`Нет условий полной работы для этапа ${program} ${stage}`)
    return { stage, description: item.description, assignment: text, practice }
  }))
  const data = { program, number, title, homework: tasks, instructorNotes }
  const sourceDigest = createHash('sha256').update(pdf).update(JSON.stringify(data)).digest('hex')
  preparations.push({ pdf, data: { ...data, sourceDigest }, filename: `tutoring-${key}-${sourceDigest.slice(0, 10)}.pdf` })
}

const { LMS_URL, LMS_ADMIN_EMAIL, LMS_ADMIN_PASSWORD } = process.env
if (!LMS_URL || !LMS_ADMIN_EMAIL || !LMS_ADMIN_PASSWORD) {
  if (values.apply) throw new Error('Для импорта нужны LMS_URL, LMS_ADMIN_EMAIL и LMS_ADMIN_PASSWORD')
  process.stdout.write(`Проверено ${preparations.length} встреч, PDF, заметки и задания обоих буткемпов.\n`)
  process.exit(0)
}
const target = new URL(LMS_URL)
const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
if (target.href !== `${target.origin}/` || (target.protocol !== 'https:' && !(local && target.protocol === 'http:'))) {
  throw new Error('LMS_URL должен быть origin по HTTPS или локальный HTTP')
}

let token = ''
let lastRequest = 0
async function request(method, route, data) {
  if (!local && lastRequest) await new Promise(resolve => setTimeout(resolve, Math.max(0, lastRequest + 550 - Date.now())))
  lastRequest = Date.now()
  const multipart = data instanceof FormData
  const response = await fetch(`${target.origin}/api/${route}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { ...(token ? { Authorization: `JWT ${token}` } : {}), ...(!multipart && data ? { 'Content-Type': 'application/json' } : {}) },
    body: multipart ? data : data === undefined ? undefined : JSON.stringify(data),
  })
  if (!response.ok) throw new Error(`${method} ${route.split('?')[0]}: HTTP ${response.status}`)
  return response.json()
}
const login = await request('POST', 'users/login', { email: LMS_ADMIN_EMAIL, password: LMS_ADMIN_PASSWORD })
if (typeof login.token !== 'string') throw new Error('Вход не выдал токен')
token = login.token
const session = await request('GET', 'users/me')
if (session.user?.role !== 'admin') throw new Error('Нужна авторизованная учётная запись администратора')
const counts = { created: 0, changed: 0, unchanged: 0 }
for (const { data, pdf, filename } of preparations) {
  const query = new URLSearchParams({ 'where[program][equals]': data.program, 'where[number][equals]': data.number, depth: '0', limit: '2' })
  const { docs } = await request('GET', `tutoring-meetings?${query}`)
  if (docs.length > 1) throw new Error('Несколько материалов для одной встречи')
  const existing = docs[0]
  if (existing?.sourceDigest === data.sourceDigest && existing.filename) {
    counts.unchanged++
    continue
  }
  counts[existing ? 'changed' : 'created']++
  if (!values.apply) continue
  const form = new FormData()
  form.append('_payload', JSON.stringify(data))
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), filename)
  const result = await request(existing ? 'PATCH' : 'POST', existing ? `tutoring-meetings/${existing.id}` : 'tutoring-meetings', form)
  const saved = await request('GET', `tutoring-meetings/${result.doc.id}?depth=0`)
  if (saved.sourceDigest !== data.sourceDigest || saved.mimeType !== 'application/pdf' || !saved.filename) {
    throw new Error(`Листинг ${data.program} ${data.number}: LMS сохранила неполные материалы`)
  }
}
process.stdout.write(`${values.apply ? 'Импорт' : 'Проверка'}: ${JSON.stringify(counts)}\n`)
