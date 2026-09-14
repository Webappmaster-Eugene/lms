/**
 * Дочерний процесс-раннер тренажёра.
 *
 * Запускается через child_process.fork из pool.ts и делает две вещи:
 *   - execute   — прогоняет решение в свежем V8-изоляте (isolated-vm);
 *   - typecheck — компилирует и проверяет типы TypeScript.
 *
 * Почему отдельный процесс, а не всё это прямо в Next-сервере:
 *   1. isolated-vm на Node 20+ требует флаг --no-node-snapshot, и вешать его на
 *      весь веб-сервер не хочется;
 *   2. процесс форкается с ПУСТЫМ окружением — даже при гипотетическом побеге
 *      из изолята рядом нет ни DATABASE_URL, ни PAYLOAD_SECRET;
 *   3. зависший изолят убивается вместе с процессом, веб-сервер не страдает;
 *   4. проверка типов (200–400 мс CPU) уходит с главного event loop.
 *
 * Протокол IPC: получаем { id, kind, payload }, отвечаем
 * { id, ok: true, result } либо { id, ok: false, error }.
 */
import ivm from 'isolated-vm'

import { compile } from './typescript-service.mjs'

/** Запас поверх лимита задачи: изолят должен успеть свернуться сам. */
const DISPOSE_GRACE_MS = 500
const DEFAULT_MEMORY_LIMIT_MB = 32

function send(message) {
  if (process.send) process.send(message)
}

/**
 * Прогон собранного скрипта в изоляте.
 *
 * Контекст создаётся пустым: в нём нет ни require, ни process, ни fs, ни
 * setTimeout — таймеры подменяет сам харнесс. Наружу не передаётся ни одна
 * ссылка на объект хоста, результат копируется структурно (copy: true).
 */
async function execute(payload) {
  const timeLimitMs = clamp(payload.timeLimitMs, 500, 10000, 5000)
  const memoryLimit = clamp(payload.memoryLimitMb, 8, 256, DEFAULT_MEMORY_LIMIT_MB)

  const isolate = new ivm.Isolate({ memoryLimit })
  let disposed = false
  let timer = null

  const dispose = () => {
    if (disposed) return
    disposed = true
    if (timer) clearTimeout(timer)
    try {
      isolate.dispose()
    } catch {
      // изолят мог уже освободиться сам
    }
  }

  try {
    const context = await isolate.createContext()

    // Компиляция отделена от исполнения: только здесь ошибка означает, что
    // код не разобрался. Всё, что случится дальше, — уже ошибки выполнения.
    let script
    try {
      // Обёртка в функцию: собранный скрипт — это ТЕЛО функции, оно завершается
      // через return, а не выражением.
      script = await isolate.compileScript(`(function(){\n${payload.source}\n})()`, {
        filename: 'trainer-sandbox.js',
      })
    } catch (error) {
      return failure('compile_error', describeError(error), {
        errorLine: extractLine(error, payload.userStartLine, payload.userEndLine),
      })
    }

    const run = script.run(context, { timeout: timeLimitMs, promise: true, copy: true })

    const guard = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        // Лимит isolated-vm покрывает синхронное исполнение; микрозадачи после
        // него он уже не сторожит, поэтому у процесса есть свой таймер.
        dispose()
        reject(new TimeoutError())
      }, timeLimitMs + DISPOSE_GRACE_MS)
    })

    return await Promise.race([run, guard])
  } catch (error) {
    if (error instanceof TimeoutError || isTimeout(error)) {
      return failure(
        'timeout',
        `Превышен лимит времени (${timeLimitMs} мс). Похоже на бесконечный цикл.`,
        { totalMs: timeLimitMs },
      )
    }

    if (isMemoryLimit(error)) {
      return failure('error', `Превышен лимит памяти (${memoryLimit} МБ).`)
    }

    return failure('error', describeError(error), {
      errorLine: extractLine(error, payload.userStartLine, payload.userEndLine),
    })
  } finally {
    dispose()
  }
}

/** Результат-заглушка для аварий уровня хоста. */
function failure(status, error, extra) {
  return {
    status,
    tests: [],
    passedCount: 0,
    totalCount: 0,
    consoleOutput: [],
    error,
    totalMs: 0,
    ...extra,
  }
}

class TimeoutError extends Error {
  constructor() {
    super('timeout')
    this.name = 'TrainerTimeoutError'
  }
}

function isTimeout(error) {
  return typeof error?.message === 'string' && error.message.includes('Script execution timed out')
}

/**
 * Признаки исчерпания памяти изолятом.
 *
 * isolated-vm сообщает об этом по-разному в зависимости от того, где именно
 * кончилась память: при выделении массива, при росте кучи или уже после того,
 * как изолят был снесён.
 */
function isMemoryLimit(error) {
  const message = typeof error?.message === 'string' ? error.message : ''

  return (
    message.includes('heap out of memory') ||
    message.includes('Array buffer allocation') ||
    message.includes('memory limit') ||
    message.includes('Isolate was disposed') ||
    message.includes('Isolate is disposed')
  )
}

function describeError(error) {
  if (!error) return 'Неизвестная ошибка песочницы'
  const name = error.name && error.name !== 'Error' ? `${error.name}: ` : ''
  return `${name}${error.message ?? String(error)}`.slice(0, 1000)
}

/**
 * Номер строки из стека синтаксической ошибки. Харнесс в этот момент ещё не
 * создан — скрипт не скомпилировался, — поэтому пересчёт делается здесь.
 * Обёртка добавляет одну строку сверху, её и вычитаем.
 */
function extractLine(error, userStartLine, userEndLine) {
  const stack = typeof error?.stack === 'string' ? error.stack : ''
  const match = /trainer-sandbox\.js:(\d+)/.exec(stack)
  if (!match) return undefined
  const absolute = Number(match[1]) - 1
  if (
    typeof userStartLine !== 'number' ||
    typeof userEndLine !== 'number' ||
    absolute < userStartLine ||
    absolute > userEndLine
  ) {
    return undefined
  }
  return absolute - userStartLine + 1
}

function clamp(value, min, max, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.round(value), min), max)
}

process.on('message', (message) => {
  const { id, kind, payload } = message ?? {}

  const respond = (promise) =>
    promise.then(
      (result) => send({ id, ok: true, result }),
      (error) => send({ id, ok: false, error: describeError(error) }),
    )

  if (kind === 'execute') {
    respond(execute(payload ?? {}))
    return
  }

  if (kind === 'typecheck') {
    respond(Promise.resolve().then(() => compile(payload ?? {})))
    return
  }

  if (kind === 'ping') {
    send({ id, ok: true, result: 'pong' })
    return
  }

  send({ id, ok: false, error: `Неизвестный тип задания: ${String(kind)}` })
})

send({ ready: true })
