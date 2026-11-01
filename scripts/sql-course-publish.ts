/**
 * Публикует курс «SQL и PostgreSQL с нуля» из content/sql-course через REST под админом.
 *
 *   LMS_URL=… LMS_ADMIN_EMAIL=… LMS_ADMIN_PASSWORD=… pnpm sql:publish-course [--dry-run] [--publish]
 *
 * Новый курс создаётся черновиком и закрытым по назначению; --publish публикует его после
 * проверки флажка. Задачи практики должны быть в LMS заранее: pnpm sql:publish-trainer.
 */
import { parseArgs } from 'node:util'

import { TRAINER_CATALOG } from '@/data/trainer'
import { lmsFromEnv } from './lib/lms-rest'
import { buildCourse } from './lib/sql-course'
import { publishSqlCourse } from './lib/sql-publish'

const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false }, publish: { type: 'boolean', default: false } } })
// Сборка до входа в LMS: сломанный пример не должен оставить курс наполовину обновлённым.
const course = await buildCourse(TRAINER_CATALOG)
const lms = lmsFromEnv()
try {
  await lms.login()
  await publishSqlCourse(lms, course, { dryRun: values['dry-run'], publish: values.publish })
} finally {
  await lms.logout()
}
