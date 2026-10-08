import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const image = 'lms-observability-local:0.145.0'
const prefix = `lms-otel-check-${process.pid}`
const directory = mkdtempSync(join(tmpdir(), 'lms-otel-check-'))
const containers = []
let networkCreated = false
const docker = (...args) => execFileSync('docker', args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GF_SECURITY_ADMIN_PASSWORD: grafanaPassword },
}).trim()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const attribute = (key, stringValue) => ({ key, value: { stringValue } })
const now = BigInt(Date.now()) * 1000000n
const start = String(now - 1000000000n)
const end = String(now)
const grafanaPassword = randomBytes(24).toString('hex')
const resource = (service) => ({ attributes: [attribute('service.name', service), attribute('process.command_line', 'synthetic-private-marker')] })
const labels = [attribute('resource', 'lesson'), attribute('outcome', 'deny'), attribute('reason', 'unassigned')]
const traceId = 'a'.repeat(32)
const spanId = 'b'.repeat(16)

function payloads(service) {
  return {
    metrics: { resourceMetrics: [{ resource: resource(service), scopeMetrics: [{ scope: { name: 'lms.learning' }, metrics: [
      { name: 'lms_learning_access_total', sum: { aggregationTemporality: 2, isMonotonic: true, dataPoints: [{ attributes: labels, asInt: '1', startTimeUnixNano: start, timeUnixNano: end }] } },
      { name: 'lms_learning_access_duration', unit: 's', histogram: { aggregationTemporality: 2, dataPoints: [{ attributes: labels.slice(0, 2), count: '1', sum: 0.25, explicitBounds: [0.5, 1], bucketCounts: ['1', '0', '0'], startTimeUnixNano: start, timeUnixNano: end }] } },
    ] }] }] },
    logs: { resourceLogs: [{ resource: resource(service), scopeLogs: [{ scope: { name: 'lms.learning' }, logRecords: [{ timeUnixNano: end, severityNumber: 13, severityText: 'WARN', body: { stringValue: 'learning.access' }, attributes: labels, traceId, spanId }] }] }] },
    traces: { resourceSpans: [{ resource: resource(service), scopeSpans: [{ scope: { name: 'lms.learning' }, spans: [{ name: 'learning.access', traceId, spanId, startTimeUnixNano: start, endTimeUnixNano: end, attributes: labels, status: { code: 1 } }] }] }] },
  }
}

function port(name, internal) {
  const config = JSON.parse(docker('inspect', name))[0]
  return config.NetworkSettings.Ports[`${internal}/tcp`][0].HostPort
}

