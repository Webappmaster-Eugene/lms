import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import Link from 'next/link'
import { BookOpen, Clock } from 'lucide-react'
import { collectAllPages } from '@/lib/paginate'

export const metadata: Metadata = {
  title: 'Курсы',
}

export default async function CoursesListPage() {
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  const courseDocs = await collectAllPages(
    ({ page, limit }) =>
      payload.find({
        collection: 'courses',
        where: { isPublished: { equals: true } },
        sort: ['order', 'id'],
        depth: 1,
        page,
        limit,
      }),
    { label: 'каталог курсов' },
  )

  const courseIds = courseDocs.map((c) => String(c.id))

  const [lessonDocs, progressDocs] = await Promise.all([
    courseIds.length > 0
      ? collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'lessons',
              where: {
                course: { in: courseIds },
                isPublished: { equals: true },
              },
              select: { course: true },
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: 'уроки каталога курсов' },
        )
      : [],
    user
      ? collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'user-progress',
              where: {
                user: { equals: user.id },
                isCompleted: { equals: true },
              },
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

  // Группируем уроки по курсу
  const lessonsByCourse = new Map<string, string[]>()
  for (const lesson of lessonDocs) {
    const cId = String(typeof lesson.course === 'object' ? lesson.course.id : lesson.course)
    const arr = lessonsByCourse.get(cId) ?? []
    arr.push(String(lesson.id))
    lessonsByCourse.set(cId, arr)
  }

  const completedLessonIds = new Set(
    progressDocs.map((p) => String(typeof p.lesson === 'object' ? p.lesson.id : p.lesson)),
  )

  const coursesWithProgress = courseDocs.map((course) => {
    const cId = String(course.id)
    const courseLessonIds = lessonsByCourse.get(cId) ?? []
    const totalLessons = courseLessonIds.length
    const completedCount = courseLessonIds.filter((id) => completedLessonIds.has(id)).length
    const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0

    const roadmap = typeof course.roadmap === 'object' ? course.roadmap : null

    return {
      id: cId,
      title: course.title,
      slug: course.slug,
      estimatedHours: course.estimatedHours,
      roadmapTitle: roadmap?.title ?? null,
      totalLessons,
      completedCount,
      progressPercent,
    }
  })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="h-7 w-7 text-primary" />
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Курсы</h1>
      </div>

      {coursesWithProgress.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Курсы скоро появятся</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {coursesWithProgress.map((course) => (
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
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                      {course.roadmapTitle}
                    </span>
                  )}
                  <span>{course.totalLessons} уроков</span>
                  {course.estimatedHours != null && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {course.estimatedHours}ч
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{course.completedCount}/{course.totalLessons}</span>
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
