import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { TRAINER_CATALOG } from '@/data/trainer'
import { SQL_EXPECTED } from '@/data/trainer/sql/expected.generated'
import { ROW_PERMUTATIONS, setupSql, type RowPermutation } from '@/data/trainer/sql/fixture'
import { SQL_STARTER, SQL_TASK_SOURCES } from '@/data/trainer/sql/task'
import { computeSqlExpected, openSqlRunner, sqlTasks, type SqlRunner } from '../../../scripts/lib/sql-catalog'

/**
 * Эталоны SQL-задач исполняются настоящим PostgreSQL (PGlite) той же версии, что в
 * среде тренажёра. Здесь же ловятся задачи, на которые нельзя ответить однозначно:
 * ничья в сортировке, LIMIT среди равных значений, одинаковый ответ на всех наборах.
 */

const tasks = sqlTasks(TRAINER_CATALOG)
// Время и случайность дали бы эталон, который не совпадёт при следующей проверке.
const VOLATILE = /\b(now|random|setseed|current_date|current_time|current_timestamp|localtime|localtimestamp|clock_timestamp|statement_timestamp|transaction_timestamp|timeofday|gen_random_uuid|txid_current|pg_backend_pid)\b/i

let runner: SqlRunner
let fresh: { expected: Record<string, string[]>; failures: string[] }

beforeAll(async () => {
  runner = await openSqlRunner()
  fresh = await computeSqlExpected(runner, tasks)
}, 600_000)

afterAll(async () => {
  await runner?.close()
})

describe('каталог SQL-задач', () => {
  it('в каталоге есть SQL-задачи, и все темы SQL закрыты по назначению', () => {
    expect(tasks.length).toBeGreaterThan(0)
    for (const topic of TRAINER_CATALOG.filter((item) => item.category === 'sql')) expect(topic.assignedOnly, topic.slug).toBe(true)
  })

  it('каждый эталон выполняется без ошибок и возвращает таблицу', () => {
    expect(fresh.failures).toEqual([])
  })

  it('сохранённые ожидания совпадают с пересчётом: иначе запустите pnpm trainer:sql-expected', () => {
    expect(fresh.expected).toEqual(SQL_EXPECTED)
  })

  it('у каждой задачи открытый пример и хотя бы один скрытый набор', () => {
    for (const task of tasks) {
      const cases = task.runtimeCases ?? []
      expect(cases.filter((item) => !item.hidden), task.slug).toHaveLength(1)
      expect(cases.filter((item) => item.hidden).length, task.slug).toBeGreaterThan(0)
      for (const item of cases) expect(item.expected, `${task.slug}: ${item.name}`).not.toBe('')
    }
  })

  it('скрытый набор даёт другой ответ: подставить значения из условия нельзя', () => {
    const same = tasks.filter((task) => {
      const tables = SQL_EXPECTED[task.slug] ?? []
      return tables.length > 1 && tables.slice(1).some((table) => table === tables[0])
    }).map((task) => task.slug)
    expect(same).toEqual([])
  })

  it('стартовый шаблон не проходит ни одной проверки', async () => {
    for (const task of tasks) {
      expect(task.starterCode, task.slug).toBe(SQL_STARTER)
      const [first] = task.runtimeCases ?? []
      const outcome = await runner.run({ setup: first?.input ?? '', code: task.starterCode, check: task.sqlCheck, ordered: task.sqlOrdered })
      expect(outcome.table === first?.expected, task.slug).toBe(false)
    }
  }, 600_000)

  it('ответ не зависит от физического порядка строк: в сортировке и LIMIT нет ничьих', async () => {
    const ambiguous: string[] = []
    for (const task of tasks) {
      const source = SQL_TASK_SOURCES.get(task.slug)
      if (!source) throw new Error(`Нет описания задачи ${task.slug}`)
      for (let variant = 0; variant <= source.fixture.hidden.length; variant += 1) {
        for (const permutation of Object.keys(ROW_PERMUTATIONS) as RowPermutation[]) {
          const outcome = await runner.run({ setup: setupSql(source.fixture, variant, { permutation }), code: task.solutionCode, check: task.sqlCheck, ordered: task.sqlOrdered })
          if (outcome.table !== SQL_EXPECTED[task.slug]?.[variant]) ambiguous.push(`${task.slug} [набор ${variant}, ${permutation}]`)
        }
      }
    }
    expect(ambiguous).toEqual([])
  }, 600_000)

  it('эталоны не опираются на текущее время и случайные значения', () => {
    for (const task of tasks) {
      expect(VOLATILE.test(task.solutionCode), task.slug).toBe(false)
      expect(VOLATILE.test(task.sqlCheck ?? ''), task.slug).toBe(false)
    }
  })
})
