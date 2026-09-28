import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import type { SubmitResponse } from '@/lib/trainer/api'
import type { TrainerTask } from '@/payload-types'
import { POST as submit } from '@/app/api/trainer/submit/route'
import { GET as solution } from '@/app/api/trainer/solution/route'
import { POST as compile } from '@/app/api/trainer/compile/route'
import { POST as supportMessage } from '@/app/api/support-message/route'
import { GET as health } from '@/app/(payload)/api/health/route'
import { POST as ydImport } from '@/app/api/yandex-disk/import/route'
import { GET as ydProxy } from '@/app/api/yandex-disk/proxy/route'
import { GET as ydStream } from '@/app/api/yandex-disk/stream/route'
import { createAdmin, createStudent, createSumTask, getTestPayload, login, type TestUser } from '../helpers/payload'

/**
 * Собственные route handlers из src/app/api вызываются напрямую с настоящим
 * Request и настоящим Payload: авторизация, валидация входа, запись прогресса,
 * начисление баллов, серверная песочница тренажёра.
 *
 * Сеть наружу запрещена: fetch подменён и падает на любой внешний адрес,
 * поэтому маршруты Яндекс.Диска проверяются только до обращения к диску.
 */
let payload: Payload
let task: TrainerTask

const externalFetch = vi.fn(async (input: unknown) => {
  throw new Error(`Внешняя сеть в тестах запрещена: ${String(input)}`)
})

