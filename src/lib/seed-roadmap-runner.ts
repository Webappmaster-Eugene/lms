/**
 * seed-roadmap-runner.ts — реюзабельная функция засидивания роадмапов.
 *
 * Используется из двух точек:
 * 1. `src/seed-roadmaps.ts` — standalone CLI-скрипт (`pnpm exec payload run ...`)
 * 2. `src/payload.config.ts` → `onInit` — auto-seed при пустой таблице `roadmap-nodes`
 *
 * НЕ импортирует payload.config.ts → нет circular dependency.
 */

import type { Payload } from 'payload'
import {
  findOrCreateRoadmap,
  createStubCourse,
} from './seed-helpers'

// ============================================================
// Types
// ============================================================

export type NodeSeed = {
  nodeId: string
  label: string
  nodeType: 'category' | 'topic' | 'subtopic'
  positionX: number
  positionY: number
  icon: string
  description: string
  order: number
  stage: 'start' | 'base' | 'stage1' | 'stage2' | 'practice' | 'advanced' | 'growth'
  color: 'yellow' | 'lime' | 'white' | 'gray' | 'pink' | 'blue' | 'red'
  bullets: string[]
  existingCourseSlug?: string
  createStub?: boolean
}

export type EdgeSeed = {
  edgeId: string
  source: string
  target: string
  animated?: boolean
}

// ============================================================
// FRONTEND REACT ROADMAP — data
// ============================================================

