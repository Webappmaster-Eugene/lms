import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TrainerRunResult } from '@/lib/trainer/types'

/**
 * POST /api/trainer/submit
 *
 * Роут — единственная точка, где начисляются баллы, поэтому проверяется в
 * первую очередь то, что он НЕ доверяет клиенту: результат прогона берётся
 * только от серверной песочницы, а прогресс пишется только по её вердикту.
 */

const auth = vi.fn()
const find = vi.fn()
const create = vi.fn()
const update = vi.fn()
const runSolution = vi.fn()
const execute = vi.fn()
const initTransaction = vi.fn(async () => true)
const commitTransaction = vi.fn()
const killTransaction = vi.fn()

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ auth, find, create, update, db: { sessions: { test: { db: { execute } } } } })),
  createLocalReq: vi.fn(async () => ({ transactionID: 'test' })),
  initTransaction, commitTransaction, killTransaction,
}))
vi.mock('@/server/trainer/sandbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/trainer/sandbox')>()
  return { ...actual, runSolution }
})
vi.mock('@/lib/telemetry', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { POST } = await import('@/app/api/trainer/submit/route')

const USER = { id: 7, role: 'student' }
const TASK = {
  id: 42,
  slug: 'demo',
  isPublished: true,
  checkMode: 'unit',
  languages: ['js', 'ts'],
  pointsReward: 20,
}

function request(body: unknown, url = 'https://learn.mentorcareer.ru/api/trainer/submit'): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function passed(): TrainerRunResult {
  return {
    status: 'passed',
    tests: [{ name: 'кейс', hidden: false, passed: true, durationMs: 1 }],
    passedCount: 1,
    totalCount: 1,
    consoleOutput: [],
    totalMs: 1,
  }
}

function failed(): TrainerRunResult {
  return {
    status: 'failed',
    tests: [{ name: 'кейс', hidden: false, passed: false, durationMs: 1, message: 'не сошлось' }],
    passedCount: 0,
    totalCount: 1,
    consoleOutput: [],
    totalMs: 1,
  }
}

/** Ставит find так, чтобы задача находилась, а прогресса ещё не было. */
function givenTaskWithoutProgress(): void {
  find.mockImplementation(async ({ collection }: { collection: string }) => {
    if (collection === 'trainer-tasks') return { docs: [TASK], totalDocs: 1 }
    if (collection === 'points-transactions') return { docs: [{ amount: 20 }], totalDocs: 1 }
    return { docs: [], totalDocs: 0 }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ user: USER })
  runSolution.mockResolvedValue(passed())
  create.mockResolvedValue({ id: 1 })
  update.mockResolvedValue({ id: 1 })
  givenTaskWithoutProgress()

  // Счётчик частоты живёт в globalThis и переживает импорт модуля.
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('lms.trainer.rateLimit.submit')]
})

