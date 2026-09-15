import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Дублирует paths из tsconfig.json — держать синхронно
const alias = {
  '@payload-config': fileURLToPath(new URL('./src/payload.config.ts', import.meta.url)),
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  // Пакет server-only бросает исключение вне серверного окружения Next —
  // в тестах он подменяется пустышкой, иначе не импортировать ни один
  // серверный модуль
  'server-only': fileURLToPath(new URL('./tests/helpers/server-only-stub.ts', import.meta.url)),
}

const EXCLUDE = ['node_modules/**', '.next/**', 'landing/**']

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts', 'tests/smoke/**/*.test.ts'],
          exclude: EXCLUDE,
        },
      },
      {
        // React-плагин и jsdom нужны только здесь: в node-проекте они
        // удваивают время прогона, ничего не давая взамен.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['tests/components/**/*.test.tsx'],
          exclude: EXCLUDE,
          setupFiles: ['./tests/setup/dom.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      include: ['src/components/**', 'src/hooks/**', 'src/lib/**', 'src/payload/hooks/**'],
      exclude: ['**/*.d.ts', '**/types.ts'],
    },
  },
})
