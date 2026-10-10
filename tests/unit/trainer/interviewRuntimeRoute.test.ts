import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InterviewError, interviewCode, interviewLanguage, interviewStarter } from '@/lib/trainer/interview'
import { LANGUAGE_OPTIONS } from '@/lib/trainer/constants'

const auth = vi.fn()
const find = vi.fn()
const create = vi.fn()
const update = vi.fn()
const runRuntime = vi.fn()
const previewRuntime = vi.fn()
const getTrainerAccess = vi.fn()
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ auth, find, create, update, logger: { error: vi.fn() } }) }))
vi.mock('@/server/trainer/runtime', () => ({ runRuntime, previewRuntime }))
vi.mock('@/server/trainer/sandbox', () => ({ compileTypeScript: vi.fn() }))
vi.mock('@/server/trainer-access', () => ({ getTrainerAccess, invalidateTrainerAccess: vi.fn() }))
vi.mock('@/payload/hooks/learningAccessLock', () => ({ lockLearningAccess: vi.fn() }))

const { POST } = await import('@/app/api/trainer/interview/[token]/run/route')
const token = 'aa573b25-ab70-4b9f-aec4-9dd78d38b109'
let room: { members: number[]; language: string; endedAt: string | null; sourceTaskKnown: boolean; sourceTaskId: number | null }

function request(language = 'go', code = interviewStarter('go'), origin = 'https://lms.test') {
  return POST(new Request(`https://lms.test/api/trainer/interview/${token}/run`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ language, code }),
  }), { params: Promise.resolve({ token }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ user: { id: 7, isActive: true } })
  getTrainerAccess.mockResolvedValue({ hasAccess: true, admin: false, canAccessTask: () => true })
  room = { members: [7], language: 'go', endedAt: null, sourceTaskKnown: true, sourceTaskId: 42 }
  find.mockImplementation(async () => ({ docs: [room] }))
  runRuntime.mockResolvedValue({ status: 'passed', tests: [], totalCount: 0, passedCount: 0, consoleOutput: ['42'], totalMs: 2 })
  previewRuntime.mockResolvedValue({ html: '<h1>Hello</h1>' })
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('lms.trainer.rateLimit.interview-run')]
})

describe('собеседования Go, Python и frontend', () => {
  it.each(['go', 'python'] as const)('запускает %s один раз без тестов и без записи прогресса или комнаты', async (language) => {
    const response = await request(language, interviewStarter(language))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ result: { consoleOutput: ['42'], tests: [], totalCount: 0 } })
    expect(runRuntime).toHaveBeenCalledWith(expect.objectContaining({ language, cases: [], allowNoTests: true }))
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it.each(['html', 'react', 'next'] as const)('отдаёт предпросмотр %s без проверки задачи и начисления прогресса', async (language) => {
    const response = await request(language, interviewStarter(language))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ preview: { html: '<h1>Hello</h1>' } })
    expect(runRuntime).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('возвращает Next.js capability path без внутреннего адреса runtime', async () => {
    const preview = { previewPath: '/api/trainer/preview/' + 'a'.repeat(48) + '/', leaseToken: 'a'.repeat(48), expiresAt: '2026-10-10T12:02:00Z' }
    previewRuntime.mockResolvedValue(preview)
    const response = await request('next', interviewStarter('next'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ preview })
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('проверяет членство, завершение, исходную задачу, Origin и авторизацию до запуска', async () => {
    room.members = [99]
    expect((await request()).status).toBe(403)
    room.members = [7]
    room.endedAt = new Date().toISOString()
    expect((await request()).status).toBe(410)
    room.endedAt = null
    getTrainerAccess.mockResolvedValue({ hasAccess: true, admin: false, canAccessTask: () => false })
    expect((await request()).status).toBe(403)
    getTrainerAccess.mockResolvedValue({ hasAccess: true, admin: false, canAccessTask: () => true })
    expect((await request('go', '', 'https://foreign.test')).status).toBe(403)
    auth.mockResolvedValue({ user: null })
    expect((await request()).status).toBe(401)
    expect(runRuntime).not.toHaveBeenCalled()
    expect(previewRuntime).not.toHaveBeenCalled()
  })

  it('не запускает невалидный проект, неизвестный язык и превышение rate limit', async () => {
    expect((await request('react', 'not JSON')).status).toBe(400)
    expect((await request('java', '')).status).toBe(400)
    expect((await request('js', '')).status).toBe(400)
    for (let i = 0; i < 10; i++) expect((await request()).status).toBe(200)
    expect((await request()).status).toBe(429)
    expect(runRuntime).toHaveBeenCalledTimes(10)
  })

  it('принимает все языки справочника и не допускает небезопасные файлы проекта', () => {
    for (const { value } of LANGUAGE_OPTIONS) {
      expect(interviewLanguage(value)).toBe(value)
      expect(interviewCode(interviewStarter(value), value)).toBeTruthy()
    }
    expect(() => interviewCode('{"../app.tsx":"bad"}', 'react')).toThrow(InterviewError)
  })
})
