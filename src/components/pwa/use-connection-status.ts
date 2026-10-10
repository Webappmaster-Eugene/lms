'use client'

import { useEffect, useState } from 'react'

/** Browser connectivity events are hints: a successful uncached request is
 * the source of truth, including when navigator.onLine remains stale. */
export function useConnectionStatus() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let mounted = true
    let disconnected = !navigator.onLine
    let controller: AbortController | null = null
    let timeout: ReturnType<typeof setTimeout> | undefined
    let retry: ReturnType<typeof setTimeout> | undefined

    function stopRequest() {
      controller?.abort()
      controller = null
      clearTimeout(timeout)
    }

    async function checkConnection() {
      if (controller || document.visibilityState === 'hidden') return
      clearTimeout(retry)
      const request = new AbortController()
      controller = request
      timeout = setTimeout(() => request.abort(), 5000)
      try {
        const response = await fetch('/api/connectivity', {
          cache: 'no-store', credentials: 'omit', redirect: 'error', signal: request.signal,
        })
        if (mounted && controller === request && response.status === 204 && response.headers.get('X-LMS-Connectivity') === '1') {
          disconnected = false
          setOffline(false)
        }
      } catch {
        // Keep the current status until the next recovery check succeeds.
      } finally {
        if (controller === request) {
          clearTimeout(timeout)
          controller = null
          if (mounted && disconnected) retry = setTimeout(() => void checkConnection(), 10000)
        }
      }
    }

    function lostConnection() {
      disconnected = true
      setOffline(true)
      stopRequest()
      clearTimeout(retry)
      void checkConnection()
    }
    function recoveredConnection() {
      if (disconnected) void checkConnection()
    }

    window.addEventListener('offline', lostConnection)
    window.addEventListener('online', recoveredConnection)
    window.addEventListener('focus', recoveredConnection)
    document.addEventListener('visibilitychange', recoveredConnection)
    if (disconnected) lostConnection()
    return () => {
      mounted = false
      stopRequest()
      clearTimeout(retry)
      window.removeEventListener('offline', lostConnection)
      window.removeEventListener('online', recoveredConnection)
      window.removeEventListener('focus', recoveredConnection)
      document.removeEventListener('visibilitychange', recoveredConnection)
    }
  }, [])

  return offline
}
