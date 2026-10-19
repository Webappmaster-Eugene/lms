---
name: prod-check
description: Диагностика прода LMS (learn.mentorcareer.ru / info.mentorcareer.ru) через SSH — Dokploy, туннель до домашней VM, контейнеры, Traefik, логи, БД. Используй когда «прод не открывается», «сайт лежит», «проверь логи LMS», «404 на проде».
---

Подключись к проду и определи, что именно сломано. С 19.10.2026 прод LMS работает **не на VDS, а в домашней VM**: Dokploy-панель по-прежнему на VDS (`root@217.199.254.38`, `deploy.nadtocheev.ru`), но стек LMS развёрнут на её удалённом сервере `serverlink-vm`. Доступ к VDS описан в `expert_info/ssh_access.txt` (файл лежит на уровень выше репозитория, в корне рабочего каталога).

## Контекст

Путь запроса — от него зависит, где искать поломку:

```
браузер → DNS learn/info.mentorcareer.ru = 217.199.254.38 (VDS)
        → Traefik VDS: TLS (Let's Encrypt) + файловый маршрут /etc/dokploy/traefik/dynamic/home-sites.yml
        → туннель AmneziaWG awg0: 10.77.0.1 (VDS) → 10.77.0.2 (домашняя VM)
        → Traefik VM :80 (маршруты по меткам из доменов Dokploy, HTTPS выключен)
        → lms-mentor-app:3000 / lms-mentor-landing:80
```

VM — это KVM-машина на домашнем сервере Beelink (Wi-Fi, без ИБП). SSH в неё из любой точки — через VDS как прыжковый хост:

```bash
PROD='ssh -J root@217.199.254.38 eugene@10.77.0.2'   # docker без sudo
$PROD 'hostname; uptime'
```

LMS развёрнута как **Dokploy compose**-приложение:

| Что | Значение |
|---|---|
| Сервер Dokploy | `serverlink-vm` (10.77.0.2) |
| `appName` | `lms-mentor-home-s62veg` |
| `composeId` | `rHLx1hVh-uuetAPMbyhYU` |
| Источник | GitHub `Webappmaster-Eugene/lms`, ветка `main`, сборка на самой VM (8 vCPU, 16 ГБ) |
| Каталог кода (в VM) | `/etc/dokploy/compose/lms-mentor-home-s62veg/code` |
| Сервисы | `lms-mentor-app` (Next+Payload, 3000), `lms-mentor-db` (postgres:16), `lms-mentor-landing` (nginx, 80), `lms-mentor-redis`, `lms-mentor-otel`, `lms-mentor-trainer-runtime`, планировщики `notifications`, `interviews`, `geoip` |
| Домены | `learn.mentorcareer.ru → lms-mentor-app:3000`, `info.mentorcareer.ru → lms-mentor-landing:80` |
| Тома (в VM) | `lms-mentor-home-s62veg_lms-pgdata`, `_lms-media`, `_lms-geoip`, `_lms-trainer-auth` |

Хеш в имени (`s62veg`) меняется при пересоздании приложения — **находи имена динамически** (`docker ps --filter name=lms-mentor`), не полагайся на константу.

**Старый стек `lms-mentor-3ghbnk` на VDS остановлен намеренно — не запускай и не деплой его.** У LMS планировщики уведомлений и собеседований: две живые копии разошлют ученикам дубли. На VDS остались только его тома (для отката).

## Шаги

### 1. Внешняя проверка — что видно снаружи

```bash
for u in https://learn.mentorcareer.ru/api/health https://learn.mentorcareer.ru/login https://info.mentorcareer.ru/; do
  curl -s -o /dev/null -w "%{http_code} %{time_total}s $u\n" -L --max-time 20 "$u"
done
```

| Что видно | Что это значит |
|---|---|
| `200` | Сервис жив, иди в шаг 5 смотреть логи по существу |
| `502` / `504` от VDS | Traefik VDS не достучался до VM: туннель, домашний интернет или питание. Шаг 2 |
| `404` и тело ровно `404 page not found` | Ответ Traefik. На VDS нет хоста в `home-sites.yml` (шаг 2) **или** в VM нет роутера — контейнер не запущен/нездоров (шаг 3) |
| `000` / таймаут | Сеть или DNS. `dig +short <host>` должно быть `217.199.254.38` |

### 2. VDS и туннель

```bash
ssh root@217.199.254.38 'grep -E "Host\(" /etc/dokploy/traefik/dynamic/home-sites.yml'      # домены LMS на месте
ssh root@217.199.254.38 'ping -c3 -W2 10.77.0.2; ip route show 10.77.0.0/30'               # туннель жив, в маршруте congctl bbr
ssh root@217.199.254.38 'docker ps --filter name=compose-back-up-multi-byte-sensor --format "{{.Names}} {{.Status}}"'  # контейнер туннеля
ssh root@217.199.254.38 'curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" -H "Host: learn.mentorcareer.ru" http://10.77.0.2/login'
```

- Пинга нет — VM недоступна: дома нет питания или интернета, VM/хост выключены, либо туннель лёг. Проверь контейнер туннеля на VDS (Dokploy-проект `home-link`, compose `awg-tunnel`) и, если есть доступ к домашней сети, `ssh serverlink` → `virsh list`, `docker ps` в VM (контейнер `awg-tunnel` в `/opt/tunnel`).
- Пинг есть, но всё очень медленно — проверь, что в маршруте `10.77.0.0/30` есть `congctl bbr`. Без BBR TCP через домашний Wi-Fi падает в 6–15 раз. Строка ставится скриптом `run.sh` компоуза `awg-tunnel` при старте; вручную: `ip route replace 10.77.0.0/30 dev awg0 proto kernel scope link src 10.77.0.1 congctl bbr`.
- `curl` с заголовком Host отвечает, а снаружи нет — проблема в Traefik VDS или в `home-sites.yml`.

