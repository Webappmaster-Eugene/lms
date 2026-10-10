'use client'

import { useSyncExternalStore } from 'react'
import { currentInstallPrompt, isInstalledPwa, isIosDevice } from '@/lib/pwa-client'

function subscribe(callback: () => void) {
  window.addEventListener('lms:install-ready', callback)
  return () => window.removeEventListener('lms:install-ready', callback)
}

function snapshot() {
  const installed = isInstalledPwa()
  const supported = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const denied = 'Notification' in window && Notification.permission === 'denied'
  return (supported ? 1 : 0) | (installed ? 2 : 0) | (isIosDevice() && !installed ? 4 : 0) | (currentInstallPrompt() ? 8 : 0) | (denied ? 16 : 0)
}

export function usePwaCapabilities() {
  const environment = useSyncExternalStore(subscribe, snapshot, () => 0)
  return {
    supported: Boolean(environment & 1),
    installed: Boolean(environment & 2),
    needsHomeScreen: Boolean(environment & 4),
    canInstall: Boolean(environment & 8),
    denied: Boolean(environment & 16),
  }
}
