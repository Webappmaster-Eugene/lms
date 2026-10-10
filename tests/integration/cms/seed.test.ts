import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import type { Payload } from 'payload'

import { TRAINER_CATALOG } from '@/data/trainer'
import { flattenCatalog, POINTS_BY_DIFFICULTY, toCaseSpecs } from '@/data/trainer/types'
import { collectAllPages } from '@/lib/paginate'
import { isFrontendLanguage, runtimeCases } from '@/lib/trainer/runtime-spec'
import { solutionCodeFor, starterCodeFor, taskLanguages } from '@/lib/trainer/spec'
import { runSolution } from '@/server/trainer/sandbox'
import type { TrainerTask, TrainerTopic } from '@/payload-types'
import { databaseUrl, migrateFresh } from '../../../scripts/test-db.mjs'
import { TEST_SECRET } from '../setup/constants'

/**
 * Сиды — штатными CLI-командами на отдельной чистой базе, как их запускают
 * люди. Затем каждая задача каталога, прошедшая через Payload и БД, проверяется
 * против источника по всем полям, включая Go/frontend и скрытые runtime-кейсы.
 * JS/TS дополнительно исполняются в isolated-vm + tsc. Каталог Go/frontend
 * исполняет Docker-набор; маршруты и запись прогресса — runtime integration.
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

function runtimeCaseData(row: { name: string; hidden?: boolean | null; input?: string | null; expected?: string | null; checks?: unknown; viewport?: unknown; path?: string | null }) {
  return {
    name: row.name, hidden: row.hidden, input: row.input ?? null, expected: row.expected ?? null,
    checks: row.checks ?? null, viewport: row.viewport ?? null, path: row.path ?? null,
  }
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
    const firstTasks = await sql.query('select id, slug from trainer_tasks order by id')
    expect(firstTasks.rows).toHaveLength(total)

    const second = cli(['seed:trainer'], { PAYLOAD_MIGRATING: 'true' })
    expect(second.status, second.out).toBe(0)
    // CLI log buffers may not flush before exit; stored identities prove idempotence.
    const secondTasks = await sql.query('select id, slug from trainer_tasks order by id')
    expect(secondTasks.rows).toEqual(firstTasks.rows)

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

describe('каталог в базе: сохранность всех языков и серверный JS/TS-прогон', () => {
  let tasks: TrainerTask[] = []
  let topics: TrainerTopic[] = []

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl(DB)
    const { getPayload } = await import('payload')
    const { default: config } = await import('@payload-config')
    payload = await getPayload({ config, disableOnInit: true, key: 'seed' })
    tasks = await collectAllPages(({ page, limit }) => payload.find({ collection: 'trainer-tasks', page, limit, depth: 0, overrideAccess: true, sort: 'id' }), { label: 'Все сохранённые задачи каталога' })
    topics = await collectAllPages(({ page, limit }) => payload.find({ collection: 'trainer-topics', page, limit, depth: 0, overrideAccess: true, sort: 'id' }), { label: 'Все сохранённые темы каталога' })
  }, 120_000)

  it('все темы и задачи всех языков сохраняют содержимое источника, включая скрытые кейсы и файлы проектов', () => {
    const source = flattenCatalog(TRAINER_CATALOG)
    expect(tasks.map((task) => task.slug).sort()).toEqual(source.map(({ task }) => task.slug).sort())
    expect(topics.map((topic) => topic.slug).sort()).toEqual(TRAINER_CATALOG.map((topic) => topic.slug).sort())
    const topicsBySlug = new Map(topics.map((topic) => [topic.slug, topic]))
    const tasksBySlug = new Map(tasks.map((task) => [task.slug, task]))
    for (const topic of TRAINER_CATALOG) {
      expect(topicsBySlug.get(topic.slug), topic.slug).toMatchObject({ title: topic.title, description: topic.description, category: topic.category, icon: topic.icon ?? null, order: topic.order, isPublished: true })
      for (const [index, expected] of topic.tasks.entries()) {
        const actual = tasksBySlug.get(expected.slug)
        expect(actual, expected.slug).toBeDefined()
        if (!actual) throw new Error(`Не сохранена задача ${expected.slug}`)
        expect(actual, expected.slug).toMatchObject({
          title: expected.title, topic: topicsBySlug.get(topic.slug)?.id, order: index + 1,
          difficulty: expected.difficulty, checkMode: expected.checkMode, languages: expected.languages,
          descriptionMd: expected.descriptionMd, entryName: expected.entryName ?? null,
          setupCode: expected.setupCode ?? null, setupTypes: expected.setupTypes ?? null,
          starterCode: expected.starterCode, starterCodeTs: expected.starterCodeTs ?? null,
          starterCodeGo: expected.starterCodeGo ?? null,
          solutionCode: expected.solutionCode, solutionCodeTs: expected.solutionCodeTs ?? null,
          solutionCodeGo: expected.solutionCodeGo ?? null,
          solutionNotes: expected.solutionNotes ?? null, testCode: expected.testCode ?? null,
          typeHarness: expected.typeHarness ?? null, expectedOutput: expected.expectedOutput ?? null,
          timeLimitMs: expected.timeLimitMs ?? 5000, sourceUrl: expected.sourceUrl ?? null,
          leetcodeNumber: expected.leetcodeNumber ?? null,
          pointsReward: expected.pointsReward ?? POINTS_BY_DIFFICULTY[expected.difficulty], isPublished: true,
        })
        expect(actual.starterFiles ?? null, expected.slug).toEqual(expected.starterFiles ?? null)
        expect(actual.solutionFiles ?? null, expected.slug).toEqual(expected.solutionFiles ?? null)
        expect(actual.languages, expected.slug).toEqual(expected.languages)
        expect(actual.description?.root.type, expected.slug).toBe('root')
        expect(actual.description?.root.children, expected.slug).toEqual([{ type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text: expected.title }] }])
        expect((actual.hints ?? []).map(({ hint }) => hint), expected.slug).toEqual(expected.hints ?? [])
        expect(actual.tags ?? [], expected.slug).toEqual(expected.tags ?? [])
        expect(actual.companies ?? [], expected.slug).toEqual(expected.companies ?? [])
        expect((actual.testCases ?? []).map(({ name, argsCode, expectedCode, compare, hidden }) => ({ name, argsCode, expectedCode, compare, hidden })), expected.slug).toEqual(toCaseSpecs(expected.cases))
        expect((actual.runtimeCases ?? []).map(runtimeCaseData), expected.slug).toEqual((expected.runtimeCases ?? []).map(runtimeCaseData))
      }
    }
  })

  it('все задачи опубликованы, со slug, темой и хотя бы одним способом проверки', () => {
    expect(tasks.length).toBeGreaterThan(100)
    for (const task of tasks) {
      expect(task.isPublished, task.slug).toBe(true)
      expect(task.topic, task.slug).toBeTruthy()
      const hasCheck =
        (task.checkMode === 'unit' && ((task.testCases?.length ?? 0) > 0 || Boolean(task.testCode?.trim()))) ||
        (task.checkMode === 'types' && Boolean(task.typeHarness?.trim())) ||
        (task.checkMode === 'stdout' && Boolean(task.expectedOutput?.trim())) ||
        (task.checkMode === 'program' && runtimeCases(task).length > 0 && runtimeCases(task).every((row) => typeof row.input === 'string' && typeof row.expected === 'string')) ||
        (task.checkMode === 'dom' && runtimeCases(task).length > 0 && runtimeCases(task).every((row) => (row.checks?.length ?? 0) > 0))
      expect(hasCheck, `${task.slug}: нет тестов`).toBe(true)
      if (task.checkMode === 'program') expect(taskLanguages(task), task.slug).toEqual(['go'])
      else if (task.checkMode === 'dom') expect(taskLanguages(task).every(isFrontendLanguage), task.slug).toBe(true)
      else expect(taskLanguages(task).every((language) => language === 'js' || language === 'ts'), task.slug).toBe(true)
      for (const language of taskLanguages(task)) {
        expect(starterCodeFor(task, language).trim(), `${task.slug} [${language}]: шаблон`).toBeTruthy()
        expect(solutionCodeFor(task, language)?.trim(), `${task.slug} [${language}]: эталон`).toBeTruthy()
      }
    }
  })

  it('эталон проходит собственные тесты в isolated-vm для JS и tsc для TS', async () => {
    const failures: string[] = []
    for (const task of tasks) {
      for (const language of taskLanguages(task).filter((language) => language === 'js' || language === 'ts')) {
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

  it('стартовый шаблон JS/TS не проходит серверную проверку', async () => {
    const trivial: string[] = []
    for (const task of tasks) {
      for (const language of taskLanguages(task).filter((language) => language === 'js' || language === 'ts')) {
        const result = await runSolution(task, language, starterCodeFor(task, language))
        if (result.status === 'passed') trivial.push(`${task.slug} [${language}]`)
      }
    }
    expect(trivial).toEqual([])
  }, 600_000)
})

describe('pnpm seed (базовый сид src/seed.ts)', () => {
  it('`pnpm seed` создаёт базовые данные', async () => {
    const run = cli(['seed'], { PAYLOAD_MIGRATING: 'true' })
    expect(run.status, run.out).toBe(0)
    const { rows } = await sql.query('select count(*)::int as n from faq_items')
    expect(rows[0].n).toBeGreaterThan(0)

    // Повторный запуск не падает на уникальных полях и не плодит дубли
    const count = async () =>
      (await sql.query(`select
        (select count(*) from faq_items)::int as faq,
        (select count(*) from lessons)::int as lessons,
        (select count(*) from achievements)::int as achievements,
        (select count(*) from trainer_tasks)::int as tasks`)).rows[0]
    const before = await count()
    const again = cli(['seed'], { PAYLOAD_MIGRATING: 'true' })
    expect(again.status, again.out).toBe(0)
    expect(await count()).toEqual(before)
  }, 300_000)
})
