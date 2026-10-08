import { describe, it, expect, vi } from 'vitest'

import { markNotificationsRead, requestNotifications, requestUnreadNotificationCount } from '@/components/layout/notifications-api'

function response(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response
}

describe('requestNotifications', () => {
  const signal = new AbortController().signal

  it('успешный ответ отдаёт список уведомлений', async () => {
    const doc = {
      id: '1',
      title: 'Курс завершён',
      message: 'Поздравляем',
      type: 'course',
      isRead: false,
      createdAt: '2026-09-15T10:00:00.000Z',
    }
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { docs: [doc] }))

    await expect(requestNotifications(signal, fetchImpl)).resolves.toEqual({
      status: 'ok',
      docs: [doc],
    })
  })

  it('ответ без docs не падает, а даёт пустой список', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, {}))

    await expect(requestNotifications(signal, fetchImpl)).resolves.toEqual({
      status: 'ok',
      docs: [],
    })
  })

  it.each([401, 403])('код %s — это истёкшая сессия, а не пустой список', async (status) => {
    // Именно из-за неразличения этих случаев колокольчик опрашивал закрытую
    // коллекцию бесконечно, показывая «нет уведомлений»
    const fetchImpl = vi.fn().mockResolvedValue(response(status, { errors: [] }))

    await expect(requestNotifications(signal, fetchImpl)).resolves.toEqual({
      status: 'unauthorized',
    })
  })

  it.each([404, 500, 502])('код %s пробрасывается ошибкой, а не тишиной', async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(response(status, { errors: [] }))

    await expect(requestNotifications(signal, fetchImpl)).rejects.toThrow(
      new RegExp(`HTTP ${status}`),
    )
  })

  it('запрос уходит с куками и переданным signal', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { docs: [] }))

    await requestNotifications(signal, fetchImpl)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toContain('/api/notifications')
    expect(init).toMatchObject({ credentials: 'include', signal })
  })

  it('отмена запроса пробрасывается наружу', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'))

    await expect(requestNotifications(signal, fetchImpl)).rejects.toThrow('Aborted')
  })
})

describe('подтверждённое прочтение уведомлений', () => {
  it('учитывает только ответы сервера с isRead=true', async () => {
    const original = global.fetch
    global.fetch = vi.fn(async (input) => String(input).endsWith('/1') ? Response.json({ doc: { isRead: true } }) : String(input).endsWith('/2') ? Response.json({ doc: { isRead: false } }) : new Response(null, { status: 500 })) as typeof fetch
    try {
      const docs = ['1', '2', '3'].map((id) => ({ id, title: 'Сообщение', message: '', type: 'info', isRead: false, createdAt: '2026-10-08T10:00:00.000Z' }))
      const result = await markNotificationsRead(docs)
      expect([...result.readIds]).toEqual(['1'])
      expect(result.failed).toBe(2)
      expect(result.unauthorized).toBe(false)
    } finally { global.fetch = original }
  })

  it('ошибочный счётчик не превращается в ноль', async () => {
    const original = global.fetch
    global.fetch = vi.fn(async () => Response.json({})) as typeof fetch
    try { await expect(requestUnreadNotificationCount(new AbortController().signal, 34)).rejects.toThrow('Некорректный счётчик') } finally { global.fetch = original }
  })
})
