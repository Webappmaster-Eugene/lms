'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

type Heading = { id: string; title: string }

/** Раздел считается текущим, когда его заголовок поднялся выше этой линии от верха окна. */
const ACTIVE_LINE = 120
/** Отступ оглавления от верха окна при прокрутке. */
const STICKY_TOP = 32

/**
 * Оглавление сбоку на широком экране: всегда под рукой и подсвечивает раздел, который сейчас читают.
 * Прилипание считается здесь, а не через position: sticky — у <main> overflow-x-hidden,
 * и sticky внутри него не работает. Оглавление не выходит за свою колонку, поэтому не наезжает на подвал.
 */
export function GuideSideToc({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState<string | null>(null)
  const nav = useRef<HTMLElement>(null)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const element = nav.current
      const column = element?.parentElement
      if (element && column) {
        const box = column.getBoundingClientRect()
        const offset = Math.max(0, Math.min(STICKY_TOP - box.top, box.height - element.offsetHeight))
        element.style.transform = `translateY(${offset}px)`
      }
      // Докрученная до конца страница: последние разделы до линии не поднимутся — текущий тот, что виден ниже всех.
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      let current: string | null = null
      for (const heading of headings) {
        const top = document.getElementById(heading.id)?.getBoundingClientRect().top
        if (top !== undefined && top <= (atBottom ? window.innerHeight : ACTIVE_LINE)) current = heading.id
      }
      setActive(current)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [headings])

  return (
    <nav ref={nav} aria-label="Содержание гайда" className="max-h-[calc(100vh-4rem)] overflow-y-auto will-change-transform">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Содержание</p>
      <ol className="mt-3 space-y-1 border-l border-border text-sm">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              aria-current={active === heading.id ? 'location' : undefined}
              className={cn(
                '-ml-px block border-l-2 py-1 pl-3 leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                active === heading.id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {heading.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
