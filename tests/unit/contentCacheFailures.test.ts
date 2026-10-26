import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const redis = vi.hoisted(() => ({
  isReady: false, isOpen: false,
  get: vi.fn<() => Promise<string | null>>(),
  set: vi.fn<() => Promise<string>>(),
  connect: vi.fn<() => Promise<void>>(),
  destroy: vi.fn(), on: vi.fn(),
}))
vi.mock('redis', () => ({ createClient: vi.fn(() => redis) }))
const capture = vi.hoisted(() => ({ captureThrottled: vi.fn() }))
vi.mock('@/lib/error-reporting/capture', () => capture)

type Doc = { title: string }
const valid = (value: unknown): value is Doc => !!value && typeof value === 'object' && 'title' in value && typeof value.title === 'string'
const stable = async () => true

async function cache() {
  vi.resetModules()
  return import('@/server/content-cache')
}

beforeEach(() => {
  vi.stubEnv('REDIS_URL', 'redis://user:secret@cache.test:6379')
  Object.assign(redis, { isReady: false, isOpen: false })
  redis.get.mockReset().mockResolvedValue(null)
  redis.set.mockReset().mockResolvedValue('OK')
  redis.connect.mockReset().mockImplementation(async () => { Object.assign(redis, { isReady: true, isOpen: true }) })
  redis.destroy.mockReset()
  capture.captureThrottled.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('кеш каталога: Redis и локальная копия', () => {
  it('подключается один раз и отдаёт снимок из Redis без загрузки из Payload', async () => {
    redis.get.mockResolvedValue(JSON.stringify({ title: 'Из Redis' }))
    const { cachedContent } = await cache()
    const load = vi.fn(async () => ({ title: 'Из базы' }))
    expect(await cachedContent('remote-hit', load, valid, stable)).toEqual({ title: 'Из Redis' })
    // Второй запрос берёт локальную копию: ни базы, ни нового похода в Redis.
    expect(await cachedContent('remote-hit', load, valid, stable)).toEqual({ title: 'Из Redis' })
    expect(load).not.toHaveBeenCalled()
    expect(redis.connect).toHaveBeenCalledTimes(1)
    expect(redis.get).toHaveBeenCalledTimes(1)
  })

  it('сбой подключения: страница получает данные из Payload, предупреждение без адреса Redis, повтор не раньше чем через 30 секунд', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    redis.connect.mockImplementation(async () => { redis.isOpen = true; throw new Error('ECONNREFUSED') })
    const { cachedContent } = await cache()
    expect(await cachedContent('refused-a', async () => ({ title: 'База' }), valid, stable)).toEqual({ title: 'База' })
    expect(redis.destroy).toHaveBeenCalledTimes(1)
    expect(capture.captureThrottled).toHaveBeenCalledWith('redis-unavailable', 600_000, expect.any(Error), expect.objectContaining({ level: 'warning', tags: { component: 'redis' } }))
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('secret')

    await cachedContent('refused-b', async () => ({ title: 'База' }), valid, stable)
    expect(redis.connect).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 30_001)
    await cachedContent('refused-c', async () => ({ title: 'База' }), valid, stable)
    expect(redis.connect).toHaveBeenCalledTimes(2)
    // Предупреждение в консоль — не чаще раза за паузу, а не на каждый запрос.
    expect(console.warn).toHaveBeenCalledTimes(2)
  })

  it('ошибка записи в Redis не ломает ответ и закрывает соединение', async () => {
    redis.set.mockRejectedValue(new Error('READONLY'))
    const { cachedContent } = await cache()
    expect(await cachedContent('write-fail', async () => ({ title: 'Свежие данные' }), valid, stable)).toEqual({ title: 'Свежие данные' })
    expect(redis.destroy).toHaveBeenCalledTimes(1)
    expect(capture.captureThrottled).toHaveBeenCalledTimes(1)
  })

  it('повреждённая запись Redis не возвращается, вместо неё — загрузка и перезапись', async () => {
    redis.get.mockResolvedValue('{не json')
    const { cachedContent } = await cache()
    const load = vi.fn(async () => ({ title: 'Исправлено' }))
    expect(await cachedContent('broken', load, valid, stable)).toEqual({ title: 'Исправлено' })
    expect(load).toHaveBeenCalledTimes(1)
    expect(redis.set).toHaveBeenCalledWith('broken', JSON.stringify({ title: 'Исправлено' }), { EX: 300 })
  })

  it('локальная копия хранит не больше 128 снимков: самый старый вытесняется', async () => {
    vi.stubEnv('REDIS_URL', '')
    const { cachedContent } = await cache()
    const load = vi.fn(async () => ({ title: 'x' }))
    for (let index = 0; index <= 128; index += 1) await cachedContent(`entry-${index}`, load, valid, stable)
    expect(load).toHaveBeenCalledTimes(129)
    await cachedContent('entry-128', load, valid, stable)
    expect(load).toHaveBeenCalledTimes(129)
    await cachedContent('entry-0', load, valid, stable)
    expect(load).toHaveBeenCalledTimes(130)
  })

  it('локальная копия живёт 5 минут', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.stubEnv('REDIS_URL', '')
    const { cachedContent } = await cache()
    const load = vi.fn(async () => ({ title: 'x' }))
    await cachedContent('ttl', load, valid, stable)
    vi.setSystemTime(Date.now() + 299_000)
    await cachedContent('ttl', load, valid, stable)
    expect(load).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 2_000)
    await cachedContent('ttl', load, valid, stable)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
