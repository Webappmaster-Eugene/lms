# Seed данных на Production LMS

## Архитектура

С 19.10.2026 база прода живёт в домашней VM (Dokploy-сервер `serverlink-vm`, адрес `10.77.0.2` в
туннеле AmneziaWG), а VDS `217.199.254.38` служит прыжковым хостом: снаружи VM напрямую не видна.

```
┌─ Local dev machine ─┐   SSH -J через VDS    ┌─ Домашняя VM (serverlink-vm) ─┐
│                      │ ◄──────────────────► │                                │
│  seed-roadmaps.ts    │   localhost:15432    │  socat 127.0.0.1:25432         │
│  DATABASE_URL=       │                      │     ↓ dokploy-network          │
│    localhost:15432   │                      │  lms-mentor-db (port 5432)     │
│                      │                      │  lms-mentor-app                │
└──────────────────────┘                      └────────────────────────────────┘
```

**Почему нужен socat**: PostgreSQL находится в Docker overlay-сети `dokploy-network`. Порт 5432 не проброшен на хост. Прямой SSH-туннель к IP контейнера не работает (overlay-сети не маршрутизируются с хоста). Socat-контейнер на той же сети пробрасывает порт на `127.0.0.1` VM — наружу он не открыт.

## Когда нужен ручной seed

1. Первый деплой с новыми seed-данными
2. Обновление существующих seed-данных (новые узлы/рёбра роадмапов)
3. Восстановление после очистки данных

**Когда НЕ нужен**: при обычном деплое без изменения seed-данных — `onInit` автоматически засидит данные, если таблица `roadmap_nodes` пуста.

## Быстрый старт

Вход по SSH-ключу: на VDS — как `root`, в VM — как `eugene` (в группе `docker`). Пароль не нужен.

```bash
prod() { ssh -J root@217.199.254.38 eugene@10.77.0.2 "$@"; }

# 1. Поднять прокси к БД (слушает только 127.0.0.1 внутри VM)
prod "docker run -d --rm --name lms-db-proxy \
   --network dokploy-network -p 127.0.0.1:25432:5432 \
   alpine/socat:1.8.1.1 TCP-LISTEN:5432,fork,reuseaddr TCP:lms-mentor-db:5432"

# 2. SSH-туннель через VDS
ssh -J root@217.199.254.38 -f -N -L 15432:127.0.0.1:25432 eugene@10.77.0.2

# 3. Пароль роли lms — из env стека в VM, в вывод и историю он не попадает
export PGPASSWORD="$(prod 'grep -m1 "^DB_PASSWORD=" /etc/dokploy/compose/lms-mentor-home-*/code/.env | cut -d= -f2-')"

# 4. Seed (из корня репозитория)
DATABASE_URL="postgresql://lms:${PGPASSWORD}@localhost:15432/lms_platform" \
  pnpm exec payload run src/seed-roadmaps.ts

# 5. Cleanup
prod "docker stop lms-db-proxy"
kill $(lsof -t -i:15432) 2>/dev/null
unset PGPASSWORD
```

Сид пишет в базу прода — запускать только с согласия владельца прода (см. `CLAUDE.md`, раздел 3).

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
- **Production DATABASE_URL** внутри стека: `postgresql://lms:<DB_PASSWORD>@lms-mentor-db:5432/lms_platform`; пароль — `DB_PASSWORD` в Dokploy UI (compose `mentor-home`), см. `db-password-rotation.md`
- **Seed идемпотентен** — удаляет старые nodes/edges и пересоздаёт
- **Stub-курсы** создаются для узлов без реальных курсов (для кликабельности графа)