const frontendNodes: NodeSeed[] = [
  { nodeId: 'fe-start', label: 'Начало', nodeType: 'category', positionX: 500, positionY: 0, icon: 'rocket', description: 'Старт обучения Frontend-разработке', order: 0, stage: 'start', color: 'pink', bullets: [] },
  { nodeId: 'fe-html', label: 'HTML', nodeType: 'topic', positionX: 40, positionY: 180, icon: 'file-code', description: 'Разметка, семантика, доступность', order: 1, stage: 'base', color: 'yellow', bullets: ['Теги, атрибуты, структура документа', 'Семантическая разметка (header, main, article)', 'Формы и валидация HTML5', 'Таблицы и списки', 'Доступность (a11y), ARIA-атрибуты', 'Медиа (audio, video, picture)', 'SEO-теги, OpenGraph, Schema.org'], createStub: true },
  { nodeId: 'fe-css', label: 'CSS', nodeType: 'topic', positionX: 300, positionY: 180, icon: 'palette', description: 'Стилизация, адаптив, анимации', order: 2, stage: 'base', color: 'yellow', bullets: ['Селекторы, каскад, специфичность', 'Box-model, позиционирование', 'Flexbox', 'Grid', 'CSS-переменные', 'Адаптивная вёрстка, media queries', 'Анимации и transitions', 'Методологии (БЭМ)'], createStub: true },
  { nodeId: 'fe-js', label: 'JS', nodeType: 'topic', positionX: 560, positionY: 180, icon: 'file-code', description: 'Основы JavaScript', order: 3, stage: 'base', color: 'yellow', bullets: ['Переменные, типы данных', 'Операторы, условия, циклы', 'Функции, область видимости', 'Массивы и методы', 'Объекты и деструктуризация', 'Строки и шаблонные литералы', 'Обработка ошибок try/catch'], existingCourseSlug: 'js-basics' },
  { nodeId: 'fe-js-dom', label: 'JS + DOM', nodeType: 'topic', positionX: 820, positionY: 180, icon: 'monitor', description: 'DOM, события, браузер', order: 4, stage: 'base', color: 'yellow', bullets: ['document, querySelector, querySelectorAll', 'События и addEventListener', 'Делегирование событий', 'Работа с формами', 'Fetch API, Promise', 'LocalStorage, SessionStorage', 'DevTools, отладка'], createStub: true },
  { nodeId: 'fe-ts-build', label: 'TypeScript и сборка', nodeType: 'topic', positionX: 40, positionY: 460, icon: 'shield', description: 'Типизация, компиляция, бандлеры', order: 5, stage: 'stage1', color: 'lime', bullets: ['Базовые типы, интерфейсы', 'Generics и Utility-типы', 'tsconfig.json и strict-режим', 'Type guards, narrowing', 'Declaration-файлы', 'Webpack / Vite / esbuild', 'Code splitting, tree shaking'], createStub: true },
  { nodeId: 'fe-js-adv', label: 'JS — продвинутый', nodeType: 'topic', positionX: 300, positionY: 460, icon: 'cpu', description: 'Асинхронность, замыкания, прототипы', order: 6, stage: 'stage1', color: 'lime', bullets: ['Event Loop, микротаски', 'Async/await, Promise chains', 'Замыкания и область видимости', 'Прототипы и наследование', 'this, call / apply / bind', 'ES6+ (Map, Set, Symbol, Proxy)', 'Модули (ESM, CommonJS)'], createStub: true },
  { nodeId: 'fe-react', label: 'React JS', nodeType: 'topic', positionX: 560, positionY: 460, icon: 'zap', description: 'Компоненты, состояние, хуки', order: 7, stage: 'stage1', color: 'lime', bullets: ['JSX и компоненты', 'Props и композиция', 'useState, useEffect, useMemo', 'useCallback, useRef', 'Context API', 'Кастомные хуки', 'Оптимизация ре-рендеров'], existingCourseSlug: 'react-fundamentals' },
  { nodeId: 'fe-react-eco', label: 'Экосистема React', nodeType: 'topic', positionX: 820, positionY: 460, icon: 'puzzle', description: 'State-менеджеры, роутинг, формы', order: 8, stage: 'stage1', color: 'lime', bullets: ['React Router (v6+)', 'Redux Toolkit / Zustand', 'React Query / SWR', 'React Hook Form', 'Формы и валидация (Zod, Yup)', 'Styled-components, Emotion', 'Tailwind CSS'], createStub: true },
  { nodeId: 'fe-layout', label: 'Вёрстка', nodeType: 'topic', positionX: 40, positionY: 760, icon: 'layout', description: 'Pixel-perfect, адаптивность, кроссбраузерность', order: 9, stage: 'stage2', color: 'white', bullets: ['Pixel-perfect вёрстка по макету', 'Работа с Figma', 'Адаптивная вёрстка (mobile-first)', 'Кроссбраузерность', 'Retina-ресурсы, SVG', 'БЭМ на практике'], createStub: true },
  { nodeId: 'fe-arch', label: 'Архитектура и код-ревью', nodeType: 'topic', positionX: 300, positionY: 760, icon: 'folder-tree', description: 'Паттерны, чистый код, ревью', order: 10, stage: 'stage2', color: 'white', bullets: ['Feature-Sliced Design', 'Атомарный дизайн компонентов', 'SOLID в компонентах', 'DRY / KISS / YAGNI', 'Code review практики', 'Чистый код и рефакторинг'], createStub: true },
  { nodeId: 'fe-nextjs', label: 'Next.js', nodeType: 'topic', positionX: 560, positionY: 760, icon: 'zap', description: 'SSR, SSG, App Router', order: 11, stage: 'stage2', color: 'white', bullets: ['App Router и Server Components', 'SSR, SSG, ISR', 'Middleware, edge runtime', 'Route Handlers / API Routes', 'Динамические маршруты', 'Оптимизация Image / Font', 'Деплой на Vercel'], createStub: true },
  { nodeId: 'fe-tests', label: 'Тестирование', nodeType: 'topic', positionX: 820, positionY: 760, icon: 'test-tube', description: 'Unit, integration, E2E', order: 12, stage: 'stage2', color: 'white', bullets: ['Jest / Vitest', 'React Testing Library', 'Моки и стабы', 'Snapshot-тесты', 'Playwright / Cypress (E2E)', 'Test coverage, TDD'], createStub: true },
  { nodeId: 'fe-real-project', label: 'Реальные проекты', nodeType: 'topic', positionX: 40, positionY: 1060, icon: 'rocket', description: 'Работа с клиентом, ТЗ, сроки', order: 13, stage: 'practice', color: 'pink', bullets: ['Сбор требований и анализ ТЗ', 'Планирование и оценка', 'Работа в команде, Agile/Scrum', 'Git-flow в команде', 'Презентация результатов', 'Обработка обратной связи'], createStub: true },
  { nodeId: 'fe-complex-int', label: 'Сложные интеграции', nodeType: 'topic', positionX: 300, positionY: 1060, icon: 'network', description: 'WebSocket, GraphQL, OAuth', order: 14, stage: 'practice', color: 'pink', bullets: ['WebSocket и real-time', 'GraphQL (Apollo / urql)', 'OAuth 2.0, JWT', 'Server-Sent Events (SSE)', 'Сторонние API (платежи, карты)', 'Работа с файлами и загрузка'], createStub: true },
  { nodeId: 'fe-perf', label: 'Производительность', nodeType: 'topic', positionX: 560, positionY: 1060, icon: 'zap', description: 'Web Vitals, оптимизация', order: 15, stage: 'practice', color: 'pink', bullets: ['Core Web Vitals (LCP, CLS, FID)', 'Lighthouse, Chrome DevTools', 'Оптимизация bundle size', 'Lazy loading, code splitting', 'Image / Font оптимизация', 'Кеширование и CDN'], createStub: true },
  { nodeId: 'fe-mobile', label: 'Mobile / PWA', nodeType: 'topic', positionX: 820, positionY: 1060, icon: 'smartphone', description: 'React Native, PWA', order: 16, stage: 'practice', color: 'pink', bullets: ['PWA: manifest, service worker', 'Offline-first подход', 'Push-уведомления', 'React Native (базово)', 'Capacitor / Expo', 'Responsive design patterns'], createStub: true },
  { nodeId: 'fe-interview', label: 'Подготовка к собеседованию', nodeType: 'topic', positionX: 180, positionY: 1340, icon: 'workflow', description: 'Алгоритмы, system design, soft-skills', order: 17, stage: 'advanced', color: 'red', bullets: ['Алгоритмы и структуры данных', 'System design для фронта', 'Live-coding задачи', 'Поведенческие вопросы (STAR)', 'Вопросы о проектах', 'Переговоры по офферу'], createStub: true },
  { nodeId: 'fe-resume', label: 'Резюме и портфолио', nodeType: 'topic', positionX: 480, positionY: 1340, icon: 'book-open', description: 'CV, GitHub, LinkedIn', order: 18, stage: 'advanced', color: 'red', bullets: ['Структура резюме', 'Описание достижений через метрики', 'GitHub-профиль и pinned репозитории', 'LinkedIn оптимизация', 'Портфолио-сайт', 'Cover letter'], createStub: true },
  { nodeId: 'fe-mentoring', label: 'Менторинг и рост', nodeType: 'topic', positionX: 780, positionY: 1340, icon: 'network', description: 'Наставничество, команда', order: 19, stage: 'advanced', color: 'red', bullets: ['Менторинг младших', 'Code review других', 'Tech talks и презентации', 'Tech leadership базово', 'Написание документации', 'Постоянное обучение'], createStub: true },
  { nodeId: 'fe-growth-monorepo', label: 'Монорепо', nodeType: 'subtopic', positionX: 60, positionY: 1620, icon: 'box', description: 'Turborepo, Nx, pnpm workspaces', order: 20, stage: 'growth', color: 'gray', bullets: [], createStub: true },
  { nodeId: 'fe-growth-micro', label: 'Микрофронтенды', nodeType: 'subtopic', positionX: 280, positionY: 1620, icon: 'puzzle', description: 'Module Federation, Single-SPA', order: 21, stage: 'growth', color: 'gray', bullets: [], createStub: true },
  { nodeId: 'fe-growth-wasm', label: 'WebAssembly', nodeType: 'subtopic', positionX: 500, positionY: 1620, icon: 'cpu', description: 'Rust/Go → WASM во фронте', order: 22, stage: 'growth', color: 'gray', bullets: [], createStub: true },
  { nodeId: 'fe-growth-3d', label: '3D / WebGL', nodeType: 'subtopic', positionX: 720, positionY: 1620, icon: 'layers', description: 'Three.js, React Three Fiber', order: 23, stage: 'growth', color: 'gray', bullets: [], createStub: true },
]

