'use client'

import { RotateCcw } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatTime, PLAYBACK_RATES } from '@/lib/video-memory'

type Props = {
  resumedFrom: number | null
  restart: () => void
  rate: number
  setRate: (rate: number) => void
}

/** Под плеером: откуда продолжили и скорость — у встроенного плеера Safari и Firefox её нет. */
export function VideoMemoryBar({ resumedFrom, restart, rate, setRate }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-2" aria-live="polite">
        {resumedFrom !== null && (
          <>
            <span>Продолжили с {formatTime(resumedFrom)}</span>
            <button
              type="button"
              onClick={restart}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-foreground transition-colors hover:bg-accent"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />С начала
            </button>
          </>
        )}
      </div>
      <div className="flex items-center gap-1" role="group" aria-label="Скорость воспроизведения">
        <span className="mr-1">Скорость</span>
        {PLAYBACK_RATES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={rate === value}
            onClick={() => setRate(value)}
            className={cn(
              'rounded px-1.5 py-0.5 tabular-nums transition-colors',
              rate === value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-foreground',
            )}
          >
            {String(value).replace('.', ',')}×
          </button>
        ))}
      </div>
    </div>
  )
}
