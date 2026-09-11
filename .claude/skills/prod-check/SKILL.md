---
name: prod-check
description: Диагностика прода LMS (lms.nadtocheev.ru / promo.nadtocheev.ru) через SSH — Dokploy, контейнеры, Traefik, логи, БД. Используй когда «прод не открывается», «сайт лежит», «проверь логи LMS», «404 на проде».
---

Подключись к проду и определи, что именно сломано. Прод — Dokploy на `root@217.199.254.38`, доступ описан в `expert_info/ssh_access.txt` (файл лежит на уровень выше репозитория, в корне рабочего каталога).

## Контекст

LMS развёрнута как **Dokploy compose**-приложение, а не как отдельный проект docker compose:

| Что | Значение |
|---|---|
| `appName` | `lms-mentor-3ghbnk` |
| `composeId` | `hUkN0SBfId0nogeR4yhgc` |
| Источник | GitHub `Webappmaster-Eugene/lms`, ветка `main`, сборка на сервере |
| Каталог кода | `/etc/dokploy/compose/lms-mentor-3ghbnk/code` |
| Сервисы | `lms-mentor-app` (Next+Payload, 3000), `lms-mentor-db` (postgres:16), `lms-mentor-landing` (nginx, 80) |
| Домены | `lms.nadtocheev.ru → lms-mentor-app:3000`, `promo.nadtocheev.ru → lms-mentor-landing:80` |
| Тома | `lms-mentor-3ghbnk_lms-pgdata`, `lms-mentor-3ghbnk_lms-media` |

Хеш в имени (`3ghbnk`) меняется при пересоздании приложения — **находи имена динамически**, не полагайся на константу.

На том же сервере живут стеки `podborminute-*` (25+ контейнеров) и `calendarvoiceplanner-*`. Фильтруй по `lms-mentor`, иначе утонешь в чужих контейнерах.

## Шаги

### 1. Внешняя проверка — что видно снаружи

```bash
for u in https://lms.nadtocheev.ru/api/health https://lms.nadtocheev.ru/login https://promo.nadtocheev.ru/; do
  curl -s -o /dev/null -w "%{http_code} $u\n" -L --max-time 20 "$u"
done
```

Как читать ответ:

| Что видно | Что это значит |
|---|---|
| `200` | Сервис жив, иди в шаг 4 смотреть логи по существу |
| `404` и тело ровно `404 page not found` | **Это ответ Traefik, а не приложения.** Роутера для домена нет → контейнер не запущен. Шаг 2 |
| `502` / `503` | Роутер есть, контейнер за ним не отвечает — упал или ещё стартует. Шаг 3 |
| `000` / таймаут | Сеть или DNS. Проверь `dig +short <host>` — должно быть `217.199.254.38` |

### 2. Стек не запущен — проверь статус в Dokploy

```bash
ssh root@217.199.254.38 'docker ps -a --format "{{.Names}}\t{{.Status}}" | grep -i lms-mentor || echo "КОНТЕЙНЕРОВ НЕТ"'
ssh root@217.199.254.38 'docker volume ls | grep -i lms-mentor'
```

Если контейнеров нет, а тома есть — приложение снято с выката, данные целы. Подтверди статусом в БД Dokploy:

```bash
ssh root@217.199.254.38 'docker exec $(docker ps -q -f name=dokploy-postgres) \
  psql -U dokploy -d dokploy -c "select \"appName\", \"composeStatus\" from compose where \"appName\" like '"'"'lms-mentor%'"'"';"'
```

`composeStatus = idle` — приложение не развёрнуто. Само оно не поднимется: Dokploy не перезапускает `idle`-приложения после перезагрузки сервера. Нужен деплой (шаг 6).

История выкатов — почему стек в таком состоянии:

```bash
ssh root@217.199.254.38 'docker exec $(docker ps -q -f name=dokploy-postgres) \
  psql -U dokploy -d dokploy -c "select status, title, \"createdAt\" from deployment where \"composeId\" = '"'"'hUkN0SBfId0nogeR4yhgc'"'"' order by \"createdAt\" desc limit 5;"'
```

### 3. Контейнеры есть, но нездоровы

```bash
ssh root@217.199.254.38 'docker ps -a --filter name=lms-mentor --format "{{.Names}}\t{{.Status}}\t{{.Image}}"'
```

`Restarting` по кругу у `lms-mentor-app` — почти всегда либо недоступная БД, либо падение миграций на старте.

### 4. Логи приложения

```bash
ssh root@217.199.254.38 'docker logs $(docker ps -qf name=lms-mentor-app) --tail 200 2>&1'
```

**Маркеры «всё ок»:** старт Next на `:3000`; отсутствие ошибок применения миграций; `Admin user already exists` или создание админа при пустой БД.

| Сообщение | Что значит |
|---|---|
| `ECONNREFUSED ... 5432` | `lms-mentor-db` не поднялся или не прошёл healthcheck |
| ошибка в `prodMigrations` | Миграция не применилась. **Не перевыкатывай вслепую** — разбери конкретную миграцию, БД могла остаться в промежуточном состоянии |
| `PAYLOAD_SECRET` пустой/короткий | Переменная не доехала из Dokploy UI в контейнер |
| OOM / внезапный kill во время сборки | На сервере ~2.5 ГБ свободной памяти при 4 ГБ swap; сборка Next+Payload идёт с `--max-old-space-size=2048`. См. шаг 6 |

### 5. Проверка изнутри контейнера (минует Traefik)

```bash
ssh root@217.199.254.38 'docker exec $(docker ps -qf name=lms-mentor-app) curl -sf http://localhost:3000/api/health && echo OK || echo FAIL'
```

`OK` внутри при `404`/`502` снаружи — проблема в роутинге Traefik/Dokploy, а не в приложении: смотри метки контейнера и домены в Dokploy UI.

### 6. Перезапуск и деплой

Любое действие ниже **меняет прод — спроси подтверждение у пользователя перед запуском.**

Перезапуск уже существующего стека:

```bash
ssh root@217.199.254.38 'cd /etc/dokploy/compose/lms-mentor-3ghbnk/code && docker compose up -d'
```

Полный деплой (пересборка из GitHub) делается **из Dokploy UI** — так обновится и статус приложения, и метки Traefik.

Память — главный риск деплоя. Перед сборкой посмотри запас:

```bash
ssh root@217.199.254.38 'free -h; df -h /'
```

Если сборка падает по OOM — собери образ локально, запушь в registry и переведи `docker-compose.yml` с `build:` на `image:`.

### 7. Данные

Тома переживают пересоздание контейнеров, но проверить содержимое после инцидента стоит явно. Прямое подключение к БД — через socat-прокси и SSH-туннель, процедура описана в `docs/seed-production.md`.

## Что стоит проверить заодно

- `SMTP_*` в `/etc/dokploy/compose/lms-mentor-3ghbnk/code/.env`. Если их нет — в `src/payload.config.ts` почтовый адаптер не подключается, и восстановление пароля молча не работает. Отсутствие писем в поддержке начинается отсюда.
- `OTEL_EXPORTER_OTLP_ENDPOINT` по умолчанию `http://otel-collector:4318`. Алиас `otel-collector` в сети `dokploy-network` держит коллектор стека `podborminute-podborminutemonitoring` — это рабочая конфигурация, не считай её ошибкой.

## Итог

Заверши отчётом в форме: **что не работает → почему (с доказательством из вывода команд) → что предлагается сделать**. Не предлагай перевыкат как первое действие, пока причина не названа: перевыкат стирает следы.
