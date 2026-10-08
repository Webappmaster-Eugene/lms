import { writeFileSync } from 'node:fs'

const prometheus = { type: 'prometheus', uid: 'prometheus' }
const service = 'service_name="lms-platform"'
const access = `lms_learning_access_total{${service}}`
const duration = `lms_learning_access_duration_seconds_bucket{${service},resource=~"course|lesson"}`
const errors = `lms_learning_access_total{${service},resource="media",outcome="error"}`
const media = `lms_learning_access_total{${service},resource="media",outcome=~"allow|error"}`
const suspicious = `lms_learning_access_total{${service},outcome="deny",reason=~"invalid_source|invalid_origin|rate_limited|unauthenticated"}`
const assignments = `lms_learning_assignment_total{${service}}`
const collectorErrors = `{${service},component="lms-mentor-otel",__name__=~"otelcol_exporter_send_failed_(metric_points|log_records|spans)_total"}`
const collectorUp = `up{${service},component="lms-mentor-otel"}`
const p95 = `histogram_quantile(0.95, sum by (le) (rate(${duration}[5m])))`
const panels = []
let panelId = 1
function panel(type, title, expr, position, unit) {
  const id = panelId++
  panels.push({ id, type, title, datasource: prometheus, gridPos: position,
    targets: [{ refId: 'A', datasource: prometheus, expr, legendFormat: '{{resource}} {{outcome}} {{reason}}', range: true }],
    fieldConfig: { defaults: { unit: unit ?? 'short', color: { mode: 'palette-classic' } }, overrides: [] },
    options: type === 'stat' ? { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value' } : { legend: { displayMode: 'list', placement: 'bottom' } },
  })
  return id
}
panels.push({ id: panelId++, type: 'text', title: 'Как читать показатели', gridPos: { x: 0, y: 0, w: 24, h: 3 }, options: { mode: 'markdown', content: 'Отказы unassigned/explicit_deny ожидаемы для закрытых материалов. Подозрительные отказы оцениваются отдельно. Назначения означают validated mutation; подтверждённые изменения — в транзакционном аудите CMS. Разрешённые проверки не создают отдельный лог на каждый range. Runbook: docs/learning-observability.md.' } })
const mediaPanel = panel('stat', 'Ошибки видео за 5 минут', `sum(increase(${errors}[5m])) or vector(0)`, { x: 0, y: 3, w: 6, h: 4 })
const securityPanel = panel('stat', 'Подозрительные отказы за 5 минут', `sum(increase(${suspicious}[5m])) or vector(0)`, { x: 6, y: 3, w: 6, h: 4 })
const assignmentPanel = panel('stat', 'Изменения назначений за час', `sum(increase(${assignments}[1h])) or vector(0)`, { x: 12, y: 3, w: 6, h: 4 })
const latencyPanel = panel('stat', 'p95 проверки доступа', p95, { x: 18, y: 3, w: 6, h: 4 }, 's')
panel('timeseries', 'Проверки доступа по результату', `sum by (outcome) (rate(${access}[$__rate_interval]))`, { x: 0, y: 7, w: 12, h: 8 }, 'ops')
panel('timeseries', 'Отказы по ресурсу и причине', `sum by (resource,reason) (rate(lms_learning_access_total{${service},outcome="deny"}[$__rate_interval]))`, { x: 12, y: 7, w: 12, h: 8 }, 'ops')
panel('timeseries', 'Ошибки видео по причине', `sum by (reason) (rate(${errors}[$__rate_interval]))`, { x: 0, y: 15, w: 12, h: 8 }, 'ops')
panel('timeseries', 'p95 по ресурсу', `histogram_quantile(0.95, sum by (le,resource) (rate(lms_learning_access_duration_seconds_bucket{${service}}[$__rate_interval])))`, { x: 12, y: 15, w: 12, h: 8 }, 's')
panel('timeseries', 'Назначения по цели и эффекту', `sum by (target_type,effect) (increase(${assignments}[$__rate_interval]))`, { x: 0, y: 23, w: 12, h: 8 })
const collectorPanel = panel('timeseries', 'Ошибки экспорта collector', `sum(increase(${collectorErrors}[$__rate_interval])) or vector(0)`, { x: 12, y: 23, w: 12, h: 8 })
panels.push({ id: panelId++, type: 'logs', title: 'Отказы, ошибки и назначения', gridPos: { x: 0, y: 31, w: 24, h: 9 }, datasource: { type: 'loki', uid: 'loki' }, targets: [{ refId: 'A', datasource: { type: 'loki', uid: 'loki' }, expr: '{service_name="lms-platform"} |= "learning."', queryType: 'range' }], options: { showTime: true, showLabels: true, sortOrder: 'Descending', enableLogDetails: true, wrapLogMessage: true } })
panels.push({ id: panelId++, type: 'table', title: 'Трассы LMS — открыть trace ID для разбора', gridPos: { x: 0, y: 40, w: 24, h: 9 }, datasource: { type: 'tempo', uid: 'tempo' }, targets: [{ refId: 'A', datasource: { type: 'tempo', uid: 'tempo' }, queryType: 'traceql', query: '{ resource.service.name = "lms-platform" }', limit: 20, tableType: 'traces' }], options: { showHeader: true } })
const dashboard = { uid: 'lms-learning-access', title: 'MentorCareer — доступ и видео', tags: ['lms', 'learning', 'security'], timezone: 'browser', schemaVersion: 41, version: 1, editable: true, refresh: '30s', time: { from: 'now-6h', to: 'now' }, panels }

const rules = []
function rule(uid, title, expr, pending, role, summary, panel, severity = 'warning') {
  rules.push({ uid, title, orgID: 1, folderUID: 'lms-learning', ruleGroup: 'LMS learning', condition: 'B',
    for: pending, noDataState: 'OK', execErrState: 'KeepLast', isPaused: false,
    labels: { service: 'lms-platform', severity, responsible_role: role },
    annotations: { summary, description: 'Проверьте docs/learning-observability.md. Данные не содержат логинов, паролей и source URL.', __dashboardUid__: 'lms-learning-access', __panelId__: String(panel) },
    data: [
      { refId: 'A', datasourceUid: 'prometheus', relativeTimeRange: { from: 600, to: 0 }, model: { datasource: prometheus, expr, refId: 'A', instant: true, range: false, intervalMs: 1000, maxDataPoints: 43200 } },
      { refId: 'B', datasourceUid: '__expr__', relativeTimeRange: { from: 0, to: 0 }, model: { datasource: { type: '__expr__', uid: '__expr__' }, expression: 'A', refId: 'B', type: 'threshold', conditions: [{ type: 'query', evaluator: { type: 'gt', params: [0.5] }, operator: { type: 'and' }, reducer: { type: 'last', params: [] }, query: { params: ['B'] } }] } },
    ],
  })
}
rule('lms-media-errors', 'LMS: ошибки доставки видео', `((sum(rate(${errors}[5m])) / clamp_min(sum(rate(${media}[5m])), 0.001)) > bool 0.05) * (sum(increase(${errors}[5m])) >= bool 10) or vector(0)`, '3m', 'platform_operator', 'Более 5% ошибок видео и минимум 10 ошибок за 5 минут', mediaPanel)
rule('lms-suspicious-denials', 'LMS: всплеск подозрительных отказов', `(sum(increase(${suspicious}[5m])) >= bool 30) or vector(0)`, '5m', 'security_operator', '30+ invalid_source/origin/rate_limited/unauthenticated отказов за 5 минут', securityPanel)
rule('lms-assignment-burst', 'LMS: серия изменений назначений', `(sum(increase(${assignments}[15m])) > bool 50) or vector(0)`, '1m', 'learning_administrator', '50+ валидированных изменений доступа за 15 минут; сверить транзакционный аудит', assignmentPanel)
rule('lms-access-latency', 'LMS: медленная проверка доступа', `(${p95} > bool 2) * (sum(increase(lms_learning_access_duration_seconds_count{${service},resource=~"course|lesson"}[5m])) >= bool 50) or vector(0)`, '5m', 'platform_operator', 'p95 больше 2 секунд при 50+ измерениях за 5 минут', latencyPanel)
rule('lms-collector-export', 'LMS: сбои экспорта наблюдаемости', `(sum(increase(${collectorErrors}[5m])) > bool 0) or vector(0)`, '3m', 'platform_operator', 'Collector не доставляет metrics/logs/traces; проверить backend/DNS/очереди', collectorPanel)
rule('lms-collector-heartbeat', 'LMS: пропала телеметрия collector', `((time() - max(timestamp(${collectorUp}))) > bool 90) + (1 - (max(${collectorUp}) or vector(0))) or vector(1)`, '3m', 'platform_operator', 'Self metrics collector не обновлялись больше 90 секунд или self scrape неуспешен', collectorPanel)

writeFileSync(new URL('./lms-learning.dashboard.json', import.meta.url), JSON.stringify(dashboard, null, 2) + '\n')
writeFileSync(new URL('./lms-learning.alerts.json', import.meta.url), JSON.stringify(rules, null, 2) + '\n')
