import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

// Контейнер получает 768 МБ, один экземпляр PGlite занимает около 550 МБ.
// Запрос с неограниченным ростом памяти снимаем раньше OOM, чтобы остальные кейсы досчитались.
const MEMORY_LIMIT_BYTES = Number(process.env.SQL_MEMORY_LIMIT_BYTES) || 680 * 1024 * 1024
const SETUP_LIMIT_MS = 20000
const DATA_DIR = process.env.SQL_DATA_DIR || '/runtime/pgdata.tar'

let input = ''
for await (const chunk of process.stdin) input += chunk
const job = JSON.parse(input)
// PID 1 watchdog remains independent if the gateway or this worker stops.
const hardTimer = setTimeout(() => process.exit(124), 100000)
hardTimer.unref()

const wasmPath = fileURLToPath(new URL('./pglite.wasm', import.meta.resolve('@electric-sql/pglite')))
const wasmModule = await WebAssembly.compile(await readFile(wasmPath))

/** Поток живёт между кейсами: повторный импорт и прогрев PGlite дороже самого запроса. */
function startWorker() {
  const worker = new Worker(new URL('./sql-case.mjs', import.meta.url), {
    workerData: { wasmModule, dataDirPath: DATA_DIR },
    resourceLimits: { maxOldGenerationSizeMb: 192 },
    stdout: true,
    stderr: true,
  })
  // Вывод PGlite не должен попасть в stdout: это канал JSON-ответа gateway.
  worker.stdout.resume()
  worker.stderr.resume()
  const state = { worker, listener: undefined }
  worker.on('message', (message) => state.listener?.({ kind: 'message', message }))
  worker.on('error', (error) => state.listener?.({ kind: 'error', error }))
  worker.on('exit', () => state.listener?.({ kind: 'exit' }))
  return new Promise((resolve) => {
    state.listener = (event) => {
      if (event.kind === 'message' && event.message?.type === 'idle') resolve(state)
      else if (event.kind !== 'message') resolve(undefined)
    }
  })
}

/** Возвращает результат и признак, что поток больше нельзя использовать. */
function runCase(state, item) {
  return new Promise((resolve) => {
    let timer
    // До «ready» запрос ученика ещё не начинался: любой сбой здесь - сбой среды.
    let started = false
    const finish = (result, broken = false) => {
      clearTimeout(timer)
      clearTimeout(setupTimer)
      clearInterval(watch)
      state.listener = undefined
      resolve({ result, broken })
    }
    const setupTimer = setTimeout(() => finish({ status: 'infrastructure', error: 'Подготовка данных не уложилась во время' }, true), SETUP_LIMIT_MS)
    const watch = setInterval(() => {
      if (process.memoryUsage().rss > MEMORY_LIMIT_BYTES) finish(started ? { status: 'memory' } : { status: 'infrastructure', error: 'Не хватило памяти на подготовку данных' }, true)
    }, 20)
    state.listener = (event) => {
      if (event.kind === 'message') {
        if (event.message?.type === 'ready') {
          started = true
          clearTimeout(setupTimer)
          timer = setTimeout(() => finish({ status: 'timeout' }, true), job.timeLimitMs)
        } else if (event.message?.type === 'done') finish(event.message.result)
        else if (event.message?.type === 'setup-error') finish({ status: 'infrastructure', error: event.message.error }, true)
      } else if (!started) {
        finish({ status: 'infrastructure', error: event.kind === 'error' ? `Поток SQL упал до запроса: ${event.error?.message ?? ''}`.slice(0, 300) : 'Поток SQL завершился до запроса' }, true)
      } else if (event.kind === 'error') {
        // ERR_WORKER_OUT_OF_MEMORY: решение вернуло в JavaScript слишком много строк.
        finish(event.error?.code === 'ERR_WORKER_OUT_OF_MEMORY' ? { status: 'memory' } : { status: 'error', error: 'Сбой выполнения запроса' }, true)
      } else finish({ status: 'error', error: 'Выполнение запроса прервано' }, true)
    }
    state.worker.postMessage({ setup: item.setup, code: job.code, check: job.check, ordered: job.ordered === true })
  })
}

const results = []
let state
for (const item of job.cases) {
  state ??= await startWorker()
  if (!state) {
    process.stderr.write('SQL worker: поток не запустился')
    process.exit(1)
  }
  const { result, broken } = await runCase(state, item)
  if (result.status === 'infrastructure') {
    process.stderr.write(`SQL fixture: ${result.error}`)
    process.exit(1)
  }
  results.push(result)
  if (broken) {
    await state.worker.terminate().catch(() => {})
    state = undefined
  }
}
await state?.worker.terminate().catch(() => {})
process.stdout.write(JSON.stringify({ results }))
