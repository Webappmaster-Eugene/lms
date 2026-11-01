/**
 * Загружает SQL-темы тренажёра из кодового каталога в LMS через REST под админом.
 *
 *   LMS_URL=… LMS_ADMIN_EMAIL=… LMS_ADMIN_PASSWORD=… pnpm sql:publish-trainer [--dry-run] [--publish]
 *
 * Трогает только темы категории sql и их задачи. Новые темы и задачи создаются черновиками,
 * --publish публикует их. pnpm seed:trainer для прода не годится: он перезаписывает все темы
 * каталога и снова публикует их.
 */
import { parseArgs } from 'node:util'

import { TRAINER_CATALOG } from '@/data/trainer'
import { SQL_EXPECTED } from '@/data/trainer/sql/expected.generated'
import { lmsFromEnv } from './lib/lms-rest'
import { computeSqlExpected, openSqlRunner, sqlTasks } from './lib/sql-catalog'
import { publishSqlTrainer } from './lib/sql-publish'

const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false }, publish: { type: 'boolean', default: false } } })
const sqlTopics = TRAINER_CATALOG.filter((topic) => topic.category === 'sql')
// Ожидания пересчитываются из эталонов до входа в LMS: устаревший файл сделал бы задачи нерешаемыми.
const runner = await openSqlRunner()
try {
  const fresh = await computeSqlExpected(runner, sqlTasks(TRAINER_CATALOG))
  const stale = Object.keys(fresh.expected).filter((slug) => JSON.stringify(fresh.expected[slug]) !== JSON.stringify(SQL_EXPECTED[slug]))
  if (fresh.failures.length || stale.length) {
    process.stderr.write(`Ожидаемые таблицы не совпадают с эталонами (${[...fresh.failures, ...stale].slice(0, 5).join(', ')}). Запустите pnpm trainer:sql-expected\n`)
    process.exit(1)
  }
} finally {
  await runner.close()
}
const lms = lmsFromEnv()
try {
  await lms.login()
  await publishSqlTrainer(lms, sqlTopics, { dryRun: values['dry-run'], publish: values.publish })
} finally {
  await lms.logout()
}
