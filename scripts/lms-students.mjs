#!/usr/bin/env node
/**
 * Ученики и доступы LMS через API администратора. Описание и сценарии:
 * .claude/skills/lms-students/SKILL.md
 *
 *   pnpm students list [поиск]
 *   pnpm students show <почта|id> [--courses]
 *   pnpm students create <почта> <имя> <фамилия> [--allow цель]... [--deny цель]... [--dry-run]
 *   pnpm students allow|deny|remove <почта|id> <цель>... [--dry-run]
 *   pnpm students mode <почта|id> [--access all|assigned] [--catalog catalog|assigned] [--trainer all|assigned|disabled] [--guides all|assigned] [--dry-run]
 *   pnpm students password|disable|enable <почта|id> [--dry-run]
 *   pnpm students freeze <почта|id> [--for 1m|3m|6m|1y|forever | --until ГГГГ-ММ-ДД] [--reason vacation|left|no-contact|other] [--note текст] [--dry-run]
 *   pnpm students unfreeze <почта|id> [--next 6m|1y|none] [--dry-run]
 *   pnpm students plan <почта|id> --date ГГГГ-ММ-ДД|none [--dry-run]
 *   pnpm students delete <почта|id> --confirm <почта> [--dry-run]
 *
 * Цели: roadmap:<slug> course:<slug> section:<id> lesson:<slug> topic:<nodeId>
 *       trainer-topic:<slug> trainer-task:<slug> guide:<slug>
 *
 * Адрес: LMS_BASE_URL, по умолчанию прод. Учётка администратора: LMS_ADMIN_EMAIL и
 * LMS_ADMIN_PASSWORD, иначе строки ADMIN_EMAIL= и ADMIN_PASSWORD= из LMS_INFO_FILE
 * (по умолчанию ../expert_info/info.txt). В файле есть чужие данные, поэтому он
 * разбирается здесь и никуда не выводится. Пароль в аргументы не передаётся.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const TARGET_KINDS = {
  roadmap: { collection: 'roadmaps', field: 'slug' },
  course: { collection: 'courses', field: 'slug' },
  section: { collection: 'sections', field: 'id' },
  lesson: { collection: 'lessons', field: 'slug' },
  topic: { collection: 'roadmap-nodes', field: 'nodeId' },
  'trainer-topic': { collection: 'trainer-topics', field: 'slug' },
  'trainer-task': { collection: 'trainer-tasks', field: 'slug' },
  guide: { collection: 'guides', field: 'slug' },
}

export class StudentsCliError extends Error {}

export function parseTarget(raw) {
  const separator = raw.indexOf(':')
  const kind = separator > 0 ? raw.slice(0, separator) : ''
  const value = separator > 0 ? raw.slice(separator + 1).trim() : ''
  if (!Object.hasOwn(TARGET_KINDS, kind) || !value) throw new StudentsCliError(`Неверная цель «${raw}». Формат: ${Object.keys(TARGET_KINDS).join('|')}:<значение>`)
  if (TARGET_KINDS[kind].field === 'id' && !/^\d+$/.test(value)) throw new StudentsCliError(`Для ${kind} нужен числовой id, получено «${value}»`)
  return { kind, value, collection: TARGET_KINDS[kind].collection, field: TARGET_KINDS[kind].field }
}

const PROD_URL = 'https://learn.mentorcareer.ru'

/** Сюда уйдёт пароль администратора: открытый http допустим только на своей машине. */
export function resolveBaseUrl(raw) {
  let url
  try { url = new URL(raw ?? PROD_URL) }
  catch { throw new StudentsCliError(`Неверный LMS_BASE_URL: ${raw}`) }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new StudentsCliError(`LMS_BASE_URL должен быть https, http только для localhost: ${raw}`)
  return url.origin
}

const MODE_VALUES = { access: ['all', 'assigned'], catalog: ['catalog', 'assigned'], trainer: ['all', 'assigned', 'disabled'], guides: ['all', 'assigned'] }

/** Иначе --dry-run показал бы неверный режим как успех, а настоящий запуск упал бы на сервере. */
export function assertModeValues(options) {
  for (const [name, allowed] of Object.entries(MODE_VALUES)) {
    if (options[name] !== undefined && !allowed.includes(options[name])) throw new StudentsCliError(`--${name}: допустимо ${allowed.join(', ')}, получено «${options[name]}»`)
  }
}

