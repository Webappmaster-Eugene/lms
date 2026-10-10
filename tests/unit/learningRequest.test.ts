import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), createLocalReq: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: 'test-session' }) }))
vi.mock('@/lib/payload', () => ({ getPayload: async () => ({ auth: mocks.auth }) }))
vi.mock('payload', () => ({ createLocalReq: mocks.createLocalReq }))
import { getLearningRequest } from '@/server/learning-request'

beforeEach(() => { vi.clearAllMocks() })

describe('контекст авторизации страницы обучения', () => {
  it('сохраняет запрос и рассчитанные права из payload.auth для чтения страницы', async () => {
    const request = { user: null as unknown, context: {} }
    const user = { id: 7, role: 'student' }
    mocks.createLocalReq.mockResolvedValue(request)
    mocks.auth.mockImplementation(async ({ req }: { req: typeof request }) => {
      req.user = user
      return { user }
    })
    const result = await getLearningRequest()
    expect(result.req).toBe(request)
    expect(result.req.user).toBe(user)
    expect(result.user).toBe(user)
    expect(mocks.auth).toHaveBeenCalledWith({ headers: expect.any(Headers), req: request })
    expect(mocks.createLocalReq).toHaveBeenCalledOnce()
  })

  it('анонимный запрос остаётся анонимным и получает отдельный контекст', async () => {
    const request = { user: null, context: {} }
    mocks.createLocalReq.mockResolvedValue(request)
    mocks.auth.mockResolvedValue({ user: null })
    const result = await getLearningRequest()
    expect(result.user).toBeNull()
    expect(result.req.user).toBeNull()
    expect(result.req).toBe(request)
  })
})
