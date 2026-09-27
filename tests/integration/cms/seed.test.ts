import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import type { Payload } from 'payload'

import { TRAINER_CATALOG } from '@/data/trainer'
import { solutionCodeFor, starterCodeFor, taskLanguages } from '@/lib/trainer/spec'
import { runSolution } from '@/server/trainer/sandbox'
import type { TrainerTask } from '@/payload-types'
import { databaseUrl, migrateFresh } from '../../../scripts/test-db.mjs'
import { TEST_SECRET } from '../setup/constants'

/**
 * Сиды — штатными CLI-командами на отдельной чистой базе, как их запускают
 * люди. Затем каждая задача каталога, прошедшая через Payload и БД, проверяется
 * в настоящей серверной песочнице (isolated-vm + tsc): эталон проходит свои
 * тесты, шаблон — нет. Юнит-тест каталога делает то же в node:vm и до БД не
 * доходит, поэтому потерю данных при сохранении он не заметит.
 */
const DB = 'lms_seed'
const APP_DIR = fileURLToPath(new URL('../../../', import.meta.url))

let payload: Payload
let sql: pg.Client

function cli(args: string[], extraEnv: Record<string, string> = {}) {
  const result = spawnSync('pnpm', args, {
    cwd: APP_DIR,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: databaseUrl(DB), PAYLOAD_SECRET: TEST_SECRET, SMTP_HOST: '', ...extraEnv },
    timeout: 240_000,
  })
  return { status: result.status, out: `${result.stdout}\n${result.stderr}` }
}

async function indexExists(name: string): Promise<boolean> {
  const { rows } = await sql.query('select 1 from pg_indexes where indexname = $1', [name])
  return rows.length === 1
}

beforeAll(async () => {
  await migrateFresh(DB, { env: { PAYLOAD_SECRET: TEST_SECRET } })
  sql = new pg.Client({ connectionString: databaseUrl(DB) })
  await sql.connect()
}, 300_000)

afterAll(async () => {
  await sql?.end()
  await payload?.destroy()
})

describe('pnpm seed:trainer', () => {
  let firstRun = ''

  it('заливает весь каталог, повторный запуск ничего не дублирует', async () => {
    const first = cli(['seed:trainer'], { PAYLOAD_MIGRATING: 'true' })
    expect(first.status, first.out).toBe(0)
    firstRun = first.out
    const total = TRAINER_CATALOG.reduce((n, topic) => n + topic.tasks.length, 0)
    expect(first.out).toContain(`Создано: ${total}, обновлено: 0.`)

    const second = cli(['seed:trainer'], { PAYLOAD_MIGRATING: 'true' })
    expect(second.status, second.out).toBe(0)
    expect(second.out).toContain(`Создано: 0, обновлено: ${total}.`)

    const { rows } = await sql.query('select count(*)::int as n from trainer_tasks')
    expect(rows[0].n).toBe(total)
    const topics = await sql.query('select count(*)::int as n from trainer_topics')
    expect(topics.rows[0].n).toBe(TRAINER_CATALOG.length)
  }, 600_000)

  it('в базе нет задач вне каталога', () => {
    expect(firstRun).not.toContain('задач вне каталога')
  })

  // docs/trainer.md предупреждает, что `payload run` в dev-режиме пишет строку
  // `dev` в payload_migrations. Проверяем, что штатный запуск схему не трогает:
  // ни строки dev, ни потери индекса, который есть только в миграции.
  it('запуск без PAYLOAD_MIGRATING не меняет схему и не пишет строку dev', async () => {
    expect(await indexExists('user_trainer_progress_user_task_unique_idx')).toBe(true)
    const run = cli(['seed:trainer'])
    expect(run.status, run.out).toBe(0)
    const dev = await sql.query("select 1 from payload_migrations where name = 'dev'")
    expect(dev.rows).toHaveLength(0)
    expect(await indexExists('user_trainer_progress_user_task_unique_idx')).toBe(true)
  }, 300_000)
})

describe('каталог в базе: каждая задача решаема на сервере', () => {
  let tasks: TrainerTask[] = []

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl(DB)
    const { getPayload } = await import('payload')
    const { default: config } = await import('@payload-config')
    payload = await getPayload({ config, disableOnInit: true, key: 'seed' })
    const found = await payload.find({ collection: 'trainer-tasks', limit: 1000, depth: 0, overrideAccess: true, sort: 'id' })
    tasks = found.docs
  }, 120_000)

  it('все задачи опубликованы, со slug, темой и хотя бы одним способом проверки', () => {
    expect(tasks.length).toBeGreaterThan(100)
    for (const task of tasks) {
      expect(task.isPublished, task.slug).toBe(true)
      expect(task.topic, task.slug).toBeTruthy()
      const hasCheck =
        (task.checkMode === 'unit' && ((task.testCases?.length ?? 0) > 0 || Boolean(task.testCode?.trim()))) ||
        (task.checkMode === 'types' && Boolean(task.typeHarness?.trim())) ||
        (task.checkMode === 'stdout' && Boolean(task.expectedOutput?.trim()))
      expect(hasCheck, `${task.slug}: нет тестов`).toBe(true)
    }
  })

  it('эталон проходит собственные тесты в isolated-vm на каждом языке задачи', async () => {
    const failures: string[] = []
    for (const task of tasks) {
      for (const language of taskLanguages(task)) {
        const code = solutionCodeFor(task, language)
        if (!code) {
          failures.push(`${task.slug} [${language}]: нет эталона`)
          continue
        }
        const result = await runSolution(task, language, code)
        if (result.status !== 'passed') {
          const failed = result.tests.filter((t) => !t.passed).map((t) => t.name).slice(0, 3)
          failures.push(`${task.slug} [${language}]: ${result.status} ${result.error ?? ''} ${failed.join('; ')}`.trim())
        }
      }
    }
    expect(failures).toEqual([])
  }, 600_000)

  it('стартовый шаблон тесты не проходит', async () => {
    const trivial: string[] = []
    for (const task of tasks) {
      for (const language of taskLanguages(task)) {
        const result = await runSolution(task, language, starterCodeFor(task, language))
        if (result.status === 'passed') trivial.push(`${task.slug} [${language}]`)
      }
    }
    expect(trivial).toEqual([])
  }, 600_000)
})

describe('pnpm seed (базовый сид src/seed.ts)', () => {
  it.fails('БАГ: `pnpm seed` создаёт базовые данные — сейчас модуль только экспортирует функцию и ничего не делает', async () => {
    const run = cli(['seed'], { PAYLOAD_MIGRATING: 'true' })
    expect(run.status, run.out).toBe(0)
    const { rows } = await sql.query('select count(*)::int as n from faq_items')
    expect(rows[0].n).toBeGreaterThan(0)
  }, 300_000)
})
