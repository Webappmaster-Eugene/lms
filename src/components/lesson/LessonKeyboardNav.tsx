'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Props = { prevHref: string | null; nextHref: string | null }

/** Стрелки не должны угонять ввод: в заметках, комментариях и редакторе кода они двигают курсор. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], .monaco-editor'))
}

/** ← и → — соседние уроки, как листание в читалке. */
export function LessonKeyboardNav({ prevHref, nextHref }: Props) {
  const router = useRouter()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (isTyping(event.target)) return
      const href = event.key === 'ArrowLeft' ? prevHref : event.key === 'ArrowRight' ? nextHref : null
      if (!href) return
      event.preventDefault()
      router.push(href)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prevHref, nextHref, router])

  return null
}
