#!/usr/bin/env node
/**
 * Скриншотные тесты в официальном контейнере Playwright той же версии, что в
 * package.json, — эталоны совпадают с CI (Linux) пиксель в пиксель.
 *
 *   node scripts/visual-docker.mjs                    # сравнить с эталонами
 *   node scripts/visual-docker.mjs --update-snapshots # переснять эталоны
 *
 * Приложение и лендинг поднимаются на хосте на своих портах (3102/3103) со
 * свежей базой, браузер в контейнере ходит к ним через host.docker.internal.
 * Шрифты рендерит браузер, поэтому место запуска сервера на снимки не влияет.
 */
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { browserServerUrl } from './test-db.mjs'

const APP_DIR = fileURLToPath(new URL('../', import.meta.url))
const APP_PORT = process.env.VISUAL_APP_PORT ?? '3102'
const LANDING_PORT = process.env.VISUAL_LANDING_PORT ?? '3103'
const version = JSON.parse(
  readFileSync(new URL('../node_modules/@playwright/test/package.json', import.meta.url), 'utf8'),
).version
const IMAGE = `mcr.microsoft.com/playwright:v${version}-noble`

const children = []
function start(script, env) {
  const child = spawn('node', [script], { cwd: APP_DIR, env: { ...process.env, ...env }, stdio: ['ignore', 'inherit', 'inherit'] })
  children.push(child)
  return child
}
function stopAll() {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM')
}
process.on('SIGINT', () => {
  stopAll()
  process.exit(130)
})

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // сервер ещё поднимается
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Не дождались ${url}`)
}

let code = 1
try {
  start('scripts/e2e-server.mjs', { E2E_APP_PORT: APP_PORT, E2E_BASE_URL: `http://host.docker.internal:${APP_PORT}` })
  start('scripts/landing-server.mjs', { E2E_LANDING_PORT: LANDING_PORT })
  await waitFor(`http://localhost:${APP_PORT}/api/health`, 30 * 60_000)
  await waitFor(`http://localhost:${LANDING_PORT}/`, 5 * 60_000)

  const result = spawnSync(
    'docker',
    [
      'run', '--rm', '--init', '--ipc=host',
      '--name', `lms-test-visual-${process.pid}`,
      '--add-host=host.docker.internal:host-gateway',
      '-v', `${APP_DIR}:/work`, '-w', '/work',
      '-e', 'CI=1', '-e', 'PW_NO_WEBSERVER=1',
      '-e', 'TEST_PG_URL',
      '-e', `E2E_BASE_URL=http://host.docker.internal:${APP_PORT}`,
      '-e', `E2E_LANDING_URL=http://host.docker.internal:${LANDING_PORT}`,
      IMAGE,
      'node', 'node_modules/@playwright/test/cli.js', 'test', '--project=visual', ...process.argv.slice(2),
    ],
    { stdio: 'inherit', env: { ...process.env, TEST_PG_URL: browserServerUrl() } },
  )
  code = result.status ?? 1
} catch (error) {
  console.error(error)
} finally {
  stopAll()
}
process.exit(code)