export function parseArgs(argv) {
  const positional = []
  const options = { allow: [], deny: [] }
  const valued = new Set(['allow', 'deny', 'access', 'catalog', 'trainer', 'guides', 'confirm', 'for', 'until', 'reason', 'note', 'next', 'date'])
  const flags = new Set(['dry-run', 'courses'])
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    if (!item.startsWith('--')) { positional.push(item); continue }
    const name = item.slice(2)
    if (flags.has(name)) { options[name] = true; continue }
    if (!valued.has(name)) throw new StudentsCliError(`Неизвестный параметр ${item}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new StudentsCliError(`После ${item} нужно значение`)
    index += 1
    if (Array.isArray(options[name])) options[name].push(value)
    else options[name] = value
  }
  return { positional, options }
}

const FREEZE_TERMS = ['1m', '3m', '6m', '1y', 'forever']
const FREEZE_REASONS = ['vacation', 'left', 'no-contact', 'other']
const NEXT_FREEZE = ['6m', '1y', 'none']
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Тело запроса заморозки для POST /api/manage/students/<id>/freeze. Проверяет значения до входа на прод. */
export function freezeBody(command, options) {
  if (command === 'freeze') {
    if (options.for !== undefined && options.until !== undefined) throw new StudentsCliError('Укажите --for или --until, не оба')
    if (options.until !== undefined && !DAY.test(options.until)) throw new StudentsCliError('--until в формате ГГГГ-ММ-ДД')
    const term = options.until !== undefined ? 'date' : options.for ?? '1m'
    if (term !== 'date' && !FREEZE_TERMS.includes(term)) throw new StudentsCliError(`--for: ${FREEZE_TERMS.join(', ')}`)
    const reason = options.reason ?? 'vacation'
    if (!FREEZE_REASONS.includes(reason)) throw new StudentsCliError(`--reason: ${FREEZE_REASONS.join(', ')}`)
    return { action: 'freeze', term, ...(term === 'date' ? { until: options.until } : {}), reason, ...(options.note ? { note: options.note } : {}) }
  }
  if (command === 'unfreeze') {
    const next = options.next ?? '6m'
    if (!NEXT_FREEZE.includes(next)) throw new StudentsCliError(`--next: ${NEXT_FREEZE.join(', ')}`)
    return { action: 'unfreeze', next }
  }
  if (command === 'plan') {
    if (options.date !== 'none' && !DAY.test(options.date ?? '')) throw new StudentsCliError('--date ГГГГ-ММ-ДД или none')
    return { action: 'plan', date: options.date === 'none' ? null : options.date }
  }
  throw new StudentsCliError(`Не команда заморозки: ${command}`)
}

const day = (iso) => new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow' }).format(new Date(iso))

/** Строка состояния заморозки, как на экране «Ученики и доступы». */
export function freezeLine(student) {
  const freeze = student.freeze
  const test = student.isTestStudent ? ', тестовый ученик' : ''
  if (!freeze) return ''
  if (freeze.active) return `Заморожен ${freeze.endsAt ? `до ${day(freeze.endsAt)}` : 'бессрочно'}${freeze.reason ? ` (${freeze.reason})` : ''}${freeze.endsAt && freeze.frozenUntil !== freeze.endsAt ? `, потом ${freeze.frozenUntil ? `до ${day(freeze.frozenUntil)}` : 'бессрочно'}` : ''}${test}`
  return `${freeze.plannedAt ? `Доступ до ${day(freeze.plannedAt)}` : 'Доступ без срока'}${test}`
}

/** На одну цель одно правило: новое действие меняет прежнее, сохраняя его id и комментарий. */
export function mergeRules(rules, changes) {
  const next = rules.map((rule) => ({ ...rule }))
  for (const change of changes) {
    const index = next.findIndex((rule) => rule.target.relationTo === change.relationTo && rule.target.value === change.value)
    if (change.effect === 'remove') {
      if (index >= 0) next.splice(index, 1)
    } else if (index >= 0) next[index].effect = change.effect
    else next.push({ target: { relationTo: change.relationTo, value: change.value }, title: change.title, effect: change.effect, startsAt: null, expiresAt: null, note: '' })
  }
  return next
}

export function readAdminCredentials(env, cwd) {
  if (env.LMS_ADMIN_EMAIL && env.LMS_ADMIN_PASSWORD) return { email: env.LMS_ADMIN_EMAIL, password: env.LMS_ADMIN_PASSWORD }
  const file = env.LMS_INFO_FILE ?? resolve(cwd, '../expert_info/info.txt')
  let lines
  try { lines = readFileSync(file, 'utf8').split(/\r?\n/) }
  catch { throw new StudentsCliError(`Нет учётки администратора: задайте LMS_ADMIN_EMAIL и LMS_ADMIN_PASSWORD или LMS_INFO_FILE (не прочитан ${file})`) }
  const value = (key) => lines.find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1)
  const email = value('ADMIN_EMAIL')
  const password = value('ADMIN_PASSWORD')
  if (!email || !password) throw new StudentsCliError(`В ${file} нет строк ADMIN_EMAIL и ADMIN_PASSWORD`)
  return { email: email.trim(), password }
}

function client(baseUrl) {
  let token = null
  async function request(path, { method = 'GET', body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, { method, headers: { ...(token ? { Authorization: `JWT ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new StudentsCliError(`${method} ${path.split('?')[0]}: ${response.status} ${data?.error ?? data?.errors?.[0]?.message ?? ''}`.trim())
    return data
  }
  return {
    request,
    async login({ email, password }) {
      let data
      try { data = await request('/api/users/login', { method: 'POST', body: { email, password } }) }
      // Каждая неудача растит счётчик блокировки: повторять нельзя, пароль надо уточнить у владельца.
      catch (error) { throw new StudentsCliError(`Вход администратора не удался, повторять нельзя: ${error.message}`) }
      if (data?.user?.role !== 'admin') {
        token = data?.token ?? null
        await this.logout()
        throw new StudentsCliError('Эта учётка не администратор')
      }
      token = data.token
    },
    async logout() {
      if (!token) return
      try { await request('/api/users/logout', { method: 'POST' }) }
      catch (error) { console.error(`Выход не удался, сессия остаётся: ${error.message}`) }
      token = null
    },
  }
}

