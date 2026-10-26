import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInterviewRoom } from '@/components/trainer/interview/useInterviewRoom'
import type { InterviewRoom } from '@/lib/trainer/interview'

/**
 * Синхронизация общей комнаты: автосохранение после паузы, предупреждение о
 * несохранённом коде, реакция на отказы сервера и возврат на вкладку.
 */

const token = 'aa573b25-ab70-4b9f-aec4-9dd78d38b109'
const initial: InterviewRoom = {
  token, ownerId: 1, title: 'Сумма', descriptionMd: '', setupCode: '', code: 'original',
  language: 'js', version: 1, createdAt: '2026-10-06T00:00:00Z', endedAt: null,
  participants: [{ id: 1, name: 'Ученик', lastSeen: '2026-10-06T00:00:00Z' }],
}

let remote: InterviewRoom
let calls: { method: string; body?: Record<string, unknown> }[]
let patchAnswer: ((body: Record<string, unknown>) => Response) | null
let hidden = false

const patches = () => calls.filter((call) => call.method === 'PATCH')

beforeEach(() => {
  remote = { ...initial }
  calls = []
  patchAnswer = null
  hidden = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method: init.method ?? 'GET', body })
    if (init.method === 'PATCH') {
      if (patchAnswer) return patchAnswer(body)
      remote = { ...remote, code: body.code, language: body.language, version: remote.version + 1 }
    }
    return Response.json({ room: remote, userId: 1 })
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'hidden')
})

async function openRoom() {
  const view = renderHook(() => useInterviewRoom(token))
  await waitFor(() => expect(view.result.current.room?.version).toBe(1))
  return view
}

describe('автосохранение общего кода', () => {
  it('правка уходит на сервер сама после паузы в наборе', async () => {
    const { result, unmount } = await openRoom()
    vi.useFakeTimers()

    act(() => result.current.edit({ code: 'function sum(a, b) { return a + b }', language: 'js' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(799) })
    expect(patches()).toHaveLength(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })

    await vi.waitFor(() => expect(result.current.dirty).toBe(false))
    expect(patches()).toEqual([{ method: 'PATCH', body: { version: 1, code: 'function sum(a, b) { return a + b }', language: 'js' } }])
    expect(result.current.room?.version).toBe(2)
    unmount()
  })

  it('пока код не сохранён, закрытие вкладки предупреждает, а после сохранения — нет', async () => {
    const { result, unmount } = await openRoom()
    const closeTab = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(closeTab()).toBe(false)

    act(() => result.current.edit({ code: 'несохранённое', language: 'js' }))
    expect(closeTab()).toBe(true)

    await act(async () => { await result.current.save() })
    expect(result.current.dirty).toBe(false)
    expect(closeTab()).toBe(false)
    unmount()
  })

  it('завершённая комната не принимает сохранения', async () => {
    remote = { ...initial, endedAt: '2026-10-06T01:00:00Z' }
    const { result, unmount } = await openRoom()

    act(() => result.current.edit({ code: 'после завершения', language: 'js' }))
    await act(async () => { await result.current.save() })

    expect(patches()).toHaveLength(0)
    unmount()
  })
})

describe('отказы при сохранении', () => {
  it('отказ в доступе блокирует комнату: ни повторных сохранений, ни опроса', async () => {
    patchAnswer = () => Response.json({ error: 'Вас удалили из комнаты' }, { status: 403 })
    const { result, unmount } = await openRoom()
    vi.useFakeTimers()

    act(() => result.current.edit({ code: 'мой код', language: 'js' }))
    await act(async () => { await result.current.save() })

    expect(result.current.blocked).toBe(true)
    expect(result.current.error).toBe('Вас удалили из комнаты')
    expect(result.current.draft.code).toBe('мой код')
    const before = calls.length
    await act(async () => { await result.current.save() })
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(calls).toHaveLength(before)
    unmount()
  })

  it('временный сбой не блокирует комнату; автосохранение ждёт явного повтора', async () => {
    let failures = 1
    patchAnswer = (body) => {
      if (failures-- > 0) return Response.json({}, { status: 500 })
      remote = { ...remote, code: String(body.code), version: remote.version + 1 }
      return Response.json({ room: remote, userId: 1 })
    }
    const { result, unmount } = await openRoom()
    vi.useFakeTimers()

    act(() => result.current.edit({ code: 'важный код', language: 'js' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await vi.waitFor(() => expect(result.current.error).toBe('Не удалось сохранить код'))
    expect(result.current.blocked).toBe(false)
    expect(result.current.dirty).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(patches()).toHaveLength(1)

    await act(async () => { await result.current.save() })
    expect(result.current.error).toBe('')
    expect(result.current.dirty).toBe(false)
    expect(remote.code).toBe('важный код')
    unmount()
  })
})

describe('опрос комнаты', () => {
  it('скрытая вкладка не опрашивает сервер, а при возвращении комната обновляется сразу', async () => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useInterviewRoom(token))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.room?.version).toBe(1)

    hidden = true
    const before = calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(calls).toHaveLength(before)

    remote = { ...remote, version: 2, code: 'код собеседника' }
    hidden = false
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(calls).toHaveLength(before + 1)
    expect(result.current.draft.code).toBe('код собеседника')
    unmount()
  })

  it('запоздалый ответ опроса со старой версией не откатывает сохранённый код', async () => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useInterviewRoom(token))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    act(() => result.current.edit({ code: 'сохранённая правка', language: 'js' }))
    await act(async () => { await result.current.save() })
    expect(result.current.room?.version).toBe(2)

    remote = { ...initial }
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })

    expect(calls.at(-1)?.method).toBe('GET')
    expect(result.current.room?.version).toBe(2)
    expect(result.current.draft.code).toBe('сохранённая правка')
    expect(result.current.conflict).toBeNull()
    unmount()
  })

  // Прокси перед приложением отвечает на 502/504 не JSON: фразу интерфейса не должна подменять ошибка парсера.
  it('сбой прокси при опросе объяснён по-русски', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Bad Gateway', { status: 502 }))
    const { result, unmount } = renderHook(() => useInterviewRoom(token))

    await waitFor(() => expect(result.current.error).not.toBe(''))
    expect(result.current.error).toMatch(/[а-яё]/i)
    expect(result.current.error).not.toMatch(/JSON/)
    unmount()
  })
})
