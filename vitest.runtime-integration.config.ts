import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** HTTP gateway, настоящие Docker jobs и отдельная PostgreSQL; без mocks и skips. */
export default defineConfig({
  resolve: { alias: {
    '@payload-config': fileURLToPath(new URL('./src/payload.config.ts', import.meta.url)),
    '@': fileURLToPath(new URL('./src', import.meta.url)),
    'server-only': fileURLToPath(new URL('./tests/helpers/server-only-stub.ts', import.meta.url)),
  } },
  test: {
    environment: 'node',
    include: ['tests/runtime/**/*.test.ts', 'tests/runtime-integration/**/*.test.ts'],
    globalSetup: ['./tests/runtime-integration/setup.ts'],
    setupFiles: ['./tests/runtime-integration/env.ts'],
    fileParallelism: false,
    testTimeout: 250_000,
    hookTimeout: 250_000,
  },
})
