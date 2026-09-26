#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { repo, sync } from "./harness.mjs";
import { trustProjectHooks } from "./trust.mjs";

const seed = (path, value) => {
  const target = join(repo, path);
  mkdirSync(dirname(target), { recursive: true });
  if (!existsSync(target)) writeFileSync(target, value);
};

seed(".codex/memory/MEMORY.md", `# Память проекта LMS

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
`);

seed(".agents/skills/project-harness/SKILL.md", `---
name: project-harness
description: Настроить, проверить или восстановить локальную инфраструктуру Codex для LMS, память, зависимости, MCP и паритет с Claude.
---

Работай из корня Git-репозитория app. Прочитай [руководство](../../../docs/CODEX.md).
Сначала pnpm codex:doctor. После изменения источников — pnpm codex:sync.
Для первого запуска или новой машины — pnpm codex:setup после pnpm install в app
и npm install в landing. Конфиги только локальные; из глобального ~/.codex
меняется лишь доверие к hooks этого проекта — через pnpm codex:trust (штатный
config API Codex), после каждого изменения hooks или путей в config.toml.
Проверяй pnpm codex:test и pnpm lint. Для полного quality gate — pnpm codex:verify;
он включает сборку, которой нужны DATABASE_URL и PAYLOAD_SECRET. Для MCP handshake
и tools/list — pnpm codex:mcp-check; это не проверка токенов API и не разрешение
выполнять реальные операции с данными. Проверяй drift, читаемость ссылок скиллов,
загрузку ролей и конфига самим Codex через pnpm codex:native-check.
При недоступном OAuth/Chrome честно обозначай, что требуется интерактивное подключение.
Проверки и логи сохраняются в .codex/state и не попадают в Git.
`);

const frontend = join(homedir(), ".claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design");
const skillTarget = join(repo, ".agents/skills/frontend-design");
if (!existsSync(join(skillTarget, "SKILL.md"))) {
  if (!existsSync(join(frontend, "skills/frontend-design/SKILL.md"))) throw new Error("Installed Claude frontend-design source is missing; restore its checked-in Codex copy.");
  mkdirSync(skillTarget, { recursive: true });
  writeFileSync(join(skillTarget, "SKILL.md"), readFileSync(join(frontend, "skills/frontend-design/SKILL.md"), "utf8") + "\n## LMS project integration\n\nRead AGENTS.md. This is the MentorCareer LMS: Next.js App Router, React 19 server components by default, Tailwind 4 with the tokens in src/app/globals.css, and the existing ui primitives in src/components. Interface copy is Russian. Preserve the current design tokens, dark theme handling (next-themes) and accessibility attributes unless the task asks for a redesign. Do not add a component library for a small change. Verify changed UI with pnpm test (jsdom components project) and, when layout matters, with a real browser through the chrome-devtools MCP.\n");
  copyFileSync(join(frontend, "LICENSE"), join(skillTarget, "LICENSE.txt"));
}
sync();
// Untrusted hooks are skipped silently by Codex: memory and guardrails would be absent.
// Throwaway checkouts in tests must not leave trust entries in ~/.codex.
if (process.env.LMS_CODEX_SKIP_TRUST === "1") {
  console.log("Hook trust skipped (LMS_CODEX_SKIP_TRUST=1).");
} else {
  try {
    const { total } = await trustProjectHooks();
    console.log(`Project hooks trusted: ${total}.`);
  } catch (error) {
    console.error(`Hook trust failed: ${error.message}. Run pnpm codex:trust or trust the hooks in the Codex UI.`);
    process.exitCode = 1;
  }
}