const accessUrl = '/api/manage/learning-access'

async function findStudent(api, reference) {
  const where = /^\d+$/.test(reference) ? `where[id][equals]=${reference}` : `where[email][equals]=${encodeURIComponent(reference.trim().toLowerCase())}`
  const { docs } = await api.request(`/api/users?${where}&depth=0&limit=2`)
  if (docs.length !== 1) throw new StudentsCliError(`Ученик «${reference}» не найден`)
  if (docs[0].role !== 'student') throw new StudentsCliError(`«${reference}» не ученик, а ${docs[0].role}`)
  return docs[0]
}

async function resolveTarget(api, raw) {
  const target = parseTarget(raw)
  const { docs } = await api.request(`/api/${target.collection}?where[${target.field}][equals]=${encodeURIComponent(target.value)}&depth=0&limit=2&select[title]=true&select[label]=true`)
  if (docs.length !== 1) throw new StudentsCliError(`Цель «${raw}»: найдено ${docs.length}, нужна ровно одна`)
  return { relationTo: target.collection, value: docs[0].id, title: docs[0].title ?? docs[0].label }
}

async function resolveChanges(api, entries) {
  const changes = []
  for (const [effect, raw] of entries) changes.push({ effect, ...await resolveTarget(api, raw) })
  return changes
}

const ruleLine = (rule) => `  ${rule.effect === 'deny' ? 'закрыть' : 'открыть'} ${rule.target.relationTo}:${rule.target.value} ${rule.title ?? ''}${rule.startsAt || rule.expiresAt ? ` (срок ${rule.startsAt ?? '...'} - ${rule.expiresAt ?? '...'})` : ''}`.trimEnd()

async function loadSnapshot(api, id) { return api.request(`${accessUrl}?user=${id}`) }

async function saveSnapshot(api, snapshot, changes) {
  return api.request(accessUrl, { method: 'PUT', body: { userId: snapshot.userId, revision: snapshot.revision, mode: changes.mode ?? snapshot.mode, catalogVisibility: changes.catalogVisibility ?? snapshot.catalogVisibility, trainerMode: changes.trainerMode ?? snapshot.trainerMode, guidesMode: changes.guidesMode ?? snapshot.guidesMode, rules: changes.rules ?? snapshot.rules } })
}

/** Постранично через предпросмотр: тот же расчёт, что у экрана, и без записи. */
async function previewAccess(api, snapshot) {
  const courses = []
  let totals
  for (let page = 1; page <= 200; page += 1) {
    const preview = await api.request(`${accessUrl}?page=${page}`, { method: 'POST', body: { userId: snapshot.userId, revision: snapshot.revision, mode: snapshot.mode, catalogVisibility: snapshot.catalogVisibility, trainerMode: snapshot.trainerMode, guidesMode: snapshot.guidesMode, rules: snapshot.rules } })
    courses.push(...preview.courses)
    totals = preview
    if (!preview.hasNextPage) break
  }
  return { courses, availableCount: totals.availableCount, totalCount: totals.totalCount, trainer: totals.trainer, guides: totals.guides }
}

