#!/usr/bin/env node
/**
 * Одноразовый PostgreSQL для интеграционных и e2e-тестов.
 *
 *   node scripts/test-db.mjs up             # поднять контейнер lms-test-pg (порт 55433)
 *   node scripts/test-db.mjs reset <db>     # пересоздать базу <db> с нуля
 *   node scripts/test-db.mjs down           # остановить и удалить контейнер
 *
 * В CI контейнер не нужен: там БД даёт service container, а адрес сервера
 * приходит через TEST_PG_URL. Тогда `up` только ждёт готовности, а `down` — no-op.
 *
 * Данные живут в tmpfs: после `down` от базы не остаётся ни тома, ни файлов.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

export const CONTAINER = 'lms-test-pg'
export const PORT = 55433
const IMAGE = 'postgres:16-alpine'

/** Адрес сервера без имени базы. */
export function serverUrl() {
  return (process.env.TEST_PG_URL ?? `postgresql://lms:lms@127.0.0.1:${PORT}`).replace(/\/+$/, '')
}

export function databaseUrl(db) {
  return `${serverUrl()}/${db}`
}

/** Браузерные тесты в Docker обращаются к тому же Postgres через хост. */
export function browserServerUrl(url = serverUrl()) {
  const parsed = new URL(url)
  if (['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
    parsed.hostname = 'host.docker.internal'
  }
  return parsed.toString().replace(/\/+$/, '')
}

function docker(args, opts = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()
}

function containerState() {
  try {
    return docker(['inspect', '-f', '{{.State.Running}}', CONTAINER])
  } catch {
    return 'absent'
  }
}

async function waitReady(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    const client = new pg.Client({ connectionString: databaseUrl('postgres') })
    try {
      await client.connect()
      await client.query('select 1')
      await client.end()
      return
    } catch (error) {
      lastError = error
      await client.end().catch(() => {})
      await sleep(500)
    }
  }
  throw new Error(`PostgreSQL не поднялся за ${timeoutMs} мс: ${lastError?.message ?? 'нет ответа'}`)
}

export async function up() {
  if (!process.env.TEST_PG_URL) {
    const state = containerState()
    if (state === 'false') docker(['start', CONTAINER])
    if (state === 'absent') {
      docker([
        'run', '-d', '--name', CONTAINER,
        '-e', 'POSTGRES_USER=lms', '-e', 'POSTGRES_PASSWORD=lms', '-e', 'POSTGRES_DB=postgres',
        '-p', `${PORT}:5432`,
        '--tmpfs', '/var/lib/postgresql/data',
        IMAGE,
        // Надёжность записи тестовой базе не нужна, скорость — нужна.
        '-c', 'fsync=off', '-c', 'synchronous_commit=off', '-c', 'full_page_writes=off',
        '-c', 'max_connections=300',
      ])
    }
  }
  await waitReady()
}

export async function reset(db) {
  if (!/^[a-z0-9_]+$/.test(db)) throw new Error(`Недопустимое имя базы: ${db}`)
  const client = new pg.Client({ connectionString: databaseUrl('postgres') })
  await client.connect()
  try {
    await client.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`)
    await client.query(`CREATE DATABASE ${db}`)
  } finally {
    await client.end()
  }
  return databaseUrl(db)
}

const APP_DIR = fileURLToPath(new URL('../', import.meta.url))

async function appliedMigrations(db) {
  const client = new pg.Client({ connectionString: databaseUrl(db) })
  await client.connect()
  try {
    const { rows } = await client.query('select count(*)::int as n from payload_migrations where batch > 0')
    return rows[0].n
  } catch {
    return 0
  } finally {
    await client.end()
  }
}

/**
 * Пересоздаёт базу и накатывает миграции штатной командой `payload migrate`.
 * Результат сверяется по самой базе: CLI изредка выходит с кодом 0, не применив
 * ничего, — тогда повторяем, а вывод печатаем для разбора.
 *
 * @param {string} db
 * @param {{ expected?: number, env?: Record<string, string | undefined>, attempts?: number }} [options]
 */
export async function migrateFresh(db, { expected, env = {}, attempts = 3 } = {}) {
  let last = ''
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await reset(db)
    const result = spawnSync('pnpm', ['payload', 'migrate'], {
      cwd: APP_DIR,
      encoding: 'utf8',
      env: { ...process.env, ...env, DATABASE_URL: databaseUrl(db), SMTP_HOST: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    last = `код ${result.status}\n${result.stdout}\n${result.stderr}`
    const applied = await appliedMigrations(db)
    if (result.status === 0 && applied > 0 && (expected === undefined || applied === expected)) return
    console.error(`[test-db] попытка ${attempt}: применено ${applied} миграций из ${expected ?? '?'}\n${last}`)
  }
  throw new Error(`payload migrate не применил миграции в ${db}:\n${last}`)
}

export function down() {
  if (process.env.TEST_PG_URL) return
  if (containerState() !== 'absent') docker(['rm', '-f', '-v', CONTAINER])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, arg] = process.argv.slice(2)
  if (command === 'up') {
    await up()
    console.log(`PostgreSQL готов: ${serverUrl().replace(/\/\/.*@/, '//***@')}`)
  } else if (command === 'reset') {
    if (!arg) throw new Error('Укажите имя базы: reset <db>')
    await up()
    await reset(arg)
    console.log(`База ${arg} пересоздана`)
  } else if (command === 'down') {
    down()
    console.log('Контейнер удалён')
  } else {
    console.error('Использование: node scripts/test-db.mjs up | reset <db> | down')
    process.exit(1)
  }
}
