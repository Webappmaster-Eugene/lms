import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnectionStatus } from '@/components/pwa/use-connection-status'

const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine')
function online(value: boolean) { Object.defineProperty(navigator, 'onLine', { configurable: true, value }) }
function Connection() { return <p role="status">{useConnectionStatus() ? 'offline' : 'connected'}</p> }
let api: ReturnType<typeof vi.fn<typeof fetch>>

beforeEach(() => {
  vi.useFakeTimers()
  online(true)
  api = vi.fn(async () => new Response(null, { status: 204, headers: { 'X-LMS-Connectivity': '1' } }))
  vi.stubGlobal('fetch', api)
})

afterEach(() => {
  cleanup()
  if (onlineDescriptor) Object.defineProperty(navigator, 'onLine', onlineDescriptor)
  else Reflect.deleteProperty(navigator, 'onLine')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('PWA connectivity recovery', () => {
  it('does not poll the server during normal connected use', async () => {
    render(<Connection />)
    await act(async () => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(60000) })
    expect(api).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('connected')
  })

  it('recovers with a real response even if navigator.onLine stays false and no online event arrives', async () => {
    online(false)
    api.mockRejectedValueOnce(new TypeError('Network unreachable'))
    render(<Connection />)
    expect(screen.getByRole('status')).toHaveTextContent('offline')
    await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    expect(navigator.onLine).toBe(false)
    expect(screen.getByRole('status')).toHaveTextContent('connected')
    expect(api).toHaveBeenCalledWith('/api/connectivity', expect.objectContaining({ cache: 'no-store', credentials: 'omit', redirect: 'error' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(api).toHaveBeenCalledTimes(2)
  })

  it('does not trust an online event or a captive portal HTML response', async () => {
    online(false)
    api.mockResolvedValue(new Response('<html>Sign in to Wi-Fi</html>', { status: 200 }))
    render(<Connection />)
    await act(async () => { await Promise.resolve() })
    await act(async () => { online(true); window.dispatchEvent(new Event('online')) })
    expect(screen.getByRole('status')).toHaveTextContent('offline')
    api.mockResolvedValue(new Response(null, { status: 204, headers: { 'X-LMS-Connectivity': '1' } }))
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(screen.getByRole('status')).toHaveTextContent('connected')
  })

  it('keeps the banner for a 204 response without the same-origin service marker', async () => {
    online(false)
    api.mockResolvedValue(new Response(null, { status: 204 }))
    render(<Connection />)
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('status')).toHaveTextContent('offline')
  })

  it('aborts a stalled recovery request and allows a later successful retry', async () => {
    online(false)
    let firstSignal: AbortSignal | null | undefined
    api.mockImplementationOnce((_path, options) => new Promise((_resolve, reject) => {
      firstSignal = options?.signal
      firstSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    render(<Connection />)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(firstSignal?.aborted).toBe(true)
    expect(screen.getByRole('status')).toHaveTextContent('offline')
    await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    expect(screen.getByRole('status')).toHaveTextContent('connected')
  })

  it('aborts pending work and removes recovery listeners when unmounted', async () => {
    online(false)
    let pendingSignal: AbortSignal | null | undefined
    api.mockImplementation((_path, options) => new Promise((_resolve, reject) => {
      pendingSignal = options?.signal
      pendingSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const { unmount } = render(<Connection />)
    unmount()
    expect(pendingSignal?.aborted).toBe(true)
    await act(async () => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(60000) })
    expect(api).toHaveBeenCalledOnce()
  })

  it('pauses requests in a hidden tab and checks immediately when it becomes visible', async () => {
    online(false)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    render(<Connection />)
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(api).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(api).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('connected')
  })

  it('ignores a stale successful response when a new offline event invalidates it', async () => {
    online(false)
    let resolveFirst: ((value: Response) => void) | undefined
    api.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
    api.mockRejectedValueOnce(new TypeError('Still offline'))
    render(<Connection />)
    await act(async () => { window.dispatchEvent(new Event('offline')); resolveFirst?.(new Response(null, { status: 204, headers: { 'X-LMS-Connectivity': '1' } })) })
    expect(screen.getByRole('status')).toHaveTextContent('offline')
  })

  it('keeps the new timeout when an aborted older request rejects late', async () => {
    online(false)
    let rejectFirst: ((reason: Error) => void) | undefined
    let currentSignal: AbortSignal | null | undefined
    api.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject }))
    api.mockImplementationOnce((_path, options) => new Promise((_resolve, reject) => {
      currentSignal = options?.signal
      currentSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    render(<Connection />)
    await act(async () => { window.dispatchEvent(new Event('offline')) })
    await act(async () => { rejectFirst?.(new DOMException('Old request aborted', 'AbortError')) })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(currentSignal?.aborted).toBe(true)
    expect(screen.getByRole('status')).toHaveTextContent('offline')
    await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    expect(screen.getByRole('status')).toHaveTextContent('connected')
    expect(api).toHaveBeenCalledTimes(3)
  })

  it('coalesces concurrent recovery hints into one request and stops retrying after success', async () => {
    online(false)
    let resolveProbe: ((value: Response) => void) | undefined
    api.mockImplementationOnce(() => new Promise((resolve) => { resolveProbe = resolve }))
    render(<Connection />)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(api).toHaveBeenCalledOnce()
    await act(async () => { resolveProbe?.(new Response(null, { status: 204, headers: { 'X-LMS-Connectivity': '1' } })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(api).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('connected')
  })
})
