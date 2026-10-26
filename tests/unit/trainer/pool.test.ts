import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getRunnerPool, TrainerRunnerError } from '@/server/trainer/pool'

/**
 * Пул процессов песочницы на настоящих дочерних процессах.
 *
 * Вместо runner-child.mjs запускается подставной раннер с тем же протоколом:
 * он сообщает своё окружение, падает или зависает по команде теста. Так
 * проверяется сам пул — граница окружения, отказы и замена процессов — без
 * подмены child_process.
 */

// Каждый тест поднимает настоящие процессы: под нагрузкой их старт не укладывается в 5 с по умолчанию.
vi.setConfig({ testTimeout: 20_000 })

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/telemetry', () => ({ logger }))

const PROBE = fileURLToPath(new URL('../../fixtures/trainer-runner-probe.mjs', import.meta.url))
const POOL_KEY = Symbol.for('lms.trainer.runnerPool')

type Pool = ReturnType<typeof getRunnerPool>
type Echo = { value: unknown; pid: number }

function resetPool(): void {
  const holder = globalThis as unknown as Record<symbol, Pool | undefined>
  holder[POOL_KEY]?.dispose()
  delete holder[POOL_KEY]
}

function run<T>(pool: Pool, payload: Record<string, unknown>, timeLimitMs = 5000): Promise<T> {
  return pool.run<T>('execute', payload, timeLimitMs)
}

/** Процесс исчез из таблицы процессов — значит, пул уже получил его exit. */
async function waitForExit(pid: number): Promise<void> {
  await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow(), { timeout: 15_000, interval: 20 })
}

beforeEach(() => {
  vi.clearAllMocks()
  resetPool()
  vi.stubEnv('TRAINER_RUNNER_PATH', PROBE)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetPool()
  vi.unstubAllEnvs()
})

describe('пул песочницы: граница окружения', () => {
  it('запускает раннер с пустым окружением и флагом --no-node-snapshot, даже когда у сервера есть секреты', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://secret@db/lms')
    vi.stubEnv('PAYLOAD_SECRET', 'server-secret')
    vi.stubEnv('NODE_OPTIONS', '--require=/tmp/evil.js')
    const probe = await run<{ env: string[]; execArgv: string[] }>(getRunnerPool(), { action: 'env' })
    // __CF_USER_TEXT_ENCODING macOS дописывает любому процессу сама, от сервера она не приходит.
    expect(probe.env.filter((name) => name !== '__CF_USER_TEXT_ENCODING')).toEqual([])
    expect(probe.execArgv).toContain('--no-node-snapshot')
  })
})

describe('пул песочницы: ответы раннера', () => {
  it('ошибку раннера отдаёт как TrainerRunnerError с его текстом, без текста — с понятной заменой', async () => {
    const pool = getRunnerPool()
    await expect(run(pool, { action: 'fail', error: 'ReferenceError: x is not defined' })).rejects.toMatchObject({ name: 'TrainerRunnerError', message: 'ReferenceError: x is not defined' })
    const silent = run(pool, { action: 'fail' })
    await expect(silent).rejects.toBeInstanceOf(TrainerRunnerError)
    await expect(silent).rejects.toThrow('Песочница вернула ошибку без описания')
  })

  it('служебное сообщение и ответ с чужим id не завершают текущее задание', async () => {
    expect(await run(getRunnerPool(), { action: 'stale' })).toBe('свой ответ')
  })

  it('вывод раннера в stderr попадает в журнал предупреждением не длиннее 500 символов', async () => {
    const text = 'stderr-маркер '.repeat(60)
    expect(await run(getRunnerPool(), { action: 'stderr', text })).toBe('записано')
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalled(), { timeout: 10_000 })
    const [message, attributes] = logger.warn.mock.calls[0] as [string, Record<string, string>]
    expect(message).toBe('Песочница тренажёра написала в stderr')
    expect(attributes['trainer.runner.stderr'].length).toBeLessThanOrEqual(500)
    expect(text.startsWith(attributes['trainer.runner.stderr'])).toBe(true)
  })
})

