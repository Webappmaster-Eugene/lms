import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrainerRunResult } from '@/lib/trainer/types'
import { TRAINER_LIMITS } from '@/lib/trainer/constants'
import { TrainerRunnerError } from '@/server/trainer/pool'

const auth = vi.fn()
const find = vi.fn()
const runRuntime = vi.fn()
const getTrainerAccess = vi.fn()
const saveTrainerProgress = vi.fn()

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ auth, find }) }))
vi.mock('@/server/trainer/runtime', () => ({ runRuntime }))
vi.mock('@/server/trainer-access', () => ({
  getTrainerAccess,
  TrainerAccessError: class TrainerAccessError extends Error {},
}))
vi.mock('@/lib/trainer/save-progress', () => ({ saveTrainerProgress }))
vi.mock('@/lib/telemetry', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

const { POST } = await import('@/app/api/trainer/submit/route')
const failed: TrainerRunResult = { status: 'failed', tests: [{ name: 'Скрытый', hidden: true, passed: false, durationMs: 1 }], passedCount: 0, totalCount: 1, consoleOutput: [], totalMs: 1 }
let task: Record<string, unknown>

function request(input: unknown = { taskId: 42, language: 'go', code: 'package main' }) {
  return POST(new Request('https://lms.test/api/trainer/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ user: { id: 7 } })
  getTrainerAccess.mockResolvedValue({ canAccessTask: () => true })
  task = { id: 42, isPublished: true, languages: ['go'], checkMode: 'program', runtimeCases: [
    { name: 'Публичный', input: '2 2', expected: '4', hidden: false },
    { name: 'Скрытый', input: '0 0', expected: '0', hidden: true },
  ] }
  find.mockImplementation(async () => ({ docs: [task] }))
  runRuntime.mockResolvedValue(failed)
  saveTrainerProgress.mockResolvedValue({ completed: false, awardedPoints: null })
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('lms.trainer.rateLimit.submit')]
})

describe('POST /api/trainer/submit: серверные проверки Go и frontend', () => {
  it('гость и пользователь без доступа не запускают runtime и не сохраняют прогресс', async () => {
    auth.mockResolvedValue({ user: null })
    expect((await request()).status).toBe(401)
    auth.mockResolvedValue({ user: { id: 7 } })
    getTrainerAccess.mockResolvedValue({ canAccessTask: () => false })
    expect((await request()).status).toBe(403)
    expect(find).not.toHaveBeenCalled()
    expect(runRuntime).not.toHaveBeenCalled()
    expect(saveTrainerProgress).not.toHaveBeenCalled()
  })

  it('не доверяет клиентскому результату или cases: исполняет полные серверные проверки', async () => {
    const response = await request({ taskId: 42, language: 'go', code: 'package main', cases: [{ expected: 'FORGED' }], customCases: [{ input: 'safe', expected: 'FORGED' }], allowNoTests: true, result: { status: 'passed', passedCount: 99, totalCount: 99 } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ result: { status: 'failed' }, completed: false })
    expect(runRuntime).toHaveBeenCalledWith({ language: 'go', code: 'package main', cases: task.runtimeCases, timeLimitMs: 5000 })
    expect(JSON.stringify(runRuntime.mock.calls)).not.toContain('FORGED')
    expect(runRuntime.mock.calls[0][0]).not.toHaveProperty('allowNoTests')
    expect(saveTrainerProgress).toHaveBeenCalledWith(expect.objectContaining({ task, language: 'go', result: failed }))
  })

  it.each(['html', 'react', 'next'])('для %s исполняет в runtime публичные и скрытые DOM-проверки', async (language) => {
    task.languages = [language]
    task.checkMode = 'dom'
    task.runtimeCases = [{ name: 'Публичный', hidden: false, checks: [{ selector: 'button', text: 'OK' }] }, { name: 'Скрытый', hidden: true, checks: [{ selector: '.secret', visible: true }] }]
    const code = JSON.stringify({ 'app/page.tsx': 'export default () => <button>OK</button>' })
    const response = await request({ taskId: 42, language, code, customCases: [{ checks: [{ selector: '*', visible: true }] }] })
    expect(response.status).toBe(200)
    expect(runRuntime).toHaveBeenCalledWith(expect.objectContaining({ language, code, cases: task.runtimeCases }))
    expect(saveTrainerProgress).toHaveBeenCalledWith(expect.objectContaining({ result: failed }))
  })

  it('отклоняет неизвестный и неподдерживаемый язык, неверный режим и чрезмерный размер', async () => {
    expect((await request({ taskId: 42, language: 'python', code: 'x' })).status).toBe(400)
    expect((await request({ taskId: 42, language: 'react', code: '{}' })).status).toBe(400)
    expect((await request({ taskId: 42, language: 'go', code: 'x'.repeat(TRAINER_LIMITS.maxCodeLength + 1) })).status).toBe(400)
    task.checkMode = 'dom'
    expect((await request()).status).toBe(500)
    expect(runRuntime).not.toHaveBeenCalled()
    expect(saveTrainerProgress).not.toHaveBeenCalled()
  })

  it('отклоняет чрезмерный размер всего JSON, даже если само решение короткое', async () => {
    expect((await request({ taskId: 42, language: 'go', code: 'package main', padding: 'x'.repeat(256 * 1024) })).status).toBe(413)
    expect(runRuntime).not.toHaveBeenCalled()
    expect(saveTrainerProgress).not.toHaveBeenCalled()
  })

  it('не даёт зачёт задачам без ожидаемого результата или с одними действиями DOM', async () => {
    task.runtimeCases = []
    expect((await request()).status).toBe(500)
    task.runtimeCases = [{ name: 'Без ожидаемого вывода', hidden: false, input: '' }]
    expect((await request()).status).toBe(500)
    task.languages = ['react']
    task.checkMode = 'dom'
    task.runtimeCases = [{ name: 'Только действие', hidden: false, checks: [{ selector: 'button', action: 'click' }] }]
    expect((await request({ taskId: 42, language: 'react', code: '{"App.tsx":"export default () => null"}' })).status).toBe(500)
    expect(runRuntime).not.toHaveBeenCalled()
    expect(saveTrainerProgress).not.toHaveBeenCalled()
  })

  it('не пишет прогресс при недоступной среде и ограничивает время runtime', async () => {
    task.timeLimitMs = 100_000
    await request()
    expect(runRuntime.mock.calls[0][0].timeLimitMs).toBe(TRAINER_LIMITS.maxTimeLimitMs)
    task.timeLimitMs = 1
    await request()
    expect(runRuntime.mock.calls[1][0].timeLimitMs).toBe(500)
    saveTrainerProgress.mockClear()
    runRuntime.mockRejectedValueOnce(new TrainerRunnerError('runtime unavailable'))
    expect((await request()).status).toBe(503)
    expect(saveTrainerProgress).not.toHaveBeenCalled()
  })
})
