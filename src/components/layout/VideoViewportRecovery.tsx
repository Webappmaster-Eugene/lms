'use client'

import { useEffect } from 'react'

/** Native Android players can leave the page pinch-zoomed after a rotation. */
export function VideoViewportRecovery() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport || !window.matchMedia('(pointer: coarse)').matches) return

    let stableScale = viewport.scale
    let recoverUntil = 0
    let manualZoomUntil = 0
    let stableTimer: ReturnType<typeof setTimeout> | undefined
    let restoreTimer: ReturnType<typeof setTimeout> | undefined
    let restoreMeta: (() => void) | undefined

    const restore = () => {
      clearTimeout(restoreTimer)
      restoreMeta?.()
      restoreMeta = undefined
    }

    const recover = () => {
      if (Date.now() > recoverUntil || viewport.scale <= 1.02 || restoreMeta) return
      if (document.fullscreenElement || document.querySelector('video:fullscreen')) return
      if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return
      const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
      if (!meta) return
      const original = meta.content
      // Chromium resets the current scale only when initial-scale changes.
      const resetContent = `${original.replace(/initial-scale\s*=[^,;]+[,;]?/gi, '')}, initial-scale=1.0001`
      restoreMeta = () => {
        // Next may replace the viewport during navigation; do not overwrite it.
        if (meta.content === resetContent) meta.content = original
      }
      meta.content = resetContent
      // Restore the exact original metadata without restricting pinch zoom.
      restoreTimer = setTimeout(restore, 100)
    }

    const beginRecovery = () => {
      if (Date.now() < manualZoomUntil || !document.querySelector('video')) return
      clearTimeout(stableTimer)
      if (Date.now() > recoverUntil && Math.abs(stableScale - 1) > 0.02) return
      recoverUntil = Date.now() + 2000
      recover()
    }

    const resize = () => {
      clearTimeout(stableTimer)
      if (Date.now() <= recoverUntil) recover()
      else {
        // Rotation and visualViewport events can arrive in either order.
        stableTimer = setTimeout(() => { stableScale = viewport.scale }, 250)
      }
    }

    const touchStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return
      recoverUntil = 0
      manualZoomUntil = Date.now() + 2000
      restore()
    }

    window.screen.orientation?.addEventListener('change', beginRecovery)
    window.addEventListener('orientationchange', beginRecovery)
    viewport.addEventListener('resize', resize)
    document.addEventListener('fullscreenchange', beginRecovery)
    document.addEventListener('webkitbeginfullscreen', beginRecovery, true)
    document.addEventListener('webkitendfullscreen', beginRecovery, true)
    document.addEventListener('touchstart', touchStart, { passive: true })
    return () => {
      clearTimeout(stableTimer)
      restore()
      window.screen.orientation?.removeEventListener('change', beginRecovery)
      window.removeEventListener('orientationchange', beginRecovery)
      viewport.removeEventListener('resize', resize)
      document.removeEventListener('fullscreenchange', beginRecovery)
      document.removeEventListener('webkitbeginfullscreen', beginRecovery, true)
      document.removeEventListener('webkitendfullscreen', beginRecovery, true)
      document.removeEventListener('touchstart', touchStart)
    }
  }, [])

  return null
}
