import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from 'redis'

const connections = vi.hoisted(() => [] as { isOpen: boolean; destroy: () => void }[])
vi.mock('redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('redis')>()
  return { ...actual, createClient: (...args: Parameters<typeof actual.createClient>) => {
    const client = actual.createClient(...args)
    connections.push(client)
    return client
  } }
})

const valid = (value: unknown): value is { title: string } => !!value && typeof value === 'object' && 'title' in value && typeof value.title === 'string'
const redisUrl = process.env.LMS_TEST_REDIS_URL
beforeEach(() => { vi.resetModules(); vi.stubEnv('REDIS_URL', redisUrl ?? '') })
afterEach(() => {
  for (const client of connections.splice(0)) if (client.isOpen) client.destroy()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe.skipIf(!redisUrl)('настоящий Redis: LMS_TEST_REDIS_URL (одноразовый сервер)', () => {
  it('другой процесс читает общий снимок с TTL вместо повторной загрузки Payload', async () => {
    const first = await import('@/server/content-cache')
    const key = first.contentCacheKey(`test-${crypto.randomUUID()}`, 'revision')
    const load = vi.fn(async () => ({ title: 'HTML' }))
    expect(await first.cachedContent(key, load, valid, async () => true)).toEqual({ title: 'HTML' })
    const inspect = createClient({ url: redisUrl })
    await inspect.connect()
    const ttl = await inspect.ttl(key)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(300)
    vi.resetModules()
    const second = await import('@/server/content-cache')
    expect(await second.cachedContent(key, load, valid, async () => true)).toEqual({ title: 'HTML' })
    expect(load).toHaveBeenCalledTimes(1)
    await inspect.del(key)
  })

  it('повреждённая запись заменяется и credentials не попадают в предупреждения', async () => {
    const cache = await import('@/server/content-cache')
    const key = cache.contentCacheKey(`test-${crypto.randomUUID()}`, 'revision')
    const inspect = createClient({ url: redisUrl })
    await inspect.connect()
    await inspect.set(key, '{bad json', { EX: 30 })
    expect(await cache.cachedContent(key, async () => ({ title: 'Go' }), valid, async () => true)).toEqual({ title: 'Go' })
    expect(JSON.parse(await inspect.get(key) ?? '{}')).toEqual({ title: 'Go' })
    await inspect.del(key)
  })

  it('настоящий отказ подключения не блокирует загрузку учебного контента', async () => {
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:1')
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const cache = await import('@/server/content-cache')
    const start = performance.now()
    expect(await cache.cachedContent('refused', async () => ({ title: 'React' }), valid, async () => true)).toEqual({ title: 'React' })
    expect(performance.now() - start).toBeLessThan(1000)
  })
})
