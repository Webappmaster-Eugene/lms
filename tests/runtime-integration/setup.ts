import { migrations } from '../../src/migrations'
import { migrateFresh, up } from '../../scripts/test-db.mjs'
import { TEST_SECRET } from '../integration/setup/constants'

export default async function globalSetup(): Promise<void> {
  await up()
  await migrateFresh('lms_runtime_integration', { expected: migrations.length, env: { PAYLOAD_SECRET: TEST_SECRET } })
}
