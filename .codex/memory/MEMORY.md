# Память проекта LMS

Проверено 2026-09-21. Только устойчивые факты; текущие проверки перепроверять.

- Workspace: 107.lms; Git, pnpm и весь код находятся в app/. Родительская папка не Git.
- Владелец разрешил локальную настройку Codex и необходимые доступы в проекте.
  Профиль lms разрешает запись проекта, .git/.codex/.agents и сеть без запросов.
  Текущая управляемая сессия может иметь более строгую политику; конфиг её не отменяет.
- Источник полной инструкции: ../CLAUDE.md; копия .codex/context/CLAUDE.md.
  Исходные скиллы: .claude/skills. Роли: ../expert_info/lms/agents с копией в
  .codex/context/lms/agents.
- Пакетный менеджер pnpm 10 (packageManager в package.json), обычно через corepack.
  Лендинг landing/ — отдельный npm-пакет на Astro со своим package-lock.json.
- Прод: Dokploy на 217.199.254.38, compose-приложение lms-mentor-<hash>;
  learn.mentorcareer.ru — Next+Payload, promo.mentorcareer.ru — лендинг.
  Push в main = деплой. Хеш в имени приложения меняется, имена находить динамически.
- Миграции Payload применяются на старте контейнера (prodMigrations), поэтому
  несовместимая миграция роняет прод. Схема изменений — expand-contract.
- Postgres локально не предполагается. Тесты vitest (проекты unit и components)
  не требуют БД; сборка next build требует DATABASE_URL и PAYLOAD_SECRET.
- Тренажёр выполняет пользовательский код в isolated-vm; scripts/build-harness.mjs
  собирает его песочницу и не имеет отношения к harness Codex в scripts/codex.
- Локальный MCP-конфиг может содержать credentials: адаптер читает их при запуске
  и не копирует в Git, память и отчёты. Токен GitHub MCP в проект не переносился.

## Прод: окружение и почта (из памяти Claude, проверено 2026-09-22)

- Env прода правится только во вкладке Environment приложения lms-mentor в
  Dokploy UI: .env в compose-каталоге Dokploy перегенерирует при каждом деплое,
  правка по ssh доживает лишь до следующего push в main. После экстренной
  правки по ssh обязательно сказать, что то же нужно исправить в UI.
- Панель Dokploy переехала на deploy.nadtocheev.ru (старый домен удалён из DNS);
  вебхуки GitHub App указывают на https://deploy.nadtocheev.ru/api/deploy/github.
  Если автодеплой молча не сработал — сначала журнал доставок вебхука.
- Почта: VK WorkSpace, smtp.mail.ru:465, ящик noreply@mentorcareer.ru. SMTP
  принимает только «пароль для внешнего приложения» (ответ 535 ... parol
  prilozheniya на обычный пароль). SMTP_HOST, SMTP_USER, SMTP_PASS заполнять
  строго вместе: неполная конфигурация раньше роняла приложение.
- Живая память Claude (~/.claude/projects/<slug>/memory) подмешивается hook
  SessionStart при каждом старте и после compaction; копировать её сюда вручную
  нужно только для фактов, которые должны жить в Git.

## Инфраструктура Codex (2026-09-26)

- Контекст ограничен 600k (model_context_window), авто-компакт с 540k —
  паритет с autoCompactWindow = 600000 у Claude. Усилие рассуждений high.
- Hook PreToolUse повторяет deny-список Claude (sudo, git reset --hard,
  git clean, rm -rf системных и домашних путей, dd, mkfs, diskutil erase...).
  Отказ хука — не повод обходить его другой формулировкой команды.
- Codex молча пропускает недоверенные hooks. После изменения hooks или путей
  в config.toml: pnpm codex:sync, затем pnpm codex:trust и pnpm codex:native-check.

## Навигация администратора (2026-10-04)

- Справочник административных пунктов: `src/lib/admin-navigation.ts`;
  полноту охвата коллекций и служебных страниц проверяет
  `tests/smoke/adminNavigation.smoke.test.ts`. Пользовательские переходы описаны
  в `docs/admin-navigation.md`.
- Custom view Payload сам по себе не получает меню админки. Редактор обёрнут
  в `DefaultTemplate` и проверяет роль через `initPageResult.req.user`;
  источник: `src/components/roadmap-editor/RoadmapEditorView.tsx`.
- Цвета фона Payload переопределять только для `html[data-theme='dark']`:
  глобальный тёмный фон в `:root` делает текст светлой темы нечитаемым.
  Источник: `src/app/(payload)/custom.scss`, браузерная проверка контраста
  в `tests/e2e/specs/admin-navigation.spec.ts`.

## Управление данными через агентов (2026-10-04)

- Общий скилл `lms-content`: источник `.claude/skills/lms-content/SKILL.md`,
  Codex-адаптер `.agents/skills/lms-content/SKILL.md`; сценарии вынесены в
  `references/` оригинала. Синхронизация — `pnpm codex:sync`.
