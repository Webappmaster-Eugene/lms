import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PwaProvider } from '@/components/pwa/PwaProvider'

const descriptors = new Map<string, PropertyDescriptor | undefined>()
function navigatorProperty(name: string, value: unknown) {
  if (!descriptors.has(name)) descriptors.set(name, Object.getOwnPropertyDescriptor(navigator, name))
  Object.defineProperty(navigator, name, { configurable: true, value })
}

let register: ReturnType<typeof vi.fn>
let api: ReturnType<typeof vi.fn<typeof fetch>>
const connectivityResponse = () => new Response(null, { status: 204, headers: { 'X-LMS-Connectivity': '1' } })

beforeEach(() => {
  navigatorProperty('onLine', true)
  const registration = Object.assign(new EventTarget(), { waiting: null, installing: null })
  register = vi.fn(async () => registration)
  navigatorProperty('serviceWorker', Object.assign(new EventTarget(), { register, controller: null }))
  api = vi.fn(async () => connectivityResponse())
  vi.stubGlobal('fetch', api)
})

afterEach(() => {
  cleanup()
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(navigator, name, descriptor)
    else Reflect.deleteProperty(navigator, name)
  }
  descriptors.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PWA worker registration after network recovery', () => {
  it('retries a registration that failed offline and removes both connection and installation errors', async () => {
    navigatorProperty('onLine', false)
    register.mockRejectedValueOnce(new TypeError('Worker could not be downloaded offline'))
    api.mockRejectedValueOnce(new TypeError('No network'))
    render(<PwaProvider />)
    await act(async () => { await Promise.resolve() })
    expect(register).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('Нет подключения')

    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(register).toHaveBeenCalledTimes(2))
    expect(navigator.onLine).toBe(false)
    expect(screen.queryByText(/Нет подключения/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Установка приложения временно недоступна/)).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('queues one recovery attempt when the original offline registration rejects after reconnection', async () => {
    navigatorProperty('onLine', false)
    let rejectFirst: ((cause: Error) => void) | undefined
    register.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject }))
    api.mockRejectedValueOnce(new TypeError('No network'))
    render(<PwaProvider />)
    await act(async () => { await Promise.resolve() })
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(register).toHaveBeenCalledOnce()
    expect(screen.queryByText(/Нет подключения/)).not.toBeInTheDocument()
    await act(async () => { rejectFirst?.(new TypeError('Original registration failed')) })
    await waitFor(() => expect(register).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not repeatedly register on normal online or focus events after a registration error', async () => {
    register.mockRejectedValue(new Error('Registration unavailable'))
    render(<PwaProvider />)
    expect(await screen.findByRole('status')).toHaveTextContent('Установка приложения временно недоступна')
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('online'))
    })
    expect(register).toHaveBeenCalledOnce()
    expect(api).not.toHaveBeenCalled()
  })

  it('keeps a successful registration when the same worker recovers from an outage', async () => {
    render(<PwaProvider />)
    await act(async () => { await Promise.resolve() })
    await act(async () => { window.dispatchEvent(new Event('offline')) })
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(register).toHaveBeenCalledOnce()
  })

  it('retries an initial installation whose precache failed after register had already resolved', async () => {
    navigatorProperty('onLine', false)
    api.mockRejectedValueOnce(new TypeError('No network'))
    const worker = Object.assign(new EventTarget(), { state: 'installing' })
    const registration = Object.assign(new EventTarget(), { waiting: null, installing: worker, active: null })
    register.mockResolvedValueOnce(registration)
    render(<PwaProvider />)
    await act(async () => { await Promise.resolve() })
    act(() => { worker.state = 'redundant'; worker.dispatchEvent(new Event('statechange')) })
    expect(register).toHaveBeenCalledOnce()

    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(register).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('honours a verified recovery when the installation rejects after the connection is already restored', async () => {
    navigatorProperty('onLine', false)
    api.mockRejectedValueOnce(new TypeError('No network'))
    const worker = Object.assign(new EventTarget(), { state: 'installing' })
    register.mockResolvedValueOnce(Object.assign(new EventTarget(), { waiting: null, installing: worker, active: null }))
    render(<PwaProvider />)
    await act(async () => { await Promise.resolve() })
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(screen.queryByText(/Нет подключения/)).not.toBeInTheDocument()
    expect(register).toHaveBeenCalledOnce()

    await act(async () => { worker.state = 'redundant'; worker.dispatchEvent(new Event('statechange')) })
    await waitFor(() => expect(register).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('preserves a working active worker when an update becomes redundant', async () => {
    const active = Object.assign(new EventTarget(), { state: 'activated' })
    const worker = Object.assign(new EventTarget(), { state: 'installing' })
    register.mockResolvedValueOnce(Object.assign(new EventTarget(), { waiting: null, installing: worker, active }))
    render(<PwaProvider />)
    await act(async () => { await Promise.resolve() })
    act(() => { worker.state = 'redundant'; worker.dispatchEvent(new Event('statechange')) })
    await act(async () => { window.dispatchEvent(new Event('offline')) })
    expect(register).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('clears an initial installation error when the browser subsequently installs a worker successfully', async () => {
    const worker = Object.assign(new EventTarget(), { state: 'installing' })
    const registration = Object.assign(new EventTarget(), { waiting: null, installing: worker, active: null })
    register.mockResolvedValueOnce(registration)
    render(<PwaProvider />)
    await act(async () => { await Promise.resolve() })
    act(() => { worker.state = 'redundant'; worker.dispatchEvent(new Event('statechange')) })
    expect(screen.getByRole('status')).toHaveTextContent('Установка приложения временно недоступна')

    const replacement = Object.assign(new EventTarget(), { state: 'installing' })
    act(() => { registration.installing = replacement; registration.dispatchEvent(new Event('updatefound')) })
    act(() => { replacement.state = 'installed'; replacement.dispatchEvent(new Event('statechange')) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(register).toHaveBeenCalledOnce()
  })

  it('ignores events from a failed worker after its replacement was registered', async () => {
    navigatorProperty('onLine', false)
    api.mockRejectedValueOnce(new TypeError('No network'))
    const oldWorker = Object.assign(new EventTarget(), { state: 'installing' })
    const replacement = Object.assign(new EventTarget(), { state: 'installing' })
    register.mockResolvedValueOnce(Object.assign(new EventTarget(), { waiting: null, installing: oldWorker, active: null }))
    register.mockResolvedValueOnce(Object.assign(new EventTarget(), { waiting: null, installing: replacement, active: null }))
    const { unmount } = render(<PwaProvider />)
    await act(async () => { await Promise.resolve() })
    act(() => { oldWorker.state = 'redundant'; oldWorker.dispatchEvent(new Event('statechange')) })
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(register).toHaveBeenCalledTimes(2)

    act(() => { oldWorker.dispatchEvent(new Event('statechange')) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    unmount()
    await act(async () => { replacement.state = 'redundant'; replacement.dispatchEvent(new Event('statechange')); window.dispatchEvent(new Event('online')) })
    expect(register).toHaveBeenCalledTimes(2)
  })

  it('does not attach worker listeners or replay a queued recovery after unmount', async () => {
    navigatorProperty('onLine', false)
    api.mockRejectedValueOnce(new TypeError('No network'))
    let resolveRegistration: ((value: EventTarget) => void) | undefined
    register.mockImplementationOnce(() => new Promise((resolve) => { resolveRegistration = resolve }))
    const registration = Object.assign(new EventTarget(), { waiting: null, installing: null })
    const subscribe = vi.spyOn(registration, 'addEventListener')
    const { unmount } = render(<PwaProvider />)
    await act(async () => { await Promise.resolve() })
    await act(async () => { window.dispatchEvent(new Event('online')) })
    unmount()
    await act(async () => { resolveRegistration?.(registration) })
    expect(register).toHaveBeenCalledOnce()
    expect(subscribe).not.toHaveBeenCalled()
  })
})
