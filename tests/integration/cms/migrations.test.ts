import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { createLocalReq } from 'payload'

import { databaseUrl, reset } from '../../../scripts/test-db.mjs'

/**
 * Миграции на отдельной чистой базе — тем же программным путём, что и
 * `prodMigrations` при старте прод-контейнера.
 *
 * Конфиг импортируется динамически после подмены DATABASE_URL: адаптер
 * запоминает строку подключения в момент сборки конфига.
 */
const DB = 'lms_migrations'

let payload: Payload
let migrations: { name: string; up: (args: never) => Promise<void>; down: (args: never) => Promise<void> }[]

type DrizzleKit = {
  pushSchema: (
    schema: unknown,
    drizzle: unknown,
    schemaFilters?: string[],
    tablesFilter?: string[],
  ) => Promise<{ statementsToExecute: string[]; hasDataLoss: boolean; warnings: string[] }>
}

type DrizzleAdapter = {
  schema: unknown
  drizzle: unknown
  tablesFilter?: string[]
  requireDrizzleKit: () => DrizzleKit
  execute: (args: { drizzle: unknown; raw: string }) => Promise<{ rows: Record<string, unknown>[] }>
  migrate: (args: { migrations: unknown[] }) => Promise<void>
}

const db = () => payload.db as unknown as DrizzleAdapter

async function raw(sql: string) {
  return (await db().execute({ drizzle: db().drizzle, raw: sql })).rows
}

/**
 * Индекс, который осознанно живёт только в миграции: уникальность пары
 * (user, task) нужна маршруту /api/trainer/submit для разрешения гонки двух
 * одновременных отправок, а в конфиге коллекции он не объявлен. Drizzle
 * поэтому предлагает его удалить. См. отчёт: лучше объявить его в `indexes`.
 */
const KNOWN_MIGRATION_ONLY = ['DROP INDEX "user_trainer_progress_user_task_unique_idx";']

const SET_DEFAULT = /^ALTER TABLE "(\w+)" ALTER COLUMN "(\w+)" SET DEFAULT (.+);$/

/**
 * SQL, который drizzle-kit выполнил бы, чтобы привести БД к схеме конфига.
 *
 * drizzle-kit сравнивает числовые дефолты numeric-колонок как строку с
 * числом и выдаёт `SET DEFAULT 0` даже там, где дефолт уже 0. Такие
 * утверждения перепроверяются по information_schema: если дефолт в БД
 * совпадает, это ложное срабатывание, а не расхождение.
 */
async function drift(): Promise<string[]> {
  const { pushSchema } = db().requireDrizzleKit()
  const result = await pushSchema(db().schema, db().drizzle, undefined, db().tablesFilter)
  const real: string[] = []
  for (const statement of result.statementsToExecute) {
    if (KNOWN_MIGRATION_ONLY.includes(statement)) continue
    const match = SET_DEFAULT.exec(statement)
    if (match) {
      const [, table, column, wanted] = match
      const rows = await raw(
        `select column_default from information_schema.columns where table_schema = 'public' and table_name = '${table}' and column_name = '${column}'`,
      )
      const actual = String(rows[0]?.column_default ?? '').replace(/::\w+$/, '').replace(/^'(.*)'$/, '$1')
      if (actual === wanted.replace(/^'(.*)'$/, '$1')) continue
    }
    real.push(statement)
  }
  return real
}

