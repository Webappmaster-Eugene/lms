import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

import { logger } from '@/lib/telemetry'

/**
 * Пул дочерних процессов, исполняющих решения тренажёра.
 *
 * Пул один на процесс Next и переживает горячую перезагрузку в dev: ссылка
 * лежит в globalThis, иначе каждый ре-импорт модуля плодил бы новые процессы.
 */

export type RunnerJobKind = 'execute' | 'typecheck'

type PendingJob = {
  id: number
  kind: RunnerJobKind
  payload: unknown
  timeoutMs: number
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout> | null
  worker: Worker | null
}

type Worker = {
  child: ChildProcess
  busy: boolean
  /** Задание, которое сейчас считает этот процесс. */
  job: PendingJob | null
}

const POOL_SIZE = 2
/** Больше этого в очереди не держим: лучше честный отказ, чем растущая задержка. */
const MAX_QUEUE_LENGTH = 32
/** Запас поверх лимита задания на накладные расходы IPC и старт изолята. */
const JOB_OVERHEAD_MS = 2000

/**
 * Окружение дочернего процесса. Именно пустое, а не урезанное: рядом с чужим
 * кодом не должно быть ни DATABASE_URL, ни PAYLOAD_SECRET, ни NODE_OPTIONS.
 * Приведение типа нужно потому, что @types/node считает NODE_ENV обязательным.
 */
const EMPTY_ENV = {} as NodeJS.ProcessEnv

export class TrainerRunnerError extends Error {
  readonly overloaded: boolean

  constructor(message: string, options?: { overloaded?: boolean }) {
    super(message)
    this.name = 'TrainerRunnerError'
    this.overloaded = options?.overloaded === true
  }
}

/**
 * Путь к скрипту раннера.
 *
 * В dev он лежит в исходниках; в образе его кладёт рядом отдельный COPY, потому
 * что `output: 'standalone'` трассирует только то, что импортируется статически,
 * а раннер запускается как самостоятельный процесс.
 */
