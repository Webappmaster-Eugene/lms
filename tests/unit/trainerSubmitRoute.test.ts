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

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ auth, find, create, update })),
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
        : { docs: [{ id: 5, isCompleted: true, attempts: 3, failedAttempts: 1 }], totalDocs: 1 },
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
        : { docs: [{ id: 5, isCompleted: true, attempts: 1, failedAttempts: 0 }], totalDocs: 1 },
    )

    await POST(request({ taskId: '42', language: 'js', code: 'плохое' }))

    expect(update.mock.calls[0][0].data.isCompleted).toBe(true)
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

  it('гонка двух отправок дописывается в уже созданную запись', async () => {
    // Первая отправка успела создать запись между нашим find и create.
    let progressExists = false
    find.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'trainer-tasks') return { docs: [TASK], totalDocs: 1 }
      return progressExists
        ? { docs: [{ id: 9, isCompleted: false, attempts: 1, failedAttempts: 1 }], totalDocs: 1 }
        : { docs: [], totalDocs: 0 }
    })
    create.mockImplementation(async () => {
      progressExists = true
      throw new Error('duplicate key value violates unique constraint')
    })

    const response = await POST(request({ taskId: '42', language: 'js', code: 'решение' }))

    expect(response.status).toBe(200)
    expect(update).toHaveBeenCalledOnce()
    expect(update.mock.calls[0][0].id).toBe(9)
    expect(update.mock.calls[0][0].data.isCompleted).toBe(true)
    expect(update.mock.calls[0][0].data.attempts).toBe(2)
  })
})