describe('POST /api/trainer/submit: доступ и валидация', () => {
  it('без авторизации — 401', async () => {
    auth.mockResolvedValue({ user: null })

    const response = await POST(request({ taskId: '42', language: 'js', code: 'x' }))

    expect(response.status).toBe(401)
    expect(runSolution).not.toHaveBeenCalled()
  })

  it('невалидный JSON — 400', async () => {
    const response = await POST(request('не json'))
    expect(response.status).toBe(400)
  })

  it.each([null, [], 1, true])('JSON без объекта (%s) — 400 без запуска и записи', async input => {
    const response = await POST(request(input))
    expect(response.status).toBe(400)
    expect(runSolution).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('без обязательных полей — 400', async () => {
    expect((await POST(request({ language: 'js', code: 'x' }))).status).toBe(400)
    expect((await POST(request({ taskId: '42', code: '   ' }))).status).toBe(400)
  })

  it('нечисловой taskId — 400, а не ошибка БД', async () => {
    const response = await POST(request({ taskId: 'не-число', language: 'js', code: 'x' }))

    expect(response.status).toBe(400)
    expect(find).not.toHaveBeenCalled()
  })

  it('слишком длинный код — 400', async () => {
    const response = await POST(
      request({ taskId: '42', language: 'js', code: 'x'.repeat(20_001) }),
    )

    expect(response.status).toBe(400)
    expect(runSolution).not.toHaveBeenCalled()
  })

  it('неопубликованная задача — 404', async () => {
    find.mockResolvedValue({ docs: [], totalDocs: 0 })

    const response = await POST(request({ taskId: '42', language: 'js', code: 'x' }))

    expect(response.status).toBe(404)
  })

  it('неподдерживаемый язык — 400', async () => {
    find.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === 'trainer-tasks'
        ? { docs: [{ ...TASK, languages: ['js'] }], totalDocs: 1 }
        : { docs: [], totalDocs: 0 },
    )

    const response = await POST(request({ taskId: '42', language: 'ts', code: 'x' }))

    expect(response.status).toBe(400)
    expect(runSolution).not.toHaveBeenCalled()
  })

  it('слишком частые отправки — 429', async () => {
    for (let i = 0; i < 30; i++) {
      await POST(request({ taskId: '42', language: 'js', code: 'x' }))
    }

    const response = await POST(request({ taskId: '42', language: 'js', code: 'x' }))

    expect(response.status).toBe(429)
  })
})

describe('POST /api/trainer/submit: вердикт', () => {
  it('результат клиента не принимается — прогон делает сервер', async () => {
    await POST(
      request({
        taskId: '42',
        language: 'js',
        code: 'решение',
        // Попытка подсунуть готовый результат.
        result: passed(),
      }),
    )

    expect(runSolution).toHaveBeenCalledWith(TASK, 'js', 'решение')
  })

  it('успешный прогон создаёт прогресс и начисляет баллы', async () => {
    const response = await POST(request({ taskId: '42', language: 'js', code: 'решение' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.completed).toBe(true)
    expect(body.awardedPoints).toBe(20)
    expect(create).toHaveBeenCalledOnce()

    const data = create.mock.calls[0][0].data
    expect(data.isCompleted).toBe(true)
    expect(data.verifiedBy).toBe('server')
    expect(data.user).toBe(7)
    expect(data.task).toBe(42)
    expect(data.completedAt).toBeTruthy()
  })

  it('неуспешный прогон не отмечает задачу решённой', async () => {
    runSolution.mockResolvedValue(failed())

    const response = await POST(request({ taskId: '42', language: 'js', code: 'плохое' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.completed).toBe(false)
    expect(body.awardedPoints).toBe(null)

    const data = create.mock.calls[0][0].data
    expect(data.isCompleted).toBe(false)
    expect(data.failedAttempts).toBe(1)
    expect(data.verifiedBy).toBeUndefined()
  })

  it('повторная успешная отправка не начисляет баллы второй раз', async () => {
    find.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === 'trainer-tasks'
        ? { docs: [TASK], totalDocs: 1 }
        : { docs: [{ id: 5, isCompleted: true, verifiedBy: 'server', attempts: 3, failedAttempts: 1 }], totalDocs: 1 },
    )

    const response = await POST(request({ taskId: '42', language: 'js', code: 'решение' }))
    const body = await response.json()

    expect(body.completed).toBe(true)
    expect(body.awardedPoints).toBe(null)
    expect(body.attempts).toBe(4)
    expect(update).toHaveBeenCalledOnce()
    expect(create).not.toHaveBeenCalled()
  })

  it('решённая задача не размечается обратно после неудачной попытки', async () => {
    runSolution.mockResolvedValue(failed())
    find.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === 'trainer-tasks'
        ? { docs: [TASK], totalDocs: 1 }
        : { docs: [{ id: 5, isCompleted: true, verifiedBy: 'server', attempts: 1, failedAttempts: 0 }], totalDocs: 1 },
    )

    await POST(request({ taskId: '42', language: 'js', code: 'плохое' }))

    expect(update.mock.calls[0][0].data.isCompleted).toBe(true)
  })

  it('старый клиентский зачёт не сохраняется после неудачного серверного прогона', async () => {
    runSolution.mockResolvedValue(failed())
    find.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === 'trainer-tasks'
        ? { docs: [TASK], totalDocs: 1 }
        : { docs: [{ id: 5, isCompleted: true, verifiedBy: 'client', attempts: 1, failedAttempts: 0 }], totalDocs: 1 },
    )
    const response = await POST(request({ taskId: '42', language: 'js', code: 'плохое' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ completed: false, awardedPoints: null })
    expect(update.mock.calls[0][0].data.isCompleted).toBe(false)
    expect(update.mock.calls[0][0].data.verifiedBy).toBeUndefined()
  })

  it('счётчики попыток растут', async () => {
    runSolution.mockResolvedValue(failed())
    find.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === 'trainer-tasks'
        ? { docs: [TASK], totalDocs: 1 }
        : { docs: [{ id: 5, isCompleted: false, attempts: 2, failedAttempts: 2 }], totalDocs: 1 },
    )

    await POST(request({ taskId: '42', language: 'js', code: 'плохое' }))

    const data = update.mock.calls[0][0].data
    expect(data.attempts).toBe(3)
    expect(data.failedAttempts).toBe(3)
  })

  it('сводка последнего прогона сохраняется', async () => {
    runSolution.mockResolvedValue(failed())

    await POST(request({ taskId: '42', language: 'ts', code: 'плохое' }))

    const summary = create.mock.calls[0][0].data.lastResult
    expect(summary.status).toBe('failed')
    expect(summary.language).toBe('ts')
    expect(summary.failedTests).toEqual(['кейс'])
  })
})

describe('POST /api/trainer/submit: отказы инфраструктуры', () => {
  it('недоступная песочница — 503, а не «решение неверное»', async () => {
    const { TrainerRunnerError } = await import('@/server/trainer/pool')
    runSolution.mockRejectedValue(new TrainerRunnerError('нет процессов'))

    const response = await POST(request({ taskId: '42', language: 'js', code: 'x' }))

    expect(response.status).toBe(503)
    expect(create).not.toHaveBeenCalled()
  })

  it('перегруженная очередь — 503 с понятным текстом', async () => {
    const { TrainerRunnerError } = await import('@/server/trainer/pool')
    runSolution.mockRejectedValue(new TrainerRunnerError('очередь', { overloaded: true }))

    const response = await POST(request({ taskId: '42', language: 'js', code: 'x' }))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toContain('перегружена')
  })

  it('некорректно настроенная задача — 500', async () => {
    const { TrainerSpecError } = await import('@/lib/trainer/spec')
    runSolution.mockRejectedValue(new TrainerSpecError('нет тестов'))

    const response = await POST(request({ taskId: '42', language: 'js', code: 'x' }))

    expect(response.status).toBe(500)
    expect(create).not.toHaveBeenCalled()
  })

  it('сбой записи прогресса — 500', async () => {
    create.mockRejectedValue(new Error('сеть отвалилась'))

    const response = await POST(request({ taskId: '42', language: 'js', code: 'x' }))

    expect(response.status).toBe(500)
  })

  it('успешная запись прогресса коммитится после блокировки пользователя', async () => {
    const response = await POST(request({ taskId: '42', language: 'js', code: 'решение' }))
    expect(response.status).toBe(200)
    expect(initTransaction).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledOnce()
    expect(commitTransaction).toHaveBeenCalledOnce()
    expect(killTransaction).not.toHaveBeenCalled()
    expect(create.mock.calls[0][0].req.transactionID).toBe('test')
  })

  it('ошибка записи откатывает транзакцию вместе с начислением', async () => {
    create.mockRejectedValueOnce(new Error('запись недоступна'))
    const response = await POST(request({ taskId: '42', language: 'js', code: 'решение' }))
    expect(response.status).toBe(500)
    expect(killTransaction).toHaveBeenCalledOnce()
    expect(commitTransaction).not.toHaveBeenCalled()
  })

  it('показывает фактически начисленную награду из транзакции', async () => {
    find.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'trainer-tasks') return { docs: [{ ...TASK, pointsReward: null }], totalDocs: 1 }
      if (collection === 'points-transactions') return { docs: [{ amount: 37 }], totalDocs: 1 }
      return { docs: [], totalDocs: 0 }
    })
    const response = await POST(request({ taskId: '42', language: 'js', code: 'решение' }))
    expect((await response.json()).awardedPoints).toBe(37)
  })
})