function resolveRunnerPath(): string {
  const override = process.env.TRAINER_RUNNER_PATH
  const candidates = [
    ...(override ? [override] : []),
    path.join(process.cwd(), 'src/server/trainer/runner-child.mjs'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  throw new TrainerRunnerError(
    `Не найден скрипт песочницы. Искали: ${candidates.join(', ')}. ` +
      'Задайте TRAINER_RUNNER_PATH или проверьте сборку образа.',
  )
}

class RunnerPool {
  private readonly workers: Worker[] = []
  private readonly queue: PendingJob[] = []
  private nextJobId = 1
  private disposed = false

  private spawn(): Worker {
    // Именно spawn, а не fork: бандлер Next разбирает аргумент fork() как путь к
    // модулю и падает на том, что он вычисляется в рантайме. У spawn первый
    // аргумент — бинарник node, разбирать там нечего.
    // Канал 'ipc' в stdio даёт те же child.send() и 'message', что и fork.
    const child = spawn(
      process.execPath,
      // isolated-vm на Node 20+ отказывается работать со снимком стартового состояния.
      ['--no-node-snapshot', resolveRunnerPath()],
      {
        // Пустое окружение: секретов и строки подключения к БД рядом с чужим кодом быть не должно.
        env: EMPTY_ENV,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      },
    )

    const worker: Worker = { child, busy: false, job: null }

    child.on('message', (message: unknown) => {
      const data = message as { id?: number; ok?: boolean; result?: unknown; error?: string }
      if (typeof data?.id !== 'number') return
      const job = worker.job
      if (!job || job.id !== data.id) return

      this.finish(worker)
      if (data.ok) {
        job.resolve(data.result)
      } else {
        job.reject(new TrainerRunnerError(data.error ?? 'Песочница вернула ошибку без описания'))
      }
      this.drain()
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      logger.warn('Песочница тренажёра написала в stderr', {
        'trainer.runner.stderr': String(chunk).slice(0, 500),
      })
    })

    child.on('exit', (code, signal) => {
      const job = worker.job
      this.finish(worker)
      if (job) {
        job.reject(
          new TrainerRunnerError(
            `Песочница завершилась досрочно (code=${code ?? '-'}, signal=${signal ?? '-'})`,
          ),
        )
      }
      const index = this.workers.indexOf(worker)
      if (index !== -1) this.workers.splice(index, 1)
      if (!this.disposed) this.drain()
    })

    child.on('error', (error) => {
      logger.error('Не удалось запустить песочницу тренажёра', error)
    })

    this.workers.push(worker)
    return worker
  }

  private finish(worker: Worker): void {
    if (worker.job?.timer) clearTimeout(worker.job.timer)
    worker.job = null
    worker.busy = false
  }

  /** Убивает зависший процесс: изолят мог застрять в микрозадачах после таймаута. */
  private kill(worker: Worker): void {
    try {
      worker.child.kill('SIGKILL')
    } catch {
      // процесс мог уже умереть
    }
  }

  private idleWorker(): Worker | null {
    const free = this.workers.find((worker) => !worker.busy)
    if (free) return free
    if (this.workers.length < POOL_SIZE) return this.spawn()
    return null
  }

  /**
   * Раздаёт очередь свободным процессам.
   *
   * Вызывается в том числе из обработчиков событий процесса, поэтому обязан не
   * бросать: отсутствующий скрипт раннера или отказ fork() уронили бы весь
   * сервер. Вместо этого такие сбои отклоняют очередь с понятной ошибкой.
   */
  private drain(): void {
    while (this.queue.length > 0) {
      let worker: Worker | null
      try {
        worker = this.idleWorker()
      } catch (error) {
        this.rejectAll(
          error instanceof TrainerRunnerError
            ? error
            : new TrainerRunnerError(
                `Не удалось запустить песочницу: ${error instanceof Error ? error.message : String(error)}`,
              ),
        )
        return
      }

      if (!worker) return

      const job = this.queue.shift()
      if (!job) return
      this.dispatch(worker, job)
    }
  }

  /** Отклоняет всю очередь: песочницу поднять не удалось, ждать нечего. */
  private rejectAll(error: TrainerRunnerError): void {
    logger.error('Песочница тренажёра не запускается', error)

    const pending = this.queue.splice(0, this.queue.length)
    for (const job of pending) {
      if (job.timer) clearTimeout(job.timer)
      job.reject(error)
    }
  }

  private dispatch(worker: Worker, job: PendingJob): void {
    worker.busy = true
    worker.job = job
    job.worker = worker

    job.timer = setTimeout(() => {
      // Процесс не ответил в срок — он больше не пригоден, поднимаем новый.
      this.finish(worker)
      this.kill(worker)
      job.reject(new TrainerRunnerError('Песочница не ответила в отведённое время'))
    }, job.timeoutMs)

    try {
      worker.child.send({ id: job.id, kind: job.kind, payload: job.payload })
    } catch (error) {
      this.finish(worker)
      this.kill(worker)
      job.reject(
        new TrainerRunnerError(
          `Не удалось передать задание песочнице: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
    }
  }

  run<T>(kind: RunnerJobKind, payload: unknown, timeLimitMs: number): Promise<T> {
    if (this.queue.length >= MAX_QUEUE_LENGTH) {
      return Promise.reject(
        new TrainerRunnerError('Проверка перегружена, попробуйте через несколько секунд', {
          overloaded: true,
        }),
      )
    }

    return new Promise<T>((resolve, reject) => {
      const job: PendingJob = {
        id: this.nextJobId++,
        kind,
        payload,
        timeoutMs: timeLimitMs + JOB_OVERHEAD_MS,
        resolve: resolve as (value: unknown) => void,
        reject,
        timer: null,
        worker: null,
      }
      this.queue.push(job)
      this.drain()
    })
  }

  dispose(): void {
    this.disposed = true
    for (const worker of this.workers) this.kill(worker)
    this.workers.length = 0
  }
}

const POOL_KEY = Symbol.for('lms.trainer.runnerPool')

type PoolHolder = { [POOL_KEY]?: RunnerPool }

/** Пул создаётся лениво: без задач тренажёра лишние процессы не нужны. */
export function getRunnerPool(): RunnerPool {
  const holder = globalThis as unknown as PoolHolder
  if (!holder[POOL_KEY]) {
    holder[POOL_KEY] = new RunnerPool()
  }
  return holder[POOL_KEY]
}
