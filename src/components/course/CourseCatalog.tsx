'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Clock, Search } from 'lucide-react'

import { cn, pluralize } from '@/lib/utils'

export type CatalogCourse = {
  id: string
  title: string
  slug: string
  estimatedHours: number | null | undefined
  roadmapTitle: string | null
  totalLessons: number
  completedCount: number
  progressPercent: number
}

type Status = 'all' | 'active' | 'new' | 'done'

const STATUS_LABELS: Record<Status, string> = {
  all: 'Все',
  active: 'В процессе',
  new: 'Не начатые',
  done: 'Пройденные',
}

export function courseStatus(course: CatalogCourse): Exclude<Status, 'all'> {
  if (course.totalLessons > 0 && course.completedCount === course.totalLessons) return 'done'
  return course.completedCount > 0 ? 'active' : 'new'
}

/** Фильтр по роадмапу, статусу и названию: полсотни курсов одной сеткой не просмотреть. */
export function filterCourses(
  courses: CatalogCourse[],
  { roadmap, status, query }: { roadmap: string | null; status: Status; query: string },
): CatalogCourse[] {
  const needle = query.trim().toLowerCase()
  return courses.filter(
    (c) =>
      (roadmap === null || c.roadmapTitle === roadmap) &&
      (status === 'all' || courseStatus(c) === status) &&
      (needle === '' || c.title.toLowerCase().includes(needle)),
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-sm transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function CourseCatalog({ courses }: { courses: CatalogCourse[] }) {
  const [roadmap, setRoadmap] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('all')
  const [query, setQuery] = useState('')

  const roadmaps = useMemo(
    () => [...new Set(courses.flatMap((c) => (c.roadmapTitle ? [c.roadmapTitle] : [])))],
    [courses],
  )
  const counts = useMemo(() => {
    const result: Record<Status, number> = { all: courses.length, active: 0, new: 0, done: 0 }
    for (const c of courses) result[courseStatus(c)] += 1
    return result
  }, [courses])
  const shown = filterCourses(courses, { roadmap, status, query })

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти курс"
            aria-label="Найти курс по названию"
            className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Статус курса">
          {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
              {STATUS_LABELS[s]} <span className="opacity-70">{counts[s]}</span>
            </Chip>
          ))}
        </div>
        {roadmaps.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Роадмап">
            <Chip active={roadmap === null} onClick={() => setRoadmap(null)}>
              Все роадмапы
            </Chip>
            {roadmaps.map((r) => (
              <Chip key={r} active={roadmap === r} onClick={() => setRoadmap(r)}>
                {r}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {pluralize(shown.length, 'курс', 'курса', 'курсов')}
      </p>

      {shown.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">Под эти условия курсов нет — попробуйте сбросить фильтры</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((course) => (
            <Link
              key={course.id}
              href={`/courses/${course.slug}`}
              className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/50 sm:p-5"
            >
              <div className="flex-1">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                  {course.title}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {course.roadmapTitle && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{course.roadmapTitle}</span>
                  )}
                  <span>{pluralize(course.totalLessons, 'урок', 'урока', 'уроков')}</span>
                  {course.estimatedHours ? (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {course.estimatedHours}ч
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {course.completedCount}/{course.totalLessons}
                  </span>
                  <span>{course.progressPercent}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${course.progressPercent}%` }}
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
