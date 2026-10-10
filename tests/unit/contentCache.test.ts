import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const redis = vi.hoisted(() => ({
  isReady: true, isOpen: true,
  get: vi.fn<() => Promise<string | null>>(),
  set: vi.fn<() => Promise<string>>(),
  connect: vi.fn<() => Promise<void>>(),
  destroy: vi.fn(), on: vi.fn(),
}))
vi.mock('redis', () => ({ createClient: () => redis }))

const valid = (value: unknown): value is { title: string } => !!value && typeof value === 'object' && 'title' in value && typeof value.title === 'string'

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('REDIS_URL', 'redis://cache.test:6379')
  redis.isReady = true
  redis.isOpen = true
  redis.get.mockReset().mockResolvedValue(null)
  redis.set.mockReset().mockResolvedValue('OK')
  redis.connect.mockReset().mockResolvedValue()
  redis.destroy.mockClear()
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('каталоговый кеш', () => {
  it('объединяет одновременные misses и не позволяет потребителю менять общий объект', async () => {
    const { cachedContent } = await import('@/server/content-cache')
    const load = vi.fn(async () => ({ title: 'HTML' }))
    const [a, b] = await Promise.all([
      cachedContent('revision-a', load, valid, async () => true),
      cachedContent('revision-a', load, valid, async () => true),
    ])
    expect(load).toHaveBeenCalledTimes(1)
    a.title = 'Изменено'
    expect(b.title).toBe('HTML')
    expect(await cachedContent('revision-a', load, valid, async () => true)).toEqual({ title: 'HTML' })
  })

  it('проверяет runtime-схему Redis вместо доверия повреждённому JSON', async () => {
    const { cachedContent } = await import('@/server/content-cache')
    redis.get.mockResolvedValue('{"user":"private"}')
    const load = vi.fn(async () => ({ title: 'CSS' }))
    expect(await cachedContent('revision-b', load, valid, async () => true)).toEqual({ title: 'CSS' })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('не записывает снимок, изменившийся во время загрузки', async () => {
    const { cachedContent } = await import('@/server/content-cache')
    const load = vi.fn(async () => ({ title: 'JS' }))
    await cachedContent('revision-c', load, valid, async () => false)
    await cachedContent('revision-c', load, valid, async () => false)
    expect(load).toHaveBeenCalledTimes(2)
    expect(redis.set).not.toHaveBeenCalled()
  })

  it('при зависшем Redis быстро получает Payload и включает паузу перед повтором', async () => {
    const { cachedContent } = await import('@/server/content-cache')
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    redis.get.mockImplementation(() => new Promise(() => undefined))
    const start = performance.now()
    expect(await cachedContent('revision-d', async () => ({ title: 'TS' }), valid, async () => true)).toEqual({ title: 'TS' })
    expect(performance.now() - start).toBeLessThan(1000)
    await cachedContent('revision-e', async () => ({ title: 'React' }), valid, async () => true)
    expect(redis.get).toHaveBeenCalledTimes(1)
    expect(redis.destroy).toHaveBeenCalledTimes(1)
    expect(warning).toHaveBeenCalledWith(expect.not.stringContaining('cache.test'))
  })

  it('ошибка loader не отравляет следующие запросы', async () => {
    const { cachedContent } = await import('@/server/content-cache')
    await expect(cachedContent('revision-f', async () => { throw new Error('DB failure') }, valid, async () => true)).rejects.toThrow('DB failure')
    expect(await cachedContent('revision-f', async () => ({ title: 'Go' }), valid, async () => true)).toEqual({ title: 'Go' })
  })

  it('работает без Redis и ограничивает размер записываемого значения', async () => {
    const { cachedContent } = await import('@/server/content-cache')
    vi.stubEnv('REDIS_URL', '')
    const load = vi.fn(async () => ({ title: 'a'.repeat(4 * 1024 * 1024) }))
    await cachedContent('large', load, valid, async () => true)
    await cachedContent('large', load, valid, async () => true)
    expect(load).toHaveBeenCalledTimes(2)
    expect(redis.get).not.toHaveBeenCalled()
    expect(redis.set).not.toHaveBeenCalled()
  })

  it('разделяет базы данных без включения credentials в ключ', async () => {
    const { contentCacheKey } = await import('@/server/content-cache')
    vi.stubEnv('DATABASE_URL', 'postgres://secret-user:secret-password@db/catalog-a')
    const a = contentCacheKey('catalog', '1')
    vi.stubEnv('DATABASE_URL', 'postgres://secret-user:secret-password@db/catalog-b')
    expect(contentCacheKey('catalog', '1')).not.toBe(a)
    expect(a).not.toMatch(/secret|postgres|password/)
  })
})