const frontendEdges: EdgeSeed[] = [
  { edgeId: 'fe-e-start-html', source: 'fe-start', target: 'fe-html' },
  { edgeId: 'fe-e-start-css', source: 'fe-start', target: 'fe-css' },
  { edgeId: 'fe-e-start-js', source: 'fe-start', target: 'fe-js', animated: true },
  { edgeId: 'fe-e-start-jsdom', source: 'fe-start', target: 'fe-js-dom' },
  { edgeId: 'fe-e-html-ts', source: 'fe-html', target: 'fe-ts-build' },
  { edgeId: 'fe-e-css-jsadv', source: 'fe-css', target: 'fe-js-adv' },
  { edgeId: 'fe-e-js-react', source: 'fe-js', target: 'fe-react', animated: true },
  { edgeId: 'fe-e-jsdom-eco', source: 'fe-js-dom', target: 'fe-react-eco' },
  { edgeId: 'fe-e-js-jsadv', source: 'fe-js', target: 'fe-js-adv' },
  { edgeId: 'fe-e-ts-layout', source: 'fe-ts-build', target: 'fe-layout' },
  { edgeId: 'fe-e-jsadv-arch', source: 'fe-js-adv', target: 'fe-arch' },
  { edgeId: 'fe-e-react-next', source: 'fe-react', target: 'fe-nextjs', animated: true },
  { edgeId: 'fe-e-eco-tests', source: 'fe-react-eco', target: 'fe-tests' },
  { edgeId: 'fe-e-layout-real', source: 'fe-layout', target: 'fe-real-project' },
  { edgeId: 'fe-e-arch-int', source: 'fe-arch', target: 'fe-complex-int' },
  { edgeId: 'fe-e-next-perf', source: 'fe-nextjs', target: 'fe-perf' },
  { edgeId: 'fe-e-tests-mobile', source: 'fe-tests', target: 'fe-mobile' },
  { edgeId: 'fe-e-real-interview', source: 'fe-real-project', target: 'fe-interview' },
  { edgeId: 'fe-e-int-resume', source: 'fe-complex-int', target: 'fe-resume' },
  { edgeId: 'fe-e-perf-mentoring', source: 'fe-perf', target: 'fe-mentoring' },
  { edgeId: 'fe-e-mobile-mentoring', source: 'fe-mobile', target: 'fe-mentoring' },
  { edgeId: 'fe-e-interview-mono', source: 'fe-interview', target: 'fe-growth-monorepo' },
  { edgeId: 'fe-e-resume-micro', source: 'fe-resume', target: 'fe-growth-micro' },
  { edgeId: 'fe-e-mentoring-wasm', source: 'fe-mentoring', target: 'fe-growth-wasm' },
  { edgeId: 'fe-e-mentoring-3d', source: 'fe-mentoring', target: 'fe-growth-3d' },
]

