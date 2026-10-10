#!/usr/bin/env node
/**
 * Временные аккаунты для проверки прода (tests/prod, playwright.prod.config.ts).
 *
 *   node scripts/prod-test-accounts.mjs run      создать → прогнать тесты → удалить (всегда)
 *   node scripts/prod-test-accounts.mjs create   только создать
 *   node scripts/prod-test-accounts.mjs delete   только удалить и проверить, что следов нет
 *
 * Аккаунты — ученик и администратор с доменом .invalid (письма на него не уходят).
 * Создаются SQL-вставкой в базу прода: регистрации на платформе нет, а хук
 * приглашения отправил бы письмо. Пароль генерируется здесь, в базу попадает
 * только pbkdf2-хеш в формате Payload, сам пароль — в файле вне репозитория
 * (PROD_TEST_ENV, по умолчанию ~/.config/lms-prod-test/accounts.env, права 600).
 *
 * Удаление идёт через REST от имени тестового админа — так срабатывают хуки
 * Payload и вместе с пользователем уходят его прогресс, баллы, заметки, вопросы
 * и уведомления. Уведомления реальным админам о тестовых вопросах удаляются по
 * метке прогона. В конце SQL-проверка, что не осталось ни одной записи.
 */
import { spawnSync } from 'node:child_process'
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const SSH = process.env.PROD_SSH ?? 'root@217.199.254.38'
const BASE_URL = process.env.PROD_BASE_URL ?? 'https://learn.mentorcareer.ru'
const ENV_FILE = process.env.PROD_TEST_ENV ?? join(homedir(), '.config/lms-prod-test/accounts.env')
const DOMAIN = 'lms-e2e.invalid'
const AUTH_DIR = new URL('../tests/prod/.auth/', import.meta.url)

function sql(query) {
  const script = [
    'db=$(docker ps -q --filter name=lms-mentor-db | head -1)',
    'test -n "$db" || { echo "контейнер БД lms-mentor-db не найден" >&2; exit 1; }',
    'docker exec -i "$db" sh -c \'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q -At\'',
  ].join('; ')
  const result = spawnSync('ssh', [SSH, script], { input: query, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`SQL на проде не выполнился: ${result.stderr.trim()}`)
  return result.stdout.trim()
}

function hashPassword(password) {
  const salt = randomBytes(32).toString('hex')
  const hash = pbkdf2Sync(password, salt, 25000, 512, 'sha256').toString('hex')
  return { salt, hash }
}

function readEnv() {
  if (!existsSync(ENV_FILE)) return null
  return Object.fromEntries(
    readFileSync(ENV_FILE, 'utf8')
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  )
}

function create() {
  if (readEnv()) throw new Error(`${ENV_FILE} уже есть — сначала delete, иначе прошлые аккаунты останутся на проде`)
  const run = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`
  const accounts = {
    student: { email: `student-${run}@${DOMAIN}`, password: randomBytes(18).toString('base64url'), role: 'student', first: 'Тест', last: 'Ученик' },
    admin: { email: `admin-${run}@${DOMAIN}`, password: randomBytes(18).toString('base64url'), role: 'admin', first: 'Тест', last: 'Ментор' },
  }
  const ids = {}
  for (const [key, a] of Object.entries(accounts)) {
    const { salt, hash } = hashPassword(a.password)
    const id = sql(
      `INSERT INTO users (first_name, last_name, role, email, salt, hash, is_active,
                         learning_access_mode, learning_catalog_visibility, trainer_access_mode)
       VALUES ('${a.first}', '${a.last}', '${a.role}', '${a.email}', '${salt}', '${hash}', true,
               'all', 'catalog', 'all') RETURNING id;`,
    )
    if (!/^\d+$/.test(id)) throw new Error(`Не удалось создать ${key}: вместо id пришло «${id}»`)
    ids[key] = id
  }
  mkdirSync(dirname(ENV_FILE), { recursive: true })
  writeFileSync(
    ENV_FILE,
    [
      `PROD_RUN_ID=${run}`,
      `PROD_STUDENT_ID=${ids.student}`,
      `PROD_STUDENT_EMAIL=${accounts.student.email}`,
      `PROD_STUDENT_PASSWORD=${accounts.student.password}`,
      `PROD_ADMIN_ID=${ids.admin}`,
      `PROD_ADMIN_EMAIL=${accounts.admin.email}`,
      `PROD_ADMIN_PASSWORD=${accounts.admin.password}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  )
  chmodSync(ENV_FILE, 0o600)
  console.log(`Созданы тестовые аккаунты прогона ${run} (id ${ids.student}, ${ids.admin}); пароли — в ${ENV_FILE}`)
}

async function api(path, init = {}, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `JWT ${token}` } : {}), ...init.headers },
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

