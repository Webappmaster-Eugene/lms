import { describe, expect, it, vi } from 'vitest'

const getPayloadInstance = vi.fn(async () => ({ instance: true }))

vi.mock('payload', () => ({ getPayload: getPayloadInstance }))
vi.mock('@payload-config', () => ({ default: { collections: [] } }))

const { getPayload } = await import('@/lib/payload')

/**
 * Обёртка над getPayload. Смысл ровно один: конфиг подставляется здесь, а не
 * в каждом вызывающем модуле, — иначе разные части приложения могут поднять
 * Payload с разной конфигурацией.
 */

describe('клиент Payload', () => {
  it('поднимается с конфигом приложения', async () => {
    await getPayload()

    expect(getPayloadInstance).toHaveBeenCalledWith({ config: expect.anything() })
  })

  it('возвращает экземпляр', async () => {
    await expect(getPayload()).resolves.toEqual({ instance: true })
  })
})
