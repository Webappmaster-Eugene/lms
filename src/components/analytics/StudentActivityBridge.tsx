'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { onCLS, onINP, onLCP, type Metric } from 'web-vitals'

function observedPath(path: string): string {
  if (path.startsWith('/admin')) return '/admin'
  if (path.startsWith('/trainer/interview/')) return '/trainer/interview'
  return path.slice(0, 240)
}

export function StudentActivityBridge({ userId }: { userId: number }) {
  const pathname = usePathname()
  const path = useRef(pathname)

  useEffect(() => {
    path.current = pathname
    if (document.visibilityState !== 'visible') return
    const body = { expectedUserId: userId, path: observedPath(pathname), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, standalone: window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone) }
    void fetch('/api/activity', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) }).catch(() => { /* An observation failure cannot interrupt studying. */ })
  }, [pathname, userId])

  useEffect(() => {
    let active = true
    let stopped = false
    const pending = new Map<string, Metric>()
    const navigationPath = observedPath(path.current)
    const post = async (route: string, value: unknown) => {
      if (!active || stopped) return
      try {
        const response = await fetch(route, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value), signal: AbortSignal.timeout(10000), keepalive: true })
        if (response.status === 401 || response.status === 403) stopped = true
      } catch { /* Analytics is best-effort; learning APIs remain independent. */ }
    }
    const heartbeat = () => {
      if (document.visibilityState !== 'visible') return
      void post('/api/activity', { expectedUserId: userId, path: observedPath(path.current), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, standalone: window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone) })
    }
    const flush = (beacon: boolean) => {
      for (const metric of pending.values()) {
        const body = { expectedUserId: userId, path: metric.name === 'LCP' ? navigationPath : observedPath(path.current), metric: { name: metric.name, value: metric.value, id: metric.id, navigationType: metric.navigationType } }
        if (beacon && active && !stopped && navigator.sendBeacon) navigator.sendBeacon('/api/vitals', new Blob([JSON.stringify(body)], { type: 'application/json' }))
        else void post('/api/vitals', body)
      }
      pending.clear()
    }
    const record = (metric: Metric) => { if (active && !stopped) pending.set(metric.name, metric) }
    onLCP(record, { reportAllChanges: true })
    onINP(record, { reportAllChanges: true })
    onCLS(record, { reportAllChanges: true })
    const visible = () => { if (document.visibilityState === 'visible') heartbeat(); else flush(true) }
    const hidden = () => flush(true)
    const heartbeatTimer = window.setInterval(heartbeat, 60_000)
    const metricsTimer = window.setInterval(() => flush(false), 10_000)
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('pagehide', hidden)
    return () => {
      flush(true)
      active = false
      window.clearInterval(heartbeatTimer)
      window.clearInterval(metricsTimer)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('pagehide', hidden)
    }
  }, [userId])

  return null
}