try {
  const original = readFileSync(fileURLToPath(new URL('./otel-collector.yaml', import.meta.url)), 'utf8')
  // Local trace/log sinks deliberately use debug; production exporters stay unchanged.
  const local = original.replace('exporters:\n', 'exporters:\n  debug:\n    verbosity: detailed\n')
    .replace('exporters: [otlp_grpc/tempo]', 'exporters: [debug]')
    .replace('exporters: [otlp_http/loki]', 'exporters: [debug]')
    .replace('level: warn', 'level: info')
  writeFileSync(join(directory, 'collector.yaml'), local)
  writeFileSync(join(directory, 'prometheus.yaml'), 'global:\n  scrape_interval: 15s\nscrape_configs: []\n')
  docker('network', 'create', prefix)
  networkCreated = true
  const prom = `${prefix}-prometheus`
  docker('run', '-d', '--name', prom, '--network', prefix, '--network-alias', 'proof-prometheus', '--read-only', '--memory', '192m', '--tmpfs', '/prometheus:size=64m,uid=65534,gid=65534', '-p', '127.0.0.1::9090', '-v', `${join(directory, 'prometheus.yaml')}:/etc/prometheus/prometheus.yml:ro`, 'prom/prometheus:v3.9.1', '--config.file=/etc/prometheus/prometheus.yml', '--web.enable-remote-write-receiver', '--storage.tsdb.retention.time=1h')
  containers.push(prom)
  const collector = `${prefix}-collector`
  docker('run', '-d', '--name', collector, '--network', prefix, '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '192m', '--tmpfs', '/tmp:size=8m', '-e', 'GOMEMLIMIT=144MiB', '-e', 'LMS_PROMETHEUS_REMOTE_WRITE_ENDPOINT=http://proof-prometheus:9090/api/v1/write', '-p', '127.0.0.1::4318', '-p', '127.0.0.1::13133', '-v', `${join(directory, 'collector.yaml')}:/etc/otelcol-contrib/config.yaml:ro`, image)
  containers.push(collector)
  const otlp = `http://127.0.0.1:${port(collector, 4318)}`
  const health = `http://127.0.0.1:${port(collector, 13133)}`
  const prometheus = `http://127.0.0.1:${port(prom, 9090)}`
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const states = await Promise.allSettled([fetch(health), fetch(`${prometheus}/-/ready`)])
    if (states.every((result) => result.status === 'fulfilled' && result.value.ok)) break
    if (attempt === 29) throw new Error('Local receiver/Prometheus did not become ready')
    await wait(200)
  }
  docker('exec', collector, '/bin/busybox', 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1:13133/')
  for (const service of ['lms-platform', 'other-app']) {
    for (const [signal, body] of Object.entries(payloads(service))) {
      const response = await fetch(`${otlp}/v1/${signal}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) })
      assert.equal(response.status, 200, `${signal} receiver`)
    }
  }
  let result
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`${prometheus}/api/v1/query?query=${encodeURIComponent('lms_learning_access_total')}`)
    const body = await response.json()
    if (body.data?.result?.length) { result = body.data.result; break }
    await wait(200)
  }
  assert.equal(result?.length, 1)
  assert.equal(result[0].value[1], '1')
  assert.equal(result[0].metric.service_name, 'lms-platform')
  assert.equal(result[0].metric.outcome, 'deny')
  assert.equal(JSON.stringify(result).includes('synthetic-private-marker'), false)
  assert.equal(JSON.stringify(result).includes('process_command_line'), false)
  const histogram = await (await fetch(`${prometheus}/api/v1/query?query=${encodeURIComponent('lms_learning_access_duration_seconds_count{service_name="lms-platform"}')}`)).json()
  assert.equal(histogram.data.result[0]?.value[1], '1')
  let selfReady = false
  for (let attempt = 0; attempt < 125; attempt += 1) {
    const response = await fetch(`${prometheus}/api/v1/query?query=${encodeURIComponent('up{service_name="lms-platform",component="lms-mentor-otel"}')}`)
    const body = await response.json()
    if (body.data?.result?.some((point) => point.value[1] === '1')) { selfReady = true; break }
    await wait(200)
  }
  assert.equal(selfReady, true)
  const rules = JSON.parse(readFileSync(fileURLToPath(new URL('./grafana/lms-learning.alerts.json', import.meta.url)), 'utf8'))
  for (const rule of rules) {
    const response = await fetch(`${prometheus}/api/v1/query?query=${encodeURIComponent(rule.data[0].model.expr)}`)
    const body = await response.json()
    assert.equal(response.status, 200, `${rule.uid}: PromQL`)
    assert.equal(body.status, 'success', `${rule.uid}: PromQL`)
  }
  const grafana = `${prefix}-grafana`
  docker('run', '-d', '--name', grafana, '--network', prefix, '--read-only', '--memory', '256m', '--tmpfs', '/var/lib/grafana:size=128m,uid=472,gid=472', '--tmpfs', '/var/log/grafana:size=8m,uid=472,gid=472', '-p', '127.0.0.1::3000', '-e', 'GF_SECURITY_ADMIN_USER=localtest', '-e', 'GF_SECURITY_ADMIN_PASSWORD', '-e', 'GF_ANALYTICS_REPORTING_ENABLED=false', '-e', 'GF_ANALYTICS_CHECK_FOR_UPDATES=false', '-e', 'GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES=false', '-e', 'GF_PLUGINS_PREINSTALL=', '-e', 'GF_UNIFIED_ALERTING_EXECUTE_ALERTS=false', 'grafana/grafana:12.3.2')
  containers.push(grafana)
  const grafanaUrl = `http://127.0.0.1:${port(grafana, 3000)}`
  const grafanaHeaders = { authorization: `Basic ${Buffer.from(`localtest:${grafanaPassword}`).toString('base64')}`, 'content-type': 'application/json' }
  let grafanaReady = false
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const health = await fetch(`${grafanaUrl}/api/health`)
      if (health.ok) { grafanaReady = true; break }
    } catch { /* The temporary container may still be starting. */ }
    await wait(200)
  }
  assert.equal(grafanaReady, true)
  for (const [path, body] of [
    ['/api/datasources', { name: 'Prometheus', uid: 'prometheus', type: 'prometheus', url: 'http://proof-prometheus:9090', access: 'proxy', isDefault: true }],
    ['/api/folders', { uid: 'lms-learning', title: 'LMS learning' }],
    ['/api/dashboards/db', { dashboard: JSON.parse(readFileSync(fileURLToPath(new URL('./grafana/lms-learning.dashboard.json', import.meta.url)), 'utf8')), folderUid: 'lms-learning', overwrite: true }],
    ...rules.map((rule) => ['/api/v1/provisioning/alert-rules', rule]),
  ]) {
    const response = await fetch(`${grafanaUrl}${path}`, { method: 'POST', headers: grafanaHeaders, body: JSON.stringify(body) })
    assert.equal(response.ok, true, `${path}: HTTP ${response.status}`)
  }
  const logRead = spawnSync('docker', ['logs', collector], { encoding: 'utf8' })
  assert.equal(logRead.status, 0)
  const logs = logRead.stdout + logRead.stderr
  assert.equal(logs.includes('other-app'), false)
  assert.equal(logs.includes('synthetic-private-marker'), false)
  assert.equal(logs.includes('learning.access'), true)
  assert.equal(logs.includes('LogRecord #0'), true)
  assert.equal(logs.includes('Span #0'), true)
  console.error(JSON.stringify({ receiverSignals: 3, healthProbe: 'passed', realPrometheusRemoteWrite: 'passed', histogramSecondsName: 'passed', onlyLmsServiceAccepted: 'passed', resourcePrivacy: 'passed', traceLogDebugSinks: 'passed', collectorSelfMetrics: 'passed', alertPromql: rules.length, grafanaDashboardAndAlertApi: 'passed' }))
} finally {
  for (const container of containers.reverse()) docker('rm', '-f', container)
  if (networkCreated) docker('network', 'rm', prefix)
  rmSync(directory, { recursive: true, force: true })
}
