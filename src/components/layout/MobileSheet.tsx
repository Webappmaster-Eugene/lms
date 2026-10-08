'use client'

import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  id?: string
  returnFocusRef?: RefObject<HTMLElement | null>
  initialFocusSelector?: string
}

/** Native modal makes the background inert; explicit Tab wrapping also keeps
 * external mobile keyboards from briefly moving focus to browser chrome. */
export function MobileSheet({ open, onClose, title, children, id, returnFocusRef, initialFocusSelector }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose)
  const titleId = useId()
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return
    const desktop = window.matchMedia('(min-width: 1024px)')
    if (desktop.matches) {
      closeRef.current()
      return
    }
    const previousOverflow = document.body.style.overflow
    const previousFocus = returnFocusRef?.current ?? document.activeElement
    dialog.showModal()
    if (initialFocusSelector) dialog.querySelector<HTMLElement>(initialFocusSelector)?.focus({ preventScroll: true })
    document.body.style.overflow = 'hidden'
    const onResize = (event: MediaQueryListEvent) => {
      if (event.matches) closeRef.current()
    }
    desktop.addEventListener('change', onResize)
    return () => {
      desktop.removeEventListener('change', onResize)
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [open, returnFocusRef, initialFocusSelector])

  if (!open) return null

  return createPortal(
    <dialog
      ref={dialogRef}
      id={id}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none overflow-hidden rounded-t-3xl border border-b-0 border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/60 lg:hidden"
      style={{ maxHeight: 'calc(100dvh - max(1rem, env(safe-area-inset-top, 0px)))' }}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
        const dialog = event.currentTarget
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]'))
          .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[inert], [aria-hidden="true"]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible')
          .sort((left, right) => {
            if (left.tabIndex === right.tabIndex) return 0
            if (left.tabIndex === 0) return 1
            if (right.tabIndex === 0) return -1
            return left.tabIndex - right.tabIndex
          })
        const first = focusable[0]
        const last = focusable.at(-1)
        if (!first || !last) return
        const active = document.activeElement
        const atBoundary = event.shiftKey ? active === first : active === last
        const focusInside = active instanceof HTMLElement && focusable.includes(active)
        if (atBoundary || !focusInside) {
          event.preventDefault()
          const target = event.shiftKey ? last : first
          target.focus({ preventScroll: true })
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
      }}
    >
      <div className="flex max-h-[85dvh] min-h-0 flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}>
        <div aria-hidden="true" className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 pb-3 pt-2">
          <h2 id={titleId} className="min-w-0 flex-1 break-words text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Закрыть ${title === 'Меню платформы' ? 'меню' : title === 'Поиск' ? 'поиск' : 'содержание'}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </dialog>,
    document.body,
  )
}
