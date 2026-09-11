// @ts-check
/**
 * Flat-конфиг ESLint для LMS.
 *
 * До этого файла линтера в проекте не было вообще: скрипт `lint` звал `next lint`,
 * а тот, не найдя конфигурации, запускал интерактивный визард и падал. То есть
 * команда «проверь линтер» много месяцев возвращала ошибку, а не результат проверки.
 *
 * Плагины подключены напрямую, без пакета `eslint-config-next` и без FlatCompat.
 * Причина практическая: eslint-config-next патчит разрешение модулей, чтобы тянуть
 * плагины из своих зависимостей, а при изолированной раскладке pnpm этот патч
 * разваливается — ESLint перестаёт находить eslint-plugin-react-hooks после любого
 * сдвига версий. Прямая регистрация плагинов детерминирована; сам Next перешёл
 * на неё в 16-й версии.
 *
 * Разделение обязанностей: tsc отвечает за типы, ESLint — за то, чего тип не видит.
 * Потерянный промис, ветка без await, неиспользованный импорт, пропущенная
 * зависимость хука — всё это проходит проверку типов и всплывает уже в рантайме.
 *
 * Набор правил повторяет требования CLAUDE.md (strict, без any, без non-null
 * assertions) — конфиг закрепляет то, чего код уже придерживается.
 */
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import next from '@next/eslint-plugin-next'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      // У лендинга свой пакет, свой стек (Astro) и свой прогон проверок.
      'landing/**',
      'next-env.d.ts',
      // Генерируются Payload: `generate:types` и `generate:importmap`. Править их
      // руками нельзя, значит и замечания по ним показывать незачем.
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
      // Набор Next: рекомендованные правила плюс Core Web Vitals — тот же состав,
      // что даёт `eslint-config-next/core-web-vitals`.
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,

      // Правила хуков. Порядок вызова и состав зависимостей остаются ошибками:
      // цена промаха высокая, устаревшее замыкание даёт молчаливо неверное поведение.
      ...reactHooks.configs.recommended.rules,

      // Новое поколение правил из eslint-plugin-react-hooks 7 (чистота рендера,
      // обращение к ref, setState в эффекте) ориентировано на React Compiler.
      // В этом коде все одиннадцать срабатываний разобраны поимённо и дефектами
      // не являются:
      //   * `static-components` принимает за создание компонента вызов
      //     getIconComponent() — а это поиск в константной карте иконок
      //     (src/components/roadmap/icon-map.ts), ссылка стабильна;
      //   * `set-state-in-effect` указывает на флаг mounted — канонический приём
      //     для next-themes и порталов, без которого ломается гидратация, —
      //     и на загрузку данных в эффекте;
      //   * `refs` — на работу с ref в редакторе роадмапов.
      // Держать их ошибками значит блокировать проверку на заведомо ложных
      // срабатываниях; выключать совсем — потерять будущие настоящие находки.
      // Поэтому предупреждения: видны в каждом прогоне, не блокируют.
      'react-hooks/static-components': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',

      // JSX в Next не требует React в области видимости, а типы пропсов даёт TS.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/jsx-uses-vars': 'error',

      // Доступность: подмножество из конфига Next.
      'jsx-a11y/alt-text': ['warn', { elements: ['img'], img: ['Image'] }],
      'jsx-a11y/aria-props': 'warn',
      'jsx-a11y/aria-proptypes': 'warn',
      'jsx-a11y/aria-unsupported-elements': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',
      'jsx-a11y/role-supports-aria-props': 'warn',

      // Подчёркивание — принятый способ сказать «значение не нужно».
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Оба правила прямо записаны в правилах проекта (CLAUDE.md: no `any`,
      // no non-null assertions). Сейчас код им соответствует — правило это фиксирует.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Пустой catch в коде проекта — осознанный приём (например, разбор тела
      // запроса, где отказ обрабатывается возвратом 400 строкой ниже).
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      // console.log в серверных компонентах Next уезжает в логи контейнера и там
      // тонет: для этого есть logger из @/lib/telemetry. Явные ошибки и
      // предупреждения оставляем.
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },

  // Сидеры и скрипты миграции данных: печатать прогресс в stdout — их прямая
  // работа, их запускают руками и смотрят вывод.
  {
    files: ['src/seed*.ts', 'src/lib/seed-*.ts', 'src/migrations/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  // Миграции генерирует `payload migrate:create` с фиксированной сигнатурой
  // `({ db, payload, req })`. Переименовать неиспользуемые аргументы нельзя — их
  // вернёт следующая генерация, — поэтому аргументы здесь из проверки исключены.
  // Переменные внутри тела проверяются как везде.
  {
    files: ['src/migrations/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },

  // Редактор роадмапов живёт ВНУТРИ админки Payload: он подключён как
  // `afterNavLinks` и кастомная вьюха `/roadmap-editor/:segments*`
  // (см. src/payload.config.ts). Ссылки отсюда ведут в маршрут
  // `/admin/[[...segments]]`, которым владеет Payload со своим клиентским
  // роутером, а не Next. Полная перезагрузка через <a> — намеренный выбор:
  // мягкая навигация next/link заходит в Payload мимо его провайдеров и
  // оставляет админку в промежуточном состоянии.
  {
    files: ['src/components/roadmap-editor/**/*.tsx'],
    rules: { '@next/next/no-html-link-for-pages': 'off' },
  },

  // Тесты: утверждение о непустоте и заглушки — обычное дело.
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-empty': 'off',
    },
  },
)