// ============================================================
// BACKEND NODE.JS ROADMAP — data
// ============================================================

const backendNodes: NodeSeed[] = [
  { nodeId: 'be-start', label: 'Начало', nodeType: 'category', positionX: 500, positionY: 0, icon: 'rocket', description: 'Старт обучения Backend-разработке', order: 0, stage: 'start', color: 'pink', bullets: [] },
  { nodeId: 'be-js', label: 'JS', nodeType: 'topic', positionX: 40, positionY: 180, icon: 'file-code', description: 'Основы JavaScript для сервера', order: 1, stage: 'base', color: 'yellow', bullets: ['Переменные, типы, операторы', 'Функции, замыкания', 'Массивы и объекты', 'Async/await, Promise', 'ES-модули', 'Обработка ошибок'], createStub: true },
  { nodeId: 'be-ts', label: 'TS', nodeType: 'topic', positionX: 240, positionY: 180, icon: 'shield', description: 'TypeScript для Node', order: 2, stage: 'base', color: 'yellow', bullets: ['Базовые типы', 'Интерфейсы и type', 'Generics', 'Utility-типы', 'Декораторы (для NestJS)', 'tsconfig для Node'], createStub: true },
  { nodeId: 'be-git-net', label: 'Git и сеть', nodeType: 'topic', positionX: 440, positionY: 180, icon: 'git-branch', description: 'Git, HTTP, TCP/IP', order: 3, stage: 'base', color: 'yellow', bullets: ['Git-flow, rebase, merge', 'HTTP методы, статусы', 'TCP/IP, DNS, SSL/TLS', 'REST, URL-схемы', 'Cookies, CORS', 'SSH, GitHub/GitLab'], createStub: true },
  { nodeId: 'be-node', label: 'Node.js', nodeType: 'topic', positionX: 640, positionY: 180, icon: 'server', description: 'Runtime, модули, npm', order: 4, stage: 'base', color: 'yellow', bullets: ['Event Loop, libuv', 'Модули CommonJS/ESM', 'npm / pnpm / yarn', 'Файловая система (fs)', 'Streams и буферы', 'Worker Threads', 'Глобальные объекты'], existingCourseSlug: 'node-basics' },
  { nodeId: 'be-linux', label: 'Linux / Терминал', nodeType: 'topic', positionX: 840, positionY: 180, icon: 'terminal', description: 'Bash, процессы, права', order: 5, stage: 'base', color: 'yellow', bullets: ['Базовые команды (ls, cd, grep)', 'Bash-скрипты', 'Права доступа, chmod/chown', 'Процессы, ps, top, htop', 'SSH, scp, rsync', 'Cron и systemd'], createStub: true },
  { nodeId: 'be-algo', label: 'Алгоритмы и структуры', nodeType: 'topic', positionX: 40, positionY: 460, icon: 'cpu', description: 'Big O, деревья, графы', order: 6, stage: 'stage1', color: 'lime', bullets: ['Big O нотация', 'Массивы, стеки, очереди', 'Связные списки', 'Деревья (BST, AVL)', 'Графы, BFS / DFS', 'Хеш-таблицы', 'Сортировки и поиск'], createStub: true },
  { nodeId: 'be-nest', label: 'NestJS', nodeType: 'topic', positionX: 240, positionY: 460, icon: 'box', description: 'Модули, DI, декораторы', order: 7, stage: 'stage1', color: 'lime', bullets: ['Модули, контроллеры, провайдеры', 'Dependency Injection', 'Guards, Interceptors, Pipes', 'Middleware и фильтры', 'Конфигурация и валидация', 'Testing в NestJS', 'WebSockets, Microservices'], createStub: true },
  { nodeId: 'be-arch', label: 'Архитектура', nodeType: 'topic', positionX: 440, positionY: 460, icon: 'folder-tree', description: 'SOLID, Clean Architecture, DDD', order: 8, stage: 'stage1', color: 'lime', bullets: ['SOLID принципы', 'Clean Architecture', 'Hexagonal / Ports & Adapters', 'Domain-Driven Design (DDD)', 'Repository pattern', 'CQRS (базово)', 'Слоистая архитектура'], createStub: true },
  { nodeId: 'be-sql', label: 'SQL и реляционные БД', nodeType: 'topic', positionX: 640, positionY: 460, icon: 'database', description: 'PostgreSQL, индексы, транзакции', order: 9, stage: 'stage1', color: 'lime', bullets: ['SQL: SELECT, JOIN, GROUP BY', 'Нормализация, ключи', 'Индексы, EXPLAIN ANALYZE', 'Транзакции, уровни изоляции', 'Триггеры и хранимые процедуры', 'PostgreSQL специфика'], createStub: true },
  { nodeId: 'be-nosql', label: 'NoSQL', nodeType: 'topic', positionX: 840, positionY: 460, icon: 'database', description: 'MongoDB, Redis, ClickHouse', order: 10, stage: 'stage1', color: 'lime', bullets: ['MongoDB: документы, коллекции', 'Aggregation Pipeline', 'Redis: ключ-значение', 'Redis: Pub/Sub, Streams', 'Когда выбирать NoSQL', 'ClickHouse для аналитики'], createStub: true },
  { nodeId: 'be-docker', label: 'Docker', nodeType: 'topic', positionX: 40, positionY: 760, icon: 'box', description: 'Контейнеризация, compose', order: 11, stage: 'stage2', color: 'white', bullets: ['Dockerfile, multi-stage build', 'Docker Compose', 'Volumes и networks', 'Переменные окружения', 'Healthchecks', 'Оптимизация образов'], createStub: true },
  { nodeId: 'be-api', label: 'API: REST, GraphQL, gRPC', nodeType: 'topic', positionX: 240, positionY: 760, icon: 'globe', description: 'Проектирование API', order: 12, stage: 'stage2', color: 'white', bullets: ['REST best practices', 'OpenAPI / Swagger', 'GraphQL: schema, resolvers', 'gRPC, Protocol Buffers', 'WebSocket для real-time', 'Versioning API', 'Rate limiting'], createStub: true },
  { nodeId: 'be-orm', label: 'ORM и миграции', nodeType: 'topic', positionX: 440, positionY: 760, icon: 'database', description: 'Drizzle, Prisma, TypeORM', order: 13, stage: 'stage2', color: 'white', bullets: ['Drizzle ORM (type-safe)', 'Prisma ORM', 'TypeORM', 'Миграции expand-contract', 'Query builder vs raw SQL', 'Connection pooling'], createStub: true },
  { nodeId: 'be-auth', label: 'Аутентификация', nodeType: 'topic', positionX: 640, positionY: 760, icon: 'key-round', description: 'JWT, OAuth, сессии', order: 14, stage: 'stage2', color: 'white', bullets: ['Password hashing (bcrypt/argon2)', 'JWT: access + refresh', 'Сессии и cookies', 'OAuth 2.0, OpenID Connect', 'RBAC и ABAC', '2FA, WebAuthn'], createStub: true },
  { nodeId: 'be-queues', label: 'Очереди сообщений', nodeType: 'topic', positionX: 840, positionY: 760, icon: 'network', description: 'RabbitMQ, Kafka, BullMQ', order: 15, stage: 'stage2', color: 'white', bullets: ['BullMQ + Redis', 'RabbitMQ: exchanges, queues', 'Kafka: топики, партиции', 'Паттерны: pub/sub, work queue', 'Retry и dead-letter queue', 'Idempotency'], createStub: true },
  { nodeId: 'be-testing', label: 'Тестирование бэка', nodeType: 'topic', positionX: 40, positionY: 1060, icon: 'test-tube', description: 'Unit, integration, E2E', order: 16, stage: 'practice', color: 'pink', bullets: ['Jest / Vitest', 'Unit-тесты сервисов', 'Integration: real БД (testcontainers)', 'E2E через supertest', 'Моки внешних сервисов', 'TDD практика'], createStub: true },
  { nodeId: 'be-cicd', label: 'CI/CD', nodeType: 'topic', positionX: 260, positionY: 1060, icon: 'workflow', description: 'GitHub Actions, GitLab CI', order: 17, stage: 'practice', color: 'pink', bullets: ['GitHub Actions', 'GitLab CI', 'Build / Test / Deploy pipeline', 'Container registry', 'Semantic versioning', 'Rollback стратегии'], createStub: true },
  { nodeId: 'be-observ', label: 'Observability', nodeType: 'topic', positionX: 480, positionY: 1060, icon: 'monitor', description: 'Логи, метрики, трейсинг', order: 18, stage: 'practice', color: 'pink', bullets: ['Структурированные логи (pino)', 'Prometheus метрики', 'Grafana дашборды', 'OpenTelemetry', 'Трейсинг запросов', 'Алерты и SLO'], createStub: true },
  { nodeId: 'be-security', label: 'Безопасность', nodeType: 'topic', positionX: 700, positionY: 1060, icon: 'shield', description: 'OWASP Top 10, защита API', order: 19, stage: 'practice', color: 'pink', bullets: ['OWASP Top 10', 'SQL Injection, XSS, CSRF', 'Rate limiting и защита от DDoS', 'Secret management (Vault)', 'HTTPS и сертификаты', 'Аудит и пентесты'], createStub: true },
  { nodeId: 'be-microservices', label: 'Микросервисы', nodeType: 'topic', positionX: 40, positionY: 1340, icon: 'network', description: 'Разделение, коммуникация, паттерны', order: 20, stage: 'advanced', color: 'red', bullets: ['Когда микросервисы нужны', 'Service discovery', 'Circuit Breaker, Retry, Bulkhead', 'Saga pattern', 'Event-Driven Architecture', 'CQRS + Event Sourcing'], createStub: true },
  { nodeId: 'be-k8s', label: 'Kubernetes', nodeType: 'topic', positionX: 260, positionY: 1340, icon: 'cloud', description: 'Оркестрация контейнеров', order: 21, stage: 'advanced', color: 'red', bullets: ['Pods, Deployments, Services', 'ConfigMaps и Secrets', 'Ingress и Load Balancer', 'Helm charts', 'Автоскейлинг (HPA)', 'Monitoring в K8s'], createStub: true },
  { nodeId: 'be-load', label: 'Нагрузочное тестирование', nodeType: 'topic', positionX: 480, positionY: 1340, icon: 'zap', description: 'k6, Artillery, стресс-тесты', order: 22, stage: 'advanced', color: 'red', bullets: ['k6 или Artillery', 'Load / Stress / Spike тесты', 'Профилирование Node.js', 'Clinic.js', 'Оптимизация под нагрузку', 'Capacity planning'], createStub: true },
  { nodeId: 'be-interview', label: 'Подготовка к собеседованию', nodeType: 'topic', positionX: 700, positionY: 1340, icon: 'workflow', description: 'System design, алгоритмы', order: 23, stage: 'advanced', color: 'red', bullets: ['System design интервью', 'Алгоритмические задачи', 'Вопросы по Node internals', 'Опыт работы с БД', 'Опыт с продом', 'Soft skills'], createStub: true },
  { nodeId: 'be-growth-ml', label: 'ML / AI в бэкенде', nodeType: 'subtopic', positionX: 40, positionY: 1620, icon: 'zap', description: 'LLM API, vector DB', order: 24, stage: 'growth', color: 'gray', bullets: [], createStub: true },
  { nodeId: 'be-growth-web3', label: 'Web3 / Blockchain', nodeType: 'subtopic', positionX: 260, positionY: 1620, icon: 'network', description: 'Ethereum, смарт-контракты', order: 25, stage: 'growth', color: 'gray', bullets: [], createStub: true },
  { nodeId: 'be-growth-rust', label: 'Rust для бэка', nodeType: 'subtopic', positionX: 480, positionY: 1620, icon: 'server', description: 'Производительность, safety', order: 26, stage: 'growth', color: 'gray', bullets: [], createStub: true },
  { nodeId: 'be-growth-arch', label: 'Cloud-native design', nodeType: 'subtopic', positionX: 700, positionY: 1620, icon: 'cloud', description: 'Serverless, edge', order: 27, stage: 'growth', color: 'gray', bullets: [], createStub: true },
]

