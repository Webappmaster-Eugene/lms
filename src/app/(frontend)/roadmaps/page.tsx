import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Map as MapIcon } from 'lucide-react'
import { collectAllPages } from '@/lib/paginate'
import { relationId } from '@/lib/relation-id'

export const metadata: Metadata = {
  title: 'Роадмапы',
}

export default async function RoadmapsPage() {
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: await headers() })

  const roadmapDocs = await collectAllPages(
    ({ page, limit }) =>
      payload.find({
        collection: 'roadmaps',
        where: { isPublished: { equals: true } },
        sort: ['order', 'id'],
        page,
        limit,
      }),
    { label: 'список роадмапов' },
  )

  // Прогресс на карточке: ученику сразу видно, какой роадмап у него в работе.
  const roadmapIds = roadmapDocs.map((r) => r.id)
  const courseDocs =
    roadmapIds.length > 0
      ? await collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'courses',
              where: { roadmap: { in: roadmapIds }, isPublished: { equals: true } },
              select: { roadmap: true },
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: 'курсы роадмапов' },
        )
      : []
  const roadmapOfCourse = new Map(courseDocs.map((c) => [c.id, relationId(c.roadmap)]))

  const [lessonDocs, progressDocs] = await Promise.all([
    courseDocs.length > 0
      ? collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'lessons',
              where: { course: { in: courseDocs.map((c) => c.id) }, isPublished: { equals: true } },
              select: { course: true },
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: 'уроки роадмапов' },
        )
      : [],
    user
      ? collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'user-progress',
              where: { user: { equals: user.id }, isCompleted: { equals: true } },
              select: { lesson: true },
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: `прогресс пользователя ${user.id}` },
        )
      : [],
  ])

  const completed = new Set(progressDocs.map((p) => relationId(p.lesson)))
  const stats = new Map<number, { courses: number; lessons: number; done: number }>()
  const statsFor = (id: number) => {
    const current = stats.get(id) ?? { courses: 0, lessons: 0, done: 0 }
    stats.set(id, current)
    return current
  }
  for (const course of courseDocs) statsFor(relationId(course.roadmap)).courses += 1
  for (const lesson of lessonDocs) {
    const roadmapId = roadmapOfCourse.get(relationId(lesson.course))
    if (roadmapId === undefined) continue
    const entry = statsFor(roadmapId)
    entry.lessons += 1
    if (completed.has(lesson.id)) entry.done += 1
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">Роадмапы</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {roadmapDocs.map((roadmap) => {
          const { courses = 0, lessons = 0, done = 0 } = stats.get(roadmap.id) ?? {}
          const percent = lessons > 0 ? Math.round((done / lessons) * 100) : 0
          const status = done === 0 ? 'Не начат' : done === lessons ? 'Пройден' : 'В процессе'
          return (
            <Link
              key={roadmap.id}
              href={`/roadmaps/${roadmap.slug}`}
              className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <MapIcon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                    {roadmap.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {courses} курсов · {lessons} уроков · {status}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div
                  className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Прогресс роадмапа «${roadmap.title}»`}
                >
                  <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                </div>
                <span className="text-sm font-medium text-foreground">{percent}%</span>
              </div>
            </Link>
          )
        })}

        {roadmapDocs.length === 0 && (
          <p className="col-span-full text-center text-muted-foreground py-12">
            Роадмапы пока не опубликованы
          </p>
        )}
      </div>
    </div>
  )
}
