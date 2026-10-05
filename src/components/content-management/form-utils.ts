'use client'

import { useEffect, useRef, useState } from 'react'

export const inputClass = 'min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'
export const buttonClass = 'inline-flex min-h-[44px] items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'
export const panelClass = 'space-y-5 rounded-lg border border-border bg-card p-4 sm:p-6'
const approvedNavigation = new WeakSet<Event>()

export function relationId(value: number | { id: number } | null | undefined): number | null {
  return typeof value === 'number' ? value : value?.id ?? null
}

export function optionalNumber(value: string): number | null {
  return value.trim() ? Number(value) : null
}

export function useContentDraft<T>(initial: T) {
  const [draft, setDraft] = useState(initial)
  const [baseline, setBaseline] = useState(JSON.stringify(initial))
  const dirty = JSON.stringify(draft) !== baseline
  const dirtyRef = useRef(dirty)
  useEffect(() => { dirtyRef.current = dirty }, [dirty])

  useEffect(() => {
    function unload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    function followLink(event: MouseEvent) {
      if (!dirtyRef.current || event.defaultPrevented || approvedNavigation.has(event) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.href === window.location.href) return
      if (!window.confirm('Есть несохранённые изменения. Выйти без сохранения?')) {
        event.preventDefault()
        event.stopPropagation()
      } else {
        approvedNavigation.add(event)
      }
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', followLink, true)
    return () => {
      window.removeEventListener('beforeunload', unload)
      document.removeEventListener('click', followLink, true)
    }
  }, [])

  function markSaved(value: T) {
    dirtyRef.current = false
    setDraft(value)
    setBaseline(JSON.stringify(value))
  }

  function canLeave() {
    return !dirtyRef.current || window.confirm('Есть несохранённые изменения. Выйти без сохранения?')
  }

  return { draft, setDraft, dirty, markSaved, canLeave }
}

export async function saveContent<T extends { id: number; updatedAt: string; slug: string }>(
  collection: 'courses' | 'sections' | 'lessons',
  id: number | undefined,
  body: Record<string, unknown>,
  createKey?: string,
): Promise<T> {
  const response = await fetch(`/api/manage/content/${collection}${id ? `/${id}` : ''}`, {
    method: id ? 'PATCH' : 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(id === undefined && createKey ? { 'Idempotency-Key': createKey } : {}) },
    body: JSON.stringify(body),
  })
  let result: unknown
  try {
    result = await response.json()
  } catch {
    throw new Error('Сервер не подтвердил сохранение. Проверьте соединение и попробуйте ещё раз.')
  }
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : null
    if (response.status === 409) {
      throw new Error(`${message ?? 'Материал изменён в другой вкладке.'} Ваши изменения остаются в форме. Скопируйте их перед обновлением страницы.`)
    }
    throw new Error(message ?? 'Не удалось сохранить. Проверьте данные и попробуйте ещё раз.')
  }
  const doc = result && typeof result === 'object' && 'doc' in result ? result.doc : null
  if (!doc || typeof doc !== 'object' || !('id' in doc) || typeof doc.id !== 'number' || !Number.isSafeInteger(doc.id) || doc.id <= 0 || !('updatedAt' in doc) || typeof doc.updatedAt !== 'string' || !doc.updatedAt || !('slug' in doc) || typeof doc.slug !== 'string' || !doc.slug || (id !== undefined && id !== doc.id)) {
    throw new Error('Сервер не подтвердил сохранение материала. Обновите страницу после проверки изменений.')
  }
  return doc as T
}

export function saveError(error: unknown): string {
  return error instanceof TypeError
    ? 'Нет соединения с сервером. Ваши изменения остаются в форме. Проверьте сеть и повторите сохранение.'
    : error instanceof Error ? error.message : 'Не удалось сохранить. Попробуйте ещё раз.'
}
