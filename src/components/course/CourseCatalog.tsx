'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Clock, Lock, Search } from 'lucide-react'

import { cn, pluralize } from '@/lib/utils'
import { boundedQueryText, CATALOG_PAGE_SIZE, positiveQueryInteger, queryHref } from '@/lib/shared-url'
import { ShareButton } from '@/components/ui/ShareButton'

export type CatalogCourse = {
  id: string
  title: string
  slug: string
  estimatedHours: number | null | undefined
  roadmapTitle: string | null
  totalLessons: number
  completedCount: number
  progressPercent: number
  /** Программа видна всем; обучение открывается только по назначению. */
  accessAllowed?: boolean
  accessibleLessons?: number
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
  { roadmap, status, query, assignedOnly = false }: { roadmap: string | null; status: Status; query: string; assignedOnly?: boolean },
): CatalogCourse[] {
  const needle = query.trim().toLowerCase()
  return courses.filter(
    (c) =>
      (roadmap === null || c.roadmapTitle === roadmap) &&
      (!assignedOnly || c.accessAllowed !== false) &&
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
  const search = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const queryFromURL = boundedQueryText(search.get('q'))
  const [query, setQuery] = useState(queryFromURL)
  const [syncedQuery, setSyncedQuery] = useState(queryFromURL)
  if (queryFromURL !== syncedQuery) { setSyncedQuery(queryFromURL); setQuery(queryFromURL) }
  const roadmap = boundedQueryText(search.get('roadmap')) || null
  const rawStatus = search.get('status')
  const status: Status = rawStatus === 'active' || rawStatus === 'new' || rawStatus === 'done' ? rawStatus : 'all'
  const assignedOnly = search.get('assigned') === '1'
  const sort = search.get('sort') === 'title' ? 'title' : search.get('sort') === 'progress' ? 'progress' : 'program'
  const currentQuery = search.toString()
  const apply = (changes: Record<string, string | null>) => router.push(queryHref(pathname, currentQuery, { q: query.trim(), page: null, ...changes }), { scroll: false })
  useEffect(() => {
    if (query === queryFromURL) return
    const timer = setTimeout(() => router.replace(queryHref(pathname, currentQuery, { q: query.trim(), page: null }), { scroll: false }), 250)
    return () => clearTimeout(timer)
  }, [query, queryFromURL, currentQuery, pathname, router])

  const roadmaps = useMemo(
    () => [...new Set(courses.flatMap((c) => (c.roadmapTitle ? [c.roadmapTitle] : [])))],
    [courses],
  )
  const counts = useMemo(() => {
    const result: Record<Status, number> = { all: courses.length, active: 0, new: 0, done: 0 }
    for (const c of courses) result[courseStatus(c)] += 1
    return result
  }, [courses])
  const shown = filterCourses(courses, { roadmap, status, query: queryFromURL, assignedOnly })
  const sorted = sort === 'program' ? shown : [...shown].sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'ru') : b.progressPercent - a.progressPercent || a.title.localeCompare(b.title, 'ru'))
  const pageCount = Math.max(1, Math.ceil(sorted.length / CATALOG_PAGE_SIZE))
  const page = Math.min(pageCount, positiveQueryInteger(search.get('page')))
  const pageCourses = sorted.slice((page - 1) * CATALOG_PAGE_SIZE, page * CATALOG_PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 160))}
            maxLength={160}
            placeholder="Найти курс"
            aria-label="Найти курс по названию"
            className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Статус курса">
          {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
            <Chip key={s} active={status === s} onClick={() => apply({ status: s === 'all' ? null : s })}>
              {STATUS_LABELS[s]} <span className="tabular-nums">{counts[s]}</span>
            </Chip>
          ))}
        </div>
        {courses.some((course) => course.accessAllowed === false) && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Назначение доступа">
            <Chip active={!assignedOnly} onClick={() => apply({ assigned: null })}>Весь каталог</Chip>
            <Chip active={assignedOnly} onClick={() => apply({ assigned: '1' })}>Назначенные мне</Chip>
          </div>
        )}
        {roadmaps.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Роадмап">
            <Chip active={roadmap === null} onClick={() => apply({ roadmap: null })}>
              Все роадмапы
            </Chip>
            {roadmaps.map((r) => (
              <Chip key={r} active={roadmap === r} onClick={() => apply({ roadmap: r })}>
                {r}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">Порядок
          <select aria-label="Порядок курсов" value={sort} onChange={(event) => apply({ sort: event.target.value === 'program' ? null : event.target.value })} className="min-h-[44px] rounded-lg border border-border bg-card px-3 text-sm text-foreground">
            <option value="program">По программе</option><option value="title">По названию</option><option value="progress">По прогрессу</option>
          </select>
        </label>
        <ShareButton getHref={() => queryHref(pathname, currentQuery, { q: query.trim() })} />
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {pluralize(shown.length, 'курс', 'курса', 'курсов')}
      </p>

      {shown.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">Под эти условия курсов нет — попробуйте сбросить фильтры</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pageCourses.map((course) => (
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
                {course.accessAllowed === false ? (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Доступ не назначен · Посмотреть программу
                  </p>
                ) : course.accessibleLessons !== undefined && course.accessibleLessons < course.totalLessons ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Доступно {course.accessibleLessons} из {course.totalLessons} уроков
                  </p>
                ) : null}
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
      {pageCount > 1 && <nav aria-label="Страницы каталога курсов" className="flex items-center justify-center gap-3">
        <button type="button" disabled={page === 1} onClick={() => apply({ page: page > 2 ? String(page - 1) : null })} className="min-h-[44px] rounded-lg border border-border px-3 text-sm disabled:opacity-50">Назад</button>
        <span className="text-sm text-muted-foreground">{page} из {pageCount}</span>
        <button type="button" disabled={page === pageCount} onClick={() => apply({ page: String(page + 1) })} className="min-h-[44px] rounded-lg border border-border px-3 text-sm disabled:opacity-50">Дальше</button>
      </nav>}
    </div>
  )
}
