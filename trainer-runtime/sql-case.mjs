import { readFile } from 'node:fs/promises'
import { parentPort, workerData } from 'node:worker_threads'
import { PGlite } from '@electric-sql/pglite'
import { prepareCase, runSolutionCase } from './sql-engine.mjs'

const { wasmModule, dataDirPath } = workerData
const dataDir = await readFile(dataDirPath)

/** Экземпляр живёт только внутри этой функции: после возврата его память может собрать gc. */
async function runTask(task) {
  let db
  try {
    db = new PGlite({ loadDataDir: new Blob([dataDir]), pgliteWasmModule: wasmModule })
    await db.waitReady
  } catch (error) {
    // Отказ движка - сбой среды, а не ошибка в запросе ученика.
    parentPort.postMessage({ type: 'setup-error', error: error instanceof Error ? `PGlite: ${error.message.slice(0, 300)}` : 'PGlite не запустился' })
    await db?.close().catch(() => {})
    return
  }
  try {
    let parsers
    try {
      parsers = await prepareCase(db, task.setup)
    } catch (error) {
      parentPort.postMessage({ type: 'setup-error', error: error instanceof Error ? error.message.slice(0, 300) : 'setup failed' })
      return
    }
    // Лимит времени отсчитывается только с этого сообщения: старт экземпляра не вина решения.
    parentPort.postMessage({ type: 'ready' })
    parentPort.postMessage({ type: 'done', result: await runSolutionCase(db, { code: task.code, check: task.check, ordered: task.ordered, parsers }) })
  } finally {
    await db.close().catch(() => {})
  }
}

// Кейсы приходят строго по одному: следующий отправляется после ответа на предыдущий.
parentPort.on('message', async (task) => {
  await runTask(task)
  // Память WASM прежнего экземпляра должна освободиться до следующего, иначе сработает сторож.
  globalThis.gc?.()
})
parentPort.postMessage({ type: 'idle' })
