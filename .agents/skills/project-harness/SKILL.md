---
name: project-harness
description: Настроить, проверить или восстановить локальную инфраструктуру Codex для LMS, память, зависимости, MCP и паритет с Claude.
---

Работай из корня Git-репозитория app. Прочитай [руководство](../../../docs/CODEX.md).
Сначала pnpm codex:doctor. После изменения источников — pnpm codex:sync.
Для первого запуска или новой машины — pnpm codex:setup после pnpm install в app
и npm install в landing. Конфиги только локальные, глобальные ~/.codex не изменять.
Проверяй pnpm codex:test и pnpm lint. Для полного quality gate — pnpm codex:verify;
он включает сборку, которой нужны DATABASE_URL и PAYLOAD_SECRET. Для MCP handshake
и tools/list — pnpm codex:mcp-check; это не проверка токенов API и не разрешение
выполнять реальные операции с данными. Проверяй drift, читаемость ссылок скиллов,
загрузку ролей и конфига самим Codex через pnpm codex:native-check.
При недоступном OAuth/Chrome честно обозначай, что требуется интерактивное подключение.
Проверки и логи сохраняются в .codex/state и не попадают в Git.
