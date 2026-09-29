import { afterEach, describe, expect, it, vi } from 'vitest'

import { markAnswersRead } from '@/lib/answer-notifications'

/** Прочитанный ответ ментора не должен висеть уведомлением на дашборде и в колокольчике. */

afterEach(() => vi.unstubAllGlobals())

describe('отметка ответов прочитанными', () => {
  it('один массовый PATCH только непрочитанных ответов по ссылке', async () => {
    const fetchMock = vi.fn(async () => Response.json({ docs: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await markAnswersRead('/lessons/hooks#comment-')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ isRead: true })
    expect(init.keepalive, 'запрос должен пережить уход со страницы').toBe(true)
    expect(url).toContain('where[type][equals]=comment')
    expect(url).toContain('where[isRead][equals]=false')
    expect(url).toContain(`where[link][like]=${encodeURIComponent('/lessons/hooks#comment-')}`)
  })

  it('сбой не ломает страницу, но пишется в консоль', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))

    await expect(markAnswersRead('/lessons/')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })
})
