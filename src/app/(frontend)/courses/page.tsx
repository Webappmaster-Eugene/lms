import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { BookOpen } from 'lucide-react'
import { CourseCatalog } from '@/components/course/CourseCatalog'
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
        <CourseCatalog courses={coursesWithProgress} />
      )}
    </div>
  )
}
