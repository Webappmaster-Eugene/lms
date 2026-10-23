'use client'

import { useId, useState } from 'react'
import { ChevronDown, TableOfContents } from 'lucide-react'

import type { LessonHeading } from '@/lib/lesson-markdown'
import { pluralize } from '@/lib/utils'

/** С этого числа пунктов оглавление делится на две колонки: длинный список не растягивает начало урока. */
const TWO_COLUMNS_FROM = 9

const LINK = 'rounded-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/**
 * Оглавление длинного урока. На телефоне свёрнуто в одну строку — иначе отнимает
 * первый экран; с ширины sm открыто всегда.
 */
export function LessonContents({ items, count }: { items: LessonHeading[]; count: number }) {
  const [open, setOpen] = useState(false)
  const listId = useId()

  return (
    <nav aria-label="Содержание урока" className="rounded-xl border border-border bg-card text-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-4 text-left font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:hidden"
      >
        <TableOfContents className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1">Содержание</span>
        <span className="text-xs font-normal text-muted-foreground">{pluralize(count, 'раздел', 'раздела', 'разделов')}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <p className="hidden items-center gap-2 px-5 pt-4 font-semibold text-foreground sm:flex">
        <TableOfContents className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Содержание
      </p>
      <ol id={listId} className={`${open ? 'block' : 'hidden'} px-4 pb-4 pt-1 sm:block sm:px-5 sm:pt-3 ${count >= TWO_COLUMNS_FROM ? 'sm:columns-2 sm:gap-x-8' : ''}`}>
        {items.map((item) => (
          <li key={item.id} className="break-inside-avoid pb-2">
            <a href={`#${item.id}`} className={`${LINK} font-medium text-foreground`}>{item.title}</a>
            {item.children.length > 0 && (
              <ol className="mt-1.5 space-y-1.5 border-l border-border pl-3">
                {item.children.map((child) => (
                  <li key={child.id}>
                    <a href={`#${child.id}`} className={`${LINK} text-muted-foreground hover:text-foreground`}>{child.title}</a>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
