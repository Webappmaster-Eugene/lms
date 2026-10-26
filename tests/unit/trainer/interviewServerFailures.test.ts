import { beforeEach, describe, expect, it, vi } from 'vitest'

import { interviewStarter } from '@/lib/trainer/interview'
import { TrainerRunnerError } from '@/server/trainer/pool'

/**
 * Сбои инфраструктуры в комнате собеседования: ответ не раскрывает текст
 * исключения, а в журнал уходит только имя ошибки.
 */

const auth = vi.fn()
const find = vi.fn()
const logError = vi.fn()
const runRuntime = vi.fn()
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ auth, find, logger: { error: logError } }) }))
vi.mock('@/server/trainer/runtime', () => ({ runRuntime, previewRuntime: vi.fn() }))
vi.mock('@/server/trainer/sandbox', () => ({ compileTypeScript: vi.fn() }))
vi.mock('@/server/trainer-access', () => ({ getTrainerAccess: async () => ({ hasAccess: true, admin: false, canAccessTask: () => true }), invalidateTrainerAccess: vi.fn() }))
vi.mock('@/payload/hooks/learningAccessLock', () => ({ lockLearningAccess: vi.fn() }))

const { POST } = await import('@/app/api/trainer/interview/[token]/run/route')
const token = 'aa573b25-ab70-4b9f-aec4-9dd78d38b109'

const runGo = () => POST(new Request(`https://lms.test/api/trainer/interview/${token}/run`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'JWT token' },
  body: JSON.stringify({ language: 'go', code: interviewStarter('go') }),
}), { params: Promise.resolve({ token }) })

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ user: { id: 7, isActive: true } })
  find.mockResolvedValue({ docs: [{ members: [7], language: 'go', endedAt: null, sourceTaskKnown: true, sourceTaskId: null }] })
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('lms.trainer.rateLimit.interview-run')]
})

describe('комната собеседования: сбои', () => {
  it('недоступный runtime — 503 с его понятным текстом', async () => {
    runRuntime.mockRejectedValue(new TrainerRunnerError('Runtime не отвечает. Повторите запуск позже'))
    const response = await runGo()
    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'Runtime не отвечает. Повторите запуск позже' })
    expect(logError).not.toHaveBeenCalled()
  })

  it('непредвиденная ошибка — 503 без текста исключения, в журнале только имя ошибки', async () => {
    find.mockRejectedValue(new RangeError('postgres://lms:secret@db/lms timeout'))
    const response = await runGo()
    expect(response.status).toBe(503)
    const body = await response.text()
    expect(JSON.parse(body)).toEqual({ error: 'Комната временно недоступна. Повторите попытку' })
    expect(body).not.toContain('secret')
    expect(logError).toHaveBeenCalledWith({ msg: 'Interview room request failed', error: 'RangeError' })
    expect(JSON.stringify(logError.mock.calls)).not.toContain('secret')
  })

  it('выброшенное не-Error значение журналируется как UnknownError', async () => {
    find.mockRejectedValue('строка вместо ошибки')
    expect((await runGo()).status).toBe(503)
    expect(logError).toHaveBeenCalledWith({ msg: 'Interview room request failed', error: 'UnknownError' })
  })
})
