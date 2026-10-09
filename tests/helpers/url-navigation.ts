import { useSyncExternalStore } from 'react'
import { vi } from 'vitest'

let href = '/courses'
const listeners = new Set<() => void>()
const history = [href]
let index = 0

export function setNavigationURL(next: string) {
  href = next
  history.splice(0, history.length, next)
  index = 0
  for (const listener of listeners) listener()
}
const navigate = (next: string, replace = false) => {
  href = next
  if (replace) history[index] = next
  else { history.splice(index + 1); history.push(next); index += 1 }
  for (const listener of listeners) listener()
}
const router = {
  push: vi.fn((next: string) => navigate(next)),
  replace: vi.fn((next: string) => navigate(next, true)),
  refresh: vi.fn(), prefetch: vi.fn(), forward: vi.fn(),
  back: vi.fn(() => { if (index > 0) { index -= 1; href = history[index]; for (const listener of listeners) listener() } }),
}

export function navigationURL() { return href }
export function navigationRouter() { return router }
export function urlNavigationMock() {
  const useURL = () => useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener) }, () => href, () => href)
  return { useRouter: () => router, usePathname: () => new URL(useURL(), 'https://learn.example').pathname, useSearchParams: () => new URLSearchParams(new URL(useURL(), 'https://learn.example').search) }
}
