---
name: deploy-check
description: "Преддеплойная проверка LMS — линтер, типы, тесты, сборка, миграции Payload, env и секреты. Используй перед push в main и перед выкатом через Dokploy."
---

Прочитай [оригинальный workflow](../../../.claude/skills/deploy-check/SKILL.md) целиком и выполни его с адаптацией ниже. Пути src/, tests/, landing/ и команды pnpm/git относятся к корню репозитория app. $ARGUMENTS означает запрос пользователя, не shell-переменную.

Команды выполняй через pnpm из корня репозитория app: pnpm smoke — это lint, typecheck, test и build. pnpm codex:verify дополнительно проверяет сам harness и сборку лендинга. Сборка требует переменных окружения Payload (DATABASE_URL, PAYLOAD_SECRET): при их отсутствии отметь пропуск явно, не выдавай его за успех. Docker build выполняй при изменениях Docker/deploy и доступном daemon. Право на push владелец дал в CLAUDE.md; push в main запускает выкат Dokploy.
