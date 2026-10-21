# Ошибки и трекер ошибок

Ошибки платформы собираются в свой GlitchTip — `https://sentry.mentorcareer.ru`
(организация `mentorcareer`, проект `lms`). GlitchTip принимает протокол Sentry,
поэтому в коде работает обычный SDK `@sentry/nextjs`, и переезд на sentry.io —
это только другой `SENTRY_DSN`. Трассы, метрики и логи по-прежнему идут через
OpenTelemetry в Tempo, Prometheus и Loki
([learning-observability.md](learning-observability.md)). SDK спанов не
шлёт и своего провайдера трасс не регистрирует. Каждое событие несёт
`trace_id` активного спана OTel: по нему в Grafana находится трасса запроса.

Ниже «Sentry» — это SDK и протокол, а принимает события GlitchTip.

Без `SENTRY_DSN` отправка выключена целиком. Приложение работает как раньше,
браузер продолжает слать отчёты в туннель, а туннель отвечает 204 и их
отбрасывает.

## Откуда приходят ошибки

| Слой | Как попадает в Sentry | Где код |
|---|---|---|
| Браузер: необработанные исключения и промисы | глобальные обработчики SDK | `src/instrumentation-client.ts` |
| Браузер: ошибка рендера страницы | `error.tsx` и `global-error.tsx` через `useErrorReport` | `src/components/errors/` |
| Сервер: рендер RSC, route handlers, server actions, middleware | `onRequestError` из Next | `src/instrumentation.ts` |
| Сервер: обработанные ошибки | `logger.error(message, error, attrs)` | `src/lib/telemetry.ts` |
| Payload REST, GraphQL, админка (5xx) | корневой хук `afterError` (коллекция и id пользователя) | `src/payload/hooks/reportPayloadError.ts` |
| Payload: старт, подключение к БД, onInit | хук логгера pino (уровни error и fatal) | там же, `payloadLogger` |
| SMTP не принял логин или недоступен на старте | своя проверка транспорта через `logger.error`: встроенная в адаптер пишет только в `console.error` | `src/payload/email/transport.ts` |
| Упавшая миграция на старте контейнера | обёртка `reportMigrationFailures`: событие `fatal` и ожидание отправки до `process.exit` | там же, `prodMigrations` в `src/payload.config.ts` |
| PostgreSQL: обрыв простаивающего соединения | слушатель `error` пула; раньше событие роняло процесс | `src/server/secure-postgres-adapter.ts` |
| Redis недоступен | предупреждение, не чаще раза в 10 минут; кеш при этом работает локально | `src/server/content-cache.ts` |
| Healthcheck не прошёл (лежит БД или Payload) | `fatal`, не чаще раза в 5 минут | `src/app/(payload)/api/health/route.ts` |
| Необработанные исключения процесса Node | встроенные интеграции SDK | `src/lib/error-reporting/server-sentry.ts` |

`logger.warn` и `logger.info` событий не создают. Они становятся хлебными
крошками: в событии ошибки видно, что происходило в запросе до неё.

Ошибки 4xx в Sentry не попадают: неверный пароль, валидация, нет доступа и
`redirect()`/`notFound()` — это штатные ответы, а не сбои.

## Браузер и туннель

CSP платформы — `connect-src 'self'`, поэтому браузер шлёт отчёты в
`POST /api/monitoring` своего домена. Кроме того:

- браузер собран с DSN-заглушкой, настоящий DSN знает только сервер. Включить,
  выключить или перенести трекер можно переменной окружения без пересборки;
- туннель принимает отчёты только со своих страниц: обязателен `Origin` своего
  домена, `Sec-Fetch-Site` не `cross-site`;
- пропускаются только элементы `event` и `client_report` — вложения, сессии и
  прочее отклоняются;
- размер конверта ограничен 256 КБ, частота — 30 конвертов в минуту на клиента
  и 300 в минуту на всё приложение. Клиент — доверенный IP (`LMS_TRUST_PROXY`),
  а за прокси без него — отпечаток сессионной cookie;
- лимиты Sentry (`Retry-After`, `X-Sentry-Rate-Limits`) возвращаются браузеру,
  и SDK сам перестаёт слать.

Сессии браузера (release health) выключены, иначе каждый заход на страницу
был бы запросом в туннель. Трассировка в браузере вырезана из бандла.

## Что вырезается до отправки

Очистка работает на нашей стороне (`src/lib/error-reporting/`), а не фильтрами
Sentry. Вырезается:

- адреса почты, токены (JWT, Bearer, `token=`, `password=`), логины и пароли в
  ссылках на БД и Redis, query и hash ссылок;
- токены в самом пути: комната собеседования, превью тренажёра — UUID и
  длинные непрозрачные сегменты заменяются на `[token]`, слаги остаются;
- значения параметров SQL (сам запрос остаётся, по нему видно место в коде);
- cookie, тела запросов, все заголовки, кроме нейтральных (`user-agent`,
  `accept-language`, `content-type`, `sec-fetch-*`);
- данные пользователя, кроме числового `id`: имя, почта и IP в Sentry не попадают;
- локальные переменные кадров стека.

Там, где даже очищенный текст хранить нельзя (стенограммы собеседований,
валидация с паролем), в Sentry уходит `stackOnly(error)`: класс ошибки и стек
без текста.

## Код ошибки для ученика

Страница ошибки показывает код и кнопку «Скопировать». «Написать в поддержку»
открывает форму на `/help`, где тема, код и адрес страницы уже заполнены.

