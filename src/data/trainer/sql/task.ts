import type { TrainerTag } from '@/lib/trainer/constants'
import type { TrainerDifficulty } from '@/lib/trainer/types'
import type { TrainerTaskSeed, TrainerTopicSeed } from '../types'
import { SQL_EXPECTED } from './expected.generated'
import { fixtureMarkdown, schemaMarkdown, setupSql, type SqlFixture } from './fixture'

export const SQL_STARTER = '-- Напишите запрос PostgreSQL\n'

export type SqlTaskInput = {
  slug: string
  title: string
  difficulty: TrainerDifficulty
  fixture: SqlFixture
  /** Условие без таблиц: таблицы добавляются из набора данных. */
  task: string
  /** Какие таблицы показать в условии; по умолчанию все таблицы набора. */
  tables?: readonly string[]
  /** Показать только структуру таблиц: задачи, где ученик сам создаёт или заполняет таблицу. */
  schemaOnly?: boolean
  solution: string
  /** Запрос после решения для задач на изменение данных и структуры. */
  check?: string
  ordered?: boolean
  hints?: readonly string[]
  /** Разбор решения: почему запрос устроен именно так и где частая ошибка. */
  notes: string
  tags?: readonly TrainerTag[]
  minutes?: number
}

function contract(input: SqlTaskInput): string {
  const order = input.ordered
    ? 'Порядок строк проверяется, поэтому отсортируйте результат, как сказано в условии.'
    : 'Порядок строк не проверяется.'
  const check = input.check
    ? `\n\nПосле вашего кода выполняется проверочный запрос, и сравнивается его результат:\n\n\`\`\`sql\n${input.check.trim()}\n\`\`\``
    : ''
  return `Решение проверяется на этих данных и на скрытых наборах той же структуры, поэтому значения из таблиц в запрос не подставляйте. Сравниваются названия и порядок столбцов и сами строки. ${order}${check}`
}

/** Исходные описания задач: тесты каталога пересобирают по ним данные в другом порядке строк. */
export const SQL_TASK_SOURCES = new Map<string, SqlTaskInput>()

/** Ожидаемые таблицы считает scripts/build-sql-expected.ts по эталону; пустая строка значит, что генератор не запускали. */
function expected(slug: string, variant: number): string {
  return SQL_EXPECTED[slug]?.[variant] ?? ''
}

export function sqlTask(input: SqlTaskInput): TrainerTaskSeed {
  if (SQL_TASK_SOURCES.has(input.slug)) throw new Error(`SQL-задача ${input.slug} объявлена дважды`)
  SQL_TASK_SOURCES.set(input.slug, input)
  const data = input.schemaOnly ? schemaMarkdown(input.fixture, input.tables) : fixtureMarkdown(input.fixture, input.tables)
  return {
    slug: input.slug,
    title: input.title,
    difficulty: input.difficulty,
    languages: ['sql'],
    checkMode: 'program',
    descriptionMd: `${input.task.trim()}\n\n${data}\n\n${contract(input)}`,
    starterCode: SQL_STARTER,
    solutionCode: input.solution.trim(),
    ...(input.check ? { sqlCheck: input.check.trim() } : {}),
    sqlOrdered: input.ordered === true,
    runtimeCases: [
      { name: 'Данные из условия', hidden: false, input: setupSql(input.fixture, 0), expected: expected(input.slug, 0) },
      ...input.fixture.hidden.map((_, index) => ({ name: `Скрытый набор ${index + 1}`, hidden: true, input: setupSql(input.fixture, index + 1), expected: expected(input.slug, index + 1) })),
    ],
    hints: [...(input.hints ?? [])],
    solutionNotes: input.notes.trim(),
    tags: [...new Set<TrainerTag>(['sql', ...(input.tags ?? [])])],
    companies: [],
    companyEvidence: [],
    interviewFormat: 'language',
    recommendedMinutes: input.minutes ?? ({ easy: 10, medium: 20, hard: 30 } as const)[input.difficulty],
    timeLimitMs: 3000,
  }
}

export type SqlTopicInput = Omit<TrainerTopicSeed, 'category' | 'assignedOnly'>

/** Все SQL-темы закрыты по умолчанию: курс выдаётся только по назначению. */
export function sqlTopic(input: SqlTopicInput): TrainerTopicSeed {
  return { ...input, category: 'sql', assignedOnly: true }
}
