import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallExplanation } from '@/components/pwa/InstallExplanation'
import { currentInstallPrompt, rememberInstallPrompt, type InstallPromptEvent } from '@/lib/pwa-client'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
const descriptors = new Map<string, PropertyDescriptor | undefined>()
function navigatorProperty(name: string, value: unknown) {
  if (!descriptors.has(name)) descriptors.set(name, Object.getOwnPropertyDescriptor(navigator, name))
  Object.defineProperty(navigator, name, { configurable: true, value })
}
let requestPermission: ReturnType<typeof vi.fn>
let standalone: boolean

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  standalone = false
  navigatorProperty('userAgent', 'Mozilla/5.0 Android Chrome')
  navigatorProperty('standalone', false)
  navigatorProperty('maxTouchPoints', 1)
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query === '(display-mode: standalone)' ? standalone : query === '(max-width: 1023px)',
    media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(() => false),
  }))
  requestPermission = vi.fn()
  vi.stubGlobal('Notification', { requestPermission })
  rememberInstallPrompt(null)
})

afterEach(() => {
  cleanup()
  rememberInstallPrompt(null)
  localStorage.clear()
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(navigator, name, descriptor)
    else Reflect.deleteProperty(navigator, name)
  }
  descriptors.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function reveal() { await act(async () => { await vi.advanceTimersByTimeAsync(1500) }) }
function installEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = Object.assign(new Event('beforeinstallprompt'), { prompt: vi.fn(async () => undefined), userChoice: Promise.resolve({ outcome }) }) as InstallPromptEvent
  rememberInstallPrompt(event)
  return event
}

describe('mobile PWA explanation', () => {
  it('explains the benefits once, offers settings and restores focus on dismissal without requesting push', async () => {
    const launch = document.createElement('button')
    document.body.append(launch)
    launch.focus()
    const { unmount } = render(<InstallExplanation />)
    await reveal()
    const dialog = screen.getByRole('dialog', { name: 'Учиться удобнее с телефона' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('link', { name: 'Установка приложения' })).toHaveAttribute('href', '/settings/app')
    expect(screen.getByText(/Уведомления включаются отдельно/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить в браузере' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(launch).toHaveFocus()
    unmount()
    render(<InstallExplanation />)
    await reveal()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(requestPermission).not.toHaveBeenCalled()
    launch.remove()
  })

  it('starts Android installation only when the student presses Install', async () => {
    const event = installEvent()
    render(<InstallExplanation />)
    await reveal()
    expect(event.prompt).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Установить приложение' })) })
    expect(event.prompt).toHaveBeenCalledOnce()
    expect(currentInstallPrompt()).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('gives actionable iPhone instructions without pretending a browser install button exists', async () => {
    navigatorProperty('userAgent', 'Mozilla/5.0 iPhone Safari')
    render(<InstallExplanation />)
    await reveal()
    expect(screen.getByText(/в Safari, нажмите «Поделиться» → «На экран Домой»/)).toBeInTheDocument()
    expect(screen.getByText(/iOS 16.4/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Установить приложение' })).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not interrupt an installed application or a desktop session', async () => {
    standalone = true
    const { unmount } = render(<InstallExplanation />)
    await reveal()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    unmount()
    standalone = false
    navigatorProperty('userAgent', 'Mozilla/5.0 Windows Chrome')
    render(<InstallExplanation />)
    await reveal()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('waits for connectivity or an update message to clear before explaining installation', async () => {
    const { rerender } = render(<InstallExplanation paused />)
    await reveal()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(<InstallExplanation paused={false} />)
    await reveal()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows installation failure with recovery guidance and leaves settings available', async () => {
    const event = installEvent()
    vi.mocked(event.prompt).mockRejectedValue(new Error('Browser refused'))
    render(<InstallExplanation />)
    await reveal()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Установить приложение' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Откройте меню браузера')
    expect(screen.getByRole('link', { name: 'Установка приложения' })).toBeInTheDocument()
  })

  it('closes the explanation if the application was installed from the browser menu', async () => {
    render(<InstallExplanation />)
    await reveal()
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('waits until the student closes another dialog before showing installation guidance', async () => {
    const menu = document.createElement('dialog')
    document.body.append(menu)
    menu.showModal()
    render(<InstallExplanation />)
    await reveal()
    expect(screen.queryByRole('dialog', { name: 'Учиться удобнее с телефона' })).not.toBeInTheDocument()
    menu.close()
    menu.remove()
    await reveal()
    expect(screen.getByRole('dialog', { name: 'Учиться удобнее с телефона' })).toBeInTheDocument()
  })

  it('remains usable if private mode prevents reading and writing localStorage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError') })
    const { unmount } = render(<InstallExplanation />)
    await reveal()
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть подсказку об установке' }))
    unmount()
    render(<InstallExplanation />)
    await reveal()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
