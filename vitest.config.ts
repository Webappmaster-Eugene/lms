import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Алиасы повторяют `paths` из tsconfig.json. Держать их синхронно обязательно:
 * tsc разрешает `@/lib/...` по tsconfig, а Vitest — по этому файлу, и при расхождении
 * тесты падают на импорте, хотя с кодом всё в порядке.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@payload-config': fileURLToPath(new URL('./src/payload.config.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Каталоги сборки содержат собственные .test-файлы зависимостей — без явного
    // исключения прогон разрастается на чужой код.
    exclude: ['node_modules/**', '.next/**', 'landing/**'],
  },
})
