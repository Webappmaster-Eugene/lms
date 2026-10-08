# Наблюдаемость учебного доступа

Сервер отправляет три сигнала в отдельный collector своего стека:
метрики `/v1/metrics`, трассы `/v1/traces`, логи `/v1/logs`.
Compose default `OTEL_EXPORTER_OTLP_ENDPOINT=http://lms-mentor-otel:4318`,
`OTEL_SERVICE_NAME=lms-platform`. Источник явных overrides — Environment
Dokploy; прежний override на `otel-collector` необходимо заменить при выкате.
Пустой endpoint отключает SDK и сетевую отправку; структурированные отказы,
ошибки и изменения назначений остаются в stderr контейнера.
Compose сохраняет явно пустое значение endpoint, а не заменяет его default.

Это реализация отправки и событий в приложении. Создание дашбордов,
Prometheus rules, notification policy и проверка приёма внешним collector
требуют отдельной настройки наблюдаемости; наличие SDK не означает,
что эти внешние компоненты уже настроены.

## Отдельный collector LMS

`observability/otel-collector.yaml` и `Dockerfile.collector` запускаются как
`lms-mentor-otel` внутри нашего compose. Общий collector другого приложения
не меняется и не перезапускается. Порты LMS collector не опубликованы наружу;
он доступен только по внутренней сети Dokploy.

Три optional runtime overrides имеют проверенные defaults:

| Переменная | Default |
| --- | --- |
| `LMS_PROMETHEUS_REMOTE_WRITE_ENDPOINT` | `http://prometheus:9090/api/v1/write` |
| `LMS_LOKI_OTLP_ENDPOINT` | `http://loki:3100/otlp` |
| `LMS_TEMPO_OTLP_GRPC_ENDPOINT` | `tempo:4317` |

Текущие backend aliases не требуют credentials/tenant headers. Если backend
в будущем станет другим, auth/headers задаются через защищённое окружение,
а не литералами в Git. TLS insecure относится только к частной gRPC связи
с текущим Tempo. На публичный backend такой default не переносить.

Collector разрешает только resource `service.name=lms-platform`. Для всех
трёх signals сохраняет в resource только service name/version и deployment
environment, чтобы process/host/command args не превращались в metric labels.
SDK metric exporter явно использует cumulative temporality, совместимую с
Prometheus remote write. Другие сервисы не проходят LMS filter.

Ресурсы ограничены: 192 MiB контейнеру, memory limiter 128 MiB/spike 32 MiB,
GOMEMLIMIT 144 MiB. Batch 256/max 512, timeout 2 секунды; каждая очередь
exporter максимум 32 batches, один consumer, retry до 60 секунд с интервалом
1–10 секунд. OTLP request body/GRPC message ограничены 8 MiB. Persistent WAL
и disk queue отключены; tmpfs ограничен 8 MiB, контейнер read-only,
capabilities сняты. Collector stdout ротируется в 3 файла по 10 MiB.
При долгом backend outage телеметрия теряется после заполнения очередей,
а учебные операции продолжаются. Durable assignment audit остаётся в БД.

Health extension `/` на порту 13133 проверяется настоящим HTTP GET через
статический BusyBox wget: upstream distroless image не содержит curl/shell.
Это здоровье collector, не гарантия доступности backend. Приложение зависит
от `service_started`, поэтому backend outage не блокирует старт LMS.

Collector сам читает `/metrics` localhost:8888 каждые 15 секунд и экспортирует
в Prometheus с `component=lms-mentor-otel` и `service_name=lms-platform`.
Так heartbeat/export failures видны без правки scrape jobs общего Prometheus.

## Dashboard и alert templates

`observability/grafana/lms-learning.dashboard.json` содержит 13 панелей и
использует существующие datasource UID `prometheus`, `loki`, `tempo`.
Dashboard UID — `lms-learning-access`. `lms-learning.alerts.json` — массив
шести объектов API `/api/v1/provisioning/alert-rules`, folder UID `lms-learning`,
orgID 1. Перед импортом в другую организацию замените orgID/folder UID.
`node observability/grafana/build-templates.mjs` повторно создаёт оба artifacts.

