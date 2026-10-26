import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstallPromptEvent } from '@/lib/pwa-client'

/**
 * Клиентская часть PWA в node-окружении: браузерные границы (navigator,
 * window, localStorage, fetch) подменяются явно, без jsdom.
 */

async function freshClient() {
  vi.resetModules()
  return import('@/lib/pwa-client')
}

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

function blockedStorage() {
  const denied = () => { throw new DOMException('The operation is insecure.', 'SecurityError') }
  return { getItem: denied, setItem: denied }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('отключение push при выходе', () => {
  function deviceWithSubscription(subscription: { endpoint: string; unsubscribe: () => Promise<boolean> } | null) {
    const getRegistration = vi.fn(async () => ({ pushManager: { getSubscription: async () => subscription } }))
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration } })
    return getRegistration
  }

  it('сначала удаляет подписку на сервере, затем отписывает устройство', async () => {
    const order: string[] = []
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
      unsubscribe: vi.fn(async () => { order.push('unsubscribe'); return true }),
    }
    fetchMock.mockImplementation(async () => { order.push('fetch'); return new Response(null, { status: 204 }) })
    const getRegistration = deviceWithSubscription(subscription)
    const { disconnectDevicePush } = await freshClient()

    await disconnectDevicePush()

    expect(getRegistration).toHaveBeenCalledWith('/')
    expect(fetchMock).toHaveBeenCalledWith('/api/push/subscriptions', expect.objectContaining({
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      signal: expect.any(AbortSignal),
    }))
    expect(order).toEqual(['fetch', 'unsubscribe'])
  })

  it('без подписки на устройстве сервер не трогается', async () => {
    deviceWithSubscription(null)
    const { disconnectDevicePush } = await freshClient()

    await disconnectDevicePush()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('браузер без service worker выходит без ошибок и запросов', async () => {
    vi.stubGlobal('navigator', {})
    const { disconnectDevicePush } = await freshClient()

    await expect(disconnectDevicePush()).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('без сети выход не ломается: ошибка запроса не пробрасывается', async () => {
    deviceWithSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/device-1', unsubscribe: vi.fn(async () => true) })
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { disconnectDevicePush } = await freshClient()

    await expect(disconnectDevicePush()).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('пояснение об установке приложения', () => {
  it('запоминается в localStorage и больше не показывается', async () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    const { installExplanationSeen, rememberInstallExplanation } = await freshClient()

    expect(installExplanationSeen()).toBe(false)
    rememberInstallExplanation()

    expect(installExplanationSeen()).toBe(true)
    expect(storage.values.get('lms:pwa-install-explained:v1')).toBe('seen')
  })

  it('в приватном режиме без хранилища не падает и не повторяется в этой вкладке', async () => {
    vi.stubGlobal('localStorage', blockedStorage())
    const { installExplanationSeen, rememberInstallExplanation } = await freshClient()

    expect(installExplanationSeen()).toBe(false)
    expect(() => rememberInstallExplanation()).not.toThrow()
    expect(installExplanationSeen()).toBe(true)
  })
})

describe('определение среды', () => {
  function stubDisplayMode(standalone: boolean) {
    vi.stubGlobal('window', { matchMedia: (query: string) => ({ matches: standalone && query === '(display-mode: standalone)' }) })
  }

  it('приложение запущено с экрана «Домой»: по display-mode или по navigator.standalone на iOS', async () => {
    const { isInstalledPwa } = await freshClient()

    stubDisplayMode(true)
    vi.stubGlobal('navigator', {})
    expect(isInstalledPwa()).toBe(true)

    stubDisplayMode(false)
    vi.stubGlobal('navigator', { standalone: true })
    expect(isInstalledPwa()).toBe(true)

    vi.stubGlobal('navigator', { standalone: false })
    expect(isInstalledPwa()).toBe(false)
  })

  it.each([
    ['iPhone', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }, true],
    ['iPad с iPadOS, притворяющийся Mac', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 }, true],
    ['настоящий Mac', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 }, false],
    ['Android', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7)', platform: 'Linux armv8l', maxTouchPoints: 5 }, false],
  ])('%s → iOS: %s', async (_label, device, expected) => {
    vi.stubGlobal('navigator', device)
    const { isIosDevice } = await freshClient()

    expect(isIosDevice()).toBe(expected)
  })
})

describe('приглашение установки', () => {
  it('сохраняется и оповещает интерфейс событием lms:install-ready', async () => {
    const target = new EventTarget()
    vi.stubGlobal('window', target)
    const ready = vi.fn()
    target.addEventListener('lms:install-ready', ready)
    const { currentInstallPrompt, rememberInstallPrompt } = await freshClient()
    const prompt: InstallPromptEvent = Object.assign(new Event('beforeinstallprompt'), {
      prompt: async () => undefined,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })

    rememberInstallPrompt(prompt)
    expect(currentInstallPrompt()).toBe(prompt)
    expect(ready).toHaveBeenCalledTimes(1)

    rememberInstallPrompt(null)
    expect(currentInstallPrompt()).toBeNull()
    expect(ready).toHaveBeenCalledTimes(2)
  })
})

describe('ключ VAPID', () => {
  it.each([
    'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
    'AQID_-8',
    'AQI',
    'AQ',
  ])('base64url без паддинга %s декодируется в те же байты, что и стандартный декодер', async (key) => {
    const { vapidBytes } = await freshClient()

    expect([...vapidBytes(key)]).toEqual([...Buffer.from(key, 'base64url')])
  })
})
