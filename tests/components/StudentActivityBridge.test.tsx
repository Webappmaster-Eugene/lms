import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Metric } from 'web-vitals'
import { StudentActivityBridge } from '@/components/analytics/StudentActivityBridge'

const state = vi.hoisted(() => ({ path: '/courses', callbacks: {} as Record<string, (metric: Metric) => void> }))
vi.mock('next/navigation', () => ({ usePathname: () => state.path }))
vi.mock('web-vitals', () => ({
  onLCP: (callback: (metric: Metric) => void) => { state.callbacks.LCP = callback },
  onINP: (callback: (metric: Metric) => void) => { state.callbacks.INP = callback },
  onCLS: (callback: (metric: Metric) => void) => { state.callbacks.CLS = callback },
}))
const fetchMock = vi.fn()
const beacon = vi.fn(() => true)
const bodies = () => fetchMock.mock.calls.map(([route, options]) => ({ route, body: JSON.parse(options.body) as Record<string, unknown> }))

beforeEach(() => {
  vi.useFakeTimers()
  state.path = '/courses'
  state.callbacks = {}
  fetchMock.mockReset().mockResolvedValue({ status: 200 })
  beacon.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('наблюдения страниц и реальные Web Vitals', () => {
  it('привязывает посещение к текущему аккаунту и не вызывает API прогресса', () => {
    render(<StudentActivityBridge userId={34} />)
    expect(bodies()).toEqual([{ route: '/api/activity', body: expect.objectContaining({ expectedUserId: 34, path: '/courses', standalone: false }) }])
  })

  it('периодически отмечает только видимую вкладку', async () => {
    render(<StudentActivityBridge userId={34} />)
    await act(() => vi.advanceTimersByTimeAsync(60000))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    await act(() => vi.advanceTimersByTimeAsync(60000))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each(['/admin/collections/users/34', '/trainer/interview/private-room-token'])('не передаёт приватный идентификатор %s', (path) => {
    state.path = path
    render(<StudentActivityBridge userId={34} />)
    const output = JSON.stringify(bodies())
    expect(output).not.toContain('private-room-token')
    expect(output).not.toContain('collections/users')
  })

  it('отправляет последнее накопленное значение, LCP остаётся на исходной странице', async () => {
    const view = render(<StudentActivityBridge userId={34} />)
    const metric = (value: number) => ({ name: 'LCP', value, id: 'v5-test', navigationType: 'navigate' }) as Metric
    state.callbacks.LCP(metric(1000))
    state.callbacks.LCP(metric(1200))
    state.path = '/lessons/next-intro'
    view.rerender(<StudentActivityBridge userId={34} />)
    await act(() => vi.advanceTimersByTimeAsync(10000))
    expect(bodies().filter(({ route }) => route === '/api/vitals')).toEqual([{ route: '/api/vitals', body: { expectedUserId: 34, path: '/courses', metric: { name: 'LCP', value: 1200, id: 'v5-test', navigationType: 'navigate' } } }])
  })

  it('останавливает периодические записи после смены аккаунта или завершения сессии', async () => {
    fetchMock.mockResolvedValue({ status: 403 })
    render(<StudentActivityBridge userId={34} />)
    await act(() => vi.advanceTimersByTimeAsync(60000))
    const count = fetchMock.mock.calls.length
    await act(() => vi.advanceTimersByTimeAsync(120000))
    expect(fetchMock).toHaveBeenCalledTimes(count)
  })
})
