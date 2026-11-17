import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { access, mkdtemp, open, type FileHandle } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { databaseUrl, drop, migrateFresh, up } from './test-db.mjs'
import { BOOTSTRAP_ADMIN, INTEGRATION_DB, TEST_SECRET } from '../tests/integration/setup/constants'
import { migrations } from '../src/migrations'
import { REACT_NEXT_BOOTCAMP } from '../src/lib/react-next-bootcamp-setup'

type Document = { id: number, [key: string]: unknown }
const app = fileURLToPath(new URL('../', import.meta.url))

function document(value: unknown): Document {
  assert(value && typeof value === 'object' && 'id' in value && typeof value.id === 'number', 'API вернул документ без ID')
  return { ...value, id: value.id }
}

async function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args[0]}: код ${code}`)))
  })
}

async function stop(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  child.kill('SIGTERM')
  if (await Promise.race([exited.then(() => true), sleep(5_000).then(() => false)])) return
  child.kill('SIGKILL')
  await Promise.race([exited, sleep(5_000)])
}

async function main() {
  const content = path.resolve(process.env.FRONTEND_CONTENT_DIR ?? path.join(app, '../bootcamp/frontend/content'))
  await access(path.join(content, 'dist/package/mentorcareer/manifest.json'))
  await access(path.join(app, '.next/BUILD_ID'))
  const db = `${INTEGRATION_DB}_react_next_import`
  assert(db.length <= 63 && /^[a-z][a-z0-9_]+$/.test(db), 'Некорректное имя одноразовой базы')
  const postgres = new URL(databaseUrl(db))
  assert(['localhost', '127.0.0.1', '[::1]'].includes(postgres.hostname), 'Проверка разрешена только на локальной тестовой БД')
  const port = Number(process.env.E2E_APP_PORT ?? 3100)
  assert(Number.isInteger(port) && port > 1024 && port < 65536, 'Неверный порт из настроек рабочего дерева')
  const probe = createServer()
  await new Promise<void>((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', () => resolve()) })
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()))

  const base = `http://127.0.0.1:${port}`
  const env: NodeJS.ProcessEnv = {
    ...process.env, NODE_ENV: 'production', DATABASE_URL: databaseUrl(db), PAYLOAD_SECRET: TEST_SECRET,
    PAYLOAD_MIGRATING: 'true', ADMIN_EMAIL: BOOTSTRAP_ADMIN.email, ADMIN_PASSWORD: BOOTSTRAP_ADMIN.password,
    NEXT_PUBLIC_SERVER_URL: base, SMTP_HOST: '', TELEGRAM_BOT_TOKEN: '', TELEGRAM_ADMIN_CHAT_ID: '',
    YANDEX_DISK_TOKEN: '', OTEL_EXPORTER_OTLP_ENDPOINT: '', ROBOKASSA_MERCHANT_LOGIN: '',
    LMS_URL: base, LMS_ADMIN_EMAIL: BOOTSTRAP_ADMIN.email, LMS_ADMIN_PASSWORD: BOOTSTRAP_ADMIN.password,
    LMS_ROADMAP_SLUG: 'frontend',
  }
  await up()
  let server: ChildProcess | undefined
  let log: FileHandle | undefined
  try {
    await migrateFresh(db, { expected: migrations.length, env })
    const dir = await mkdtemp(path.join(tmpdir(), 'react-next-import-'))
    log = await open(path.join(dir, 'server.log'), 'a', 0o600)
    const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: app, env, stdio: ['ignore', log.fd, log.fd],
    })
    server = child
    let startupError: Error | undefined
    child.once('error', (error) => { startupError = error })
    let ready = false
    for (let attempt = 0; attempt < 120; attempt += 1) {
      assert(!startupError && child.exitCode === null, `Локальный сервер остановился. Лог: ${dir}/server.log`)
      ready = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2_000) }).then((response) => response.ok, () => false)
      if (ready) break
      await sleep(500)
    }
    assert(ready, 'Локальная LMS не стала готова за минуту')
    let token = ''
    async function api(method: string, route: string, body?: unknown, auth = token): Promise<unknown> {
      const response = await fetch(`${base}/api${route}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `JWT ${auth}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      assert(response.ok, `${method} ${route}: HTTP ${response.status}`)
      return response.json()
    }
    async function login(email: string, password: string) {
      const auth = await api('POST', '/users/login', { email, password }, '')
      assert(auth && typeof auth === 'object' && 'token' in auth && typeof auth.token === 'string')
      return auth.token
    }
    token = await login(BOOTSTRAP_ADMIN.email, BOOTSTRAP_ADMIN.password)
    async function find(collection: string, field: string, value: string | number) {
      const docs: Document[] = []
      for (let page = 1; ; page += 1) {
        const query = new URLSearchParams({ [`where[${field}][equals]`]: String(value), depth: '0', limit: '100', page: String(page) })
        const response = await api('GET', `/${collection}?${query}`)
        assert(response && typeof response === 'object' && 'docs' in response && Array.isArray(response.docs))
        docs.push(...response.docs.map(document))
        if (!('hasNextPage' in response) || !response.hasNextPage) return docs
      }
    }
    const roadmaps = await find('roadmaps', 'slug', 'frontend')
    if (roadmaps.length === 0) await api('POST', '/roadmaps', { title: 'Frontend: проверка импорта', slug: 'frontend', isPublished: true })
    const importPackage = (...args: string[]) => run('npm', ['run', 'import:lms', '--', '--roadmap', 'frontend', ...args], content, env)
    await importPackage('--dry-run')
    assert.equal((await find('courses', 'slug', REACT_NEXT_BOOTCAMP.courseSlug)).length, 0, 'dry-run создал курс')
    await importPackage()
    const [course] = await find('courses', 'slug', REACT_NEXT_BOOTCAMP.courseSlug)
    assert(course)
    assert.equal(course.isPublished, false)
    assert.equal(course.isBootcamp, true)
    assert.equal(course.assignedOnly, true)
    const sections = await find('sections', 'course', course.id)
    const lessons = await find('lessons', 'course', course.id)
    assert.equal(sections.length, 21)
    assert.equal(lessons.length, 84)
    assert(lessons.every((lesson) => lesson.isPublished === false), 'Импорт опубликовал уроки без --publish')
    const snapshot = lessons.map((lesson) => ({ id: lesson.id, content: lesson.content })).sort((a, b) => a.id - b.id)
    await importPackage()
    const repeated = await find('lessons', 'course', course.id)
    assert.deepEqual(repeated.map((lesson) => ({ id: lesson.id, content: lesson.content })).sort((a, b) => a.id - b.id), snapshot)
    await run('pnpm', ['bootcamp:react-next:setup'], app, env)
    assert.equal((await find('bootcamp-programs', 'key', 'react-next')).length, 0)
    await run('pnpm', ['bootcamp:react-next:setup', '--apply'], app, env)
    await run('pnpm', ['bootcamp:react-next:setup', '--apply'], app, env)
    const programs = await find('bootcamp-programs', 'key', 'react-next')
    assert.equal(programs.length, 1)
    assert.equal(programs[0]?.isActive, false)
    assert.equal(programs[0]?.priceKopecks, 4_500_000)
    assert.equal(programs[0]?.manualsCourse, course.id)
    await importPackage('--publish')
    const published = await api('GET', `/courses/${course.id}?depth=0`)
    assert.equal(document(published).isPublished, true)
    assert((await find('sections', 'course', course.id)).every((section) => section.isPublished === true))
    assert((await find('lessons', 'course', course.id)).every((lesson) => lesson.isPublished === true))
    const userResponse = await api('POST', '/users', {
      email: 'frontend-import-student@example.test', password: 'Import-Test-Student-1', firstName: 'Проверка', lastName: 'Импорта',
      role: 'student', isActive: true, learningAccessMode: 'all', learningCatalogVisibility: 'catalog',
    })
    assert(userResponse && typeof userResponse === 'object' && 'doc' in userResponse)
    const student = document(userResponse.doc)
    const studentToken = await login('frontend-import-student@example.test', 'Import-Test-Student-1')
    const [lesson] = lessons
    assert(lesson)
    const read = () => fetch(`${base}/api/lessons/${lesson.id}`, { headers: { Authorization: `JWT ${studentToken}` } })
    assert([403, 404].includes((await read()).status), 'Режим «все курсы» открыл платный материал')
    await api('POST', '/learning-access-grants', { user: student.id, target: { relationTo: 'courses', value: course.id }, effect: 'allow', ruleKey: 'server-generated' })
    assert.equal((await read()).status, 200, 'Назначение курса не открыло урок')
    process.stdout.write('Проверено: 21 раздел, 84 урока, dry-run, черновик, повтор без дублей/смены ID, публикация, закрытый набор и доступ по назначению.\n')
  } finally {
    try {
      if (server) await stop(server)
    } finally {
      try { await log?.close() } finally { await drop([db]) }
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Проверка импорта не выполнена'}\n`)
  process.exitCode = 1
})
