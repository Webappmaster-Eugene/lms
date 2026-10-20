#!/usr/bin/env node
/**
 * Установка зависимостей в CI с таймаутом и повтором.
 *
 *   node scripts/ci-install.mjs pnpm install --frozen-lockfile
 *   node scripts/ci-install.mjs npm ci --prefix landing
 *
 * Раннеры CI выходят в интернет через МТС, и загрузка из реестра npm иногда замирает
 * без ошибки: 20.10.2026 trainer-runtime полчаса стоял на 1091 пакете из 1094.
 * Зависшую попытку прерываем через CI_INSTALL_TIMEOUT_SEC (по умолчанию 8 минут; из кэша
 * установка на раннерах ci-lms идёт 2–13 с, запас оставлен под холодный кэш) и запускаем
 * заново: уже скачанное остаётся в сторе, поэтому повтор короткий.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const ATTEMPTS = 3
const DEFAULT_TIMEOUT_SEC = 480
// Пустая или нечисловая переменная дала бы таймаут 0/NaN, и каждая попытка обрывалась бы сразу.
const timeoutSec = Number(process.env.CI_INSTALL_TIMEOUT_SEC)
const TIMEOUT_MS = (Number.isFinite(timeoutSec) && timeoutSec > 0 ? timeoutSec : DEFAULT_TIMEOUT_SEC) * 1000
const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error('Использование: node scripts/ci-install.mjs <команда> [аргументы]')
  process.exit(2)
}
const label = [command, ...args].join(' ')

function attempt() {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    const timer = setTimeout(() => {
      console.log(`::warning::«${label}» не завершилась за ${TIMEOUT_MS / 1000} с — прерываю`)
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 10_000).unref()
    }, TIMEOUT_MS)
    child.on('error', (error) => {
      clearTimeout(timer)
      console.error(error)
      resolve(false)
    })
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      resolve(code === 0 && !signal)
    })
  })
}

for (let n = 1; n <= ATTEMPTS; n++) {
  if (await attempt()) process.exit(0)
  if (n < ATTEMPTS) {
    console.log(`::warning::«${label}» не удалась (попытка ${n} из ${ATTEMPTS}), повтор через 10 с`)
    await sleep(10_000)
  }
}
console.log(`::error::«${label}» не удалась за ${ATTEMPTS} попытки. Если все попытки прерваны по таймауту — проверьте доступ раннера к реестру npm; если падают сразу — смотрите вывод установки выше (например, lockfile не совпадает с package.json)`)
process.exit(1)
