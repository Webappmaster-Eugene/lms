import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createLocalReq } from 'payload'
import { BookOpen } from 'lucide-react'
import { CourseCatalog } from '@/components/course/CourseCatalog'
import { collectAllPages } from '@/lib/paginate'
import { getLearningAccess } from '@/server/learning-access'

export const metadata: Metadata = {
  title: 'Курсы',
}

export default async function CoursesListPage() {
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })
  if (!user) redirect('/login')
  const req = await createLocalReq({ user }, payload)
  const access = await getLearningAccess(payload, user, req)

  const courseDocs = await collectAllPages(
    ({ page, limit }) =>
      payload.find({
        collection: 'courses',
        where: { isPublished: { equals: true } },
        sort: ['order', 'id'],
        select: { title: true, slug: true, estimatedHours: true, roadmap: true },
        depth: 0,
        overrideAccess: false,
        req,
        page,
        limit,
      }),
    { label: 'каталог курсов' },
  )

  const visibleCourses = courseDocs.filter((course) => access.canBrowseCourse(course.id))
  const courseIds = visibleCourses.map((c) => String(c.id))

  const [lessonDocs, progressDocs, roadmapDocs] = await Promise.all([
    courseIds.length > 0
      ? collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'lessons',
              where: {
                and: [{ course: { in: courseIds }, isPublished: { equals: true } }, access.browseLessonWhere],
              },
              select: { course: true, section: true, isPublished: true },
              overrideAccess: true,
              req,
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
              overrideAccess: false,
              req,
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: `прогресс пользователя ${user.id}` },
        )
      : [],
    collectAllPages(({ page, limit }) => payload.find({ collection: 'roadmaps', where: { isPublished: { equals: true } }, select: { title: true }, depth: 0, page, limit, overrideAccess: false, req }), { label: 'названия роадмапов каталога' }),
  ])

  // Группируем уроки по курсу
  const lessonsByCourse = new Map<string, string[]>()
  const accessibleLessonsByCourse = new Map<string, number>()
  for (const lesson of lessonDocs) {
    if (!access.canBrowseLessonMetadata(lesson)) continue
    const cId = String(typeof lesson.course === 'object' ? lesson.course.id : lesson.course)
    const arr = lessonsByCourse.get(cId) ?? []
    arr.push(String(lesson.id))
    lessonsByCourse.set(cId, arr)
    if (access.canAccessLessonMetadata(lesson)) accessibleLessonsByCourse.set(cId, (accessibleLessonsByCourse.get(cId) ?? 0) + 1)
  }

  const completedLessonIds = new Set(
    progressDocs.map((p) => String(typeof p.lesson === 'object' ? p.lesson.id : p.lesson)),
  )

  const coursesWithProgress = visibleCourses.map((course) => {
    const cId = String(course.id)
    const courseLessonIds = lessonsByCourse.get(cId) ?? []
    const totalLessons = courseLessonIds.length
    const completedCount = courseLessonIds.filter((id) => completedLessonIds.has(id)).length
    const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0

    const roadmapId = typeof course.roadmap === 'object' ? course.roadmap?.id : course.roadmap
    const roadmap = roadmapDocs.find((item) => item.id === roadmapId)

    return {
      id: cId,
      title: course.title,
      slug: course.slug,
      estimatedHours: access.catalogVisibility === 'catalog' ? course.estimatedHours : null,
      roadmapTitle: roadmap?.title ?? null,
      totalLessons,
      completedCount,
      progressPercent,
      accessAllowed: access.canAccessCourse(course.id),
      accessibleLessons: accessibleLessonsByCourse.get(cId) ?? 0,
    }
  })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="h-7 w-7 text-primary" />
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Курсы</h1>
      </div>

      {coursesWithProgress.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Администратор ещё не назначил обучение</p>
      ) : (
        <CourseCatalog courses={coursesWithProgress} />
      )}
    </div>
  )
}
