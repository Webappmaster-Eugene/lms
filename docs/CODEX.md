# Codex в LMS

Настройка локальна для рабочего каталога `107.lms` и вложенного репозитория `app`.
Конфигурация живёт только в проекте; глобальный `~/.codex` и настройки Claude не
меняются. Штатный CLI хранит у себя лишь доверие к каталогам и хеши hooks.

## Запуск

```sh
cd /path/to/107.lms/app
pnpm codex:doctor
pnpm codex
```

`pnpm codex -- <аргументы Codex>` запускает CLI в рабочем каталоге и
предварительно проверяет источники конфигурации. При первом запуске подтверди
доверие к обеим папкам и к hooks через интерфейс Codex. В приложении или IDE
открывай `107.lms` либо `app` — инструкции и скиллы одинаковы в обоих случаях.
Изменение файлов не меняет разрешения уже запущенной сессии; политики
организации и runtime имеют приоритет.

Профиль `lms`: сеть включена, `approval_policy = never`, запись разрешена в папке
проекта, включая `.git`, `.codex`, `.agents`. Запись во весь домашний каталог
этим не разрешается. Кеши npm и pnpm уводятся в `.codex/state`.

Контекст ограничен 600k токенов (`model_context_window`), авто-компакт
начинается с 540k (`model_auto_compact_token_limit`) — раньше, чем окно
заполнится. Это аналог `autoCompactWindow = 600000` в `.claude/settings.json`.
Усилие рассуждений `high` совпадает с `effortLevel` Claude; до шести ролей
работают параллельно, чтобы пять ревьюеров `review_multi` шли одновременно.

## Доверие к hooks

Codex хранит доверие к hooks только в `~/.codex/config.toml` (`[hooks.state]`),
а недоверенные hooks молча пропускает: без них не подгружается память и не
работает защита команд. `pnpm codex:trust` записывает ровно те записи, что и
диалог доверия, через штатный `config/batchWrite` и только для hooks этого
checkout, вызывающих `scripts/codex/hooks.mjs`. Хеш hook меняется вместе с
`config.toml`, поэтому после `pnpm codex:sync` с изменением hooks или путей
доверие выдаётся заново. `codex:setup` делает это сам.

## Что перенесено

| Возможность Claude | Эквивалент Codex |
| --- | --- |
| Полный `CLAUDE.md` | `AGENTS.md` + синхронизируемый `.codex/context/CLAUDE.md` |
| Проектные скиллы | `.agents/skills/*`: адаптеры читают оригиналы в `.claude/skills` |
| Плагин frontend-design | Локальная копия с лицензией и привязкой к UI проекта |
| Субагенты `.claude/agents` | `.codex/agents/*.toml` из тех же определений ролей |
| Контекст `expert_info/lms` | Копии в `.codex/context/lms` для отдельного checkout |
| Серверы `.mcp.json` | Проектные MCP в `.codex/config.toml`, credentials читает адаптер |
| WebStorm MCP | Подключение из текущего Claude-каталога, если оно настроено |
| Проверки качества | `pnpm codex:verify` поверх `pnpm smoke` и сборки лендинга |
| Продолжение и память | `.codex/memory/MEMORY.md`, локальный `.codex/state/handoff.md` |
| Восстановление контекста | Hook SessionStart, включая resume и compact |
| Auto-memory Claude | SessionStart подмешивает `~/.claude/projects/<slug>/memory` вживую |
| Deny-список Claude | Hook PreToolUse: правила `Bash(...)` из настроек Claude и базовый список |
| `autoCompactWindow = 600000` | `model_context_window = 600000`, компакт с 540k |
| `effortLevel = high` | `model_reasoning_effort = "high"` |
| Проверка перед завершением | Hook Stop: drift источников и `git diff --check` |
| Диагностика инфраструктуры | `codex:doctor`, `codex:test`, `codex:mcp-check`, `codex:native-check` |

Имена моделей Claude не копируются: роли наследуют выбранную модель Codex.
Качество обеспечивают общие правила, self-review и фактические проверки. Hook
Stop не заменяет quality gate и не утверждает, что тесты прошли.

## Синхронизация и воспроизводимость