- Серверная ошибка: код — это `digest` Next. Событие на сервере помечено тегом
  `digest`, поиск в Sentry — `digest:2913870412`.
- Ошибка браузера: код — это id события Sentry (32 hex-символа), поиск по
  нему же.

## Страницы ошибок

| Файл | Когда показывается |
|---|---|
| `src/app/(frontend)/not-found.tsx` | 404 внутри платформы, с меню |
| `src/app/(frontend)/error.tsx` | упала страница, меню и шапка на месте |
| `src/app/(frontend)/manage/error.tsx` | упал редактор учебного контента |
| `src/app/(auth)/error.tsx` | упали вход, восстановление или сброс пароля |
| `src/app/global-error.tsx` | упал сам layout: чаще всего недоступны БД или Payload |

Все страницы собраны на `ErrorScreen`: цифра кода на фоне, окно терминала
с «выводом команды», действия и код ошибки. Цвета берутся из токенов темы,
поэтому светлая и тёмная темы работают одинаково. «Попробовать снова» делает
`router.refresh()` и `reset()`: одного `reset()` мало, упавший серверный
компонент без нового запроса так и останется упавшим.

## GlitchTip

| Что | Где |
|---|---|
| Интерфейс | `https://sentry.mentorcareer.ru` (TLS на Traefik VDS, маршрут в `home-sites.yml`, как у остальных домашних сайтов) |
| Где работает | Dokploy, проект «GlitchTip — трекер ошибок», compose `glitchtip-…` на сервере `serverlink-vm`; compose-файл и секреты — в самом Dokploy |
| Состав | `glitchtip-web` (GlitchTip 6, веб и воркер в одном процессе), `glitchtip-postgres`, `glitchtip-valkey` |
| Сеть | в `dokploy-network` только `glitchtip-web`; база и Valkey — во внутренней сети compose |
| Хранение | события 90 дней (`GLITCHTIP_RETENTION_DAYS`) |
| Регистрация | закрыта: новых людей добавляет владелец в настройках организации |
| Почта алертов | тот же SMTP, что у LMS (`EMAIL_URL` в Environment compose GlitchTip) |
| Бэкап | дамп базы Dokploy каждую ночь в 01:05 UTC в `vds-offsite` (каталог `glitchtip`, хранить 14); Pi и хост serverlink забирают его в restic, Pi 1-го числа восстанавливает в `postgres:18-alpine`. Том с source maps не бэкапится: их заново грузит следующий выкат |

LMS отправляет события внутри VM на `http://glitchtip-web:8000`, без выхода в
интернет: сервер сам, браузер — через туннель `/api/monitoring`. Если
GlitchTip лежит, SDK теряет события, но на работу LMS это не влияет.

Обновление GlitchTip: поменять тег образа в compose в Dokploy и нажать Deploy,
миграции он применяет сам. Мажорные версии — сначала прочитать
`https://glitchtip.com/blog/`.

## Настройка LMS в Dokploy

1. В GlitchTip: проект → Settings → Client Keys (DSN). Для LMS хост в DSN
   меняется на внутренний: `http://<public-key>@glitchtip-web:8000/<id>`.
2. В Environment приложения LMS в Dokploy:
   - `SENTRY_DSN` — DSN проекта (рантайм; меняется без пересборки, но нужен Deploy);
   - `SENTRY_BROWSER_DSN` — по желанию, второй ключ того же проекта для
     отчётов браузера с ограничением частоты: туннель открыт без входа;
   - `SENTRY_ENVIRONMENT` — `production` (по умолчанию так и есть).
3. Для читаемых стеков браузера (source maps), только на этапе сборки:
   - `SENTRY_URL` — `https://sentry.mentorcareer.ru`: сборка идёт в Docker и
     внутреннего имени `glitchtip-web` не видит;
   - `SENTRY_AUTH_TOKEN` — API-токен GlitchTip (профиль → Auth Tokens, права
     `project:read`, `project:write`, `project:releases`, `org:read`).
     Передаётся BuildKit-секретом (`build.secrets` в compose) и не остаётся
     ни в слоях, ни в истории образа;
   - `SENTRY_ORG`, `SENTRY_PROJECT` — `mentorcareer` и `lms`;
   - `SENTRY_RELEASE` — по желанию, например короткий SHA коммита.
     Без него source maps всё равно сопоставляются по debug id.

   После загрузки source maps удаляются из образа (плагином Sentry и ещё раз
   `find … -delete` в Dockerfile): исходники браузерам не раздаются. Если
   GlitchTip недоступен во время сборки, плагин пишет ошибку и сборка идёт
   дальше — стек браузерных ошибок будет сжатым до следующего выката.
4. Алерты — в GlitchTip: проект → Settings → Alerts. Сейчас одно правило:
   письмо участникам проекта, как только у проблемы появляется событие
   (порог 1 событие за 1 минуту), и при сбоях uptime-мониторов.

## Проверка

```sh
pnpm exec vitest run tests/unit/serverErrorReporting.test.ts tests/unit/errorTunnel.test.ts \
  tests/unit/errorReportingRedact.test.ts tests/components/ErrorPages.test.tsx
```

`serverErrorReporting` поднимает настоящий SDK Sentry с подменённым
транспортом и проверяет уже готовые конверты: стек, очистку, хлебные крошки,
троттлинг, хуки Payload и пул Postgres.