const backendEdges: EdgeSeed[] = [
  { edgeId: 'be-e-start-js', source: 'be-start', target: 'be-js' },
  { edgeId: 'be-e-start-ts', source: 'be-start', target: 'be-ts' },
  { edgeId: 'be-e-start-git', source: 'be-start', target: 'be-git-net' },
  { edgeId: 'be-e-start-node', source: 'be-start', target: 'be-node', animated: true },
  { edgeId: 'be-e-start-linux', source: 'be-start', target: 'be-linux' },
  { edgeId: 'be-e-js-algo', source: 'be-js', target: 'be-algo' },
  { edgeId: 'be-e-ts-nest', source: 'be-ts', target: 'be-nest', animated: true },
  { edgeId: 'be-e-git-arch', source: 'be-git-net', target: 'be-arch' },
  { edgeId: 'be-e-node-sql', source: 'be-node', target: 'be-sql' },
  { edgeId: 'be-e-linux-nosql', source: 'be-linux', target: 'be-nosql' },
  { edgeId: 'be-e-algo-docker', source: 'be-algo', target: 'be-docker' },
  { edgeId: 'be-e-nest-api', source: 'be-nest', target: 'be-api', animated: true },
  { edgeId: 'be-e-arch-orm', source: 'be-arch', target: 'be-orm' },
  { edgeId: 'be-e-sql-auth', source: 'be-sql', target: 'be-auth' },
  { edgeId: 'be-e-nosql-queues', source: 'be-nosql', target: 'be-queues' },
  { edgeId: 'be-e-docker-test', source: 'be-docker', target: 'be-testing' },
  { edgeId: 'be-e-api-cicd', source: 'be-api', target: 'be-cicd' },
  { edgeId: 'be-e-orm-obs', source: 'be-orm', target: 'be-observ' },
  { edgeId: 'be-e-auth-sec', source: 'be-auth', target: 'be-security' },
  { edgeId: 'be-e-test-micro', source: 'be-testing', target: 'be-microservices' },
  { edgeId: 'be-e-cicd-k8s', source: 'be-cicd', target: 'be-k8s' },
  { edgeId: 'be-e-obs-load', source: 'be-observ', target: 'be-load' },
  { edgeId: 'be-e-sec-interview', source: 'be-security', target: 'be-interview' },
  { edgeId: 'be-e-micro-ml', source: 'be-microservices', target: 'be-growth-ml' },
  { edgeId: 'be-e-k8s-web3', source: 'be-k8s', target: 'be-growth-web3' },
  { edgeId: 'be-e-load-rust', source: 'be-load', target: 'be-growth-rust' },
  { edgeId: 'be-e-interview-arch', source: 'be-interview', target: 'be-growth-arch' },
]

