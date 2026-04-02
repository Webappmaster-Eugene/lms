'use client'

import { useState } from 'react'
import { ChevronDown, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'

type HintsAccordionProps = {
  hints: Array<{ hint: string; id?: string }>
}

export function HintsAccordion({ hints }: HintsAccordionProps) {
  const [revealedCount, setRevealedCount] = useState(0)

  if (hints.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Lightbulb className="h-4 w-4" />
        Подсказки ({revealedCount}/{hints.length})
      </div>

      {hints.map((item, index) => {
        const isRevealed = index < revealedCount
        const isNext = index === revealedCount

        return (
          <div
            key={item.id ?? index}
            className="rounded-lg border border-border bg-card overflow-hidden"
          >
            {isRevealed ? (
              <div className="p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Подсказка {index + 1}
                </p>
                <p className="text-sm text-foreground">{item.hint}</p>
              </div>
            ) : isNext ? (
              <button
                onClick={() => setRevealedCount((c) => c + 1)}
                className="flex w-full items-center justify-between p-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>Показать подсказку {index + 1}</span>
                <ChevronDown className="h-4 w-4" />
              </button>
            ) : (
              <div className={cn('p-3 text-sm text-muted-foreground/50')}>
                Подсказка {index + 1} (сначала откройте предыдущую)
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
