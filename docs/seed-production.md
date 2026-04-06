# Seed данных на Production LMS

## Архитектура

```
┌─ Local dev machine ─┐     SSH tunnel      ┌─ Dokploy server ─────────────┐
│                      │ ◄─────────────────► │                              │
│  seed-roadmaps.ts    │   port 15432        │  socat (port 25432)          │
│  DATABASE_URL=       │                     │     ↓ dokploy-network        │
│    localhost:15432    │                     │  lms-mentor-db (port 5432)   │
│                      │                     │  lms-mentor-app              │
└──────────────────────┘                     └──────────────────────────────┘
```

**Почему нужен socat**: PostgreSQL находится в Docker overlay-сети `dokploy-network`. Порт 5432 не проброшен на хост. Прямой SSH-туннель к IP контейнера не работает (overlay-сети не маршрутизируются с хоста). Socat-контейнер на той же сети пробрасывает порт на хост.

## Когда нужен ручной seed

1. Первый деплой с новыми seed-данными
2. Обновление существующих seed-данных (новые узлы/рёбра роадмапов)
3. Восстановление после очистки данных

**Когда НЕ нужен**: при обычном деплое без изменения seed-данных — `onInit` автоматически засидит данные, если таблица `roadmap_nodes` пуста.

## Быстрый старт

```bash
# 1. SSH доступ (логин из expert_info/ssh_access.txt)
SSH_PASS="<пароль из ssh_access.txt>"

# 2. Поднять прокси
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no root@217.199.254.38 \
  "docker run -d --rm --name lms-db-proxy \
   --network dokploy-network -p 25432:5432 \
   alpine/socat TCP-LISTEN:5432,fork,reuseaddr TCP:lms-mentor-db:5432"

# 3. SSH-туннель
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no -f -N \
  -L 15432:localhost:25432 root@217.199.254.38

# 4. Seed (из директории lms/)
cd lms
DATABASE_URL=postgresql://lms:changeme@localhost:15432/lms_platform \
  pnpm exec payload run src/seed-roadmaps.ts

# 5. Cleanup
sshpass -p "$SSH_PASS" ssh root@217.199.254.38 "docker stop lms-db-proxy"
kill $(lsof -t -i:15432) 2>/dev/null
```

## Claude Code

Используйте команду `/seed-production` — она автоматизирует все шаги выше.

## Auto-seed (onInit)

В `payload.config.ts` добавлен auto-seed: при старте приложения, если таблица `roadmap-nodes` пуста, данные засидятся автоматически. Это покрывает сценарий первого деплоя и пересоздания БД.

Логика:
```typescript
// payload.config.ts → onInit
const { totalDocs: nodesCount } = await payload.count({ collection: 'roadmap-nodes' })
if (nodesCount === 0) {
  const { seedRoadmapNodes } = await import('./lib/seed-roadmap-runner')
  await seedRoadmapNodes(payload)
}
```

## Структура файлов seed

```
src/
├── seed-roadmaps.ts           # CLI entry-point (thin wrapper)
├── lib/
│   ├── seed-roadmap-runner.ts  # Логика + данные (экспортирует seedRoadmapNodes)
│   └── seed-helpers.ts         # Общие хелперы (findOrCreateCourse, createStubCourse)
└── payload.config.ts           # onInit → auto-seed
```

## Важные нюансы

- **`.env` указывает на другую БД** — `DATABASE_URL` в `.env` не совпадает с production Docker-базой. Всегда передавайте `DATABASE_URL` явно при seed.
- **Production DATABASE_URL**: `postgresql://lms:changeme@lms-mentor-db:5432/lms_platform`
- **Seed идемпотентен** — удаляет старые nodes/edges и пересоздаёт
- **Stub-курсы** создаются для узлов без реальных курсов (для кликабельности графа)
