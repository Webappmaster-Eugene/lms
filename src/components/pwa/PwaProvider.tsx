'use client'

import { useEffect, useRef, useState } from 'react'
import { rememberInstallPrompt, type InstallPromptEvent } from '@/lib/pwa-client'
import { InstallExplanation } from './InstallExplanation'
import { useConnectionStatus } from './use-connection-status'

type BadgeNavigator = Navigator & { setAppBadge?: (count: number) => Promise<void>; clearAppBadge?: () => Promise<void> }

export function PwaProvider() {
  const offline = useConnectionStatus()
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  const [registrationError, setRegistrationError] = useState(false)
  const refreshRequested = useRef(false)
  const retryRegistration = useRef<(() => void) | null>(null)
  const previousOffline = useRef(offline)

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault()
      rememberInstallPrompt(event as InstallPromptEvent)
    }
    const installed = () => rememberInstallPrompt(null)
    window.addEventListener('beforeinstallprompt', beforeInstall)
    window.addEventListener('appinstalled', installed)
    const badge = (event: Event) => {
      const count: unknown = (event as CustomEvent<unknown>).detail
      const badgeNavigator = navigator as BadgeNavigator
      if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return
      const operation = count > 0 ? badgeNavigator.setAppBadge?.(count) : badgeNavigator.clearAppBadge?.()
      void operation?.catch(() => { /* OS permissions can independently disable the badge. */ })
    }
    window.addEventListener('lms:notification-count', badge)
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall)
      window.removeEventListener('appinstalled', installed)
      window.removeEventListener('lms:notification-count', badge)
    }
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let mounted = true
    let registration: ServiceWorkerRegistration | undefined
    let installing: ServiceWorker | null = null
    let registering = false
    let retryAfterCurrentAttempt = false
    const stateChanged = () => {
      if (mounted && installing?.state === 'installed' && navigator.serviceWorker.controller) setWaiting(registration?.waiting ?? null)
    }
    const updateFound = () => {
      installing?.removeEventListener('statechange', stateChanged)
      installing = registration?.installing ?? null
      installing?.addEventListener('statechange', stateChanged)
    }
    const changed = () => {
      if (refreshRequested.current) window.location.reload()
    }
    const message = (event: MessageEvent<unknown>) => {
      if (event.data && typeof event.data === 'object' && 'type' in event.data && event.data.type === 'LMS_NOTIFICATION') window.dispatchEvent(new Event('lms:notification'))
    }
    navigator.serviceWorker.addEventListener('controllerchange', changed)
    navigator.serviceWorker.addEventListener('message', message)
    function registerWorker() {
      if (!mounted || registering || registration) return
      registering = true
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then((value) => {
        if (!mounted) return
        registration = value
        setRegistrationError(false)
        setWaiting(value.waiting)
        value.addEventListener('updatefound', updateFound)
        updateFound()
      }).catch(() => { if (mounted) setRegistrationError(true) }).finally(() => {
        registering = false
        if (retryAfterCurrentAttempt) {
          retryAfterCurrentAttempt = false
          registerWorker()
        }
      })
    }
    retryRegistration.current = () => {
      // A request started offline may reject after connectivity has returned.
      if (registering) retryAfterCurrentAttempt = true
      else registerWorker()
    }
    registerWorker()
    return () => {
      mounted = false
      retryRegistration.current = null
      registration?.removeEventListener('updatefound', updateFound)
      installing?.removeEventListener('statechange', stateChanged)
      navigator.serviceWorker.removeEventListener('controllerchange', changed)
      navigator.serviceWorker.removeEventListener('message', message)
    }
  }, [])

  useEffect(() => {
    const recovered = previousOffline.current && !offline
    previousOffline.current = offline
    if (recovered) retryRegistration.current?.()
  }, [offline])

  return (
    <>
      <InstallExplanation paused={offline || Boolean(waiting) || registrationError} />
      {(offline || waiting || registrationError) && <div className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-lg rounded-2xl border border-border bg-card p-4 text-sm shadow-lg print:hidden lg:bottom-6" role="status">
        {offline ? <p>Нет подключения. Для переходов и синхронизации нужен интернет.</p> : waiting ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>Доступно обновление приложения</p>
            <button type="button" className="min-h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground" onClick={() => { refreshRequested.current = true; waiting.postMessage({ type: 'ACTIVATE_UPDATE' }) }}>Обновить</button>
          </div>
        ) : <p>Установка приложения временно недоступна. Сайт продолжает работать; попробуйте обновить страницу.</p>}
      </div>}
    </>
  )
}