- Повторяемая проверка операций —
  `pnpm test:integration tests/integration/cms/contentWorkflows.test.ts`:
  настоящий REST Payload, сохранение ID/slug/массивов, публикация, контакты,
  приглашение/пароль и серверный изолят. Источник — соответствующий тест.
- Не считать `isActive` блокировкой входа: флаг используется в лидерборде;
  логин при false подтверждён интеграционным тестом. Источник: Users.ts и
  `contentWorkflows.test.ts`.
- У `roadmap-nodes`/`roadmap-edges` нет флага публикации, REST-read разрешён
  вошедшим пользователям даже для черновой родительской карты. У FAQ read
  публичный, включая черновики. Источник: коллекции и `contentWorkflows.test.ts`.
- Docker-браузеру для SQL-проверок регистрации нужен `TEST_PG_URL` через
  `host.docker.internal`, а не loopback контейнера. `visual-docker.mjs`
  передаёт преобразованный адрес только браузерному контейнеру; сервер LMS
  сохраняет исходный адрес. Источник: `browserServerUrl` в `scripts/test-db.mjs`
  и `tests/unit/testBrowserDatabaseUrl.test.ts`.

## Описания учебного контента (2026-10-04)

- Описание курса — Lexical JSON, описание урока — строка с лимитом 300
  символов. Источники: `src/payload/collections/Courses.ts`,
  `src/payload/collections/Lessons.ts`.
- Описание урока выводится под заголовком урока и в программе курса.
  Общее `course.description` теперь выводится через официальный RichText
  на странице курса. Браузерная проверка — `content-management.spec.ts`. Источники: `src/app/(frontend)/lessons/[slug]/page.tsx`
  и `src/app/(frontend)/courses/[slug]/page.tsx`.
- При массовом дополнении описаний сначала проверить все страницы API,
  сохранять только пустые поля, а после записи перечитать каталог и проверить
  сохранность контента, связей и публикации. Заполненные тексты не заменять
  из-за того, что другие записи пустые. Источник: `.claude/skills/lms-content/SKILL.md`.

## Редакторы учебной программы в LMS (2026-10-04)

- Обычное управление курсами и уроками находится в `/manage`, вход из меню
  «Учебный контент» или из роадмапа «Курсы и уроки». CMS вынесена в отдельный
  пункт «CMS и настройки» для расширенных операций. Источник:
  `src/lib/admin-navigation.ts`, `docs/admin-navigation.md`.
- Редакторы — `/manage/courses/<id>` (программа), `/settings`,
  `/manage/lessons/<id>`. Блоки и описания сохраняются нативными, сложный
  неподдерживаемый richtext остаётся без изменений. Источники:
  `src/components/content-management/`, `src/app/(frontend)/manage/`.
- Запись идёт через `/api/manage/content/`: admin auth, проверка родителей,
  row lock и expectedUpdatedAt защищают от потери изменений; Idempotency-Key
  обеспечивает повтор создания после потерянного ответа. Источники:
  `src/lib/content-management/mutations.ts`, соответствующие integration tests.
- Мутации схемы для редакторов не требуются. Состояние выката хранится отдельно
  в handoff; URL нового интерфейса проверять после согласованного деплоя.

## Раскладка всех роадмапов (2026-10-05)

- Учебные карты размещают карточки автоматически по реальным browser measured
  width/height. Исходные позиции задают ряды и порядок, данные БД не перезаписываются.
  Pure геометрия и маршруты: `src/lib/roadmap-layout.ts`; UI:
  `src/components/roadmap/use-roadmap-layout.ts`, `RoadmapRouteEdge.tsx`.
- При контролируемых ReactFlow nodes передавать `measured` обратно вместе с
  новой позицией; `width`/`height` не фиксировать в DOM wrapper. Иначе adoptUserNodes
  сбрасывает размеры, и карта остаётся в загрузке. Источник — код установленного
  @xyflow/system adoptUserNodes и реальная browser regression.
- Панель поиска/этапов расположена вне plot viewport; начальный вид читаемый,
  общий обзор и fullscreen доступны отдельно. Темы имеют keyboard button role,
  полный список материалов — в панели. Источники: `RoadmapGraph.tsx`,
  `tests/e2e/specs/roadmap-layout.spec.ts`.
- Реальный размер корпуса воспроизводился в одноразовой БД безопасным ignored
  importer; audit/counts/screenshots в `.codex/state/roadmap-browser-report.json`.
  Состояние выката хранится в handoff; новые UI возможности на проде проверять
  только после согласованного деплоя.

## Продолжение работы

Состояние незавершённой задачи хранить в .codex/state/handoff.md, без секретов.
Перед финалом проверить git diff, выполнить self-review и подходящие тесты.
После изменения источников Claude выполнить pnpm codex:sync и pnpm codex:doctor.