function printAccess(preview, listCourses) {
  console.log(`Курсы: открыто ${preview.availableCount} из ${preview.totalCount}. Тренажёр: ${preview.trainer.availableCount} из ${preview.trainer.totalCount}. Гайды: ${preview.guides.availableCount} из ${preview.guides.totalCount}.`)
  if (listCourses) for (const course of preview.courses.filter((item) => item.access !== 'closed')) console.log(`  ${course.access === 'full' ? 'открыт' : 'частично'} ${course.id} ${course.title}`)
}

function printSnapshot(snapshot) {
  console.log(`Режимы: курсы ${snapshot.mode}, каталог ${snapshot.catalogVisibility}, тренажёр ${snapshot.trainerMode}, гайды ${snapshot.guidesMode}`)
  console.log(snapshot.rules.length ? `Правила (${snapshot.rules.length}):` : 'Правил нет')
  for (const rule of snapshot.rules) console.log(ruleLine(rule))
}

const printCredentials = ({ email, password }) => console.log(`Логин: ${email}\nПароль: ${password}\nПароль показан один раз: передайте его владельцу в ответе, в файлы, память и отчёты не записывайте.`)

async function run(api, command, positional, options) {
  const dryRun = options['dry-run'] === true
  const need = (count, usage) => { if (positional.length < count) throw new StudentsCliError(`Использование: pnpm students ${usage}`) }
  if (command === 'list') {
    const search = positional.join(' ')
    for (let page = 1, more = true; more; page += 1) {
      const result = await api.request(`${accessUrl}?kind=students&page=${page}&search=${encodeURIComponent(search)}`)
      for (const student of result.docs) console.log(`${student.id} ${student.title}${student.active === false ? ' [отключён]' : ''}${student.frozen ? ' [заморожен]' : ''}`)
      more = result.hasNextPage
    }
    return
  }
  if (command === 'show') {
    need(1, 'show <почта|id>')
    const student = await findStudent(api, positional[0])
    const snapshot = await loadSnapshot(api, student.id)
    const details = await api.request(`/api/manage/students/${student.id}`)
    console.log(`${student.id} ${student.firstName} ${student.lastName} <${student.email}>${details.student.isActive ? '' : ' [отключён]'}`)
    console.log(freezeLine(details.student))
    printSnapshot(snapshot)
    printAccess(await previewAccess(api, snapshot), options.courses === true)
    return
  }
  if (command === 'create') {
    need(3, 'create <почта> <имя> <фамилия> [--allow цель]... [--deny цель]...')
    const [email, firstName, lastName] = positional
    const changes = await resolveChanges(api, [...options.allow.map((raw) => ['allow', raw]), ...options.deny.map((raw) => ['deny', raw])])
    if (dryRun) {
      console.log(`Создал бы ${firstName} ${lastName} <${email}> без письма. Правила:`)
      for (const change of changes) console.log(`  ${change.effect} ${change.relationTo}:${change.value} ${change.title}`)
      return
    }
    const created = await api.request('/api/manage/students', { method: 'POST', body: { email, firstName, lastName } })
    console.log(`Создан ученик ${created.student.id} ${created.student.firstName} ${created.student.lastName}`)
    printCredentials(created.credentials)
    if (changes.length) {
      let saved
      try {
        const snapshot = await loadSnapshot(api, created.student.id)
        saved = await saveSnapshot(api, snapshot, { rules: mergeRules(snapshot.rules, changes) })
      } catch (error) {
        throw new StudentsCliError(`Ученик создан, его логин и пароль выше, но доступы не выданы: ${error.message}. Повторно не создавайте, выдайте их через pnpm students allow ${created.student.email} <цель>`)
      }
      printSnapshot(saved)
      printAccess(await previewAccess(api, saved), false)
    }
    return
  }
  if (command === 'allow' || command === 'deny' || command === 'remove') {
    need(2, `${command} <почта|id> <цель>...`)
    const student = await findStudent(api, positional[0])
    const snapshot = await loadSnapshot(api, student.id)
    const changes = await resolveChanges(api, positional.slice(1).map((raw) => [command, raw]))
    const rules = mergeRules(snapshot.rules, changes)
    if (dryRun) { console.log('Было бы:'); printSnapshot({ ...snapshot, rules }); printAccess(await previewAccess(api, { ...snapshot, rules }), false); return }
    const saved = await saveSnapshot(api, snapshot, { rules })
    printSnapshot(saved)
    printAccess(await previewAccess(api, saved), false)
    return
  }
  if (command === 'mode') {
    need(1, 'mode <почта|id> [--access ...] [--catalog ...] [--trainer ...] [--guides ...]')
    const student = await findStudent(api, positional[0])
    const snapshot = await loadSnapshot(api, student.id)
    const changes = { mode: options.access, catalogVisibility: options.catalog, trainerMode: options.trainer, guidesMode: options.guides }
    if (Object.values(changes).every((value) => value === undefined)) throw new StudentsCliError('Укажите --access, --catalog, --trainer или --guides')
    if (dryRun) { printSnapshot({ ...snapshot, ...Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) }); return }
    const saved = await saveSnapshot(api, snapshot, changes)
    printSnapshot(saved)
    printAccess(await previewAccess(api, saved), false)
    return
  }
  if (command === 'password') {
    need(1, 'password <почта|id>')
    const student = await findStudent(api, positional[0])
    if (dryRun) { console.log(`Создал бы новый пароль для ${student.email} и закрыл его сессии`); return }
    printCredentials((await api.request(`/api/manage/students/${student.id}/password`, { method: 'POST' })).credentials)
    return
  }
  if (command === 'disable' || command === 'enable') {
    need(1, `${command} <почта|id>`)
    const student = await findStudent(api, positional[0])
    if (dryRun) { console.log(`${command === 'disable' ? 'Отключил' : 'Включил'} бы ${student.email}`); return }
    await api.request(`/api/manage/students/${student.id}`, { method: 'PATCH', body: { isActive: command === 'enable' } })
    console.log(`${command === 'disable' ? 'Отключён' : 'Включён'}: ${student.email}`)
    return
  }
  if (command === 'freeze' || command === 'unfreeze' || command === 'plan') {
    need(1, `${command} <почта|id>`)
    const body = freezeBody(command, options)
    const student = await findStudent(api, positional[0])
    if (dryRun) { console.log(`Для ${student.email} отправил бы ${JSON.stringify(body)}`); return }
    const { student: updated } = await api.request(`/api/manage/students/${student.id}/freeze`, { method: 'POST', body })
    console.log(`${updated.email}: ${freezeLine(updated)}`)
    return
  }
  if (command === 'delete') {
    need(1, 'delete <почта|id> --confirm <почта>')
    const student = await findStudent(api, positional[0])
    const { impact } = await api.request(`/api/manage/students/${student.id}`)
    console.log(`Удалится: прогресс ${impact.progress}, сертификаты ${impact.certificates}, комментарии ${impact.comments}, заметки ${impact.notes}, правила ${impact.rules}, баллы ${impact.points}`)
    for (const blocker of impact.blockers) console.log(`Запрет: ${blocker}`)
    if (dryRun) return
    if (typeof options.confirm !== 'string') throw new StudentsCliError('Для удаления нужен --confirm <почта ученика>')
    await api.request(`/api/manage/students/${student.id}`, { method: 'DELETE', body: { confirmEmail: options.confirm } })
    console.log(`Удалён: ${student.email}`)
    return
  }
}

export const COMMANDS = ['list', 'show', 'create', 'allow', 'deny', 'remove', 'mode', 'password', 'disable', 'enable', 'freeze', 'unfreeze', 'plan', 'delete']

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  // Ошибки вызова ловим до входа: на проде лишний вход администратора ни к чему.
  if (!COMMANDS.includes(command)) throw new StudentsCliError(`Неизвестная команда «${command ?? ''}». Команды: ${COMMANDS.join(', ')}`)
  const { positional, options } = parseArgs(rest)
  assertModeValues(options)
  if (command === 'freeze' || command === 'unfreeze' || command === 'plan') freezeBody(command, options)
  const baseUrl = resolveBaseUrl(process.env.LMS_BASE_URL)
  if (baseUrl !== PROD_URL) console.error(`Адрес не прод: ${baseUrl}`)
  const api = client(baseUrl)
  await api.login(readAdminCredentials(process.env, process.cwd()))
  try { await run(api, command, positional, options) }
  finally { await api.logout() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof StudentsCliError ? error.message : `Сбой: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
