import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { getRunnerPool, TrainerRunnerError } from '@/server/trainer/pool'

/**
 * Протокол и лимиты настоящего runner-child.mjs через публичный вход — пул.
 * Сервер всегда передаёт лимиты из спецификации задачи, но раннер обязан
 * сам держать их в границах: он последний рубеж перед чужим кодом.
 */

vi.mock('@/lib/telemetry', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

type RawResult = { status: string; error?: string; totalMs?: number }
// Бюджет пула отделён от лимита в задании: проверяется, как раннер обходится
// с лимитом из payload, а холодный старт процесса под нагрузкой сюда не входит.
const POOL_BUDGET_MS = 20_000

beforeAll(async () => {
  const pool = getRunnerPool()
  await Promise.all([pool.run('ping' as never, {}, POOL_BUDGET_MS), pool.run('ping' as never, {}, POOL_BUDGET_MS)])
}, 60_000)

afterAll(() => {
  const holder = globalThis as unknown as Record<symbol, { dispose(): void } | undefined>
  holder[Symbol.for('lms.trainer.runnerPool')]?.dispose()
})

describe('runner-child: лимиты и протокол', { timeout: 30_000 }, () => {
  it('слишком маленький лимит времени поднимается до 500 мс, бесконечный цикл обрывается таймаутом', async () => {
    const started = Date.now()
    const result = await getRunnerPool().run<RawResult>('execute', { source: 'while (true) {}', timeLimitMs: 1 }, POOL_BUDGET_MS)
    expect(result).toMatchObject({ status: 'timeout', totalMs: 500 })
    expect(result.error).toContain('500 мс')
    expect(Date.now() - started).toBeGreaterThanOrEqual(450)
  })

  it('лимит памяти не опускается ниже 8 МБ, исчерпание памяти — ошибка решения, а не падение процесса', async () => {
    const pool = getRunnerPool()
    const result = await pool.run<RawResult>('execute', {
      source: 'const chunks = []; while (true) chunks.push(new Array(1e5).fill(1))',
      timeLimitMs: 5000,
      memoryLimitMb: 1,
    }, POOL_BUDGET_MS)
    expect(result.status).toBe('error')
    expect(result.error).toBe('Превышен лимит памяти (8 МБ).')
    expect(await pool.run<RawResult>('execute', { source: 'return { status: "passed" }', timeLimitMs: 1000 }, POOL_BUDGET_MS)).toEqual({ status: 'passed' })
  })

  it('неизвестный тип задания отклоняется явно, а не исполняется', async () => {
    const pool = getRunnerPool()
    const unknown = pool.run('eval' as never, { source: 'return 1' }, POOL_BUDGET_MS)
    await expect(unknown).rejects.toBeInstanceOf(TrainerRunnerError)
    await expect(unknown).rejects.toThrow('Неизвестный тип задания: eval')
    expect(await pool.run('ping' as never, {}, POOL_BUDGET_MS)).toBe('pong')
  })
})
