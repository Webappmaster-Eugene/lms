import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/trainer/compile и GET /api/trainer/solution.
 *
 * Первый роут ничего не пишет и служит только для подсветки ошибок типов.
 * Второй отдаёт эталонное решение — и главное, что здесь проверяется, это
 * что он не отдаёт его тому, кто ещё не решил задачу.
 */

const auth = vi.fn()
const find = vi.fn()
const compileTypeScript = vi.fn()

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ auth, find })) }))
vi.mock('@/server/trainer/sandbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/trainer/sandbox')>()
  return { ...actual, compileTypeScript }
})
vi.mock('@/lib/telemetry', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { POST } = await import('@/app/api/trainer/compile/route')
const { GET } = await import('@/app/api/trainer/solution/route')

const USER = { id: 7, role: 'student' }
const ADMIN = { id: 1, role: 'admin' }
const TASK = {
  id: 42,
  isPublished: true,
  checkMode: 'unit',
  languages: ['js', 'ts'],
  setupCode: 'const helper = 1',
  setupTypes: 'declare const helper: number',
  typeHarness: 'type case1 = 1',
  solutionCode: 'эталон js',
  solutionCodeTs: 'эталон ts',
  solutionNotes: 'разбор',
}

function compileRequest(body: unknown): Request {
  return new Request('https://learn.mentorcareer.ru/api/trainer/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function solutionRequest(taskId: string): Request {
  return new Request(`https://learn.mentorcareer.ru/api/trainer/solution?taskId=${taskId}`)
}

function givenTask(task: Record<string, unknown> = TASK, progress: unknown[] = []): void {
  find.mockImplementation(async ({ collection }: { collection: string }) =>
    collection === 'trainer-tasks'
      ? { docs: [task], totalDocs: 1 }
      : { docs: progress, totalDocs: progress.length },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ user: USER })
  compileTypeScript.mockResolvedValue({ js: 'скомпилировано', diagnostics: [] })
  givenTask()

  delete (globalThis as Record<symbol, unknown>)[Symbol.for('lms.trainer.rateLimit.compile')]
})

describe('POST /api/trainer/compile', () => {
  it('без авторизации — 401', async () => {
    auth.mockResolvedValue({ user: null })
    expect((await POST(compileRequest({ taskId: '42', code: 'x' }))).status).toBe(401)
  })

  it('невалидный JSON — 400', async () => {
    expect((await POST(compileRequest('не json'))).status).toBe(400)
  })

  it('без обязательных полей — 400', async () => {
    expect((await POST(compileRequest({ code: 'x' }))).status).toBe(400)
  })

  it('нечисловой taskId — 400', async () => {
    expect((await POST(compileRequest({ taskId: 'нет', code: 'x' }))).status).toBe(400)
    expect(find).not.toHaveBeenCalled()
  })

  it('слишком длинный код — 400', async () => {
    const response = await POST(compileRequest({ taskId: '42', code: 'x'.repeat(20_001) }))

    expect(response.status).toBe(400)
    expect(compileTypeScript).not.toHaveBeenCalled()
  })

  it('задача без TypeScript — 400', async () => {
    givenTask({ ...TASK, languages: ['js'] })

    expect((await POST(compileRequest({ taskId: '42', code: 'x' }))).status).toBe(400)
  })

  it('возвращает код и диагностики', async () => {
    compileTypeScript.mockResolvedValue({
      js: 'const a = 1',
      diagnostics: [{ line: 1, column: 7, code: 2322, message: 'ошибка', category: 'error' }],
    })

    const body = await (await POST(compileRequest({ taskId: '42', code: 'x' }))).json()

    expect(body.js).toBe('const a = 1')
    expect(body.diagnostics).toHaveLength(1)
  })

  it('компилятору отдаются объявления типов, а не исполняемая преамбула', async () => {
    await POST(compileRequest({ taskId: '42', code: 'x' }))

    expect(compileTypeScript.mock.calls[0][0].setupCode).toBe('declare const helper: number')
  })

  it('без объявлений типов берётся сама преамбула', async () => {
    givenTask({ ...TASK, setupTypes: null })

    await POST(compileRequest({ taskId: '42', code: 'x' }))

    expect(compileTypeScript.mock.calls[0][0].setupCode).toBe('const helper = 1')
  })

  it('блок проверки типов подключается только в режиме types', async () => {
    await POST(compileRequest({ taskId: '42', code: 'x' }))
    expect(compileTypeScript.mock.calls[0][0].typeHarness).toBe('')

    vi.clearAllMocks()
    compileTypeScript.mockResolvedValue({ js: '', diagnostics: [] })
    givenTask({ ...TASK, checkMode: 'types' })

    await POST(compileRequest({ taskId: '42', code: 'x' }))
    expect(compileTypeScript.mock.calls[0][0].typeHarness).toBe('type case1 = 1')
  })

  it('недоступный компилятор — 503', async () => {
    const { TrainerRunnerError } = await import('@/server/trainer/pool')
    compileTypeScript.mockRejectedValue(new TrainerRunnerError('нет процессов'))

    expect((await POST(compileRequest({ taskId: '42', code: 'x' }))).status).toBe(503)
  })

  it('слишком частые запросы — 429', async () => {
    for (let i = 0; i < 60; i++) await POST(compileRequest({ taskId: '42', code: 'x' }))

    expect((await POST(compileRequest({ taskId: '42', code: 'x' }))).status).toBe(429)
  })
})

describe('GET /api/trainer/solution', () => {
  it('без авторизации — 401', async () => {
    auth.mockResolvedValue({ user: null })
    expect((await GET(solutionRequest('42'))).status).toBe(401)
  })

  it('без taskId — 400', async () => {
    const response = await GET(new Request('https://learn.mentorcareer.ru/api/trainer/solution'))
    expect(response.status).toBe(400)
  })

  it('неопубликованная задача — 404', async () => {
    find.mockResolvedValue({ docs: [], totalDocs: 0 })
    expect((await GET(solutionRequest('42'))).status).toBe(404)
  })

  it('нерешённая задача — 403', async () => {
    givenTask(TASK, [])
    expect((await GET(solutionRequest('42'))).status).toBe(403)
  })

  it('нескольких неудачных попыток мало для разблокировки', async () => {
    givenTask(TASK, [{ isCompleted: false, failedAttempts: 4 }])
    expect((await GET(solutionRequest('42'))).status).toBe(403)
  })

  it('решённая задача открывает разбор', async () => {
    givenTask(TASK, [{ isCompleted: true, failedAttempts: 0 }])

    const body = await (await GET(solutionRequest('42'))).json()

    expect(body.solutionCode).toBe('эталон js')
    expect(body.solutionCodeTs).toBe('эталон ts')
    expect(body.solutionNotes).toBe('разбор')
  })

  it('пять неудачных попыток тоже открывают разбор', async () => {
    givenTask(TASK, [{ isCompleted: false, failedAttempts: 5 }])

    expect((await GET(solutionRequest('42'))).status).toBe(200)
  })

  it('администратору разбор доступен всегда', async () => {
    auth.mockResolvedValue({ user: ADMIN })
    givenTask(TASK, [])

    expect((await GET(solutionRequest('42'))).status).toBe(200)
  })
})
