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
  const identifierNoOps = new Set<string>()
  // PostgreSQL truncates identifiers to 63 bytes; drizzle-kit compares the untruncated name.
  // Suppress only a paired drop/add whose existing, validated FK definition is identical.
  for (const statement of result.statementsToExecute) {
    const match = /^ALTER TABLE "(\w+)" ADD CONSTRAINT "(\w+)" (FOREIGN KEY .+);$/.exec(statement.trim())
    if (!match) continue
    const [, table, name, definition] = match
    if (Buffer.byteLength(name) <= 63) continue
    const truncated = name.slice(0, 63)
    const drop = result.statementsToExecute.find(value => value.trim() === `ALTER TABLE "${table}" DROP CONSTRAINT "${truncated}";`)
    if (!drop) continue
    const existing = await raw(`select pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace where n.nspname = 'public' and t.relname = '${table}' and c.conname = '${truncated}' and c.contype = 'f' and c.convalidated and not c.condeferrable and not c.condeferred`)
    const normalize = (value: string) => value.replaceAll('"', '').replaceAll('public.', '').replace(/\s+/g, ' ').replace(/ ON UPDATE no action$/i, '').toLowerCase()
    if (existing.length === 1 && normalize(String(existing[0].definition)) === normalize(definition)) {
      identifierNoOps.add(drop)
      identifierNoOps.add(statement)
    }
  }
  const real: string[] = []
  for (const statement of result.statementsToExecute) {
    if (KNOWN_MIGRATION_ONLY.includes(statement)) continue
    if (identifierNoOps.has(statement)) continue
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

/**
 * Откатывает (снимая отметки) от головы до миграции с суффиксом `targetSuffix` включительно,
 * в обратном порядке. Голову восстанавливает вызывающий через `db().migrate({ migrations })`:
 * так тест «живых данных» ставит схему в нужную точку и возвращает её, не завися от соседей.
 */
async function rollbackTo(targetSuffix: string, req: unknown): Promise<void> {
  const reversed = [...migrations].reverse()
  const end = reversed.findIndex((migration) => migration.name.endsWith(targetSuffix))
  if (end < 0) throw new Error(`Миграция ${targetSuffix} не зарегистрирована`)
  for (const migration of reversed.slice(0, end + 1)) {
    await migration.down({ db: db().drizzle, payload, req } as never)
    await raw(`delete from payload_migrations where name = '${migration.name}'`)
  }
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

  it('усечение имени FK не скрывает реальное изменение ON DELETE', async () => {
    const table = 'notification_deliveries'
    const name = 'notification_deliveries_subscription_id_push_subscriptions_id_fk'.slice(0, 63)
    const rows = await raw(`select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid = '${table}'::regclass and conname = '${name}'`)
    expect(rows).toHaveLength(1)
    const original = String(rows[0].definition)
    expect(original).toMatch(/ON DELETE SET NULL/i)
    try {
      await raw(`ALTER TABLE "${table}" DROP CONSTRAINT "${name}"`)
      await raw(`ALTER TABLE "${table}" ADD CONSTRAINT "${name}" ${original.replace(/ON DELETE SET NULL/i, 'ON DELETE RESTRICT')}`)
      const statements = await drift()
      expect(statements).toHaveLength(2)
      expect(statements.join('\n')).toContain(`DROP CONSTRAINT "${name}"`)
      expect(statements.join('\n')).toContain('ON DELETE set null')
    } finally {
      await raw(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${name}"`)
      await raw(`ALTER TABLE "${table}" ADD CONSTRAINT "${name}" ${original}`)
    }
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

  it('миграция гайдов v2 на живых данных: дата публикации, минуты чтения и первая версия', async () => {
    const req = await createLocalReq({}, payload)
    // Откатываемся до состояния перед v2 (снимая v2 и все миграции после неё), потом накатываем цепочку заново.
    await rollbackTo('_guides_v2', req)
    const words = Array.from({ length: 480 }, (_, i) => `слово${i}`).join(' ')
    // До миграции гайды пишет старый код: колонок v2 ещё нет. Ссылки и разметка в минуты не считаются.
    const markdown = `## Раздел\n\n**${words}** [ссылка](https://example.com/${'очень/длинный/путь/'.repeat(20)})`
    const rows = await raw(`insert into guides (title, slug, summary, markdown, "order", is_published, updated_at, created_at) values
      ('Опубликован', 'v2-published', 'Кратко', '${markdown}', 1, true, '2026-10-20T10:00:00Z', '2026-10-19T10:00:00Z'),
      ('Черновик', 'v2-draft', 'Кратко', 'Коротко', 2, false, '2026-10-21T10:00:00Z', '2026-10-21T10:00:00Z')
      returning id`)
    await db().migrate({ migrations })
    const ids = rows.map((row) => Number(row.id)).join(',')
    expect(await raw(`select slug, announced_at = updated_at as announced_on_update, announced_at is null as not_announced, reading_minutes from guides where id in (${ids}) order by id`)).toEqual([
      { slug: 'v2-published', announced_on_update: true, not_announced: false, reading_minutes: '3' },
      { slug: 'v2-draft', announced_on_update: null, not_announced: true, reading_minutes: '1' },
    ])
    expect(await raw(`select version_slug, version_markdown is not null as has_text, version_is_published from _guides_v where parent_id in (${ids}) order by parent_id`)).toEqual([
      { version_slug: 'v2-published', has_text: true, version_is_published: true },
      { version_slug: 'v2-draft', has_text: true, version_is_published: false },
    ])
    expect(await drift()).toEqual([])
    await raw(`delete from _guides_v where parent_id in (${ids})`)
    await raw(`delete from guides where id in (${ids})`)
  })

  it('добавление публичности оставляет прежние гайды закрытыми и сохраняет их текст', async () => {
    const req = await createLocalReq({}, payload)
    await rollbackTo('_guides_public', req)
    const inserted = await raw(`insert into guides (title, slug, summary, markdown, is_published, updated_at, created_at) values
      ('Прежний гайд', 'private-before-migration', 'Кратко', 'Сохранённый текст', true, now(), now()) returning id`)
    const id = Number(inserted[0].id)
    await db().migrate({ migrations })
    expect(await raw(`select is_public, markdown from guides where id = ${id}`)).toEqual([{ is_public: false, markdown: 'Сохранённый текст' }])
    expect(await drift()).toEqual([])
    await raw(`delete from guides where id = ${id}`)
  })

  it('миграция категорий на живых данных: прежнее значение-перечисление переносится в связь', async () => {
    const req = await createLocalReq({}, payload)
    // Откатываемся до состояния перед guides_categories (сняв её и contract): категория — колонка-перечисление.
    await rollbackTo('_guides_categories', req)
    const inserted = await raw(`insert into guides (title, slug, summary, markdown, category, "order", is_published, updated_at, created_at) values
      ('С категорией', 'cat-backfill', 'Кратко', 'Текст', 'career', 1, true, '2026-10-20T10:00:00Z', '2026-10-19T10:00:00Z')
      returning id`)
    const id = Number(inserted[0].id)
    // Накатываем заново: guides_categories.up переносит значение в связь, contract.up убирает перечисление.
    await db().migrate({ migrations })
    expect(await raw(`select c.slug from guides g join guide_categories c on c.id = g.category_id where g.id = ${id}`)).toEqual([{ slug: 'career' }])
    expect(await drift()).toEqual([])
    await raw(`delete from guides where id = ${id}`)
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
      const migration = migrations.find((m) => m.name === name)
      if (!migration) throw new Error(`Миграция ${name} не зарегистрирована`)
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
