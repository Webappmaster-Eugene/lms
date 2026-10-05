import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInterviewRoom } from '@/components/trainer/interview/useInterviewRoom'
import type { InterviewRoom } from '@/lib/trainer/interview'

const token = 'aa573b25-ab70-4b9f-aec4-9dd78d38b109'
const initial: InterviewRoom = {
  token, ownerId: 1, title: 'Сумма', descriptionMd: 'Условие', setupCode: '', code: 'original',
  language: 'js', version: 1, createdAt: '2026-10-06T00:00:00Z', endedAt: null,
  participants: [{ id: 1, name: 'Ученик', lastSeen: '2026-10-06T00:00:00Z' }],
}
let remote: InterviewRoom
let calls: { method: string; body?: Record<string, unknown> }[]

beforeEach(() => {
  remote = { ...initial }
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const input = init.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method: init.method ?? 'GET', body: input })
    if (init.method === 'PATCH') {
      if (input.version !== remote.version) return Response.json({ error: 'Conflict', room: remote }, { status: 409 })
      remote = { ...remote, code: input.code, language: input.language, version: remote.version + 1 }
    }
    return Response.json({ room: remote, userId: 1 })
  }))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('совместный редактор сохраняет собственный черновик', () => {
  it('получает конфликт при новой общей версии и сохраняет черновик только после явного выбора', async () => {
    const { result, unmount } = renderHook(() => useInterviewRoom(token))
    await waitFor(() => expect(result.current.room?.version).toBe(1))
    vi.useFakeTimers()
    act(() => result.current.edit({ code: 'my draft', language: 'ts' }))
    remote = { ...initial, version: 2, code: 'their draft' }
    await act(async () => { await result.current.save() })
    expect(result.current.conflict?.code).toBe('their draft')
    expect(result.current.draft.code).toBe('my draft')
    const writesBefore = calls.filter((call) => call.method === 'PATCH').length
    await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(writesBefore)
    act(() => result.current.resolve(true))
    await act(async () => { await result.current.save() })
    expect(calls.at(-1)?.body).toMatchObject({ version: 2, code: 'my draft', language: 'ts' })
    expect(remote).toMatchObject({ version: 3, code: 'my draft' })
    unmount()
  })

  it('не перезаписывает набранный код во время входящего poll; принятие чужой версии явное', async () => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useInterviewRoom(token))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(result.current.room?.version).toBe(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1900) })
    act(() => result.current.edit({ code: 'keep local', language: 'js' }))
    remote = { ...initial, version: 2, code: 'incoming' }
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(result.current.conflict?.code).toBe('incoming')
    expect(result.current.draft.code).toBe('keep local')
    act(() => result.current.resolve(false))
    expect(result.current.draft.code).toBe('incoming')
    expect(result.current.dirty).toBe(false)
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false)
    unmount()
  })

  it('сохраняет новый ввод, сделанный во время отправки предыдущего', async () => {
    const { result, unmount } = renderHook(() => useInterviewRoom(token))
    await waitFor(() => expect(result.current.room).not.toBeNull())
    vi.useFakeTimers()
    let finish: ((response: Response) => void) | undefined
    vi.mocked(fetch).mockImplementationOnce((_url, init) => new Promise<Response>((resolve) => {
      calls.push({ method: 'PATCH', body: JSON.parse(String(init?.body)) })
      finish = resolve
    }))
    act(() => result.current.edit({ code: 'first edit', language: 'js' }))
    let saving: Promise<void> | undefined
    act(() => { saving = result.current.save() })
    act(() => result.current.edit({ code: 'second edit', language: 'js' }))
    await act(async () => {
      finish?.(Response.json({ room: { ...initial, version: 2, code: 'first edit' }, userId: 1 }))
      await saving
    })
    expect(result.current.draft.code).toBe('second edit')
    expect(result.current.dirty).toBe(true)
    expect(result.current.room?.version).toBe(2)
    expect(result.current.conflict).toBeNull()
    unmount()
  })

  it('останавливает polling и отменяет незавершённые запросы при уходе', async () => {
    let signal: AbortSignal | null | undefined
    vi.mocked(fetch).mockImplementation((_url, init) => {
      signal = init?.signal
      return new Promise<Response>(() => {})
    })
    const { unmount } = renderHook(() => useInterviewRoom(token))
    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('после отказа доступа прекращает автоматические попытки и сохраняет сообщение', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: 'Аккаунт неактивен' }, { status: 403 }))
    const { result, unmount } = renderHook(() => useInterviewRoom(token))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(result.current.blocked).toBe(true)
    expect(result.current.error).toBe('Аккаунт неактивен')
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(fetch).toHaveBeenCalledTimes(1)
    unmount()
  })
})
