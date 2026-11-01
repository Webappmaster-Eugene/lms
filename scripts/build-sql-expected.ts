/**
 * Пересчитывает ожидаемые таблицы SQL-задач по эталонным решениям.
 *
 *   pnpm trainer:sql-expected            записать src/data/trainer/sql/expected.generated.ts
 *   pnpm trainer:sql-expected --check    только сверить, ничего не записывая
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { TRAINER_CATALOG } from '@/data/trainer'
import { computeSqlExpected, openSqlRunner, renderExpectedModule, sqlTasks } from './lib/sql-catalog'

const target = fileURLToPath(new URL('../src/data/trainer/sql/expected.generated.ts', import.meta.url))
const runner = await openSqlRunner()
try {
  const tasks = sqlTasks(TRAINER_CATALOG)
  const { expected, failures } = await computeSqlExpected(runner, tasks)
  if (failures.length) {
    console.error(`Эталоны с ошибкой (${failures.length}):\n${failures.join('\n')}`)
    process.exitCode = 1
  } else {
    const source = renderExpectedModule(expected)
    if (process.argv.includes('--check')) {
      const actual = readFileSync(target, 'utf8')
      if (actual !== source) {
        console.error('Ожидаемые таблицы устарели: запустите pnpm trainer:sql-expected')
        process.exitCode = 1
      } else process.stdout.write(`Ожидания актуальны: ${tasks.length} задач\n`)
    } else {
      writeFileSync(target, source)
      process.stdout.write(`Записано ожиданий: ${tasks.length} задач\n`)
    }
  }
} finally {
  await runner.close()
}
