import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationSettings } from '@/components/pwa/NotificationSettings'
import { PwaProvider } from '@/components/pwa/PwaProvider'
import { currentInstallPrompt, rememberInstallPrompt, type InstallPromptEvent } from '@/lib/pwa-client'

const settings = {
  preferences: { remindersEnabled: true, timezone: 'Europe/Moscow', reminderHour: 18, pushEnabled: true },
  vapidPublicKey: 'AQID', pushConfigured: true, devicesCount: 0,
}

const originalNavigator = new Map<string, PropertyDescriptor | undefined>()
function navigatorProperty(name: string, value: unknown) {
  if (!originalNavigator.has(name)) originalNavigator.set(name, Object.getOwnPropertyDescriptor(navigator, name))
  Object.defineProperty(navigator, name, { configurable: true, value })
}

let permission: NotificationPermission
let requestPermission: ReturnType<typeof vi.fn<() => Promise<NotificationPermission>>>
let subscribe: ReturnType<typeof vi.fn>
let unsubscribe: ReturnType<typeof vi.fn>
let getSubscription: ReturnType<typeof vi.fn>
let register: ReturnType<typeof vi.fn>
let registration: EventTarget & { waiting: { postMessage: ReturnType<typeof vi.fn> } | null; installing: null; pushManager: { getSubscription: typeof getSubscription; subscribe: typeof subscribe } }
let serviceWorker: EventTarget & { register: typeof register; getRegistration: ReturnType<typeof vi.fn>; ready: Promise<typeof registration>; controller: object }
let api: ReturnType<typeof vi.fn<typeof fetch>>

beforeEach(() => {
  permission = 'default'
  requestPermission = vi.fn(async () => { permission = 'granted'; return permission })
  vi.stubGlobal('Notification', { get permission() { return permission }, requestPermission })
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('isSecureContext', true)
  navigatorProperty('userAgent', 'Mozilla/5.0 Android Chrome')
  navigatorProperty('platform', 'Linux')
  navigatorProperty('maxTouchPoints', 1)
  navigatorProperty('onLine', true)
  navigatorProperty('standalone', false)
  unsubscribe = vi.fn(async () => true)
  const subscription = {
    endpoint: 'https://push.example/device-one', unsubscribe,
    toJSON: () => ({ endpoint: 'https://push.example/device-one', keys: { p256dh: 'test-public-key', auth: 'test-auth-key' } }),
  }
  getSubscription = vi.fn(async (): Promise<typeof subscription | null> => null)
  subscribe = vi.fn(async () => subscription)
  registration = Object.assign(new EventTarget(), { waiting: null, installing: null, pushManager: { getSubscription, subscribe } })
  register = vi.fn(async () => registration)
  serviceWorker = Object.assign(new EventTarget(), {
    register, getRegistration: vi.fn(async () => registration), ready: Promise.resolve(registration), controller: {},
  })
  navigatorProperty('serviceWorker', serviceWorker)
  api = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (input === '/api/connectivity') return new Response(null, { status: 204, headers: { 'X-LMS-Connectivity': '1' } })
    if (init?.method === 'POST' || init?.method === 'DELETE' || init?.method === 'PATCH') return new Response(null, { status: 204 })
    return Response.json(settings)
  })
  vi.stubGlobal('fetch', api)
  rememberInstallPrompt(null)
})