Импорт через API — сначала создать/найти folder `lms-learning`, затем
POST `/api/dashboards/db` с `{ dashboard, folderUid: 'lms-learning', overwrite: true }`,
затем каждый rule POST `/api/v1/provisioning/alert-rules` либо PUT существующего
UID. Не заменять чужие dashboard/rules и не сбрасывать notification policy.
Credentials остаются только в памяти/защищённом окружении, не в artifacts.

| Сигнал | Ответственная роль | Почему |
| --- | --- | --- |
| Ошибки media >5% и минимум 10/5m | platform_operator | Сбой транспорта/upstream требует диагностики инфраструктуры |
| 30 подозрительных отказов/5m | security_operator | Проверить invalid source/origin, rate limit и сессии |
| 50 изменений доступа/15m | learning_administrator | Сверить штатное массовое назначение с транзакционным аудитом |
| p95 access >2s при 50+ измерениях | platform_operator | Найти медленные policy/БД этапы |
| Ошибки экспорта signals | platform_operator | Проверить DNS, backend и bounded очереди |
| Нет свежего collector heartbeat 90s | platform_operator | Отдельный сигнал потери наблюдаемости даже без активности учеников |

Ожидаемые `unassigned`/`explicit_deny` исключены из security alert, чтобы
просмотр каталога закрытых курсов не вызывал тревогу. No Data нормален для
пользовательских событий; heartbeat проверяется отдельно. `execErrState=KeepLast`
снижает шум краткого Prometheus network сбоя, backend должен также иметь
свой инфраструктурный мониторинг. Метки `responsible_role` задают ответственность,
а не конкретного получателя: настройка каналов и policy — отдельная операция.
Шаблоны не содержат email/Telegram/webhook получателей и сами сообщения
никому не отправляют. Доказательство создания rule не равно доказательству
доставки оповещения человеку.

## События и приватность

`src/lib/learning-observability.ts` экспортирует:

- `recordLearningAccess({ resource, outcome, reason, userId?, resourceId?, durationMs? })`.
  Ресурсы: `roadmap`, `node`, `course`, `section`, `lesson`, `media`.
  Результаты: `allow`, `deny`, `error`.
- `recordLearningAssignment({ actorId, userId, operation, targetType, targetId, effect })`.
  Операции: `create`, `update`, `delete`; эффекты: `allow`, `deny`.
  Имена коллекций Payload (`roadmaps`, `roadmap-nodes`, `courses`, `sections`,
  `lessons`) нормализуются в единые `roadmap`, `node`, `course`, `section`, `lesson`.
  Событие означает валидированное изменение, `audit.stage=validated`,
  и может предшествовать commit Payload. Транзакционная коллекция аудита
  — источник истины о сохранённых изменениях. Откат транзакции не откатывает
  уже отправленную телеметрию.
- `withLearningSpan(resource, 'access' | 'assignment' | 'stream', fn)`.
  Обёртка отмечает ошибку фиксированным `internal_error`, сохраняет исходную
  ошибку для вызывающего кода и закрывает span. Текст/stack ошибки не отправляет.

ID ученика, администратора и ресурса — только положительные безопасные числа
в атрибутах логов и span; в metric labels их нет. Произвольные причины
превращаются в `other`. Исходные URL, подписанные ссылки, cookie, email,
токены, пароли, HTTP заголовки и тела запросов эти функции не принимают.

Доступные причины перечислены в `LEARNING_ACCESS_REASONS`: `admin`, `assigned`,
`inherited`, `unrestricted`, `restricted`, `explicit_deny`, `unassigned`,
`unauthenticated`, `unpublished`, `not_found`, `invalid_request`, `invalid_origin`,
`invalid_range`, `invalid_source`, `rate_limited`, `upstream_unavailable`,
`upstream_error`, `upstream_timeout`, `stream_error`, `internal_error`, `other`.

