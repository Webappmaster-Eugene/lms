/**
 * Прогон SQL-каталога внутри процесса: генератор ожиданий и быстрые тесты.
 *
 * В рантайме тренажёра каждый кейс идёт на свежем экземпляре PGlite. Здесь
 * исполняются только доверенные эталоны, поэтому один экземпляр со сбросом
 * схемы перед кейсом даёт тот же результат в десятки раз быстрее. Совпадение
 * с настоящей средой проверяет tests/runtime/trainerRuntimeCatalog.test.ts.
 */
import { PGlite } from '@electric-sql/pglite'

import { flattenCatalog, type TrainerTaskSeed, type TrainerTopicSeed } from '@/data/trainer/types'
import { prepareCase, runSolutionCase } from '../../trainer-runtime/sql-engine.mjs'

export type SqlOutcome = { status: 'ok' | 'error' | 'empty'; table?: string; error?: string; line?: number }

// Отдельными вызовами: несколько операторов в одном exec идут неявной транзакцией, а DISCARD ALL в ней запрещён.
const RESET_SESSION = ['ROLLBACK', 'DISCARD ALL']
const RESET_SCHEMAS = `
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT nspname FROM pg_namespace
    WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND nspname NOT LIKE 'pg_temp_%' AND nspname NOT LIKE 'pg_toast_temp_%'
  LOOP
    EXECUTE format('DROP SCHEMA %I CASCADE', item.nspname);
  END LOOP;
END $$;
CREATE SCHEMA public;
`

export type SqlRunner = {
  run: (input: { setup: string; code: string; check?: string; ordered?: boolean }) => Promise<SqlOutcome>
  close: () => Promise<void>
}

export async function openSqlRunner(): Promise<SqlRunner> {
  const db = new PGlite()
  await db.waitReady
  return {
    async run({ setup, code, check, ordered }) {
      for (const statement of RESET_SESSION) await db.exec(statement)
      await db.exec(RESET_SCHEMAS)
      const parsers = await prepareCase(db, setup)
      return await runSolutionCase(db, { code, check, ordered: ordered === true, parsers }) as SqlOutcome
    },
    close: () => db.close(),
  }
}

export function sqlTasks(catalog: readonly TrainerTopicSeed[]): TrainerTaskSeed[] {
  return flattenCatalog(catalog).map(({ task }) => task).filter((task) => task.languages.includes('sql'))
}

/** Таблицы эталона для каждого кейса задачи. Ошибка эталона - дефект каталога, а не повод записать пустой ответ. */
export async function computeSqlExpected(runner: SqlRunner, tasks: readonly TrainerTaskSeed[]): Promise<{ expected: Record<string, string[]>; failures: string[] }> {
  const expected: Record<string, string[]> = {}
  const failures: string[] = []
  for (const task of tasks) {
    const tables: string[] = []
    for (const [index, item] of (task.runtimeCases ?? []).entries()) {
      const outcome = await runner.run({ setup: item.input ?? '', code: task.solutionCode, check: task.sqlCheck, ordered: task.sqlOrdered })
      if (outcome.status !== 'ok' || !outcome.table) failures.push(`${task.slug} [кейс ${index}]: ${outcome.status} ${outcome.error ?? ''}`.trim())
      tables.push(outcome.table ?? '')
    }
    expected[task.slug] = tables
  }
  return { expected, failures }
}

export function renderExpectedModule(expected: Record<string, string[]>): string {
  const lines = Object.keys(expected).sort().map((slug) => `  ${JSON.stringify(slug)}: [\n${expected[slug].map((table) => `    ${JSON.stringify(table)},`).join('\n')}\n  ],`)
  return `// Сгенерировано scripts/build-sql-expected.ts. Не редактировать вручную.\nexport const SQL_EXPECTED: Readonly<Record<string, readonly string[]>> = {${lines.length ? `\n${lines.join('\n')}\n` : ''}}\n`
}
