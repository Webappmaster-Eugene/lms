import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoViewportRecovery } from '@/components/layout/VideoViewportRecovery'

const original = 'width=device-width, initial-scale=1, viewport-fit=cover'
let viewport: EventTarget & { scale: number }
let meta: HTMLMetaElement
let video: HTMLVideoElement
let fullscreen: Element | null
let fullscreenDescriptor: PropertyDescriptor | undefined

function rotate() {
  act(() => { window.dispatchEvent(new Event('orientationchange')) })
}

function scaleTo(scale: number) {
  act(() => {
    viewport.scale = scale
    viewport.dispatchEvent(new Event('resize'))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  viewport = Object.assign(new EventTarget(), { scale: 1 })
  vi.stubGlobal('visualViewport', viewport)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  fullscreen = null
  fullscreenDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement')
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreen })
  meta = document.createElement('meta')
  meta.name = 'viewport'
  meta.content = original
  document.head.append(meta)
  video = document.createElement('video')
  document.body.append(video)
})

afterEach(() => {
  cleanup()
  meta.remove()
  video.remove()
  if (fullscreenDescriptor) Object.defineProperty(document, 'fullscreenElement', fullscreenDescriptor)
  else Reflect.deleteProperty(document, 'fullscreenElement')
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('VideoViewportRecovery', () => {
  it('resets zoom left by rotation, then restores the original viewport', () => {
    render(<VideoViewportRecovery />)
    rotate()
    scaleTo(2.2)
    expect(meta.content).toContain('initial-scale=1.0001')
    expect(meta.content).toContain('viewport-fit=cover')
    expect(meta.content).not.toMatch(/maximum-scale|user-scalable/)
    act(() => { vi.advanceTimersByTime(100) })
    expect(meta.content).toBe(original)
    // A browser can report its final portrait scale after the fullscreen exit.
    act(() => { vi.advanceTimersByTime(500) })
    scaleTo(3)
    expect(meta.content).toContain('initial-scale=1.0001')
  })

  it('handles zoom arriving before the orientation event', () => {
    render(<VideoViewportRecovery />)
    scaleTo(2)
    rotate()
    expect(meta.content).toContain('initial-scale=1.0001')
  })

  it('handles standard and native fullscreen exit events', () => {
    const { unmount } = render(<VideoViewportRecovery />)
    fullscreen = video
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    scaleTo(2)
    expect(meta.content).toBe(original)
    fullscreen = null
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    expect(meta.content).toContain('initial-scale=1.0001')
    unmount()
    expect(meta.content).toBe(original)

    viewport.scale = 1
    render(<VideoViewportRecovery />)
    act(() => { video.dispatchEvent(new Event('webkitendfullscreen')) })
    scaleTo(2)
    expect(meta.content).toContain('initial-scale=1.0001')
  })

  it('preserves manual zoom set before rotation', () => {
    render(<VideoViewportRecovery />)
    scaleTo(1.5)
    act(() => { vi.advanceTimersByTime(300) })
    rotate()
    scaleTo(2)
    expect(meta.content).toBe(original)
  })

  it('does not reset ordinary zoom or zoom outside the recovery window', () => {
    render(<VideoViewportRecovery />)
    scaleTo(2)
    expect(meta.content).toBe(original)
    scaleTo(1)
    rotate()
    act(() => { vi.advanceTimersByTime(2100) })
    scaleTo(2)
    expect(meta.content).toBe(original)
  })

  it('stops recovery immediately when a user starts a pinch gesture', () => {
    render(<VideoViewportRecovery />)
    rotate()
    scaleTo(2)
    act(() => {
      document.dispatchEvent(new TouchEvent('touchstart', { touches: [{}, {}] as Touch[] }))
    })
    expect(meta.content).toBe(original)
    rotate()
    scaleTo(3)
    expect(meta.content).toBe(original)
  })

  it('ignores pages without video and desktop pointers', () => {
    video.remove()
    const { unmount } = render(<VideoViewportRecovery />)
    rotate()
    scaleTo(2)
    expect(meta.content).toBe(original)
    unmount()
    document.body.append(video)
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    render(<VideoViewportRecovery />)
    rotate()
    scaleTo(3)
    expect(meta.content).toBe(original)
  })

  it('cleans up listeners and does not overwrite a new viewport on navigation', () => {
    const { unmount } = render(<VideoViewportRecovery />)
    rotate()
    scaleTo(2)
    const next = `${original}, interactive-widget=resizes-content`
    meta.content = next
    unmount()
    act(() => { vi.advanceTimersByTime(300) })
    rotate()
    scaleTo(3)
    expect(meta.content).toBe(next)
  })

  it('does not interfere with input focus zoom', () => {
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    render(<VideoViewportRecovery />)
    rotate()
    scaleTo(2)
    expect(meta.content).toBe(original)
    input.remove()
  })
})
