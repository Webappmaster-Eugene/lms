'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/** Дольше этого индикатор не висит: переход мог отмениться, а событие об этом не приходит. */
const MAX_VISIBLE_MS = 15_000

function internalTarget(event: MouseEvent): URL | null {
  // defaultPrevented не проверяется: Next <Link> всегда отменяет обычный переход
  // и навигирует сам — это и есть переход, который нужно показать.
  if (event.button !== 0) return null
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  const anchor = (event.target as Element | null)?.closest?.('a[href]')
  if (!(anchor instanceof HTMLAnchorElement)) return null
  if (anchor.target && anchor.target !== '_self') return null
  if (anchor.hasAttribute('download')) return null
  const url = new URL(anchor.href, window.location.href)
  if (url.origin !== window.location.origin) return null
  // Якорь на той же странице — перехода нет
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null
  return url
}

/**
 * Полоса загрузки при переходе между страницами. Скелетон loading.tsx есть
 * только у списков: у страниц курса, урока и задачи он заставлял Next отдавать
 * 404 со статусом 200, поэтому там обратную связь даёт эта полоса.
 */
export function NavigationProgress() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const [pendingFrom, setPendingFrom] = useState<string | null>(null)
  const current = `${pathname}?${search}`

  // Адрес сменился — переход завершён. Сравнение в рендере, а не в эффекте:
  // так полоса гаснет в том же кадре, что и появляется новая страница.
  if (pendingFrom !== null && pendingFrom !== current) setPendingFrom(null)

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (internalTarget(event)) setPendingFrom(`${window.location.pathname}?${window.location.search.replace(/^\?/, '')}`)
    }
    // Фаза перехвата: до обработчиков React, которые Link вешает на корень приложения.
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  useEffect(() => {
    if (pendingFrom === null) return
    const timer = setTimeout(() => setPendingFrom(null), MAX_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [pendingFrom])

  if (pendingFrom === null) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 print:hidden" aria-hidden="true">
      <div className="h-full bg-primary animate-[nav-progress_8s_cubic-bezier(0.1,0.7,0.3,1)_forwards]" />
    </div>
  )
}
