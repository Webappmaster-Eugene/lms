// @ts-check
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import next from '@next/eslint-plugin-next'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'

// Плагины подключены напрямую, без eslint-config-next: тот патчит разрешение модулей
// под свои зависимости, и при изолированной раскладке pnpm перестаёт находить плагины.

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'landing/**',
      'next-env.d.ts',
      // Генерируются командами payload generate:types и generate:importmap
      'src/payload-types.ts',
      'src/app/(payload)/admin/importMap.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser, ...globals.es2022 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      '@next/next': next,
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,

      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/jsx-uses-vars': 'error',

      'jsx-a11y/alt-text': ['warn', { elements: ['img'], img: ['Image'] }],
      'jsx-a11y/aria-props': 'warn',
      'jsx-a11y/aria-proptypes': 'warn',
      'jsx-a11y/aria-unsupported-elements': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',
      'jsx-a11y/role-supports-aria-props': 'warn',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },

  {
    files: ['src/seed*.ts', 'src/lib/seed-*.ts', 'src/migrations/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    // payload migrate:create генерирует фиксированную сигнатуру ({ db, payload, req }),
    // переименовать неиспользуемые аргументы нельзя — их вернёт следующая генерация
    files: ['src/migrations/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },

  {
    // Компоненты подключены внутрь админки Payload (см. payload.config.ts) и ведут в
    // маршрут /admin/[[...segments]], которым владеет её собственный роутер: мягкая
    // навигация next/link заходит туда мимо провайдеров Payload
    files: ['src/components/roadmap-editor/**/*.tsx'],
    rules: { '@next/next/no-html-link-for-pages': 'off' },
  },

  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-empty': 'off',
    },
  },
)
