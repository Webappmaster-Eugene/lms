/** Общие константы тестового окружения интеграционных тестов. */
export const INTEGRATION_DB = 'lms_integration'

export const TEST_SECRET = 'integration-test-secret-not-for-production-0001'

/** Админ, которого создаёт onInit на пустой базе (см. payload.config.ts). */
export const BOOTSTRAP_ADMIN = {
  email: 'bootstrap-admin@lms.test',
  password: 'Bootstrap-Admin-Pass-1',
}
