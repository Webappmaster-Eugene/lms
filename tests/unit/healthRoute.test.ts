import { describe, it, expect, beforeEach, vi } from 'vitest'

const find = vi.fn()
const getPayload = vi.fn()

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload }))

const { GET } = await import('@/app/(payload)/api/health/route')

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getPayload.mockResolvedValue({ find })
  find.mockResolvedValue({ docs: [], totalDocs: 0 })
})

describe('успешная проверка', () => {
  it('отвечает 200 и статусом ok', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ status: 'ok' })
  })

  it('запрос к БД ограничен одной записью без подгрузки связей', async () => {
    await GET()

    expect(find).toHaveBeenCalledWith({ collection: 'users', limit: 1, depth: 0 })
  })
})

describe('отказ базы данных', () => {
  it('отвечает 503, а не 500', async () => {
    // От кода ответа зависит healthcheck контейнера: 500 Traefik трактует иначе
    find.mockRejectedValue(new Error('relation "users_sessions" does not exist'))

    const response = await GET()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ status: 'error' })
  })

  it('причина отказа попадает в лог', async () => {
    find.mockRejectedValue(new Error('connection refused'))

    await GET()

    expect(console.error).toHaveBeenCalled()
  })

  it('недоступность самого Payload тоже даёт 503', async () => {
    getPayload.mockRejectedValue(new Error('config error'))

    expect((await GET()).status).toBe(503)
  })

  it('наружу не отдаётся текст ошибки', async () => {
    find.mockRejectedValue(new Error('пароль пользователя lms неверен'))

    const body = JSON.stringify(await (await GET()).json())

    expect(body).not.toContain('пароль')
  })
})
