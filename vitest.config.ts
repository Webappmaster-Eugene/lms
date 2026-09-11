import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Дублирует paths из tsconfig.json — держать синхронно
    alias: {
      '@payload-config': fileURLToPath(new URL('./src/payload.config.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**', 'landing/**'],
  },
})