// ============================================================
// Helpers
// ============================================================

async function createNodes(
  payload: Payload,
  nodes: NodeSeed[],
  roadmapId: number,
): Promise<Map<string, number>> {
  const nodeIdToDbId = new Map<string, number>()

  for (const n of nodes) {
    let courseId: number | undefined

    if (n.existingCourseSlug) {
      const existing = await payload.find({
        collection: 'courses',
        where: { slug: { equals: n.existingCourseSlug } },
        limit: 1,
      })
      if (existing.docs.length > 0) {
        courseId = existing.docs[0].id
      } else {
        console.warn(
          `  [info] Existing course "${n.existingCourseSlug}" not found for node ${n.nodeId} → creating stub`,
        )
        const stub = await createStubCourse(payload, {
          title: n.label,
          slug: `rm-${n.nodeId}`,
          roadmapId,
          order: 1000 + n.order,
        })
        courseId = stub.id
      }
    } else if (n.createStub) {
      const stub = await createStubCourse(payload, {
        title: n.label,
        slug: `rm-${n.nodeId}`,
        roadmapId,
        order: 1000 + n.order,
      })
      courseId = stub.id
    }

    const bulletsData = n.bullets.length > 0 ? n.bullets.map((text) => ({ text })) : undefined

    const created = await payload.create({
      collection: 'roadmap-nodes',
      data: {
        nodeId: n.nodeId,
        label: n.label,
        nodeType: n.nodeType,
        roadmap: roadmapId,
        positionX: n.positionX,
        positionY: n.positionY,
        icon: n.icon,
        description: n.description,
        order: n.order,
        stage: n.stage,
        color: n.color,
        ...(courseId ? { course: courseId } : {}),
        ...(bulletsData ? { bullets: bulletsData } : {}),
      },
    })

    nodeIdToDbId.set(n.nodeId, created.id)
  }

  return nodeIdToDbId
}

