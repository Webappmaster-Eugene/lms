import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** Настоящие компиляторы/Chromium в Docker: ошибки настройки не пропускаются. */
export default defineConfig({
  resolve: { alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
    'server-only': fileURLToPath(new URL('./tests/helpers/server-only-stub.ts', import.meta.url)),
  } },
  test: {
    environment: 'node', include: ['tests/runtime/**/*.test.ts'],
    fileParallelism: false, testTimeout: 250_000, hookTimeout: 250_000,
  },
})
