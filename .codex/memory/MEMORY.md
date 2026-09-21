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

## Продолжение работы

Состояние незавершённой задачи хранить в .codex/state/handoff.md, без секретов.
Перед финалом проверить git diff, выполнить self-review и подходящие тесты.
После изменения источников Claude выполнить pnpm codex:sync и pnpm codex:doctor.
