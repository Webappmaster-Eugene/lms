export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let installPrompt: InstallPromptEvent | null = null
const INSTALL_EXPLANATION_KEY = 'lms:pwa-install-explained:v1'
let explanationSeenWithoutStorage = false

export function installExplanationSeen(): boolean {
  if (explanationSeenWithoutStorage) return true
  try { return localStorage.getItem(INSTALL_EXPLANATION_KEY) === 'seen' }
  catch { return false }
}

export function rememberInstallExplanation(): void {
  try { localStorage.setItem(INSTALL_EXPLANATION_KEY, 'seen') }
  catch {
    // Private browsing can disable storage; still avoid repeats in this session.
    explanationSeenWithoutStorage = true
  }
}

export function isInstalledPwa(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
}

export function isIosDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function rememberInstallPrompt(prompt: InstallPromptEvent | null): void {
  installPrompt = prompt
  window.dispatchEvent(new Event('lms:install-ready'))
}

export function currentInstallPrompt(): InstallPromptEvent | null { return installPrompt }

export async function disconnectDevicePush(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return
    const registration = await navigator.serviceWorker.getRegistration('/')
    const subscription = await registration?.pushManager?.getSubscription()
    if (!subscription) return
    await fetch('/api/push/subscriptions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      signal: AbortSignal.timeout(5000),
    })
    await subscription.unsubscribe()
  } catch {
    // Logging out must work even offline; server delivery also checks session revocation.
  }
}

export function vapidBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = atob(base64 + '='.repeat((4 - base64.length % 4) % 4))
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0))
}
