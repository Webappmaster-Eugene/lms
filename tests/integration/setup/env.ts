import { databaseUrl } from '../../../scripts/test-db.mjs'
import { BOOTSTRAP_ADMIN, INTEGRATION_DB, TEST_SECRET } from './constants'

/**
 * Окружение выставляется до первого импорта конфига Payload: адаптер БД и
 * почта читают переменные в момент сборки конфига.
 */
process.env.DATABASE_URL = databaseUrl(INTEGRATION_DB)
process.env.PAYLOAD_SECRET = TEST_SECRET
// Схема приходит только из миграций. Без флага Payload в dev-режиме сделал бы
// drizzle push и спрятал бы расхождение миграций с конфигом.
process.env.PAYLOAD_MIGRATING = 'true'
process.env.NEXT_PUBLIC_SERVER_URL = 'http://lms.test'
process.env.ADMIN_EMAIL = BOOTSTRAP_ADMIN.email
process.env.ADMIN_PASSWORD = BOOTSTRAP_ADMIN.password
// Никакой реальной почты и телеметрии: пустой SMTP_HOST выключает адаптер.
for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'YANDEX_DISK_TOKEN']) {
  delete process.env[name]
}
