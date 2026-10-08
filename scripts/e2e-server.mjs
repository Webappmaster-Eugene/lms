#!/usr/bin/env node
/**
 * Поднимает приложение для e2e и скриншотных тестов (webServer в Playwright).
 *
 * 1. Одноразовый Postgres (scripts/test-db.mjs), база lms_e2e_<порт> с нуля.
 * 2. `payload migrate` + детерминированный сид tests/e2e/fixtures/seed-e2e.ts.
 * 3. Production-сборка, если исходники изменились с прошлой (или E2E_BUILD=1;
 *    E2E_BUILD=0 — никогда не собирать).
 * 4. `next start` на порту E2E_APP_PORT (по умолчанию 3100).
 *
 * Почта выключена пустым SMTP_HOST, телеметрия — пустым OTEL-эндпоинтом.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { databaseUrl, migrateFresh, up } from './test-db.mjs'

const APP_DIR = fileURLToPath(new URL('../', import.meta.url))
const PORT = process.env.E2E_APP_PORT ?? '3100'
// База своя на каждый порт: e2e и скриншоты можно гонять параллельно.
const DB = `lms_e2e_${PORT}`

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl(DB),
  PAYLOAD_SECRET: 'e2e-test-secret-not-for-production-000000001',
  NEXT_PUBLIC_SERVER_URL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
  SMTP_HOST: '',
  OTEL_EXPORTER_OTLP_ENDPOINT: '',
  YANDEX_DISK_TOKEN: '',
  NEXT_TELEMETRY_DISABLED: '1',
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, { cwd: APP_DIR, env: { ...env, ...extraEnv }, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`[e2e] команда упала: ${command} ${args.join(' ')}`)
    process.exit(result.status ?? 1)
  }
}

await up()
await migrateFresh(DB, { env })
run('pnpm', ['payload', 'run', 'tests/e2e/fixtures/seed-e2e.ts'], { PAYLOAD_MIGRATING: 'true' })

/**
 * Отпечаток содержимого исходников: сборка пересобирается, только если он
 * изменился. По mtime сравнивать нельзя — его трогают генераторы и git checkout.
 */
function sourceHash() {
  const hash = createHash('sha256')
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else hash.update(full).update(readFileSync(full))
    }
  }
  walk(`${APP_DIR}src`)
  for (const file of ['next.config.mjs', 'package.json', 'pnpm-lock.yaml']) hash.update(readFileSync(`${APP_DIR}${file}`))
  return hash.digest('hex')
}

const STAMP = `${APP_DIR}.next/e2e-source.hash`
const current = sourceHash()
const stale = !existsSync(`${APP_DIR}.next/BUILD_ID`) || !existsSync(STAMP) || readFileSync(STAMP, 'utf8') !== current

if (process.env.E2E_BUILD === '1' || (process.env.E2E_BUILD !== '0' && stale)) {
  run('pnpm', ['build'])
  writeFileSync(STAMP, current)
}

const server = spawn('pnpm', ['exec', 'next', 'start', '-p', PORT], {
  cwd: APP_DIR,
  env: { ...env, NODE_ENV: 'production' },
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal))
}
server.on('exit', (code) => process.exit(code ?? 0))
