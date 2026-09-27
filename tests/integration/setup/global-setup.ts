import { migrations } from '../../../src/migrations'
import { migrateFresh, up } from '../../../scripts/test-db.mjs'
import { INTEGRATION_DB, TEST_SECRET } from './constants'

/**
 * Поднимает одноразовый Postgres, пересоздаёт базу и накатывает миграции
 * штатной командой `payload migrate` — тем же путём, что и при ручном
 * развёртывании. Падение миграции на чистой базе ломает весь прогон сразу.
 */
export default async function globalSetup(): Promise<void> {
  await up()
  await migrateFresh(INTEGRATION_DB, { expected: migrations.length, env: { PAYLOAD_SECRET: TEST_SECRET } })
}
