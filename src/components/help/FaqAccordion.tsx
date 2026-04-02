'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type FaqItem = {
  id: string | number
  question: string
  /** Plain text answer (admin-only content, safe to render) */
  answerText: string
}

type FaqAccordionProps = {
  items: FaqItem[]
}

export function FaqAccordion({ items }: FaqAccordionProps) {
  const [openId, setOpenId] = useState<string | number | null>(null)

  if (items.length === 0) {
    return <p className="text-center text-muted-foreground py-8">Пока нет часто задаваемых вопросов</p>
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isOpen = openId === item.id

        return (
          <div key={item.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              onClick={() => setOpenId(isOpen ? null : item.id)}
              className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-accent/50"
            >
              <span className="font-medium text-foreground pr-4">{item.question}</span>
              <ChevronDown
                className={cn(
                  'h-5 w-5 flex-shrink-0 text-muted-foreground transition-transform',
                  isOpen && 'rotate-180',
                )}
              />
            </button>

            {isOpen && (
              <div className="border-t border-border px-4 py-3">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {item.answerText}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
