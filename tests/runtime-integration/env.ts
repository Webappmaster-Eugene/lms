import '../integration/setup/env'
import { databaseUrl } from '../../scripts/test-db.mjs'

process.env.DATABASE_URL = databaseUrl('lms_runtime_integration')
