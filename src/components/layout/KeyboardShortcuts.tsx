'use client'

import { useEffect, useRef, useState } from 'react'
import { Keyboard, X } from 'lucide-react'

/** Открыть подсказку кнопкой — например, из бокового меню. */
export const SHORTCUTS_OPEN_EVENT = 'lms:shortcuts-open'

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: 'Везде',
    keys: [
      ['/', 'Поиск по курсам, урокам и задачам'],
      ['Ctrl/⌘ + K', 'Тоже поиск — из любого места, кроме редактора кода'],
      ['?', 'Эта подсказка'],
    ],
  },
  {
    title: 'Поиск',
    keys: [
      ['↑ ↓', 'Выбрать результат'],
      ['Enter', 'Открыть'],
      ['Esc', 'Закрыть список'],
    ],
  },
  {
    title: 'Урок',
    keys: [
      ['← →', 'Предыдущий и следующий урок'],
      ['Ctrl/⌘ + Enter', 'Сохранить заметку'],
    ],
  },
  {
    title: 'Тренажёр',
    keys: [
      ['Ctrl/⌘ + Enter', 'Запустить код'],
      ['Ctrl/⌘ + Shift + Enter', 'Отправить на проверку'],
    ],
  },
]

/** «?» не должен срабатывать, пока ученик пишет текст или код. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || Boolean(target.closest('input, textarea, select, .monaco-editor'))
}

/** Список горячих клавиш платформы по «?» — их стало много, и помнить их не нужно. */
export function KeyboardShortcuts({ trainerEnabled = true }: { trainerEnabled?: boolean } = {}) {
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      e.preventDefault()
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setOpen(true)
    }
    function onOpen() {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(SHORTCUTS_OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(SHORTCUTS_OPEN_EVENT, onOpen)
    }
  }, [])

  useEffect(() => {
    if (open) closeRef.current?.focus()
    else returnFocusRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="shortcuts-title" className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Keyboard className="h-5 w-5" aria-hidden="true" />
            Горячие клавиши
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Закрыть"
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          {GROUPS.filter((group) => trainerEnabled || group.title !== 'Тренажёр').map((group) => (
            <section key={group.title}>
              <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.title}</h3>
              <dl className="space-y-1.5">
                {group.keys.map(([keys, action]) => (
                  <div key={keys} className="flex items-center justify-between gap-4 text-sm">
                    <dt className="text-foreground">{!trainerEnabled && keys === '/' ? 'Поиск по курсам и урокам' : action}</dt>
                    <dd>
                      <kbd className="whitespace-nowrap rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                        {keys}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