```sh
pnpm codex:setup         # первичное создание памяти, скиллов и конфигурации
pnpm codex:sync          # обновить контекст, адаптеры, роли и machine-specific config
pnpm codex:doctor        # проверить drift и зависимости без сети
pnpm codex:test          # проверить поведение самого harness
pnpm codex:verify        # полный локальный набор проверок
pnpm codex:mcp-check     # handshake + tools/list по каждому MCP
pnpm codex:browser-check # реальный list_pages; в отчёте только статус и число вкладок
pnpm codex:native-check  # фактическая загрузка config/skills/hooks/MCP и окна 600k
pnpm codex:trust         # доверие к hooks проекта после изменения config.toml
```

На новой машине: `pnpm install` в `app`, `npm install` в `app/landing`, затем
`pnpm codex:setup`. Нужен Node.js 22+ и pnpm 10 (обычно через corepack).
`config.toml` содержит абсолютные пути этой машины и игнорируется Git; шаблон,
скрипты, скиллы, роли, безопасный контекст и начальная память хранятся в Git.
Источники и их SHA-256 перечислены в `.codex/sources.json`, сгенерированные
файлы — в `.codex/generated.json`. Секреты туда не копируются. `.codex/state`
содержит только локальные логи, отчёты и handoff и не попадает ни в Git, ни в
Docker-контекст.

`doctor` контролирует: drift источников Claude и сгенерированных файлов,
совпадение `config.toml` на обоих уровнях, наличие скиллов и читаемость ссылок
внутри них, ссылки рабочего каталога на `app`, наличие ролей, память, контекст,
установленные зависимости обоих пакетов, доступность pnpm и версию Node.

Повторный `setup` сохраняет существующую память. Исчезнувшие исходные роли и
скиллы удаляются только при совпадении с предыдущей генерацией: локальные
изменения вызывают явный конфликт вместо потери файла. Эти сценарии покрыты
изолированным тестом, который создаёт временный checkout и намеренно портит его
файлы (`pnpm codex:test`).

## Роли

Определения ролей лежат в `../expert_info/lms/agents/*.md` в формате субагентов
Claude (frontmatter `name`, `description`, `tools`) и одновременно служат
источником для `.codex/agents/*.toml`. Копия хранится в
`.codex/context/lms/agents` и используется, когда внешний каталог недоступен.
Роль без `Bash` в списке инструментов получает профиль `lms-review` — только
чтение и сеть. Ревьюеры не редактируют проект; findings требуют `файл:строка`,
severity, confidence и сценария сбоя.

## MCP и границы переноса

`codex:mcp-check` проверяет подключение и каталог инструментов, но не право
токена на реальную запись. Итог — `.codex/state/mcp-report.json`;
`codex:native-check` пишет `.codex/state/native-report.json`.

Определения берутся из `.mcp.json` рабочего каталога, затем `app/.mcp.json`,
затем `.codex/mcp.local.json` (файл игнорируется Git и переопределяет предыдущие).
Секреты из этих файлов попадают только в дочерний процесс MCP-сервера: в
`config.toml`, память и отчёты они не копируются, что проверяется тестом.
Сервер GitHub в проект не переносился — если он нужен, добавь его в
`.codex/mcp.local.json` со своим токеном и выполни `pnpm codex:sync`.

Chrome DevTools MCP использует уже запущенный браузер: в Chrome 144+ нужно
включить `chrome://inspect/#remote-debugging` и разрешить подключение. Это
согласие самого браузера, разрешениями Codex оно не заменяется. Для второго
профиля (например, Яндекс Браузера) добавь отдельный сервер с
`--userDataDir` в `.codex/mcp.local.json`. Cookies и сессии не извлекать.
После смены профиля перезапусти MCP: запущенный процесс хранит старые аргументы.

Playwright MCP работает с отдельным профилем и не подтверждает состояние
личного браузера пользователя.

## Границы

`pnpm codex:verify` включает `pnpm build` и сборку лендинга. Сборке нужны
`DATABASE_URL` и `PAYLOAD_SECRET`: без них проверка падает, и это не повод
объявлять её пройденной. Интеграция с реальной БД, миграции на копии прода и
Docker-сборка — отдельные проверки, описанные в скиллах `deploy-check`
и `prod-check`.

## Источники форматов

- [Проектные настройки Codex](https://learn.chatgpt.com/docs/config-file/config-advanced)
- [Permission profiles](https://learn.chatgpt.com/docs/permissions)
- [Skills](https://developers.openai.com/codex/skills)
- [Hooks и доверие к ним](https://learn.chatgpt.com/docs/hooks)
- [MCP](https://learn.chatgpt.com/docs/extend/mcp)
- [Подключение к открытому Chrome](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/advanced-usage.md)
