'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import Link from 'next/link'

import { NodeCourseList } from './NodeCourseList'
import { STAGE_TITLES } from './stage-colors'
import type { RoadmapNodeData } from './types'

const STATUS_TEXT: Record<RoadmapNodeData['status'], string> = {
  locked: 'Закрыта',
  available: 'Можно начинать',
  'in-progress': 'В процессе',
  completed: 'Пройдена',
}

/**
 * Панель темы поверх карты. Раньше клик по теме сразу уводил в первый курс,
 * и остальные курсы темы, прогресс и причина блокировки были не видны.
 */
export function RoadmapNodePanel({ data, onClose, managementRoadmapId, nodeId }: { data: RoadmapNodeData; onClose: () => void; managementRoadmapId?: number; nodeId?: number }) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Фокус в панель: с клавиатуры и скринридером иначе не понять, что она открылась.
  useEffect(() => {
    headingRef.current?.focus()
  }, [data.label])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <aside
      aria-label={`Тема «${data.label}»`}
      className="absolute inset-x-0 bottom-0 z-10 max-h-[70%] overflow-y-auto rounded-t-xl border-t border-border bg-card p-4 shadow-2xl sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-[360px] sm:rounded-none sm:border-l sm:border-t-0"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">
            {data.stage ? `${STAGE_TITLES[data.stage]} · ` : ''}
            {data.comingSoon ? 'Материалы готовятся' : STATUS_TEXT[data.status]}
          </p>
          <h3 ref={headingRef} tabIndex={-1} className="mt-1 text-lg font-semibold text-foreground outline-none">
            {data.label}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Закрыть панель темы"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {data.description && <p className="mt-3 text-sm text-muted-foreground">{data.description}</p>}

      {managementRoadmapId && nodeId && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/manage/courses/new?roadmap=${managementRoadmapId}&node=${nodeId}`} className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring">Добавить курс в тему</Link>
          <Link href={`/manage/roadmaps/${managementRoadmapId}?node=${nodeId}`} className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Управлять курсами темы</Link>
        </div>
      )}

      {data.totalLessons > 0 && (
        <p className="mt-3 text-sm text-foreground">
          Пройдено {data.completedLessons} из {data.totalLessons} уроков · {data.progressPercent}%
        </p>
      )}

      {data.courses.length > 0 ? (
        <section className="mt-4">
          <h4 className="mb-2 text-sm font-semibold text-foreground">
            {data.courses.length > 1 ? `Курсы темы (${data.courses.length})` : 'Курс темы'}
          </h4>
          <NodeCourseList courses={data.courses} />
        </section>
      ) : data.comingSoon ? (
        <p className="mt-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Курсов по этой теме пока нет — тема останется на карте, чтобы было видно, что изучать дальше.
        </p>
      ) : null}

      {data.bullets.length > 0 && (
        <section className="mt-4">
          <h4 className="mb-2 text-sm font-semibold text-foreground">Что входит в тему</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {data.bullets.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}
