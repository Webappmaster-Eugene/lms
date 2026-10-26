import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

import { LessonLearningProvider, readLocalLearningPosition, saveLocalLearningPosition } from '@/components/lesson/LessonLearningProvider'

/**
 * Место остановки в видео: на устройстве и в аккаунте. Отказ хранилища браузера
 * или сервера не должен ломать урок, а статус синхронизации обязан говорить правду.
 */

const KEY = 'lms:learning:7:10:clip'
const state = { userId: 7, positions: {}, lastVideoId: null, lastViewedAt: null }

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('место остановки на устройстве', () => {
  it('сохранённая позиция читается обратно', () => {
    saveLocalLearningPosition(KEY, { seconds: 95, at: 1000, ended: false })

    expect(readLocalLearningPosition(KEY)).toEqual({ seconds: 95, at: 1000, ended: false })
  })

  it('испорченная запись не роняет урок и считается отсутствующей', () => {
    localStorage.setItem(KEY, '{не json')

    expect(readLocalLearningPosition(KEY)).toBeUndefined()
    expect(console.warn).toHaveBeenCalledWith('Не удалось прочитать место остановки на устройстве', expect.any(SyntaxError))
  })

  it('недоступное хранилище (приватный режим) не роняет урок ни при чтении, ни при записи', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })

    expect(readLocalLearningPosition(KEY)).toBeUndefined()
    expect(() => saveLocalLearningPosition(KEY, { seconds: 1, at: 1, ended: false })).not.toThrow()
    expect(console.warn).toHaveBeenCalledWith('Не удалось сохранить место остановки на устройстве', expect.any(DOMException))
  })
})

describe('синхронизация с аккаунтом', () => {
  const openLesson = (status: number) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'нет' }), { status })))
    render(<LessonLearningProvider userId={7} lessonId={10} initialState={state}><p>урок</p></LessonLearningProvider>)
  }

  it.each([401, 403])('отказ в доступе (%i) при отметке открытия просит войти снова', async (status) => {
    openLesson(status)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Для синхронизации места остановки войдите в аккаунт снова.'))
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/learning-state')
    expect(JSON.parse(String(init?.body))).toMatchObject({ lessonId: 10, expectedUserId: 7, at: expect.any(Number) })
  })

  it('сбой сервера при отметке открытия честно говорит, что место хранится только здесь', async () => {
    openLesson(503)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Место остановки сохранено на этом устройстве. Синхронизируем, когда соединение восстановится.'))
  })

  it('восстановление сети повторяет неподтверждённую отметку открытия', async () => {
    openLesson(503)
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    vi.mocked(fetch).mockResolvedValue(Response.json(state))

    window.dispatchEvent(new Event('online'))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Место остановки сохраняется в аккаунте'))
    const [first, retry] = vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as { at: number })
    expect(retry.at).toBe(first.at)
  })
})
