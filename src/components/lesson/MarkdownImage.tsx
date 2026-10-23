'use client'

import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, X } from 'lucide-react'

/**
 * Схема на весь экран в натуральную величину: широкая прокручивается, а не ужимается.
 * Data:-адрес новой вкладкой не открыть — браузеры такую навигацию блокируют.
 */
function DiagramDialog({ src, alt, onClose, returnFocus }: { src: string; alt: string; onClose: () => void; returnFocus: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDialogElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(false)
  const close = useRef(onClose)
  const titleId = useId()

  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    const dialog = ref.current
    // Кнопка-схема живёт дольше диалога: фокус вернётся на неё после закрытия.
    const opener = returnFocus.current
    if (!dialog) return
    dialog.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      opener?.focus()
    }
  }, [returnFocus])

  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Esc закрывает диалог сам; состояние догоняет событие close.
      onClose={() => close.current()}
      onClick={(event) => {
        // Нажатие на фон вокруг схемы закрывает просмотр, на саму схему — нет.
        if (event.target === event.currentTarget || event.target === area.current) close.current()
      }}
      onKeyDown={(event) => {
        // Стрелки прокручивают схему, а не листают уроки (LessonKeyboardNav слушает window).
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.stopPropagation()
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none flex-col bg-background p-0 text-foreground backdrop:bg-black/70 open:flex sm:m-auto sm:h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)] sm:rounded-2xl sm:border sm:border-border sm:shadow-xl"
    >
      <div className="flex items-center gap-3 border-b border-border py-1 pl-4 pr-1">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-base font-semibold">{alt}</h2>
          {/* На телефоне полоса прокрутки скрыта: без подсказки не видно, что схема продолжается. */}
          {wide && <p className="text-xs text-muted-foreground">Схема шире экрана — прокрутите вбок</p>}
        </div>
        <span className="hidden text-xs text-muted-foreground sm:inline">Esc — закрыть</span>
        <button type="button" onClick={onClose} aria-label="Закрыть схему" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div
        ref={area}
        role="region"
        aria-label="Схема в натуральную величину"
        tabIndex={0}
        className="flex min-h-0 flex-1 overflow-auto overscroll-contain bg-white p-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="m-auto block h-auto max-w-none"
          onLoad={(event) => setWide(event.currentTarget.naturalWidth > (area.current?.clientWidth ?? Infinity))}
        />
      </div>
    </dialog>,
    document.body,
  )
}

/**
 * Схема в своём размере, но не шире колонки. На телефоне широкая схема не сжимается
 * уже 560 px, а прокручивается внутри рамки; нажатие открывает её на весь экран.
 */
export function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [width, setWidth] = useState(0)
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const title = alt || 'Схема'

  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? ''}
      loading="lazy"
      className="mx-auto block h-auto max-w-full"
      onLoad={(event) => setWidth(event.currentTarget.naturalWidth)}
    />
  )

  // Адрес отброшен фильтром — открывать нечего.
  if (!src) return <span className="not-prose my-6 block overflow-x-auto rounded-xl border border-border bg-white p-3">{image}</span>

  return (
    <span className="not-prose relative my-6 block rounded-xl border border-border bg-white">
      {/* Снизу полоса под значок «Увеличить»: он не закрывает подписи схемы. */}
      <span className="block overflow-x-auto px-3 pb-10 pt-3">
        <button
          ref={trigger}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${title} — открыть во весь экран`}
          aria-haspopup="dialog"
          className="mx-auto block w-fit max-w-full cursor-zoom-in rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          style={width ? { minWidth: `min(${width}px, 560px)` } : undefined}
        >
          {image}
          {/* Значок не прокручивается вместе со схемой: его позиция считается от рамки. */}
          <span aria-hidden="true" className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-1 text-xs font-medium text-white">
            <Maximize2 className="h-3.5 w-3.5" />
            Увеличить
          </span>
        </button>
      </span>
      {open && <DiagramDialog src={src} alt={title} onClose={() => setOpen(false)} returnFocus={trigger} />}
    </span>
  )
}