afterEach(() => {
  cleanup()
  rememberInstallPrompt(null)
  for (const [name, descriptor] of originalNavigator) {
    if (descriptor) Object.defineProperty(navigator, name, descriptor)
    else Reflect.deleteProperty(navigator, name)
  }
  originalNavigator.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function registrations() {
  return api.mock.calls.filter(([path, init]) => path === '/api/push/subscriptions' && init?.method === 'POST')
}

describe('notification settings: consent and device subscriptions', () => {
  it('loads preferences without asking for permission or registering a push subscription', async () => {
    render(<NotificationSettings />)
    expect(await screen.findByRole('button', { name: 'Включить уведомления' })).toBeEnabled()
    expect(requestPermission).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
    expect(registrations()).toHaveLength(0)
    expect(api).toHaveBeenCalledWith('/api/push/settings', expect.objectContaining({ credentials: 'include', method: 'GET' }))
  })

  it('starts the permission prompt in the click handler and registers only after permission is granted', async () => {
    let grant: ((value: NotificationPermission) => void) | undefined
    requestPermission.mockImplementation(() => new Promise((resolve) => { grant = resolve }))
    render(<NotificationSettings />)
    const button = await screen.findByRole('button', { name: 'Включить уведомления' })
    fireEvent.click(button)
    expect(requestPermission).toHaveBeenCalledOnce()
    expect(register).not.toHaveBeenCalled()
    expect(registrations()).toHaveLength(0)
    await act(async () => { permission = 'granted'; grant?.('granted') })
    expect(await screen.findByText('Уведомления на этом устройстве включены.')).toBeInTheDocument()
    expect(register).toHaveBeenCalledWith('/sw.js', expect.objectContaining({ scope: '/' }))
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) }))
    expect(registrations()).toHaveLength(1)
    const [, init] = registrations()[0]
    expect(JSON.parse(String(init?.body))).toEqual({ endpoint: 'https://push.example/device-one', keys: { p256dh: 'test-public-key', auth: 'test-auth-key' } })
    expect(init?.credentials).toBe('include')
  })

  it('declining the prompt does not subscribe or write device credentials to the server', async () => {
    requestPermission.mockImplementation(async () => { permission = 'denied'; return permission })
    render(<NotificationSettings />)
    fireEvent.click(await screen.findByRole('button', { name: 'Включить уведомления' }))
    expect(await screen.findByText(/Разрешение не выдано/)).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
    expect(registrations()).toHaveLength(0)
  })

  it('an already denied permission shows recovery guidance instead of prompting again', async () => {
    permission = 'denied'
    render(<NotificationSettings />)
    expect(await screen.findByText(/Уведомления запрещены в настройках браузера/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Включить уведомления' })).not.toBeInTheDocument()
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('rolls back the browser subscription if the server rejects device registration', async () => {
    api.mockImplementation(async (path, init) => {
      if (path === '/api/push/subscriptions' && init?.method === 'POST') return new Response(null, { status: 409 })
      return Response.json(settings)
    })
    render(<NotificationSettings />)
    fireEvent.click(await screen.findByRole('button', { name: 'Включить уведомления' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Это устройство связано с другим аккаунтом')
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(screen.queryByText('Уведомления на этом устройстве включены.')).not.toBeInTheDocument()
  })

  it('shows a failed settings request and retries without saving invented defaults', async () => {
    api.mockResolvedValueOnce(new Response(null, { status: 503 }))
    render(<NotificationSettings />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
    expect(screen.queryByRole('button', { name: 'Сохранить настройки' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }))
    expect(await screen.findByRole('button', { name: 'Сохранить настройки' })).toBeEnabled()
    expect(api.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
  })

  it('saves explicit opt-out, preferred local hour and timezone together', async () => {
    const user = userEvent.setup()
    render(<NotificationSettings />)
    await screen.findByRole('button', { name: 'Сохранить настройки' })
    await user.click(screen.getByRole('checkbox', { name: /Напоминать, если я давно не учился/ }))
    await user.click(screen.getByRole('checkbox', { name: /Разрешить push на подключённых устройствах/ }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Время напоминания' }), '10')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Часовой пояс' }), 'Asia/Novosibirsk')
    await user.click(screen.getByRole('button', { name: 'Сохранить настройки' }))
    expect(await screen.findByText('Настройки сохранены.')).toBeInTheDocument()
    const request = api.mock.calls.find(([path, init]) => path === '/api/push/settings' && init?.method === 'PATCH')
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ remindersEnabled: false, pushEnabled: false, reminderHour: 10, timezone: 'Asia/Novosibirsk' })
  })

  it('an iPhone browser guides installation before offering a push permission prompt', async () => {
    navigatorProperty('userAgent', 'Mozilla/5.0 iPhone Safari')
    render(<NotificationSettings />)
    expect(await screen.findByText(/Сначала добавьте приложение на экран «Домой»/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Включить уведомления' })).not.toBeInTheDocument()
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('an installed iPhone application can explicitly enable push', async () => {
    navigatorProperty('userAgent', 'Mozilla/5.0 iPhone Safari')
    navigatorProperty('standalone', true)
    render(<NotificationSettings />)
    expect(await screen.findByRole('button', { name: 'Включить уведомления' })).toBeEnabled()
    expect(screen.getByText('Вы уже открыли установленное приложение')).toBeInTheDocument()
  })
})

describe('PWA provider: installation, updates and live notifications', () => {
  it('preserves installation consent and clears a consumed browser installation prompt', async () => {
    render(<PwaProvider />)
    const prompt = vi.fn(async () => undefined)
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' as const }) }) as InstallPromptEvent
    act(() => { window.dispatchEvent(event) })
    expect(event.defaultPrevented).toBe(true)
    expect(currentInstallPrompt()).toBe(event)
    expect(prompt).not.toHaveBeenCalled()
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(currentInstallPrompt()).toBeNull()
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('waits for an explicit update click instead of interrupting an open lesson', async () => {
    const postMessage = vi.fn()
    registration.waiting = { postMessage }
    render(<PwaProvider />)
    const button = await screen.findByRole('button', { name: 'Обновить' })
    expect(postMessage).not.toHaveBeenCalled()
    fireEvent.click(button)
    expect(postMessage).toHaveBeenCalledWith({ type: 'ACTIVATE_UPDATE' })
  })

  it('forwards worker notifications while mounted and removes the listener on navigation', async () => {
    const listener = vi.fn()
    window.addEventListener('lms:notification', listener)
    const { unmount } = render(<PwaProvider />)
    await waitFor(() => expect(register).toHaveBeenCalled())
    act(() => { serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'LMS_NOTIFICATION' } })) })
    expect(listener).toHaveBeenCalledOnce()
    unmount()
    serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'LMS_NOTIFICATION' } }))
    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener('lms:notification', listener)
  })

  it('shows a connection banner and verifies the network before removing it', async () => {
    navigatorProperty('onLine', false)
    render(<PwaProvider />)
    expect(screen.getByRole('status')).toHaveTextContent('Нет подключения')
    act(() => { navigatorProperty('onLine', true); window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(screen.queryByText(/Нет подключения/)).not.toBeInTheDocument())
    expect(api).toHaveBeenCalledWith('/api/connectivity', expect.objectContaining({ cache: 'no-store', redirect: 'error' }))
  })

  it('reports a registration failure without preventing the site from working', async () => {
    register.mockRejectedValueOnce(new Error('Service worker unavailable'))
    render(<PwaProvider />)
    expect(await screen.findByRole('status')).toHaveTextContent('Сайт продолжает работать')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('updates the application badge only for a valid unread count', () => {
    const setAppBadge = vi.fn(async (_count: number) => undefined)
    const clearAppBadge = vi.fn(async () => undefined)
    navigatorProperty('setAppBadge', setAppBadge)
    navigatorProperty('clearAppBadge', clearAppBadge)
    render(<PwaProvider />)
    act(() => {
      for (const detail of [-1, 1.5, '4', Number.NaN]) window.dispatchEvent(new CustomEvent('lms:notification-count', { detail }))
      window.dispatchEvent(new CustomEvent('lms:notification-count', { detail: 3 }))
      window.dispatchEvent(new CustomEvent('lms:notification-count', { detail: 0 }))
    })
    expect(setAppBadge).toHaveBeenCalledExactlyOnceWith(3)
    expect(clearAppBadge).toHaveBeenCalledOnce()
  })
})
