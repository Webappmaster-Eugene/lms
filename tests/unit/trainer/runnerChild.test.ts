import { afterAll, describe, expect, it, vi } from 'vitest'

import { getRunnerPool, TrainerRunnerError } from '@/server/trainer/pool'

/**
 * Протокол и лимиты настоящего runner-child.mjs через публичный вход — пул.
 * Сервер всегда передаёт лимиты из спецификации задачи, но раннер обязан
 * сам держать их в границах: он последний рубеж перед чужим кодом.
 */

vi.mock('@/lib/telemetry', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

type RawResult = { status: string; error?: string; totalMs?: number }

afterAll(() => {
  const holder = globalThis as unknown as Record<symbol, { dispose(): void } | undefined>
  holder[Symbol.for('lms.trainer.runnerPool')]?.dispose()
})

describe('runner-child: лимиты и протокол', () => {
  it('слишком маленький лимит времени поднимается до 500 мс, бесконечный цикл обрывается таймаутом', async () => {
    const started = Date.now()
    const result = await getRunnerPool().run<RawResult>('execute', { source: 'while (true) {}', timeLimitMs: 1 }, 1)
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
    }, 5000)
    expect(result.status).toBe('error')
    expect(result.error).toBe('Превышен лимит памяти (8 МБ).')
    expect(await pool.run<RawResult>('execute', { source: 'return { status: "passed" }', timeLimitMs: 1000 }, 1000)).toEqual({ status: 'passed' })
  })

  it('неизвестный тип задания отклоняется явно, а не исполняется', async () => {
    const pool = getRunnerPool()
    const unknown = pool.run('eval' as never, { source: 'return 1' }, 1000)
    await expect(unknown).rejects.toBeInstanceOf(TrainerRunnerError)
    await expect(unknown).rejects.toThrow('Неизвестный тип задания: eval')
    expect(await pool.run('ping' as never, {}, 1000)).toBe('pong')
  })
})
