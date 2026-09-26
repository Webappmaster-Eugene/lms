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

## Продолжение работы

Состояние незавершённой задачи хранить в .codex/state/handoff.md, без секретов.
Перед финалом проверить git diff, выполнить self-review и подходящие тесты.
После изменения источников Claude выполнить pnpm codex:sync и pnpm codex:doctor.
