import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Интеграционные тесты: настоящий Payload Local API поверх одноразовой
 * PostgreSQL (см. scripts/test-db.mjs). В `pnpm test` не входят — там БД
 * не поднимается принципиально.
 *
 * Файлы идут последовательно: база общая, а часть проверок (лидерборд,
 * обращения в поддержку всем админам) зависит от состава пользователей.
 */
const alias = {
  '@payload-config': fileURLToPath(new URL('./src/payload.config.ts', import.meta.url)),
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  'server-only': fileURLToPath(new URL('./tests/helpers/server-only-stub.ts', import.meta.url)),
}

export default defineConfig({
  resolve: { alias },
  test: {
    name: 'integration',
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['./tests/integration/setup/global-setup.ts'],
    setupFiles: ['./tests/integration/setup/env.ts'],
    fileParallelism: false,
    // Первая инициализация Payload (сборка схемы drizzle) занимает секунды.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
})