Разрешённые запросы увеличивают счётчики и добавляют события текущего span;
они не создают отдельный JSON лог на каждый видео range. Отказы/ошибки
записываются как `WARN`/`ERROR`, назначения — `INFO`. В stderr severity
задаётся JSON полем, а не видом потока. При активной трассе JSON содержит
`trace_id` и `span_id`; OTel LogRecord получает текущий context.

HTTP и undici auto-instrumentation отключены: их URL могли содержать
invite/reset токены и подписанные media параметры. PostgreSQL не отправляет
значения параметров. Дополнительно экспортёры очищают трассы и OTel логи:
убирают URL, `http.target`, SQL/query, email/password/token/cookie/authorization,
raw error message/stack и CLI аргументы; убирают query из имени Next span.
Внешний `tracestate` также не экспортируется; trace/span ID сохраняются.
Сохраняются шаблон маршрута, числовые ID и фиксированные причины. Это важно,
потому что сам Next.js записывает `req.url` даже при отключённом HTTP плагине.
Общий logger `src/lib/telemetry.ts` также очищает stderr до вывода: удаляет
raw error message/stack и email/token attrs, редактирует URL/email и литералы
`password=...`/`token=...` в тексте. При наличии активного span сохраняет
trace/span ID. Произвольные тела запросов и пользовательский текст всё равно
не следует передавать logger: redaction распознаёт форматы, а не смысл данных.

## Метрики

| OTel имя | Labels | Значение |
| --- | --- | --- |
| `lms_learning_access_total` | `resource`, `outcome`, `reason` | Количество проверок/результатов media запроса |
| `lms_learning_access_duration` (unit `s`) | `resource`, `outcome` | Длительность переданного этапа, секунды |
| `lms_learning_assignment_total` | `operation`, `target_type`, `effect` | Валидированные изменения назначений |

`durationMs` вызывающий код передаёт в миллисекундах; модуль переводит в секунды.
NaN, infinity и отрицательные значения отбрасываются, максимум — 300 секунд.
Для media длительность должна явно означать время подключения/получения
ответа либо полную передачу, в зависимости от места измерения; это не
длительность просмотра учеником. Ошибки, случившиеся после открытия response
body, требуют отдельного вызова `recordLearningAccess` из stream error handler.

SDK Views защищают от случайного добавления ID в labels и ограничивают
кардинальность: 512 access, 32 histogram, 128 assignment рядов на процесс.
Reader экспортирует каждые 15 секунд с timeout 5 секунд. Log processor
пакетирует до 256 событий, очередь 2048, flush раз в секунду, timeout 5 секунд.
Collector недоступен — учебные операции не ожидают отправки.

Для Prometheus при стандартном переводе unit suffix histogram называется
`lms_learning_access_duration_seconds`; проверьте фактическое имя в backend,
если collector меняет translation strategy. Histogram предоставляет
`_bucket`, `_sum`, `_count`. Один запрос может проверять несколько родителей,
поэтому метрика проверок не равна количеству уникальных HTTP запросов.

## Запросы и начальные пороги оповещений

Это стартовые правила для настройки внешней системы. Оповещение о `deny`
не доказывает атаку: пользователь может открывать закрытые материалы.
Пороги сначала сравниваются с обычной нагрузкой, затем корректируются.
Отфильтруйте `service_name="lms-platform"` либо equivalent resource label
вашего collector, если backend принимает несколько сервисов.

Ошибки media: более 5% при минимум 10 ошибках за 5 минут, `for: 3m`:

```promql
sum(rate(lms_learning_access_total{resource="media",outcome="error"}[5m]))
/
clamp_min(sum(rate(lms_learning_access_total{resource="media",outcome=~"allow|error"}[5m])), 0.001)
> 0.05
and
sum(increase(lms_learning_access_total{resource="media",outcome="error"}[5m])) >= 10
```

Всплеск отказов на учебные материалы: минимум 30 отказов за 5 минут и доля
более 30%, `for: 5m`. `unassigned` при просмотре каталога может быть ожидаемым;
для расследования атак отдельно смотрите `invalid_source`, `invalid_origin`,
`rate_limited` и `unauthenticated`:

