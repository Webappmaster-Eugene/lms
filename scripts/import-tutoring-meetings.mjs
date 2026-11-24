import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { apply: { type: 'boolean' }, 'decks-only': { type: 'boolean' }, 'node-practice': { type: 'string' }, 'react-practice': { type: 'string' } },
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
if (manifest.schema !== 'mentorcareer-live-meetings/2' || !Array.isArray(manifest.meetings) || manifest.meetings.length !== 56) {
  throw new Error('Нужен комплект из 56 встреч')
}

async function presentationFiles(meeting, key) {
  const [pdf, pptx, instructorNotes] = await Promise.all([
    readFile(path.join(root, meeting.presentation)),
    readFile(path.join(root, meeting.editable)),
    readFile(path.join(root, meeting.instructorNotes), 'utf8'),
  ])
  if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-')) || pdf.length > 10 * 1024 * 1024 || pptx.length < 4 || pptx.length > 10 * 1024 * 1024 || pptx.readUInt32LE(0) !== 0x04034b50 || !instructorNotes.trim() || instructorNotes.length > 80_000) {
    throw new Error(`Некорректная презентация или заметки ${key}`)
  }
  return { pdf, pptx, instructorNotes }
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
    meeting.editable !== `${program}/${key}.pptx` || meeting.instructorNotes !== `instructor/${program}/${key}.md`) throw new Error(`Некорректные пути встречи ${key}`)
  seen.add(key)
  const { pdf, pptx, instructorNotes } = await presentationFiles(meeting, key)
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
  const digestData = values['decks-only'] ? { decksOnly: true, program, number, instructorNotes } : data
  const sourceDigest = createHash('sha256').update(JSON.stringify(digestData)).update(pdf).update(pptx).digest('hex')
  preparations.push({ pdf, pptx, data: { ...data, sourceDigest }, key })
}

if (manifest.edition === 9) {
  const guide = JSON.parse(await readFile(path.join(root, 'introductions.json'), 'utf8'))
  if (!Array.isArray(guide.introductions) || guide.introductions.length !== 2) throw new Error('Нужна вводная для каждого курса')
  for (const intro of guide.introductions) {
    const { program, key } = intro
    if (!Object.hasOwn(programs, program) || key !== `${program}-intro` || seen.has(key) ||
      intro.durationMinutes !== 60 || intro.priceKopecks !== 0 ||
      intro.presentation !== `${program}/${key}.pdf` || intro.editable !== `${program}/${key}.pptx` ||
      intro.instructorNotes !== `instructor/${program}/${key}.md`) throw new Error('Проверьте вводную встречу ' + program)
    seen.add(key)
    const { pdf, pptx, instructorNotes } = await presentationFiles(intro, key)
    const sourceDigest = createHash('sha256').update(JSON.stringify({ key, instructorNotes })).update(pdf).update(pptx).digest('hex')
    preparations.push({ key, introduction: true, pdf, pptx, data: { program, sourceDigest, instructorNotes } })
  }
}

const { LMS_URL, LMS_ADMIN_EMAIL, LMS_ADMIN_PASSWORD } = process.env
if (!LMS_URL || !LMS_ADMIN_EMAIL || !LMS_ADMIN_PASSWORD) {
  if (values.apply) throw new Error('Для импорта нужны LMS_URL, LMS_ADMIN_EMAIL и LMS_ADMIN_PASSWORD')
  process.stdout.write(`Проверено ${preparations.length} встреч, PDF, PPTX, заметки и задания обоих буткемпов.\n`)
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
const counts = { created: 0, changed: 0, unchanged: 0, manual: 0 }
for (const { data, pdf, pptx, key, introduction } of preparations) {
  const collection = introduction ? 'tutoring-introductions' : 'tutoring-meetings'
  const query = new URLSearchParams({ 'where[program][equals]': data.program, depth: '0', limit: '2' })
  if (!introduction) query.set('where[number][equals]', String(data.number))
  const { docs } = await request('GET', `${collection}?${query}`)
  if (docs.length > 1) throw new Error('Несколько материалов для одной встречи')
  const existing = docs[0]
  if (!introduction && values['decks-only'] && !existing) throw new Error(`Нет встречи для обновления презентации: ${key}`)
  if (existing?.deckOrigin === 'manual') {
    counts.manual++
    process.stdout.write(`Ручная версия сохранена: ${key}\n`)
    continue
  }
  if (existing?.sourceDigest === data.sourceDigest && existing.deckPdf && existing.deckPptx) {
    counts.unchanged++
    continue
  }
  if (!values.apply) {
    counts[existing ? 'changed' : 'created']++
    continue
  }
  const form = new FormData()
  form.set('id', String(existing?.id ?? 0))
  form.set('updatedAt', existing?.updatedAt ?? '')
  form.set('material', JSON.stringify(data))
  if (introduction) form.set('introduction', data.program)
  else if (values['decks-only']) form.set('decksOnly', 'true')
  form.set('pdf', new Blob([pdf], { type: 'application/pdf' }), `${key}.pdf`)
  form.set('pptx', new Blob([pptx], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), `${key}.pptx`)
  const result = await request('POST', 'manage/tutoring/presentation', form)
  if (result.status === 'manual') {
    counts.manual++
    process.stdout.write(`Ручная версия сохранена: ${key}\n`)
    continue
  }
  const saved = await request('GET', `${collection}/${result.id}?depth=1`)
  if (saved.sourceDigest !== data.sourceDigest || saved.deckPdf?.mimeType !== 'application/pdf' ||
    saved.deckPptx?.mimeType !== 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    !saved.deckPdf.filename || !saved.deckPptx.filename) {
    throw new Error(`Листинг ${data.program} ${data.number}: LMS сохранила неполные материалы`)
  }
  if (!introduction && values['decks-only'] && (saved.id !== existing.id || saved.title !== existing.title ||
    JSON.stringify(saved.homework) !== JSON.stringify(existing.homework))) throw new Error(`Изменились данные встречи ${key}`)
  counts[result.status === 'unchanged' ? 'unchanged' : existing ? 'changed' : 'created']++
}
process.stdout.write(`${values.apply ? 'Импорт' : 'Проверка'}: ${JSON.stringify(counts)}\n`)