### 3. Стек в VM — статус

```bash
$PROD 'docker ps -a --filter name=lms-mentor --format "{{.Names}}\t{{.Status}}\t{{.Image}}"'
$PROD 'docker volume ls | grep -i lms-mentor'
```

Если контейнеров нет, а тома есть — приложение снято с выката, данные целы. Статус и история выкатов — в БД Dokploy, она на VDS:

```bash
ssh root@217.199.254.38 'docker exec $(docker ps -q -f name=dokploy-postgres) \
  psql -U dokploy -d dokploy -c "select \"appName\", \"composeStatus\", \"serverId\" from compose where \"appName\" like '"'"'lms-mentor%'"'"';"'
ssh root@217.199.254.38 'docker exec $(docker ps -q -f name=dokploy-postgres) \
  psql -U dokploy -d dokploy -c "select status, title, \"createdAt\" from deployment where \"composeId\" = '"'"'rHLx1hVh-uuetAPMbyhYU'"'"' order by \"createdAt\" desc limit 5;"'
```

`lms-mentor-3ghbnk` со статусом `idle`/`done` и без `serverId` — это старый стек на VDS, так и должно быть. Логи выкатов лежат в VM: `/etc/dokploy/logs/lms-mentor-home-s62veg/`.

`Restarting` по кругу у `lms-mentor-app` — почти всегда либо недоступная БД, либо падение миграций на старте. Traefik в VM не видит контейнер, пока его healthcheck не `healthy`: сразу после старта короткий `404` — нормально.

### 4. Ресурсы VM и хоста

```bash
$PROD 'free -h; df -h /; uptime'
```

### 5. Логи приложения

```bash
$PROD 'docker logs $(docker ps -qf name=lms-mentor-app) --tail 200 2>&1'
```

**Маркеры «всё ок»:** старт Next на `:3000`; отсутствие ошибок применения миграций; `Admin user already exists` или создание админа при пустой БД.

| Сообщение | Что значит |
|---|---|
| `ECONNREFUSED ... 5432` | `lms-mentor-db` не поднялся или не прошёл healthcheck |
| ошибка в `prodMigrations` | Миграция не применилась. **Не перевыкатывай вслепую** — разбери конкретную миграцию, БД могла остаться в промежуточном состоянии |
| `PAYLOAD_SECRET` пустой/короткий | Переменная не доехала из Dokploy UI в контейнер |
| таймауты к внешним API, SMTP | Домашний выход в интернет идёт через VPN роутера (Цюрих) — сначала проверь сеть VM: `$PROD 'curl -sI https://api.github.com | head -1'` |

### 6. Проверка изнутри контейнера (минует оба Traefik)

```bash
$PROD 'docker exec $(docker ps -qf name=lms-mentor-app) curl -sf http://localhost:3000/api/health && echo OK || echo FAIL'
```

`OK` внутри при ошибке снаружи — проблема в маршруте (Traefik VM, туннель, Traefik VDS), а не в приложении: смотри метки контейнера, домены в Dokploy UI и шаг 2.

### 7. Перезапуск и деплой

Любое действие ниже **меняет прод — спроси подтверждение у пользователя перед запуском.**

Перезапуск уже существующего стека:

```bash
$PROD 'cd /etc/dokploy/compose/lms-mentor-home-s62veg/code && docker compose -p lms-mentor-home-s62veg -f ./docker-compose.yml up -d'
```

Полный деплой (пересборка из GitHub) делается **из Dokploy UI** — так обновится и статус приложения, и метки Traefik. Сборка идёт в самой VM; кэш сборки там есть только после первой сборки, а скачивание зависимостей идёт через домашний Wi-Fi — первая сборка после чистки кэша долгая.

### 8. Данные и копии

Тома переживают пересоздание контейнеров, но проверить содержимое после инцидента стоит явно. Ночные копии БД (00:30 UTC, хранится 14) уходят с VM на VDS — назначение Dokploy `vds-offsite` (S3 на `10.77.0.1:19000`, бакет `home-backups`). Процедура прямого подключения к БД в `docs/seed-production.md` написана для VDS и для домашней VM не годится — подключайся через `$PROD` и `docker exec` в `lms-mentor-db`.

## Что стоит проверить заодно

- `SMTP_*` в `/etc/dokploy/compose/lms-mentor-home-s62veg/code/.env` (в VM). Если их нет — в `src/payload.config.ts` почтовый адаптер не подключается, и восстановление пароля молча не работает. Отсутствие писем в поддержке начинается отсюда.
- Телеметрия: приложение шлёт OTLP в свой коллектор `lms-mentor-otel:4318`, а тот — в Prometheus/Loki/Tempo стека мониторинга на VDS через ретранслятор `telemetry-relay` (Dokploy-проект `home-link`, адреса `10.77.0.1:19090/13100/14317`). Нет метрик в Grafana при живом LMS — проверь ретранслятор и туннель, а не приложение.

## Итог

Заверши отчётом в форме: **что не работает → почему (с доказательством из вывода команд) → что предлагается сделать**. Не предлагай перевыкат как первое действие, пока причина не названа: перевыкат стирает следы.
