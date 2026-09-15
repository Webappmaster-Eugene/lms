# Смена пароля БД на проде

## Почему это отдельная процедура

В `docker-compose.yml` пароль приходит в два места из одной переменной:

```yaml
lms-mentor-db:
  environment:
    POSTGRES_PASSWORD: ${DB_PASSWORD:-changeme}
lms-mentor-app:
  environment:
    - DATABASE_URL=postgresql://lms:${DB_PASSWORD:-changeme}@lms-mentor-db:5432/lms_platform
```

Выглядит так, будто достаточно поменять `DB_PASSWORD` в Dokploy и передеплоить. Это не так.

**`POSTGRES_PASSWORD` действует только при первичной инициализации кластера** — то есть один
раз, когда том `lms-pgdata` был пустым. При всех последующих стартах образ `postgres:16-alpine`
видит непустой `PGDATA`, пропускает `initdb` и переменную игнорирует. Пароль роли `lms` хранится
внутри тома как SCRAM-верификатор и живёт своей жизнью.

Поэтому смена `DB_PASSWORD` меняет **только** строку подключения приложения. Роль в базе остаётся
со старым паролем, приложение стучится с новым, и в момент, когда пул откроет первое новое
соединение, всё падает:

```
error: password authentication failed for user "lms"
```

## Как это выглядит на проде

Отказ не мгновенный и оттого коварный: уже открытые соединения пула продолжают работать, пока их
не закроет таймаут. Деплой проходит «зелёным», сайт какое-то время отвечает, а разваливается
через минуты или часы.

Дальше срабатывает цепочка: `/api/health` делает запрос к `users` → healthcheck контейнера
падает → Traefik убирает бэкенд из роутера → **все страницы отдают 404**, включая `/login`.
Со стороны это неотличимо от «сайт исчез».

Диагностика:

```bash
ssh root@217.199.254.38
docker ps --filter name=lms-mentor-3ghbnk --format '{{.Names}}\t{{.Status}}'   # ищем unhealthy
docker logs --tail 50 lms-mentor-3ghbnk-lms-mentor-app-1 | grep -i 'authentication\|Failed query'
```

**Важно про проверку пароля.** В `pg_hba.conf` контейнера для `127.0.0.1` стоит `trust`, а
`scram-sha-256` — только для остальных адресов. Значит `docker exec ... psql -U lms` подключается
**без проверки пароля** и ничего не доказывает. Проверять надо тем же путём, которым ходит
приложение — по имени сервиса:

```bash
docker exec lms-mentor-3ghbnk-lms-mentor-db-1 sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -U lms -d lms_platform -h lms-mentor-db -c "select 1"'
```

## Правильный порядок смены пароля

Роль и переменную нужно менять вместе, роль — первой или сразу следом, но не «когда-нибудь».

1. Поменять `DB_PASSWORD` в Dokploy (Environment у compose `mentor`).
2. Передеплоить — контейнеры пересоздаются с новым `DATABASE_URL`.
3. **Сразу привести пароль роли к тому же значению.** Файл с командой (значение подставляет psql
   из окружения контейнера, руками нигде не набирается и в вывод не попадает):

   ```sql
   -- fix-role-password.sql
   ALTER ROLE lms WITH PASSWORD :'pw';
   ```

   ```bash
   scp fix-role-password.sql root@217.199.254.38:/tmp/
   ssh root@217.199.254.38 '
     docker cp /tmp/fix-role-password.sql lms-mentor-3ghbnk-lms-mentor-db-1:/tmp/ &&
     docker exec lms-mentor-3ghbnk-lms-mentor-db-1 sh -c "
       psql -U lms -d lms_platform -h 127.0.0.1 -v ON_ERROR_STOP=1 \
            -v pw=\$POSTGRES_PASSWORD -f /tmp/fix-role-password.sql" &&
     docker exec lms-mentor-3ghbnk-lms-mentor-db-1 rm -f /tmp/fix-role-password.sql &&
     rm -f /tmp/fix-role-password.sql'
   ```

4. Проверить сетевую аутентификацию (команда выше) и дождаться `healthy`:

   ```bash
   docker inspect --format '{{.State.Health.Status}}' lms-mentor-3ghbnk-lms-mentor-app-1
   curl -s https://learn.mentorcareer.ru/api/health
   ```

   Приложение подхватывает само за ≤30 секунд (интервал healthcheck), рестарт не нужен.

Порядок 1→2→3 даёт короткое окно недоступности между 2 и 3. Если оно нежелательно, роли можно
задать новый пароль до деплоя — тогда окно будет между сменой роли и деплоем. Нулевого простоя без
второй роли в БД не получится, а ради разовой ротации её заводить незачем.

## Что ещё ломается по той же причине

- `pnpm seed:trainer` и прочие скрипты через socat-туннель ходят **по сети**, а значит под
  `scram-sha-256`. Расхождение пароля роли и `DB_PASSWORD` ломает и их — см. `seed-production.md`.
- Дефолт `${DB_PASSWORD:-changeme}` в `docker-compose.yml` оставлен для локального запуска. Если
  переменная не доедет до Dokploy, прод молча поднимется на `changeme` — проверяй, что она задана.
