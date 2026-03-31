import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Circle, Clock } from 'lucide-react'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const payload = await getPayload()
  const result = await payload.find({
    collection: 'courses',
    where: { slug: { equals: slug }, isPublished: { equals: true } },
    limit: 1,
  })
  const course = result.docs[0]
  return { title: course?.title ?? 'Курс' }
}

export default async function CourseDetailPage({ params }: Props) {
  const { slug } = await params
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  const courseResult = await payload.find({
    collection: 'courses',
    where: {
      slug: { equals: slug },
      isPublished: { equals: true },
    },
    limit: 1,
    depth: 1,
  })

  const course = courseResult.docs[0]
  if (!course) return notFound()

  // Загружаем уроки курса
  const lessons = await payload.find({
    collection: 'lessons',
    where: {
      course: { equals: course.id },
      isPublished: { equals: true },
    },
    sort: 'order',
    limit: 200,
  })

  // Загружаем прогресс пользователя
  let completedLessonIds = new Set<string>()

  if (user) {
    const progress = await payload.find({
      collection: 'user-progress',
      where: {
        user: { equals: user.id },
        isCompleted: { equals: true },
      },
      limit: 1000,
    })
    completedLessonIds = new Set(
      progress.docs.map((p) =>
        String(typeof p.lesson === 'object' ? p.lesson.id : p.lesson),
      ),
    )
  }

  const totalLessons = lessons.docs.length
  const completedCount = lessons.docs.filter((l) => completedLessonIds.has(String(l.id))).length
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0

  // Определяем роадмап для навигации
  const roadmap = typeof course.roadmap === 'object' ? course.roadmap : null

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Навигация */}
      {roadmap && (
        <Link
          href={`/roadmaps/${roadmap.slug}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {roadmap.title}
        </Link>
      )}

      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{course.title}</h1>
        <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
          <span>{totalLessons} уроков</span>
          {course.estimatedHours && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              ~{course.estimatedHours}ч
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Прогресс</span>
            <span className="font-medium text-foreground">
              {completedCount}/{totalLessons} ({progressPercent}%)
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Уроки */}
      <div className="space-y-2">
        {lessons.docs.map((lesson, index) => {
          const isCompleted = completedLessonIds.has(String(lesson.id))

          return (
            <Link
              key={lesson.id}
              href={`/lessons/${lesson.slug}`}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
            >
              {/* Номер / статус */}
              <div className="flex h-8 w-8 items-center justify-center">
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </div>

              {/* Инфо */}
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  <span className="text-muted-foreground mr-2">{String(index + 1)}.</span>
                  {lesson.title}
                </p>
                {lesson.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                    {lesson.description}
                  </p>
                )}
              </div>

              {/* Время */}
              {lesson.estimatedMinutes && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {lesson.estimatedMinutes} мин
                </span>
              )}
            </Link>
          )
        })}

        {lessons.docs.length === 0 && (
          <p className="text-center text-muted-foreground py-12">В этом курсе пока нет уроков</p>
        )}
      </div>
    </div>
  )
}