function leftovers(env) {
  const marker = `%e2e-prod ${env.PROD_RUN_ID}%`
  return sql(
    `SELECT
       (SELECT count(*) FROM users WHERE email LIKE '%-${env.PROD_RUN_ID}@${DOMAIN}') AS users,
       (SELECT count(*) FROM comments WHERE content LIKE '${marker}' OR user_id IN (${env.PROD_STUDENT_ID}, ${env.PROD_ADMIN_ID})) AS comments,
       (SELECT count(*) FROM notes WHERE content LIKE '${marker}' OR user_id IN (${env.PROD_STUDENT_ID}, ${env.PROD_ADMIN_ID})) AS notes,
       (SELECT count(*) FROM notifications WHERE message LIKE '${marker}' OR user_id IN (${env.PROD_STUDENT_ID}, ${env.PROD_ADMIN_ID})) AS notifications,
       (SELECT count(*) FROM user_progress WHERE user_id IN (${env.PROD_STUDENT_ID}, ${env.PROD_ADMIN_ID})) AS progress,
       (SELECT count(*) FROM points_transactions WHERE user_id IN (${env.PROD_STUDENT_ID}, ${env.PROD_ADMIN_ID})) AS points,
       (SELECT count(*) FROM streaks WHERE user_id IN (${env.PROD_STUDENT_ID}, ${env.PROD_ADMIN_ID})) AS streaks,
       (SELECT count(*) FROM bookmarks WHERE user_id IN (${env.PROD_STUDENT_ID}, ${env.PROD_ADMIN_ID})) AS bookmarks;`,
  )
}

async function remove() {
  const env = readEnv()
  if (!env) {
    rmSync(AUTH_DIR, { recursive: true, force: true })
    console.log(`${ENV_FILE} нет — удалять нечего`)
    return
  }
  const errors = []
  try {
    const { token } = await api('/api/users/login', {
      method: 'POST',
      body: JSON.stringify({ email: env.PROD_ADMIN_EMAIL, password: env.PROD_ADMIN_PASSWORD }),
    })
    const marker = encodeURIComponent(`e2e-prod ${env.PROD_RUN_ID}`)
    // Уведомления реальным админам о тестовых вопросах — по метке прогона.
    await api(`/api/notifications?where[message][like]=${marker}`, { method: 'DELETE' }, token)
    await api(`/api/users/${env.PROD_STUDENT_ID}`, { method: 'DELETE' }, token)
    await api(`/api/users/${env.PROD_ADMIN_ID}`, { method: 'DELETE' }, token)
  } catch (error) {
    errors.push(error)
    console.error('Удаление через API не удалось, чищу SQL:', error.message)
  }

  let left = leftovers(env)
  if (left !== '0|0|0|0|0|0|0|0') {
    // Запасной путь: хуки не отработали — удаляем напрямую, в той же последовательности.
    const ids = `${env.PROD_STUDENT_ID}, ${env.PROD_ADMIN_ID}`
    const marker = `%e2e-prod ${env.PROD_RUN_ID}%`
    sql(`BEGIN;
      DELETE FROM notifications WHERE message LIKE '${marker}' OR user_id IN (${ids});
      DELETE FROM comments WHERE content LIKE '${marker}' OR user_id IN (${ids});
      DELETE FROM notes WHERE user_id IN (${ids});
      DELETE FROM user_progress WHERE user_id IN (${ids});
      DELETE FROM user_trainer_progress WHERE user_id IN (${ids});
      DELETE FROM points_transactions WHERE user_id IN (${ids});
      DELETE FROM user_achievements WHERE user_id IN (${ids});
      DELETE FROM certificates WHERE user_id IN (${ids});
      DELETE FROM streaks WHERE user_id IN (${ids});
      DELETE FROM bookmarks WHERE user_id IN (${ids});
      DELETE FROM users WHERE id IN (${ids});
      COMMIT;`)
    left = leftovers(env)
  }
  if (left !== '0|0|0|0|0|0|0|0') {
    throw new Error(`После удаления на проде остались записи (users|comments|notes|notifications|progress|points|streaks|bookmarks): ${left}`)
  }
  rmSync(ENV_FILE)
  // Куки сессий удалённых аккаунтов уже недействительны, но хранить их незачем.
  rmSync(AUTH_DIR, { recursive: true, force: true })
  console.log(`Тестовые аккаунты прогона ${env.PROD_RUN_ID} удалены, следов в базе нет${errors.length ? ' (понадобилась SQL-очистка)' : ''}`)
}

function runTests() {
  const env = readEnv()
  const result = spawnSync('pnpm', ['exec', 'playwright', 'test', '-c', 'playwright.prod.config.ts', ...process.argv.slice(3)], {
    stdio: 'inherit',
    env: { ...process.env, ...env, PROD_BASE_URL: BASE_URL },
  })
  return result.status ?? 1
}

const command = process.argv[2]
if (command === 'create') create()
else if (command === 'delete') await remove()
else if (command === 'run') {
  create()
  let status = 1
  try {
    status = runTests()
  } finally {
    await remove()
  }
  process.exit(status)
} else {
  console.error('Использование: node scripts/prod-test-accounts.mjs run|create|delete [аргументы playwright]')
  process.exit(2)
}
