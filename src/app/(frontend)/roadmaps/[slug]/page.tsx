import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, BookOpen, CheckCircle2, Clock, Lock } from 'lucide-react'
import { MiroEmbed } from '@/components/lesson/MiroEmbed'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const payload = await getPayload()
  const result = await payload.find({
    collection: 'roadmaps',
    where: { slug: { equals: slug }, isPublished: { equals: true } },
    limit: 1,
  })
  const roadmap = result.docs[0]
  return { title: roadmap?.title ?? 'Роадмап' }
}

export default async function RoadmapDetailPage({ params }: Props) {
  const { slug } = await params
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  const roadmapResult = await payload.find({
    collection: 'roadmaps',
    where: {
      slug: { equals: slug },
      isPublished: { equals: true },
    },
    limit: 1,
  })

  const roadmap = roadmapResult.docs[0]
  if (!roadmap) return notFound()

  // Загружаем курсы роадмапа
  const courses = await payload.find({
    collection: 'courses',
    where: {
      roadmap: { equals: roadmap.id },
      isPublished: { equals: true },
    },
    sort: 'order',
    limit: 100,
    depth: 1,
  })

  const courseIds = courses.docs.map((c) => String(c.id))

  // BATCH: загружаем ВСЕ уроки всех курсов роадмапа ОДНИМ запросом
  const allLessons = courseIds.length > 0
    ? await payload.find({
        collection: 'lessons',
        where: {
          course: { in: courseIds },
          isPublished: { equals: true },
        },
        limit: 2000,
      })
    : { docs: [], totalDocs: 0 }

  // Группируем уроки по курсу
  const lessonsByCourse = new Map<string, string[]>()
  for (const lesson of allLessons.docs) {
    const cId = String(typeof lesson.course === 'object' ? lesson.course.id : lesson.course)
    if (!lessonsByCourse.has(cId)) lessonsByCourse.set(cId, [])
    lessonsByCourse.get(cId)!.push(String(lesson.id))
  }

  // Прогресс пользователя (один запрос)
  let completedLessonIds = new Set<string>()

  if (user) {
    const progress = await payload.find({
      collection: 'user-progress',
      where: {
        user: { equals: user.id },
        isCompleted: { equals: true },
      },
      limit: 5000,
    })
    completedLessonIds = new Set(
      progress.docs.map((p) =>
        String(typeof p.lesson === 'object' ? p.lesson.id : p.lesson),
      ),
    )
  }

  // Вычисляем прогресс для каждого курса (без доп. запросов!)
  const coursesWithProgress = courses.docs.map((course) => {
    const cId = String(course.id)
    const courseLessonIds = lessonsByCourse.get(cId) ?? []
    const totalLessons = courseLessonIds.length
    const completedCount = courseLessonIds.filter((id) => completedLessonIds.has(id)).length
    const isCompleted = totalLessons > 0 && completedCount === totalLessons

    // Пререквизиты: проверяем по тем же данным (без доп. запросов)
    let prerequisitesMet = true
    if (course.prerequisites && Array.isArray(course.prerequisites)) {
      for (const prereq of course.prerequisites) {
        const prereqId = String(typeof prereq === 'object' ? prereq.id : prereq)
        const prereqLessonIds = lessonsByCourse.get(prereqId) ?? []
        if (prereqLessonIds.length > 0) {
          const prereqCompleted = prereqLessonIds.every((id) => completedLessonIds.has(id))
          if (!prereqCompleted) {
            prerequisitesMet = false
            break
          }
        }
      }
    }

    return {
      id: cId,
      title: course.title,
      slug: course.slug,
      estimatedHours: course.estimatedHours,
      totalLessons,
      completedCount,
      isCompleted,
      prerequisitesMet,
      progressPercent: totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0,
    }
  })

  // Итого: 4 запроса вместо N*M
  const totalLessons = coursesWithProgress.reduce((s, c) => s + c.totalLessons, 0)
  const completedTotal = coursesWithProgress.reduce((s, c) => s + c.completedCount, 0)
  const overallPercent = totalLessons > 0 ? Math.round((completedTotal / totalLessons) * 100) : 0

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Link
        href="/roadmaps"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Все роадмапы
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">{roadmap.title}</h1>
        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
          <span>{coursesWithProgress.length} курсов</span>
          <span>{totalLessons} уроков</span>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Общий прогресс</span>
            <span className="font-medium text-foreground">{overallPercent}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Miro embed */}
      {roadmap.miroEmbedUrl && typeof roadmap.miroEmbedUrl === 'string' && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold text-foreground mb-3">Карта навыков</h2>
          <MiroEmbed
            title={`${roadmap.title} — Карта навыков`}
            embedUrl={roadmap.miroEmbedUrl}
            height={600}
          />
        </div>
      )}

      <div className="space-y-3">
        {coursesWithProgress.map((course) => {
          const isLocked = !course.prerequisitesMet

          return (
            <div
              key={course.id}
              className={`rounded-xl border bg-card p-5 transition-colors ${
                isLocked ? 'border-border opacity-60' : 'border-border hover:border-primary/50'
              }`}
            >
              {isLocked ? (
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{course.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Пройдите предыдущие курсы для разблокировки
                    </p>
                  </div>
                </div>
              ) : (
                <Link href={`/courses/${course.slug}`} className="block">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      {course.isCompleted ? (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      ) : (
                        <BookOpen className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{course.title}</h3>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          {course.completedCount}/{course.totalLessons} уроков
                        </span>
                        {course.estimatedHours != null && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {course.estimatedHours}ч
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">
                      {course.progressPercent}%
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${course.progressPercent}%` }}
                    />
                  </div>
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