describe('пул песочницы: падения и перезапуск', () => {
  it('процесс, упавший во время задания, отклоняет только его, следующее задание получает новый процесс', async () => {
    const pool = getRunnerPool()
    const first = await run<Echo>(pool, { action: 'echo', value: 1 })
    await expect(run(pool, { action: 'exit', code: 3 })).rejects.toThrow('Песочница завершилась досрочно (code=3, signal=-)')
    await waitForExit(first.pid)
    const next = await run<Echo>(pool, { action: 'echo', value: 2 })
    expect(next.value).toBe(2)
    expect(next.pid).not.toBe(first.pid)
  })

  it('зависший процесс убивается по таймауту и заменяется новым', async () => {
    const pool = getRunnerPool()
    const first = await run<Echo>(pool, { action: 'echo', value: 1 })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const hung = run(pool, { action: 'hang' }, 100)
    const settled = hung.catch((error: unknown) => error)
    // Лимит задания плюс 2 с на накладные расходы IPC.
    await vi.advanceTimersByTimeAsync(2099)
    expect(await Promise.race([settled, Promise.resolve('ещё ждёт')])).toBe('ещё ждёт')
    await vi.advanceTimersByTimeAsync(1)
    expect(await settled).toMatchObject({ name: 'TrainerRunnerError', message: 'Песочница не ответила в отведённое время' })
    vi.useRealTimers()
    await waitForExit(first.pid)
    const next = await run<Echo>(pool, { action: 'echo', value: 'после таймаута' })
    expect(next).toMatchObject({ value: 'после таймаута' })
    expect(next.pid).not.toBe(first.pid)
  })

  // Дефект pool.ts:218-223 — по таймауту процесс помечается свободным (finish) и
  // убивается, но остаётся в списке workers до события exit. Задание, пришедшее
  // в этот промежуток (новая отправка или drain после ответа второго процесса),
  // уходит в убитый процесс и отклоняется «Песочница завершилась досрочно».
  it.fails('задание, пришедшее сразу после таймаута, не попадает в убитый процесс — дефект: pool.ts:218 оставляет убитый процесс свободным до exit', async () => {
    const pool = getRunnerPool()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let next: Promise<Echo> | undefined
    const hung = run(pool, { action: 'hang' }, 0).catch(() => {
      next = run<Echo>(pool, { action: 'echo', value: 'сразу после таймаута' })
    })
    await vi.advanceTimersByTimeAsync(2000)
    await hung
    vi.useRealTimers()
    expect(next).toBeDefined()
    await expect(next).resolves.toMatchObject({ value: 'сразу после таймаута' })
  })

  it('задание, которое нельзя передать по IPC, отклоняется сразу, а процесс заменяется', async () => {
    const pool = getRunnerPool()
    const first = await run<Echo>(pool, { action: 'echo', value: 1 })
    await expect(run(pool, { action: 'echo', value: 10n })).rejects.toThrow(/^Не удалось передать задание песочнице: .*BigInt/)
    await waitForExit(first.pid)
    const next = await run<Echo>(pool, { action: 'echo', value: 3 })
    expect(next.pid).not.toBe(first.pid)
  })
})

describe('пул песочницы: отказы и перегрузка', () => {
  it('без скрипта раннера сразу отвечает понятной ошибкой с подсказкой TRAINER_RUNNER_PATH', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const failure = run(getRunnerPool(), { action: 'echo', value: 1 })
    await expect(failure).rejects.toBeInstanceOf(TrainerRunnerError)
    await expect(failure).rejects.toThrow(/Не найден скрипт песочницы.*TRAINER_RUNNER_PATH/)
    expect(logger.error).toHaveBeenCalledWith('Песочница тренажёра не запускается', expect.any(TrainerRunnerError))
  })

  it('если упавший процесс нечем заменить, отказ получают все ожидающие задания, а пул потом восстанавливается', async () => {
    const pool = getRunnerPool()
    const crashing = run(pool, { action: 'exit', code: 5, delayMs: 300 }).catch((error: Error) => error.message)
    const hanging = run(pool, { action: 'hang' }).catch(() => 'остановлен')
    const exists = vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const queued = [run(pool, { action: 'echo', value: 'a' }), run(pool, { action: 'echo', value: 'b' })]
    const outcomes = await Promise.allSettled(queued)
    for (const outcome of outcomes) {
      expect(outcome.status).toBe('rejected')
      expect((outcome as PromiseRejectedResult).reason).toBeInstanceOf(TrainerRunnerError)
      expect((outcome as PromiseRejectedResult).reason.message).toMatch(/^Не найден скрипт песочницы/)
    }
    expect(await crashing).toMatch(/^Песочница завершилась досрочно \(code=5/)
    exists.mockRestore()
    expect(await run<Echo>(pool, { action: 'echo', value: 'снова работает' })).toMatchObject({ value: 'снова работает' })
    resetPool()
    await hanging
  })

  it('синхронный отказ запуска процесса заворачивает в TrainerRunnerError, а не роняет сервер', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    // Аргумент длиннее ARG_MAX: spawn бросает E2BIG синхронно, как при нехватке ресурсов ОС.
    vi.stubEnv('TRAINER_RUNNER_PATH', `/${'x'.repeat(2 * 1024 * 1024)}.mjs`)
    await expect(run(getRunnerPool(), { action: 'echo', value: 1 })).rejects.toThrow(/^Не удалось запустить песочницу: spawn E2BIG/)
  })

  it('больше 32 заданий в очереди — немедленный отказ с признаком перегрузки', async () => {
    const pool = getRunnerPool()
    // Два задания заняли оба процесса, ещё 32 ждут в очереди.
    for (let index = 0; index < 2 + 32; index += 1) run(pool, { action: 'hang' }).catch(() => undefined)
    const overflow = run(pool, { action: 'echo', value: 'лишнее' })
    await expect(overflow).rejects.toMatchObject({ name: 'TrainerRunnerError', overloaded: true, message: 'Проверка перегружена, попробуйте через несколько секунд' })
  })
})
