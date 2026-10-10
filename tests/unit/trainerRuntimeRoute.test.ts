import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRAINER_LIMITS } from '@/lib/trainer/constants'
import { TrainerRunnerError } from '@/server/trainer/pool'

const auth = vi.fn()
const find = vi.fn()
const create = vi.fn()
const update = vi.fn()
const runRuntime = vi.fn()
const runRuntimePreview = vi.fn()
const getTrainerAccess = vi.fn()

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ auth, find, create, update }) }))
vi.mock('@/server/trainer/runtime', () => ({ runRuntime, runRuntimePreview }))
vi.mock('@/server/trainer-access', () => ({ getTrainerAccess }))
vi.mock('@/lib/telemetry', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

const { POST } = await import('@/app/api/trainer/run/route')
const output = { status: 'passed', tests: [], passedCount: 0, totalCount: 0, consoleOutput: ['42'], totalMs: 1 }
const publicCase = { name: 'Публичный', input: '2 2', expected: '4', hidden: false }
let task: Record<string, unknown>

function request(input: unknown = { taskId: 42, language: 'go', code: 'package main' }, raw = false) {
  return POST(new Request('https://lms.test/api/trainer/run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: raw ? String(input) : JSON.stringify(input),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ user: { id: 7 } })
  getTrainerAccess.mockResolvedValue({ canAccessTask: () => true })
  task = { id: 42, isPublished: true, languages: ['go'], checkMode: 'program', timeLimitMs: 5000, runtimeCases: [publicCase, { name: 'SECRET_TEST', input: 'SECRET_INPUT', expected: 'SECRET_EXPECTED', hidden: true }] }
  find.mockImplementation(async () => ({ docs: [task] }))
  runRuntime.mockResolvedValue(output)
  runRuntimePreview.mockResolvedValue({ result: output, preview: { html: '<h1>Ready</h1>' } })
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('lms.trainer.rateLimit.runtime-run')]
})

describe('POST /api/trainer/run: публичный прогон новых языков', () => {
  it('отказывает гостю и при отзыве доступа до чтения задачи и запуска', async () => {
    auth.mockResolvedValue({ user: null })
    expect((await request()).status).toBe(401)
    expect(find).not.toHaveBeenCalled()
    auth.mockResolvedValue({ user: { id: 7 } })
    getTrainerAccess.mockResolvedValue({ canAccessTask: () => false })
    expect((await request()).status).toBe(403)
    expect(find).not.toHaveBeenCalled()
    expect(runRuntime).not.toHaveBeenCalled()
  })

  it.each([null, [], true, 1, { taskId: 'not-number', language: 'go', code: 'x' }, { taskId: 42, language: 'python', code: 'x' }, { taskId: 42, language: 'js', code: 'x' }, { taskId: 42, language: 'go', code: ' ' }, { taskId: 42, language: 'go', code: 1 }])('отклоняет невалидный запрос %j до исполнения', async (input) => {
    expect((await request(input)).status).toBe(400)
    expect(runRuntime).not.toHaveBeenCalled()
    expect(runRuntimePreview).not.toHaveBeenCalled()
  })

  it('отклоняет ошибочный JSON и слишком длинный код', async () => {
    expect((await request('{broken', true)).status).toBe(400)
    expect((await request({ taskId: 42, language: 'go', code: 'x'.repeat(TRAINER_LIMITS.maxCodeLength + 1) })).status).toBe(400)
    expect(find).not.toHaveBeenCalled()
  })

  it('ограничивает всё тело запроса до JSON.parse, включая неизвестные поля', async () => {
    const response = await request({ taskId: 42, language: 'go', code: 'package main', padding: 'x'.repeat(256 * 1024) })
    expect(response.status).toBe(413)
    expect(find).not.toHaveBeenCalled()
    expect(runRuntime).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('при исчерпанном лимите не читает тело запроса', async () => {
    for (let i = 0; i < 20; i++) expect((await request()).status).toBe(200)
    const incoming = new Request('https://lms.test/api/trainer/run', { method: 'POST', body: '{broken' })
    expect((await POST(incoming)).status).toBe(429)
    expect(incoming.bodyUsed).toBe(false)
    expect(runRuntime).toHaveBeenCalledTimes(20)
  })

  it('проверяет публикацию, язык задачи и соответствующий режим', async () => {
    find.mockResolvedValueOnce({ docs: [] })
    expect((await request()).status).toBe(404)
    task.languages = ['react']
    expect((await request()).status).toBe(400)
    task.languages = ['go']
    task.checkMode = 'unit'
    expect((await request()).status).toBe(400)
    task.languages = ['react']
    task.checkMode = 'program'
    expect((await request({ taskId: 42, language: 'react', code: '{"App.tsx":"export default () => null"}' })).status).toBe(400)
    expect(runRuntime).not.toHaveBeenCalled()
    expect(runRuntimePreview).not.toHaveBeenCalled()
  })

  it('передаёт только публичные проверки сервера, игнорирует клиентские cases и ничего не пишет', async () => {
    const response = await request({ taskId: 42, language: 'go', code: 'package main', cases: [{ expected: 'CLIENT_OVERRIDE' }], result: { status: 'passed' } })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ result: output })
    expect(runRuntime).toHaveBeenCalledWith({ language: 'go', code: 'package main', cases: [publicCase], timeLimitMs: 5000, allowNoTests: true })
    expect(JSON.stringify(runRuntime.mock.calls)).not.toMatch(/SECRET_|CLIENT_OVERRIDE/)
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('не читает поля скрытой проверки при публичном запуске', async () => {
    task.runtimeCases = [publicCase, { hidden: true, get checks() { throw new Error('private fields accessed') }, get expected() { throw new Error('private fields accessed') } }]
    expect((await request()).status).toBe(200)
    expect(runRuntime.mock.calls[0][0].cases).toEqual([publicCase])
  })

  it('добавляет собственные проверки Go к публичным и ограничивает их размер', async () => {
    const custom = { name: 'Мой пример', input: '0 0', expected: '0' }
    expect((await request({ taskId: 42, language: 'go', code: 'package main', customCases: [custom] })).status).toBe(200)
    expect(runRuntime.mock.calls[0][0].cases).toEqual([publicCase, { ...custom, hidden: false }])
    for (const customCases of [[{ input: '1' }], Array.from({ length: 11 }, () => custom), [{ input: 'x'.repeat(2001), expected: '' }], [{ expected: '', path: '/' }], [{ expected: '', checks: [{ selector: 'h1', text: 'Hello' }] }]]) {
      expect((await request({ taskId: 42, language: 'go', code: 'package main', customCases })).status).toBe(400)
    }
    expect(runRuntime).toHaveBeenCalledOnce()
  })

  it.each(['html', 'react', 'next'])('проверяет файлы %s, запускает публичные DOM-проверки и отдаёт предпросмотр', async (language) => {
    const check = { name: 'Заголовок', hidden: false, checks: [{ selector: 'h1', text: 'Ready' }] }
    task = { ...task, languages: [language], checkMode: 'dom', runtimeCases: [check, { hidden: true, checks: [{ selector: '#secret', text: 'SECRET_DOM' }] }] }
    expect((await request({ taskId: 42, language, code: 'broken' })).status).toBe(400)
    const code = JSON.stringify({ 'App.tsx': 'export default () => <h1>Ready</h1>' })
    const response = await request({ taskId: 42, language, code })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ preview: { html: '<h1>Ready</h1>' } })
    expect(runRuntimePreview).toHaveBeenCalledWith(expect.objectContaining({ language, cases: [check] }))
    expect(runRuntime).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('ограничивает время и частоту выполнения, отдаёт инфраструктурную ошибку без записи', async () => {
    task.timeLimitMs = 100_000
    expect((await request()).status).toBe(200)
    expect(runRuntime.mock.calls[0][0].timeLimitMs).toBe(TRAINER_LIMITS.maxTimeLimitMs)
    task.timeLimitMs = 1
    expect((await request()).status).toBe(200)
    expect(runRuntime.mock.calls[1][0].timeLimitMs).toBe(500)
    runRuntime.mockRejectedValueOnce(new TrainerRunnerError('runtime down'))
    expect((await request()).status).toBe(503)
    for (let i = 0; i < 17; i++) expect((await request()).status).toBe(200)
    expect((await request()).status).toBe(429)
    expect(create).not.toHaveBeenCalled()
  })
})
