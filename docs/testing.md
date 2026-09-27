# Тестирование

Пять уровней, от быстрых к медленным. Первый не требует ничего, кроме Node;
остальные поднимают одноразовый PostgreSQL в Docker и сами за собой убирают.

| Уровень | Команда | Что внутри | Время |
|---|---|---|---|
| Unit, компоненты, смоук | `pnpm test` | vitest на моках, без БД (`tests/unit`, `components`, `smoke`) | ~10 с |
| Интеграция CMS и API | `pnpm test:integration` | настоящий Payload Local API + PostgreSQL (`tests/integration`) | ~1 мин |
| E2E + HTTP API | `pnpm test:e2e` | Playwright против `next start` с сидом (`tests/e2e/specs`, `tests/e2e/api`) | ~2 мин + сборка |
| Контент и a11y | `pnpm test:content` | SEO лендинга, битые ссылки, axe-core (`tests/e2e/content`) | ~1,5 мин |
| Скриншоты | `pnpm test:visual` | `toHaveScreenshot` в контейнере Playwright (`tests/e2e/visual`) | ~5 мин |

`pnpm test:e2e:all` — e2e, API и контент одним прогоном.

## Одноразовая база

`scripts/test-db.mjs` поднимает контейнер `lms-test-pg` (postgres:16-alpine,
порт **55433**, данные в tmpfs) и пересоздаёт нужную базу:

| База | Кто пользуется |
|---|---|
| `lms_integration` | интеграционные тесты, миграции — штатным `payload migrate` |
| `lms_migrations` | тест миграций: программный прогон, как `prodMigrations` на старте прода |
| `lms_seed` | тест сидов: `pnpm seed:trainer` и `pnpm seed` как CLI |
| `lms_e2e_<порт>` | e2e/скриншоты: база своя на каждый порт приложения |

```sh
pnpm test:db:up     # поднять контейнер заранее (тесты сделают это сами)
pnpm test:db:down   # остановить и удалить контейнер вместе с данными
```

Если задан `TEST_PG_URL` (например, `postgresql://lms:lms@localhost:5432`), свой
контейнер не поднимается — так работает CI с service container.

Реальная почта не отправляется: `SMTP_HOST` пустой, а интеграционные тесты
перехватывают `payload.sendEmail` и `payload.email.sendEmail`. Внешняя сеть
в тестах маршрутов запрещена подменой `fetch`.

## Интеграционные тесты (`tests/integration`)

- `cms/schema` — по конфигу каждой коллекции: обязательные поля, дефолты,
  уникальность, варианты select, `maxLength`/`min`/`max`, висячие связи,
  частные валидаторы (Miro-ссылки, Lexical, блоки уроков), загрузка медиа.
  Новая коллекция без фабрики в `helpers/fixtures.ts` роняет тест.
- `cms/access` — матрица прав: каждая коллекция × create/read/update/delete ×
  аноним/владелец/другой студент/админ, плюс попытки эскалации.
- `cms/hooks` — цепочка начислений за урок, серия, достижения, сертификаты,
  уведомления, письма, приглашение и сброс пароля, блокировка входа, удаление
  документов со связями, гонки.
- `cms/migrations` — миграции на чистую БД, реестр, drizzle не видит
  расхождений схемы с конфигом, откат `down` и повторный накат.
- `cms/seed` — `seed:trainer` дважды (идемпотентность), затем **каждая задача
  каталога из БД** прогоняется в настоящей серверной песочнице (isolated-vm + tsc):
  эталон проходит, шаблон — нет.
- `cms/bootstrap` — `onInit`: первый админ из env и автосид роадмапов.
- `api/rest` — REST Payload через `handleEndpoints` (тот же обработчик, что за
  `/api/[...slug]`): логин, токены, logout, forgot-password, коды ответов.
- `api/routes` — собственные маршруты `src/app/api`: тренажёр (вердикт, баллы,
  таймаут, память, изоляция, rate limit), разбор, компиляция TS, поддержка,
  health, Яндекс.Диск до обращения к диску (SSRF-фильтр).

## E2E и скриншоты (`tests/e2e`, Playwright)

`scripts/e2e-server.mjs` (webServer) пересоздаёт базу, накатывает миграции,
заливает фиксированный сид `tests/e2e/fixtures/seed-e2e.ts`, собирает
приложение, если исходники изменились, и запускает `next start` на 3100.
Лендинг раздаёт `scripts/landing-server.mjs` на 3101 — так же, как nginx в
проде (404-страница, charset, заголовки).

Логины и слаги сида — в `tests/e2e/fixtures/data.ts`. Состояние меняет только
пользователь `doer`; скриншоты снимаются под студентом без прогресса.

Скриншоты — только из Linux-контейнера `mcr.microsoft.com/playwright` той же
версии, что `@playwright/test`: на macOS шрифты рендерятся иначе, и на маке
visual-тесты пропускаются.

```sh
pnpm test:visual          # сравнить с эталонами (поднимет приложение на 3102/3103)
pnpm test:visual:update   # переснять эталоны после намеренного изменения UI
```

Эталоны лежат в `tests/e2e/visual/__screenshots__/` и коммитятся. Изменение
эталона в PR — повод посмотреть на diff картинок, а не просто принять его.

Локально на macOS без скачанного браузера Playwright используется установленный
Google Chrome (`channel: 'chrome'`), в CI и контейнере — штатный chromium.
Для отладки против уже запущенного сервера: `E2E_REUSE_SERVER=1`.

## Известные дефекты, закреплённые тестами

Тесты с `it.fails` / `test.fail` и префиксом «БАГ:» описывают правильное
поведение, которого в продукте пока нет. Прогон остаётся зелёным, а после
исправления такой тест упадёт с «expected to fail» — тогда снимите пометку.

## CI

`.github/workflows/ci.yml`: `quality` (lint, typecheck, unit), `integration`
(service container PostgreSQL), `e2e` и `visual` (в контейнере Playwright).
Отчёт Playwright и трассы прикладываются артефактами при падении.