function request(url: string, { token, method = 'POST', body, raw }: { token?: string; method?: string; body?: unknown; raw?: string } = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token) headers.set('Authorization', `JWT ${token}`)
  return new Request(`http://lms.test${url}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : (raw ?? (body === undefined ? undefined : JSON.stringify(body))),
  })
}

async function json<T = Record<string, unknown>>(response: Response): Promise<{ status: number; body: T }> {
  return { status: response.status, body: (await response.json()) as T }
}

async function newStudent(): Promise<{ user: TestUser; token: string }> {
  const user = await createStudent(payload)
  return { user, token: await login(payload, user) }
}

const submitAs = (token: string, code: string, extra: Record<string, unknown> = {}) =>
  submit(request('/api/trainer/submit', { token, body: { taskId: task.id, language: 'js', code, ...extra } }))

async function progressOf(userId: number, taskId = task.id) {
  const found = await payload.find({
    collection: 'user-trainer-progress',
    where: { user: { equals: userId }, task: { equals: taskId } },
    overrideAccess: true,
  })
  return found.docs[0]
}

beforeAll(async () => {
  payload = await getTestPayload()
  task = await createSumTask(payload, { pointsReward: 15 })
  vi.stubGlobal('fetch', externalFetch)
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/trainer/submit — вход', () => {
  it('без авторизации — 401', async () => {
    expect((await submit(request('/api/trainer/submit', { body: { taskId: task.id, code: 'x' } }))).status).toBe(401)
  })

  it('невалидный JSON — 400', async () => {
    const { token } = await newStudent()
    expect((await submit(request('/api/trainer/submit', { token, raw: '{нет' }))).status).toBe(400)
  })

  it.each([
    ['без taskId', { code: 'x' }],
    ['пустой код', { taskId: 1, code: '   ' }],
    ['taskId не число', { taskId: 'drop table', code: 'x' }],
  ])('%s — 400', async (_, body) => {
    const { token } = await newStudent()
    expect((await submit(request('/api/trainer/submit', { token, body }))).status).toBe(400)
  })

  it('код длиннее 20 000 символов — 400', async () => {
    const { token } = await newStudent()
    const { status, body } = await json(await submitAs(token, 'x'.repeat(20_001)))
    expect(status).toBe(400)
    expect(body.error).toMatch(/20000/)
  })

  it('неопубликованная задача — 404, как несуществующая', async () => {
    const { token } = await newStudent()
    const draft = await createSumTask(payload, { isPublished: false })
    expect((await submit(request('/api/trainer/submit', { token, body: { taskId: draft.id, code: 'x' } }))).status).toBe(404)
    expect((await submit(request('/api/trainer/submit', { token, body: { taskId: 987654, code: 'x' } }))).status).toBe(404)
  })

  it('язык, которого нет у задачи, — 400', async () => {
    const { token } = await newStudent()
    const jsOnly = await createSumTask(payload, { languages: ['js'] })
    const res = await submit(request('/api/trainer/submit', { token, body: { taskId: jsOnly.id, language: 'ts', code: 'x' } }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/trainer/submit — вердикт, прогресс, баллы', () => {
  it('неверное решение: failed, попытка и неудача засчитаны, баллов нет', async () => {
    const { user, token } = await newStudent()
    const { status, body } = await json<SubmitResponse>(await submitAs(token, 'function sum(a, b) { return a - b }'))
    expect(status).toBe(200)
    expect(body.result.status).toBe('failed')
    expect(body).toMatchObject({ completed: false, awardedPoints: null, attempts: 1 })
    expect(await progressOf(user.id)).toMatchObject({ isCompleted: false, attempts: 1, failedAttempts: 1 })
    expect((await payload.find({ collection: 'points-transactions', where: { user: { equals: user.id } } })).totalDocs).toBe(0)
  })

  it('решение, проходящее только открытый кейс, валится на скрытом', async () => {
    const { token } = await newStudent()
    const { body } = await json<SubmitResponse>(await submitAs(token, 'function sum(a, b) { return a === 1 ? 3 : 42 }'))
    expect(body.result.status).toBe('failed')
    expect(body.result.passedCount).toBe(1)
    expect(body.result.totalCount).toBe(2)
  })

  it('верное решение: passed, verifiedBy=server, баллы задачи начислены один раз', async () => {
    const { user, token } = await newStudent()
    await submitAs(token, 'function sum() { return 0 }')
    const { body } = await json<SubmitResponse>(await submitAs(token, 'function sum(a, b) { return a + b }'))
    expect(body.result.status).toBe('passed')
    expect(body).toMatchObject({ completed: true, awardedPoints: 15, attempts: 2 })
    const progress = await progressOf(user.id)
    expect(progress).toMatchObject({ isCompleted: true, verifiedBy: 'server', attempts: 2, failedAttempts: 1, language: 'js' })
    expect(progress.completedAt).toEqual(expect.any(String))
    expect((progress.lastResult as { status: string }).status).toBe('passed')

    // Повторная верная отправка: зачтено, но без новых баллов и без смены даты решения.
    const again = await json<SubmitResponse>(await submitAs(token, 'function sum(a, b) { return b + a }'))
    expect(again.body).toMatchObject({ completed: true, awardedPoints: null, attempts: 3 })
    expect((await progressOf(user.id)).completedAt).toBe(progress.completedAt)

    const txs = await payload.find({ collection: 'points-transactions', where: { user: { equals: user.id } } })
    expect(txs.docs.map((t) => [t.reason, t.amount])).toEqual([['trainer_task_completed', 15]])
    expect((await payload.findByID({ collection: 'users', id: user.id })).totalPoints).toBe(15)
  })

  it('неверная отправка после решения не снимает зачёт', async () => {
    const { user, token } = await newStudent()
    await submitAs(token, 'function sum(a, b) { return a + b }')
    const { body } = await json<SubmitResponse>(await submitAs(token, 'function sum() { return NaN }'))
    expect(body.result.status).toBe('failed')
    expect(body.completed).toBe(true)
    expect((await progressOf(user.id)).isCompleted).toBe(true)
  })

  it('решение на TypeScript проверяется компилятором и проходит', async () => {
    const { token } = await newStudent()
    const res = await submitAs(token, 'function sum(a: number, b: number): number {\n  return a + b\n}\n', { language: 'ts' })
    expect((await json<SubmitResponse>(res)).body.result.status).toBe('passed')
  })

  it('параллельные отправки одного студента не создают двух записей прогресса', async () => {
    const { user, token } = await newStudent()
    const results = await Promise.all([
      submitAs(token, 'function sum(a, b) { return a + b }'),
      submitAs(token, 'function sum(a, b) { return a + b }'),
    ])
    expect(results.map((r) => r.status)).toEqual([200, 200])
    const records = await payload.find({
      collection: 'user-trainer-progress', where: { user: { equals: user.id }, task: { equals: task.id } }, overrideAccess: true,
    })
    expect(records.totalDocs).toBe(1)
    expect(records.docs[0].attempts).toBe(2)
  })
})

describe('песочница через API: безопасность и лимиты', () => {
  it('из решения не достать process, require, fetch и глобальный объект Node', async () => {
    const { token } = await newStudent()
    const probe = `
      function sum(a, b) {
        const g = (function () { return this })() || globalThis
        const viaCtor = Function('return typeof process')()
        const leaks = [typeof process, typeof require, typeof fetch, typeof g.process, viaCtor, typeof module, typeof Buffer]
          .filter((t) => t !== 'undefined')
        return leaks.length === 0 ? a + b : 'LEAK:' + leaks.join(',')
      }`
    const { body } = await json<SubmitResponse>(await submitAs(token, probe))
    expect(body.result.status, JSON.stringify(body.result.tests)).toBe('passed')
  })

  it('бесконечный цикл обрывается по таймауту, следующая отправка обрабатывается', async () => {
    const { user, token } = await newStudent()
    const started = Date.now()
    const { status, body } = await json<SubmitResponse>(await submitAs(token, 'function sum() { while (true) {} }'))
    expect(status).toBe(200)
    expect(body.result.status).toBe('timeout')
    // Лимит задачи 2 с плюс перезапуск процесса; главное — не вечность.
    expect(Date.now() - started).toBeLessThan(15_000)
    expect((await progressOf(user.id)).failedAttempts).toBe(1)
    const next = await json<SubmitResponse>(await submitAs(token, 'function sum(a, b) { return a + b }'))
    expect(next.body.result.status).toBe('passed')
  })

  it('попытка съесть память не роняет сервер', async () => {
    const { token } = await newStudent()
    const bomb = 'function sum() { const a = []; while (true) a.push(new Array(1e6).fill(1)) }'
    const { status, body } = await json<SubmitResponse>(await submitAs(token, bomb))
    expect(status).toBe(200)
    expect(['error', 'timeout']).toContain(body.result.status)
    const next = await json<SubmitResponse>(await submitAs(token, 'function sum(a, b) { return a + b }'))
    expect(next.body.result.status).toBe('passed')
  })

  it('решение не видит результатов и состояния предыдущих прогонов', async () => {
    const { token } = await newStudent()
    await submitAs(token, 'Object.prototype.polluted = 1; globalThis.leftover = 2; function sum(a, b) { return a + b }')
    const probe = 'function sum(a, b) { return ({}).polluted === undefined && typeof leftover === "undefined" ? a + b : -1 }'
    expect((await json<SubmitResponse>(await submitAs(token, probe))).body.result.status).toBe('passed')
  })

  it('больше 30 отправок в минуту — 429', async () => {
    const { token } = await newStudent()
    const statuses: number[] = []
    for (let i = 0; i < 31; i += 1) statuses.push((await submitAs(token, 'function sum() {}')).status)
    expect(statuses.slice(0, 30).every((s) => s !== 429)).toBe(true)
    expect(statuses[30]).toBe(429)
  })
})

describe('GET /api/trainer/solution', () => {
  const get = (token: string | undefined, taskId: unknown = task.id) =>
    solution(request(`/api/trainer/solution?taskId=${taskId}`, { token, method: 'GET' }))

  it('без авторизации — 401, без taskId — 400, чужая или скрытая задача — 404', async () => {
    const { token } = await newStudent()
    expect((await get(undefined)).status).toBe(401)
    expect((await solution(request('/api/trainer/solution', { token, method: 'GET' }))).status).toBe(400)
    const draft = await createSumTask(payload, { isPublished: false })
    expect((await get(token, draft.id)).status).toBe(404)
  })

  it('до решения закрыто (403), после решения — эталон и разбор', async () => {
    const { token } = await newStudent()
    expect((await get(token)).status).toBe(403)
    await submitAs(token, 'function sum(a, b) { return a + b }')
    const { status, body } = await json(await get(token))
    expect(status).toBe(200)
    expect(body).toMatchObject({ solutionCode: expect.stringContaining('return a + b'), solutionNotes: 'Сложение.' })
  })

  it('открывается после 5 неудачных попыток', async () => {
    const { token } = await newStudent()
    for (let i = 0; i < 4; i += 1) await submitAs(token, 'function sum() { return 0 }')
    expect((await get(token)).status).toBe(403)
    await submitAs(token, 'function sum() { return 0 }')
    expect((await get(token)).status).toBe(200)
  })

  it('админу доступно всегда', async () => {
    const admin = await createAdmin(payload)
    expect((await get(await login(payload, admin))).status).toBe(200)
  })

  it('студент не может открыть эталон, выставив себе failedAttempts=5 через REST', async () => {
    const { user, token } = await newStudent()
    await expect(
      payload.create({
        collection: 'user-trainer-progress',
        data: { task: task.id, failedAttempts: 5 } as never,
        user,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    expect((await get(token)).status).toBe(403)
  })
})

describe('POST /api/trainer/compile', () => {
  it('без авторизации — 401, JS-задача без TS — 400', async () => {
    expect((await compile(request('/api/trainer/compile', { body: { taskId: task.id, code: 'x' } }))).status).toBe(401)
    const { token } = await newStudent()
    const jsOnly = await createSumTask(payload, { languages: ['js'] })
    expect((await compile(request('/api/trainer/compile', { token, body: { taskId: jsOnly.id, code: 'let a = 1' } }))).status).toBe(400)
  })

  it('транспилирует TypeScript и возвращает диагностики с номером строки', async () => {
    const { token } = await newStudent()
    const ok = await json<{ js: string; diagnostics: unknown[] }>(
      await compile(request('/api/trainer/compile', { token, body: { taskId: task.id, code: 'function sum(a: number, b: number): number { return a + b }' } })),
    )
    expect(ok.status).toBe(200)
    expect(ok.body.diagnostics).toEqual([])
    expect(ok.body.js).toContain('function sum(a, b)')

    const bad = await json<{ diagnostics: { line: number; message: string }[] }>(
      await compile(request('/api/trainer/compile', { token, body: { taskId: task.id, code: 'const x: number = "строка"' } })),
    )
    expect(bad.body.diagnostics.length).toBeGreaterThan(0)
    expect(bad.body.diagnostics[0].line).toBe(1)
  })

  it('компиляция ничего не пишет в прогресс', async () => {
    const { user, token } = await newStudent()
    await compile(request('/api/trainer/compile', { token, body: { taskId: task.id, code: 'function sum(a: number, b: number) { return a + b }' } }))
    expect(await progressOf(user.id)).toBeUndefined()
  })
})

describe('POST /api/support-message', () => {
  it('без авторизации — 401, невалидный JSON и пустые поля — 400, слишком длинные — 400', async () => {
    expect((await supportMessage(request('/api/support-message', { body: { subject: 'a', message: 'b' } }))).status).toBe(401)
    const { token } = await newStudent()
    expect((await supportMessage(request('/api/support-message', { token, raw: '{' }))).status).toBe(400)
    expect((await supportMessage(request('/api/support-message', { token, body: { subject: ' ', message: 'b' } }))).status).toBe(400)
    expect((await supportMessage(request('/api/support-message', { token, body: { subject: 'a'.repeat(201), message: 'b' } }))).status).toBe(400)
    expect((await supportMessage(request('/api/support-message', { token, body: { subject: 'a', message: 'b'.repeat(5001) } }))).status).toBe(400)
  })

  it('создаёт уведомление каждому админу со ссылкой на автора', async () => {
    const extraAdmin = await createAdmin(payload)
    const { user, token } = await newStudent()
    const res = await supportMessage(request('/api/support-message', { token, body: { subject: '  Не открывается урок ', message: 'Помогите' } }))
    expect(res.status).toBe(200)
    const admins = await payload.find({ collection: 'users', where: { role: { equals: 'admin' } }, limit: 1000 })
    const notes = await payload.find({
      collection: 'notifications',
      where: { type: { equals: 'support_message' }, link: { equals: `/admin/collections/users/${user.id}` } },
      limit: 1000,
      depth: 0,
    })
    expect(notes.totalDocs).toBe(admins.totalDocs)
    expect(notes.docs.map((n) => n.user)).toContain(extraAdmin.id)
    expect(notes.docs[0].title).toBe('Обращение от Тест Пользователь: Не открывается урок')
  })

  it('частые обращения ограничиваются ответом 429', async () => {
    const { token } = await newStudent()
    const statuses: number[] = []
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await supportMessage(request('/api/support-message', { token, body: { subject: `тема ${i}`, message: 'текст' } }))).status)
    }
    expect(statuses[0]).toBe(200)
    expect(statuses.at(-1)).toBe(429)
  })

  // Лимит считает уведомления, а их создаётся по одному на каждого админа:
  // при трёх админах студент упирается в лимит уже на третьем обращении.
  it.fails('БАГ: лимит — 5 обращений в час независимо от числа админов', async () => {
    const { token } = await newStudent()
    const statuses: number[] = []
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await supportMessage(request('/api/support-message', { token, body: { subject: `тема ${i}`, message: 'текст' } }))).status)
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429])
  })
})

describe('GET /api/health', () => {
  it('отвечает ok, когда база доступна', async () => {
    const { status, body } = await json(await health())
    expect(status).toBe(200)
    expect(body.status).toBe('ok')
  })
})

describe('маршруты Яндекс.Диска (без обращения к диску)', () => {
  it('import: без авторизации и студенту — 403, админу с чужой ссылкой — 400, с несуществующим курсом — 404', async () => {
    const { token } = await newStudent()
    const admin = await createAdmin(payload)
    const adminToken = await login(payload, admin)
    const body = { publicUrl: 'https://disk.yandex.ru/d/abc123', courseId: 987654 }
    expect((await ydImport(request('/api/yandex-disk/import', { body }))).status).toBe(403)
    expect((await ydImport(request('/api/yandex-disk/import', { token, body }))).status).toBe(403)
    expect((await ydImport(request('/api/yandex-disk/import', { token: adminToken, body: { ...body, publicUrl: 'https://evil.example/x' } }))).status).toBe(400)
    expect((await ydImport(request('/api/yandex-disk/import', { token: adminToken, body: { publicUrl: '' } }))).status).toBe(400)
    expect((await ydImport(request('/api/yandex-disk/import', { token: adminToken, body }))).status).toBe(404)
    expect(externalFetch).not.toHaveBeenCalled()
  })

  it.each([
    ['proxy', ydProxy],
    ['stream', ydStream],
  ])('%s: без авторизации — 401, без url — 400, не-Яндекс ссылка (SSRF) — 400', async (_, handler) => {
    const { token } = await newStudent()
    expect((await handler(request('/api/yandex-disk/x?url=https://disk.yandex.ru/d/a', { method: 'GET' }))).status).toBe(401)
    expect((await handler(request('/api/yandex-disk/x', { token, method: 'GET' }))).status).toBe(400)
    for (const target of ['http://169.254.169.254/latest/meta-data', 'http://localhost:5432', 'file:///etc/passwd']) {
      const res = await handler(request(`/api/yandex-disk/x?url=${encodeURIComponent(target)}`, { token, method: 'GET' }))
      expect(res.status, target).toBe(400)
    }
    expect(externalFetch).not.toHaveBeenCalled()
  })
})