async function createEdges(
  payload: Payload,
  edges: EdgeSeed[],
  nodeIdToDbId: Map<string, number>,
  roadmapId: number,
) {
  for (const e of edges) {
    const sourceId = nodeIdToDbId.get(e.source)
    const targetId = nodeIdToDbId.get(e.target)

    if (!sourceId || !targetId) {
      console.warn(
        `  [warn] Edge ${e.edgeId}: не найден узел (source=${e.source}, target=${e.target})`,
      )
      continue
    }

    await payload.create({
      collection: 'roadmap-edges',
      data: {
        edgeId: e.edgeId,
        roadmap: roadmapId,
        source: sourceId,
        target: targetId,
        edgeType: 'smoothstep',
        animated: e.animated ?? false,
      },
    })
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Засидивает роадмапы (узлы, рёбра, stub-курсы).
 * Идемпотентен: удаляет старые nodes/edges и пересоздаёт.
 *
 * @param payload — инициализированный Payload instance (НЕ импортирует payload.config.ts)
 */
export async function seedRoadmapNodes(payload: Payload): Promise<void> {
  console.log('=== Seed roadmaps ===')

  const frontendRoadmap = await findOrCreateRoadmap(payload, {
    title: 'Frontend React',
    slug: 'frontend-react',
    order: 1,
    miroEmbedUrl: 'https://miro.com/app/live-embed/uXjVJaQFRcw=/?embedMode=view_only_without_ui',
  })
  console.log(`Frontend roadmap: id=${frontendRoadmap.id}`)

  const backendRoadmap = await findOrCreateRoadmap(payload, {
    title: 'Backend Node.js',
    slug: 'backend-nodejs',
    order: 2,
    miroEmbedUrl: 'https://miro.com/app/live-embed/uXjVJaQFRcw=/?embedMode=view_only_without_ui',
  })
  console.log(`Backend roadmap: id=${backendRoadmap.id}`)

  // Идемпотентность: удаляем старые данные
  for (const rm of [frontendRoadmap, backendRoadmap]) {
    await payload.delete({
      collection: 'roadmap-edges',
      where: { roadmap: { equals: rm.id } },
    })
    await payload.delete({
      collection: 'roadmap-nodes',
      where: { roadmap: { equals: rm.id } },
    })
  }
  console.log('Cleaned up old nodes/edges')

  const feNodeDbIds = await createNodes(payload, frontendNodes, frontendRoadmap.id)
  console.log(`Created ${feNodeDbIds.size} Frontend nodes`)

  const beNodeDbIds = await createNodes(payload, backendNodes, backendRoadmap.id)
  console.log(`Created ${beNodeDbIds.size} Backend nodes`)

  await createEdges(payload, frontendEdges, feNodeDbIds, frontendRoadmap.id)
  console.log(`Created ${frontendEdges.length} Frontend edges`)

  await createEdges(payload, backendEdges, beNodeDbIds, backendRoadmap.id)
  console.log(`Created ${backendEdges.length} Backend edges`)

  console.log('\n=== Seed roadmaps complete ===')
}
