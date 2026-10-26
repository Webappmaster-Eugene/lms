import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TrainerRunnerError } from '@/server/trainer/pool'
import { previewRuntime, proxyRuntimeRequest, releaseRuntimePreview, runRuntime, runRuntimePreview } from '@/server/trainer/runtime'
import { POST as releasePOST } from '@/app/api/trainer/preview-release/[token]/route'

/**
 * HTTP-адаптер runtime Go/Python/frontend и закрытие Next.js-предпросмотра.
 * Сеть подменена: проверяется, что уходит в runtime и как разбираются его
 * ответы и отказы, — без настоящих контейнеров.
 */

const SERVICE_TOKEN = 'runtime-service-token-'.repeat(2)
const LEASE = 'b'.repeat(64)
const fetchRuntime = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>()
const input = { language: 'go' as const, code: 'package main', timeLimitMs: 2000 }
const passedRun = { status: 'passed', tests: [{ name: 'кейс', passed: true, hidden: false }], consoleOutput: ['ok'], totalMs: 3 }

beforeEach(() => {
  fetchRuntime.mockReset()
  vi.stubGlobal('fetch', fetchRuntime)
  vi.stubEnv('TRAINER_RUNTIME_URL', 'http://runtime.internal:8080')
  vi.stubEnv('TRAINER_RUNTIME_TOKEN', SERVICE_TOKEN)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function rejection(promise: Promise<unknown>): Promise<TrainerRunnerError> {
  const error = await promise.then(() => null, (reason: unknown) => reason)
  expect(error).toBeInstanceOf(TrainerRunnerError)
  return error as TrainerRunnerError
}

describe('runRuntime: запрос в runtime', () => {
  it('отправляет код, кейсы и служебный токен в /run и нормализует ответ', async () => {
    fetchRuntime.mockResolvedValue(Response.json({ ...passedRun, injected: '<script>' }))
    const cases = [{ name: 'пример', stdin: '1 2', expected: '3', hidden: false }]
    const result = await runRuntime({ ...input, cases })
    expect(result).toEqual({ status: 'passed', tests: [{ name: 'кейс', passed: true, hidden: false, durationMs: 0 }], passedCount: 1, totalCount: 1, consoleOutput: ['ok'], totalMs: 3 })
    const [url, init] = fetchRuntime.mock.calls[0]
    expect(url.href).toBe('http://runtime.internal:8080/run')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store' })
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${SERVICE_TOKEN}`)
    expect(JSON.parse(String(init.body))).toEqual({ ...input, cases })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('прогон без тестов считается ошибкой, пока вызывающий явно не разрешил консольный режим', async () => {
    fetchRuntime.mockImplementation(async () => Response.json({ status: 'passed', tests: [], consoleOutput: ['42'] }))
    expect((await runRuntime({ ...input, cases: [] })).status).toBe('error')
    expect((await runRuntime({ ...input, cases: [], allowNoTests: true })).status).toBe('passed')
  })

  it.each([
    ['не задан адрес', { TRAINER_RUNTIME_URL: '' }, 'не настроен'],
    ['короткий служебный токен', { TRAINER_RUNTIME_TOKEN: 'short' }, 'не настроен'],
    ['адрес не http', { TRAINER_RUNTIME_URL: 'file:///etc/passwd' }, 'Неверная конфигурация адреса runtime'],
    ['учётные данные в адресе', { TRAINER_RUNTIME_URL: 'http://user:pass@runtime.internal' }, 'Неверная конфигурация адреса runtime'],
    ['адрес не разбирается', { TRAINER_RUNTIME_URL: 'not a url' }, 'Неверная конфигурация адреса runtime'],
  ])('%s — отказ до сетевого запроса', async (_, env, message) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
    const error = await rejection(runRuntime({ ...input, cases: [] }))
    expect(error.message).toContain(message)
    expect(error.message).not.toContain(SERVICE_TOKEN)
    expect(fetchRuntime).not.toHaveBeenCalled()
  })

  it('недоступный runtime — понятная ошибка без деталей сети', async () => {
    fetchRuntime.mockRejectedValue(new TypeError('connect ECONNREFUSED 10.0.0.5:8080'))
    const error = await rejection(runRuntime({ ...input, cases: [] }))
    expect(error.message).toBe('Runtime не отвечает. Повторите запуск позже')
    expect(error.overloaded).toBe(false)
  })

  it('503 runtime помечается как перегрузка, прочие отказы — нет', async () => {
    fetchRuntime.mockResolvedValueOnce(new Response('busy', { status: 503 }))
    const busy = await rejection(runRuntime({ ...input, cases: [] }))
    expect(busy).toMatchObject({ overloaded: true, message: 'Runtime занят или временно недоступен. Повторите запуск позже' })
    fetchRuntime.mockResolvedValueOnce(new Response('denied', { status: 401 }))
    const denied = await rejection(runRuntime({ ...input, cases: [] }))
    expect(denied).toMatchObject({ overloaded: false, message: 'Runtime отклонил запрос проверки' })
  })

  it.each([
    ['не JSON', () => new Response('<html>oops</html>')],
    ['без тела', () => new Response(null)],
    ['больше 2 МБ', () => new Response(JSON.stringify({ status: 'passed', consoleOutput: ['x'.repeat(2 * 1024 * 1024)] }))],
  ])('ответ runtime %s — «некорректный результат», а не падение', async (_, response) => {
    fetchRuntime.mockResolvedValue(response())
    expect((await rejection(runRuntime({ ...input, cases: [] }))).message).toBe('Runtime вернул некорректный результат')
  })

  it('Next.js-проект ждёт дольше остальных языков', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    fetchRuntime.mockImplementation(async () => Response.json(passedRun))
    await runRuntime({ ...input, cases: [] })
    await runRuntime({ ...input, language: 'next', cases: [] })
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([125000, 180000])
    timeout.mockRestore()
  })
})

describe('runRuntimePreview и previewRuntime', () => {
  it('просит предпросмотр вместе с прогоном и возвращает оба результата', async () => {
    fetchRuntime.mockResolvedValue(Response.json({ result: passedRun, preview: { html: '<h1>Привет</h1>' } }))
    const response = await runRuntimePreview({ ...input, language: 'html', cases: [] })
    expect(response.result.status).toBe('passed')
    expect(response.preview).toEqual({ html: '<h1>Привет</h1>' })
    expect(JSON.parse(String(fetchRuntime.mock.calls[0][1].body))).toMatchObject({ includePreview: true, language: 'html' })
  })

  it('capability предпросмотра Next.js строится только из проверенного токена, путь runtime не доверяется', async () => {
    fetchRuntime.mockResolvedValueOnce(Response.json({ result: passedRun, preview: { leaseToken: LEASE, expiresAt: 99, previewPath: 'https://evil.test/' } }))
    expect((await runRuntimePreview({ ...input, language: 'next', cases: [] })).preview).toEqual({ leaseToken: LEASE, previewPath: `/api/trainer/preview/${LEASE}/`, expiresAt: 99 })
    fetchRuntime.mockResolvedValueOnce(Response.json({ result: passedRun, preview: { leaseToken: '../../admin' } }))
    expect((await runRuntimePreview({ ...input, language: 'next', cases: [] })).preview).toBeUndefined()
    fetchRuntime.mockResolvedValueOnce(Response.json({ result: passedRun, preview: 'просто строка' }))
    expect((await runRuntimePreview({ ...input, language: 'next', cases: [] })).preview).toBeUndefined()
  })

  it('старый формат ответа без обёртки result понимается как сам результат', async () => {
    fetchRuntime.mockResolvedValue(Response.json(passedRun))
    expect(await runRuntimePreview({ ...input, language: 'react', cases: [] })).toEqual({ result: expect.objectContaining({ status: 'passed', passedCount: 1 }) })
  })

  it('ошибка сборки предпросмотра доходит текстом runtime, без текста — общей фразой', async () => {
    fetchRuntime.mockResolvedValueOnce(Response.json({ error: 'App.tsx: не закрыт тег <div>' }))
    expect((await rejection(previewRuntime({ ...input, language: 'react' }))).message).toBe('App.tsx: не закрыт тег <div>')
    fetchRuntime.mockResolvedValueOnce(Response.json({ leaseToken: 'short' }))
    expect((await rejection(previewRuntime({ ...input, language: 'next' }))).message).toBe('Не удалось собрать предпросмотр')
  })
})

describe('releaseRuntimePreview', () => {
  it('удаляет lease в runtime методом DELETE со служебным токеном', async () => {
    fetchRuntime.mockResolvedValue(new Response(null, { status: 204 }))
    await releaseRuntimePreview(LEASE)
    const [url, init] = fetchRuntime.mock.calls[0]
    expect(url.href).toBe(`http://runtime.internal:8080/next/lease/${LEASE}`)
    expect(init).toMatchObject({ method: 'DELETE', redirect: 'error', cache: 'no-store' })
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${SERVICE_TOKEN}`)
  })

  it('не обращается к runtime с подозрительным токеном или без настройки', async () => {
    for (const token of ['short', '../../etc', 'a'.repeat(129)]) await rejection(releaseRuntimePreview(token))
    vi.stubEnv('TRAINER_RUNTIME_TOKEN', '')
    expect((await rejection(releaseRuntimePreview(LEASE))).message).toBe('Runtime не настроен')
    vi.stubEnv('TRAINER_RUNTIME_TOKEN', SERVICE_TOKEN)
    vi.stubEnv('TRAINER_RUNTIME_URL', 'ftp://runtime.internal')
    expect((await rejection(releaseRuntimePreview(LEASE))).message).toBe('Неверная конфигурация адреса runtime')
    expect(fetchRuntime).not.toHaveBeenCalled()
  })

  it('отказ или недоступность runtime дают одну и ту же ошибку закрытия', async () => {
    fetchRuntime.mockResolvedValueOnce(new Response('gone', { status: 500 }))
    expect((await rejection(releaseRuntimePreview(LEASE))).message).toBe('Не удалось закрыть предпросмотр')
    fetchRuntime.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect((await rejection(releaseRuntimePreview(LEASE))).message).toBe('Не удалось закрыть предпросмотр')
  })
})

describe('proxyRuntimeRequest: отказ сети', () => {
  it('недоступный предпросмотр — TrainerRunnerError, а не сырая ошибка fetch', async () => {
    fetchRuntime.mockRejectedValue(new TypeError('fetch failed'))
    expect((await rejection(proxyRuntimeRequest(LEASE, '/', new Request('https://lms.test/preview')))).message).toBe('Предпросмотр не отвечает')
  })
})

describe('POST /api/trainer/preview-release/[token]', () => {
  const release = (token: string) => releasePOST(new Request(`https://lms.test/api/trainer/preview-release/${token}`, { method: 'POST' }), { params: Promise.resolve({ token }) })

  it('закрывает предпросмотр по capability-токену и отвечает 204 без кэша', async () => {
    fetchRuntime.mockResolvedValue(new Response(null, { status: 204 }))
    const response = await release(LEASE)
    expect(response.status).toBe(204)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(fetchRuntime.mock.calls[0][0].pathname).toBe(`/next/lease/${LEASE}`)
  })

  it.each(['a'.repeat(63), 'A'.repeat(64), `${'a'.repeat(63)}/`, 'g'.repeat(64), '..'])('токен %s — 404 без обращения к runtime', async (token) => {
    expect((await release(token)).status).toBe(404)
    expect(fetchRuntime).not.toHaveBeenCalled()
  })

  it('сбой runtime — 503 без подробностей', async () => {
    fetchRuntime.mockRejectedValue(new TypeError('connect ECONNREFUSED'))
    const response = await release(LEASE)
    expect(response.status).toBe(503)
    expect(await response.text()).toBe('')
  })
})
