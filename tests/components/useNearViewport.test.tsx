import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

import { useNearViewport } from '@/hooks/use-near-viewport'

type Entry = Pick<IntersectionObserverEntry, 'isIntersecting'>
const observers: Array<{ notify: (entries: Entry[]) => void; options?: IntersectionObserverInit; disconnect: ReturnType<typeof vi.fn> }> = []

function stubObserver() {
  observers.length = 0
  vi.stubGlobal('IntersectionObserver', class {
    disconnect = vi.fn()
    constructor(callback: (entries: Entry[]) => void, options?: IntersectionObserverInit) {
      observers.push({ notify: callback, options, disconnect: this.disconnect })
    }
    observe() {}
  })
}

function Probe() {
  const [target, near] = useNearViewport<HTMLDivElement>('100px 0px')
  return <div ref={target}>{near ? 'рядом' : 'далеко'}</div>
}

afterEach(() => vi.unstubAllGlobals())

describe('элемент рядом с экраном', () => {
  it('ждёт, пока до него долистают, и больше не сбрасывается', () => {
    stubObserver()
    render(<Probe />)
    expect(screen.getByText('далеко')).toBeInTheDocument()
    expect(observers[0].options).toEqual({ rootMargin: '100px 0px' })
    act(() => observers[0].notify([{ isIntersecting: false }]))
    expect(screen.getByText('далеко')).toBeInTheDocument()
    act(() => observers[0].notify([{ isIntersecting: true }]))
    expect(screen.getByText('рядом')).toBeInTheDocument()
    // Дальше следить незачем: файл уже нужен, обратно он не «разгрузится».
    expect(observers[0].disconnect).toHaveBeenCalled()
    expect(observers).toHaveLength(1)
  })

  it('без поддержки наблюдателя в браузере элемент считается видимым сразу', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<Probe />)
    expect(screen.getByText('рядом')).toBeInTheDocument()
  })
})
