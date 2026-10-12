'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'

export type SlideRenderState = { index: number; current: boolean; near: boolean }

type Props = {
  label: string
  count: number
  /** Ширина к высоте сцены в обычном режиме; в развёрнутом сцена занимает весь экран. */
  aspect?: number
  /** Страницы документа, а не слайды: меняются подписи кнопок и счётчика. */
  pages?: boolean
  caption?: (index: number) => string | null
  actions?: ReactNode
  children: (slide: SlideRenderState) => ReactNode
}

const SETTLE_MS = 700
const FOCUSABLE = 'button, a[href], [tabindex]:not([tabindex="-1"])'
const controlClass = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-background'

/** Шаг по клавише: null — клавиша не листает. */
function keyTarget(key: string, current: number, count: number): number | null {
  switch (key) {
    case 'ArrowLeft': case 'PageUp': return current - 1
    case 'ArrowRight': case 'PageDown': return current + 1
    case 'Home': return 0
    case 'End': return count - 1
    default: return null
  }
}

/**
 * Листалка слайдов: свайп двигает ленту с привязкой к слайду, кнопки и стрелки
 * клавиатуры прокручивают её программно. Содержимое слайда рисует вызывающий компонент.
 */
export function SlideDeck({ label, count, aspect = 16 / 9, pages = false, caption, actions, children }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const [index, setIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const last = Math.max(0, count - 1)
  const current = Math.min(index, last)
  const position = useRef(current)
  // Пока идёт программная прокрутка, промежуточные положения ленты не должны менять номер слайда.
  const settling = useRef<{ target: number; timer: number } | null>(null)
  const native = useRef(false)
  const unit = pages ? { one: 'Страница', previous: 'Предыдущая страница', next: 'Следующая страница' } : { one: 'Слайд', previous: 'Предыдущий слайд', next: 'Следующий слайд' }

  useEffect(() => { position.current = current }, [current])

  const release = useCallback(() => {
    if (!settling.current) return
    window.clearTimeout(settling.current.timer)
    settling.current = null
  }, [])

  const scrollToSlide = useCallback((target: number, smooth: boolean) => {
    const element = track.current
    if (!element || typeof element.scrollTo !== 'function') return
    const calm = !smooth || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    element.scrollTo({ left: target * element.clientWidth, behavior: calm ? 'auto' : 'smooth' })
  }, [])

  const go = useCallback((target: number) => {
    const next = Math.max(0, Math.min(count - 1, target))
    // Переход «на месте» ленту не двигает: ждать его окончания значило бы пропустить следующий свайп.
    if (next === position.current) return
    release()
    settling.current = { target: next, timer: window.setTimeout(() => { settling.current = null }, SETTLE_MS) }
    position.current = next
    setIndex(next)
    scrollToSlide(next, true)
  }, [count, release, scrollToSlide])

  function onScroll() {
    const element = track.current
    if (!element?.clientWidth) return
    const shown = Math.max(0, Math.min(count - 1, Math.round(element.scrollLeft / element.clientWidth)))
    if (settling.current) {
      if (shown !== settling.current.target) return
      release()
    }
    position.current = shown
    setIndex(shown)
  }

  useEffect(() => release, [release])

  // При смене ширины (поворот экрана, развёрнутый режим) лента должна остаться на том же слайде.
  useEffect(() => {
    const element = track.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => scrollToSlide(position.current, false))
    observer.observe(element)
    return () => observer.disconnect()
  }, [scrollToSlide])

  const collapse = useCallback(async () => {
    if (document.fullscreenElement === root.current && typeof document.exitFullscreen === 'function') {
      await document.exitFullscreen().then(() => undefined, () => undefined)
    }
    native.current = false
    setExpanded(false)
    toggle.current?.focus()
  }, [])

  async function expand() {
    const element = root.current
    setExpanded(true)
    if (element && typeof element.requestFullscreen === 'function') {
      native.current = await element.requestFullscreen().then(() => true, () => false)
    }
    // Safari не ставит фокус на кнопку по клику, а без фокуса внутри клавиши ушли бы странице.
    toggle.current?.focus()
  }

  useEffect(() => {
    const onChange = () => {
      const active = document.fullscreenElement === root.current
      if (native.current && !active) setExpanded(false)
      native.current = active
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Развёрнутая презентация ведёт себя как модальное окно: страница под ней не прокручивается,
  // клавиши и Tab остаются внутри, где бы ни оказался фокус. Без системного полноэкранного
  // режима (iPhone) она просто растянута поверх страницы, и браузер сам этого не обеспечит.
  useEffect(() => {
    if (!expanded) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const element = root.current
      if (!element) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        void collapse()
        return
      }
      if (event.key === 'Tab') {
        const stops = [...element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((node) => !node.closest('[inert]'))
        const first = stops[0]
        const final = stops.at(-1)
        const active = document.activeElement
        const outside = !(active instanceof Node) || !element.contains(active)
        if (!first || !final) return
        if (event.shiftKey ? outside || active === first : outside || active === final) {
          event.preventDefault()
          ;(event.shiftKey ? final : first).focus()
        }
        return
      }
      const target = keyTarget(event.key, position.current, count)
      if (target === null) return
      event.preventDefault()
      event.stopPropagation()
      go(target)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey, true)
    }
  }, [collapse, count, expanded, go])

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (expanded || event.altKey || event.ctrlKey || event.metaKey) return
    const target = keyTarget(event.key, position.current, count)
    if (target === null) return
    // Стрелки на странице урока листают уроки; внутри презентации они листают слайды.
    event.preventDefault()
    go(target)
  }

  if (count <= 0) return null
  const text = caption?.(current) ?? null
  const atStart = current === 0
  const atEnd = current === last
  return (
    <div
      ref={root}
      data-slide-deck=""
      tabIndex={-1}
      role={expanded ? 'dialog' : 'group'}
      aria-modal={expanded || undefined}
      aria-roledescription={expanded ? undefined : 'презентация'}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={expanded
        ? 'fixed inset-0 z-[100] m-0 flex flex-col bg-background pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] outline-none'
        : 'flex flex-col overflow-hidden rounded-xl border border-border bg-card outline-none'}
    >
      <div
        className={`relative min-h-0 w-full overflow-hidden bg-muted/40 ${expanded ? 'flex-1' : 'max-h-[max(12rem,calc(100dvh-12rem))]'}`}
        style={expanded ? undefined : { aspectRatio: String(aspect) }}
      >
        <div
          ref={track}
          tabIndex={-1}
          onScroll={onScroll}
          onPointerDown={release}
          onWheel={release}
          data-testid="slide-track"
          className="scrollbar-hide flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain outline-none"
        >
          {Array.from({ length: count }, (_, slide) => (
            <div
              key={slide}
              role="group"
              aria-roledescription={pages ? 'страница' : 'слайд'}
              aria-label={`${unit.one} ${slide + 1} из ${count}`}
              aria-hidden={slide !== current}
              inert={slide !== current}
              className="relative flex h-full w-full shrink-0 snap-center items-center justify-center"
            >
              {children({ index: slide, current: slide === current, near: Math.abs(slide - current) <= 1 })}
            </div>
          ))}
        </div>
      </div>
      <div className="h-1 w-full bg-muted" aria-hidden="true">
        <div className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${((current + 1) / count) * 100}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-2">
          {/* aria-disabled, а не disabled: отключённая кнопка теряет фокус, и следующая стрелка листала бы уроки. */}
          <button type="button" className={controlClass} aria-disabled={atStart} aria-label={unit.previous} onClick={() => go(current - 1)}>
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </button>
          <p className="min-w-16 text-center text-sm font-medium tabular-nums text-foreground" aria-live="polite" aria-atomic="true">
            <span className="sr-only">{unit.one} </span>{current + 1}<span aria-hidden="true"> / </span><span className="sr-only"> из </span>{count}
          </p>
          <button type="button" className={controlClass} aria-disabled={atEnd} aria-label={unit.next} onClick={() => go(current + 1)}>
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:order-last">
          {actions}
          <button ref={toggle} type="button" className={controlClass} aria-label={expanded ? 'Свернуть презентацию' : 'Развернуть на весь экран'} onClick={() => void (expanded ? collapse() : expand())}>
            {expanded ? <Minimize2 aria-hidden="true" className="h-5 w-5" /> : <Maximize2 aria-hidden="true" className="h-5 w-5" />}
          </button>
        </div>
        {/* На телефоне подпись уходит на свою строку: рядом с кнопками ей оставалось бы несколько букв. */}
        {text && <p title={text} className="line-clamp-3 min-w-0 basis-full text-sm text-muted-foreground sm:basis-0 sm:flex-1">{text}</p>}
      </div>
    </div>
  )
}