```promql
sum(rate(lms_learning_access_total{outcome="deny"}[5m]))
/
clamp_min(sum(rate(lms_learning_access_total{outcome=~"allow|deny"}[5m])), 0.001)
> 0.3
and
sum(increase(lms_learning_access_total{outcome="deny"}[5m])) >= 30
```

Медленные проверки lesson/course: p95 больше двух секунд при минимум
50 измерениях за 5 минут, `for: 5m`:

```promql
histogram_quantile(0.95,
  sum by (le) (rate(lms_learning_access_duration_seconds_bucket{resource=~"lesson|course"}[5m]))
) > 2
and
sum(increase(lms_learning_access_duration_seconds_count{resource=~"lesson|course"}[5m])) >= 50
```

Серия изменений прав: `sum(increase(lms_learning_assignment_total[15m])) > 50`.
Это сигнал проверить транзакционный аудит, а не автоматическая блокировка
администратора: массовое назначение может быть штатной операцией.

## Разбор проблемы

1. По bounded `reason` определите слой: `unassigned`/`explicit_deny` — права;
   `unpublished` — публикация родителей; `invalid_source` — источник media;
   `upstream_*` — поставщик видео; `stream_error` — передача после открытия ответа.
2. Найдите `learning.access` в собранных JSON логах, выберите `trace_id`,
   сопоставьте числовые `user.id` и `resource.id` с CMS. Не добавляйте email/URL
   обратно в запросы экспорта ради поиска.
3. В трассе проверьте шаблон маршрута и этапы policy/media, затем PostgreSQL.
   Ожидаемый отказ — не серверная ошибка; отсутствие allow trace может быть
   следствием выбранной внешней sampling policy.
4. Сравните текущие назначения с транзакционным аудитом, publication родителей
   и аккаунтом. Проверьте повтор сессии при изменениях прав, не меняя прогресс.
5. Для upstream ошибки проверьте доступность источника разрешённым read-only
   запросом, не публикуя подписанный URL в логи/отчёты. Для потери телеметрии
   отдельно проверьте DNS/сеть collector и включённые pipelines metrics/logs/traces.

Отсутствие рядов при отсутствии запросов нормально; `absent()` само по себе
не является health check сервиса. Для здоровья collector нужен его собственный
мониторинг экспортных ошибок и `/api/health` приложения. Docker уже ограничивает
логи приложения пятью файлами по 50 МБ; это ротация, а не постоянное хранение
аудита. Retention внешних log/trace backend и права чтения следует настроить
так, чтобы числовые ID были доступны только администраторам.

## Проверка реализации

### Продуктивная инфраструктура: проверка перед выкатом 2026-10-08

Read-only SSH проверка обнаружила общий collector
`podborminute-podborminutemonitoring-hb8qy3-otel-collector-1`, версия `0.145.0`.
`lms-platform` отправляет данные на его alias `otel-collector:4318` в сети
Dokploy. Конфигурация действительно содержит все три pipelines:

| Сигнал | Получатель |
| --- | --- |
| metrics | Prometheus remote write, `prometheus:9090/api/v1/write` |
| traces | Tempo OTLP gRPC, `tempo:4317` |
| logs | Loki OTLP HTTP, `loki:3100/otlp` |

Однако перед export во всех трёх pipelines стоит
`filter/podbor_services_only`: он разрешает 12 сервисов другого приложения,
**`lms-platform` в allowlist отсутствует**. Условие drop для LMS истинно.
Следовательно, успешный HTTP ответ OTLP endpoint не доказывает сохранение
данных: collector может принять пакет и затем удалить его. Продуктивные
запросы Prometheus по `service_name` и `job` LMS, Loki за последние 5 минут
и Tempo TraceQL по `resource.service.name` вернули пустой результат.
Новые метрики ещё не были выкачены на момент этой проверки.

Prometheus, Grafana и Loki отвечали readiness 200; Grafana database `ok`.
Первый Tempo `/ready` вернул 503, затем повтор и три последовательные проверки
вернули 200, все модули `/status/services` — `Running`. Это наблюдение
транзитной неготовности, а не подтверждённая постоянная неисправность.