async function publicTables(): Promise<string[]> {
  const rows = await raw(
    `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
  )
  return rows.map((r) => String(r.table_name))
}

beforeAll(async () => {
  await reset(DB)
  process.env.DATABASE_URL = databaseUrl(DB)
  const { getPayload } = await import('payload')
  const { default: config } = await import('@payload-config')
  ;({ migrations } = await import('@/migrations'))
  payload = await getPayload({ config, disableOnInit: true, key: 'migrations' })
  await db().migrate({ migrations })
})

afterAll(async () => {
  await payload?.destroy()
})

describe('миграции на чистой базе', () => {
  it('в payload_migrations ровно миграции из реестра, в одном батче и без строки dev', async () => {
    const rows = await raw('select name, batch from payload_migrations order by id')
    expect(rows.map((r) => r.name)).toEqual(migrations.map((m) => m.name))
    expect(new Set(rows.map((r) => Number(r.batch)))).toEqual(new Set([1]))
    expect(rows.some((r) => r.name === 'dev')).toBe(false)
  })

  it('каждая миграция из папки src/migrations зарегистрирована в index.ts', async () => {
    const { readdirSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const files = readdirSync(fileURLToPath(new URL('../../../src/migrations/', import.meta.url)))
      .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
      .map((f) => f.replace(/\.ts$/, ''))
      .sort()
    expect(migrations.map((m) => m.name).sort()).toEqual(files)
  })

  it('схема после миграций совпадает с конфигом Payload (drizzle не видит расхождений)', async () => {
    expect(await drift()).toEqual([])
  })

  it('повторный запуск ничего не применяет', async () => {
    await db().migrate({ migrations })
    const rows = await raw('select count(*)::int as n from payload_migrations')
    expect(rows[0].n).toBe(migrations.length)
  })

  it('на свежей схеме работает Local API: создание и чтение документа', async () => {
    const user = await payload.create({
      collection: 'users',
      data: { email: 'migrations@lms.test', password: 'x-Passw0rd', firstName: 'М', lastName: 'Т', role: 'admin' },
      context: { skipHooks: true },
    })
    const found = await payload.findByID({ collection: 'users', id: user.id })
    expect(found.email).toBe('migrations@lms.test')
    await payload.delete({ collection: 'users', id: user.id })
  })

  it('новая история просмотра откатывается и возвращается, сохраняя старые данные', async () => {
    const latest = migrations.find((migration) => migration.name.endsWith('_lesson_learning_states'))
    expect(latest).toBeDefined()
    if (!latest) throw new Error('Миграция истории просмотра не зарегистрирована')
    const user = await payload.create({ collection: 'users', data: { email: 'resume-migration@lms.test', password: 'Resume-Pass-1', firstName: 'Миграция', lastName: 'Истории', role: 'student' }, context: { skipHooks: true } })
    const req = await createLocalReq({}, payload)
    await latest.down({ db: db().drizzle, payload, req } as never)
    expect(await publicTables()).not.toContain('lesson_learning_states')
    expect((await payload.findByID({ collection: 'users', id: user.id })).email).toBe(user.email)
    await latest.up({ db: db().drizzle, payload, req } as never)
    const historyIndex = migrations.find((migration) => migration.name.endsWith('_learning_history_index'))
    if (!historyIndex) throw new Error('Миграция индекса истории не зарегистрирована')
    await historyIndex.up({ db: db().drizzle, payload, req } as never)
    expect(await publicTables()).toContain('lesson_learning_states')
    expect(await drift()).toEqual([])
    await payload.delete({ collection: 'users', id: user.id })
  })

  it('индекс сортировки истории откатывается и возвращается без потери мест остановки', async () => {
    const index = migrations.find((migration) => migration.name.endsWith('_learning_history_index'))
    if (!index) throw new Error('Миграция индекса истории не зарегистрирована')
    const user = await payload.create({ collection: 'users', data: { email: 'history-index@lms.test', password: 'History-Index-Pass-1', firstName: 'Индекс', lastName: 'Истории', role: 'student' }, context: { skipHooks: true } })
    const roadmap = await payload.create({ collection: 'roadmaps', data: { title: 'История индекса', slug: 'history-index', isPublished: true } })
    const course = await payload.create({ collection: 'courses', data: { title: 'История индекса', slug: 'history-index', roadmap: roadmap.id, isPublished: true } })
    const lesson = await payload.create({ collection: 'lessons', data: { title: 'История индекса', slug: 'history-index', course: course.id, isPublished: true } })
    await payload.create({ collection: 'lesson-learning-states', data: { user: user.id, lesson: lesson.id, lastViewedAt: new Date().toISOString(), lastVideoId: 'clip:123', positions: { 'clip:123': { at: Date.now(), seconds: 17, ended: false } } } })
    const before = await raw('select id, user_id, lesson_id, last_viewed_at, positions from lesson_learning_states order by id')
    expect(before).toHaveLength(1)
    const req = await createLocalReq({}, payload)
    await index.down({ db: db().drizzle, payload, req } as never)
    expect(await raw('select id, user_id, lesson_id, last_viewed_at, positions from lesson_learning_states order by id')).toEqual(before)
    await index.up({ db: db().drizzle, payload, req } as never)
    expect(await raw('select indexdef from pg_indexes where tablename = \'lesson_learning_states\' and indexname = \'user_lastViewedAt_idx\'')).toEqual([{ indexdef: 'CREATE INDEX "user_lastViewedAt_idx" ON public.lesson_learning_states USING btree (user_id, last_viewed_at)' }])
    expect((await drift()).filter((statement) => statement.includes('user_lastViewedAt_idx'))).toEqual([])
    expect(await raw('select id, user_id, lesson_id, last_viewed_at, positions from lesson_learning_states order by id')).toEqual(before)
    await payload.delete({ collection: 'users', id: user.id })
    await payload.delete({ collection: 'lessons', id: lesson.id })
    await payload.delete({ collection: 'courses', id: course.id })
    await payload.delete({ collection: 'roadmaps', id: roadmap.id })
  })

})

/**
 * Откат проверяется до двух ранних миграций: их down Payload сгенерировал с
 * `DROP CONSTRAINT` после `DROP TABLE … CASCADE`, и без `IF EXISTS` он падал.
 * Ещё раньше — исходная схема, её откат снёс бы всё и проверять нечего.
 */
const EARLY_DOWN = ['20260404_202710', '20260402_095341']

describe('откат миграций (down) в обратном порядке', () => {
  const reversed = () => [...migrations].reverse()
  const rollbackable = () => {
    const list = reversed()
    return list.slice(0, list.findIndex((m) => EARLY_DOWN.includes(m.name)))
  }

  it('down всех миграций новее 20260404_202710 выполняются по очереди без ошибок', async () => {
    const req = await createLocalReq({}, payload)
    expect(rollbackable().length).toBeGreaterThanOrEqual(5)
    for (const migration of rollbackable()) {
      await expect(migration.down({ db: db().drizzle, payload, req } as never), `down ${migration.name}`).resolves.toBeUndefined()
      await raw(`delete from payload_migrations where name = '${migration.name}'`)
    }
    const tables = await publicTables()
    // Откатились таблицы тренажёра LeetCode-формата и сессии Payload 3.89.
    expect(tables).not.toContain('trainer_tasks_test_cases')
    expect(tables).not.toContain('payload_kv')
    expect(tables).toContain('roadmap_nodes')
  })

  it('ранние миграции откатываются: внешние ключи, снятые CASCADE, не удаляются повторно', async () => {
    const req = await createLocalReq({}, payload)
    for (const name of EARLY_DOWN) {
      const migration = migrations.find((m) => m.name === name)!
      await expect(migration.down({ db: db().drizzle, payload, req } as never), `down ${name}`).resolves.toBeUndefined()
      await raw(`delete from payload_migrations where name = '${name}'`)
    }
    const tables = await publicTables()
    expect(tables).not.toContain('roadmap_nodes')
    expect(tables).not.toContain('sections')
  })

  it('после отката миграции накатываются заново и схема снова совпадает с конфигом', async () => {
    await db().migrate({ migrations })
    const rows = await raw('select name from payload_migrations order by id')
    expect(rows.map((r) => r.name)).toEqual(migrations.map((m) => m.name))
    expect(await drift()).toEqual([])
  })
})
