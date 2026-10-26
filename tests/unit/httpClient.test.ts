import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiFetch, NETWORK_ERROR_MESSAGE, readJson } from '@/lib/http-client'

afterEach(() => vi.unstubAllGlobals())

describe('apiFetch', () => {
  it('отдаёт ответ сервера как есть, включая ошибки HTTP', async () => {
    const response = new Response('{}', { status: 503 })
    vi.stubGlobal('fetch', vi.fn(async () => response))
    expect(await apiFetch('/api/x', { method: 'POST' })).toBe(response)
    expect(fetch).toHaveBeenCalledWith('/api/x', { method: 'POST' })
  })

  it('обрыв сети превращает в русское сообщение и сохраняет исходную ошибку в cause', async () => {
    const offline = new TypeError('Failed to fetch')
    vi.stubGlobal('fetch', vi.fn(async () => { throw offline }))
    const failure = await apiFetch('/api/x').catch((error: unknown) => error)
    expect(failure).toMatchObject({ message: NETWORK_ERROR_MESSAGE, cause: offline })
  })

  it('отмену запроса пропускает как есть: её не показывают пользователю', async () => {
    const aborted = new DOMException('The operation was aborted.', 'AbortError')
    vi.stubGlobal('fetch', vi.fn(async () => { throw aborted }))
    await expect(apiFetch('/api/x')).rejects.toBe(aborted)
  })
})

describe('readJson', () => {
  it('разбирает JSON', async () => {
    expect(await readJson(Response.json({ error: 'Нет доступа' }, { status: 403 }))).toEqual({ error: 'Нет доступа' })
  })

  it('на HTML-страницу прокси отвечает null вместо ошибки парсера', async () => {
    expect(await readJson(new Response('<html>502 Bad Gateway</html>', { status: 502 }))).toBeNull()
    expect(await readJson(new Response('', { status: 504 }))).toBeNull()
  })
})