Prometheus retention — 3 дня, Tempo block retention — 72 часа, storage local.
В Loki используется filesystem + TSDB; явный retention period и включённый
retention compactor в прочитанной конфигурации отсутствовали. Grafana имеет
Prometheus/Tempo/Loki datasources, пять общих dashboards и 25 alert rules;
LMS learning query/rule среди provisioned конфигураций нет.
`prometheusremotewrite.resource_to_telemetry_conversion.enabled=true`, поэтому
resource `service.name` ожидается как `service_name` metric label.

По результатам проверки выбран отдельный LMS collector, описанный выше,
с прямой отправкой в существующие backend без общего allowlist processor.
Read-only диагностика ничего не меняла в конфигурациях, env, контейнерах
и Kubernetes. Подмена `OTEL_SERVICE_NAME`
именем чужого сервиса не является решением: она смешает аудит и метрики.
Семантика drop подтверждена официальным
[описанием filter processor](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/processor/filterprocessor/README.md).

### Проверка доставки после выката

1. Проверить app endpoint `lms-mentor-otel`, healthy collector и его эффективные
   pipelines metrics/logs/traces; не ограничиваться endpoint 200.
2. Выполнить в рамках согласованной проверки обычный вход и открытие
   разрешённого/закрытого материала. Не создавать изменения прогресса ради
   телеметрии и не отправлять секреты в лог.
3. Дать два интервала reader и collector batch на доставку, затем запросить
   Prometheus `lms_learning_access_total{service_name="lms-platform"}` и
   histogram `_seconds_count`. Проверить bounded labels без ID/email/URL.
4. По Loki проверить наличие `learning.access`/`learning.assignment` и
   допустимых opaque ID, наличие `trace_id`; по этому ID открыть Tempo trace.
   Проверить отсутствие HTTP query, signed URL, raw error stack и email.
5. Подтвердить загруженные dashboard query/rules и работоспособный канал
   уведомлений отдельно. До этого считать доказанными только те сигналы,
   которые действительно появились в соответствующем backend.

Только чтение backend из существующего LMS контейнера: Node fetch к
`http://prometheus:9090/api/v1/query`, `http://loki:3100/loki/api/v1/query`
и `http://tempo:3200/api/search`. Host overlay IP может быть недоступен из SSH
сети; это не означает недоступность aliases внутри Dokploy network.

`pnpm exec vitest run --project unit tests/unit/learningObservability.test.ts`
использует настоящий MeterProvider и InMemoryMetricExporter: 1000 разных ID
дают один ряд; секретные причины/некорректные ID не экспортируются; проверяются
histogram, assignment лог, trace correlation, очистка настоящих SDK span/log
и поздний старт SDK после импорта Payload hooks.
Это проверка генерации и privacy, не подтверждение доставки в прод collector.

Отдельная локальная проверка, без Kubernetes и БД приложения:

```sh
BUILDX_CONFIG=/tmp/lms-observability-buildx docker build -f observability/Dockerfile.collector -t lms-observability-local:0.145.0 observability
node observability/validate-local.mjs
```

Скрипт использует временные Docker network/containers Collector 0.145.0,
Prometheus 3.9.1 и Grafana 12.3.2. Настоящий Prometheus принимает remote write,
проверяются counter/histogram/self metrics, три OTLP HTTP receiver signals,
service filter и resource privacy. Trace/log sinks временно заменены на debug
только в локальной копии config; продуктивная доставка Loki/Tempo этим не
доказывается. Все шесть PromQL проверяются в Prometheus, dashboard/rules
принимаются настоящим Grafana API. Временный Grafana не исполняет alerts и
не отправляет уведомления. Скрипт удаляет только созданные им containers,
network и tmp directory.

Официальные источники: [JS exporters](https://opentelemetry.io/docs/languages/js/exporters/),
[Metrics SDK](https://opentelemetry.io/docs/specs/otel/metrics/sdk/),
[JavaScript SDK metrics API](https://open-telemetry.github.io/opentelemetry-js/modules/_opentelemetry_sdk-metrics.html).
