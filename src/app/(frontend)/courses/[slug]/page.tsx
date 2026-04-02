import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, ChevronDown, Circle, Clock } from 'lucide-react'

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

  // Загружаем секции курса
  const sections = await payload.find({
    collection: 'sections',
    where: {
      course: { equals: course.id },
      isPublished: { equals: true },
    },
    sort: 'order',
    limit: 100,
  })

  // Загружаем все уроки курса
  const lessons = await payload.find({
    collection: 'lessons',
    where: {
      course: { equals: course.id },
      isPublished: { equals: true },
    },
    sort: 'order',
    limit: 500,
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
      limit: 5000,
    })
    completedLessonIds = new Set(
      progress.docs.map((p) =>
        String(typeof p.lesson === 'object' ? p.lesson.id : p.lesson),
      ),
    )
  }

  // Группируем уроки по секциям
  type LessonDoc = (typeof lessons.docs)[number]
  const sectionLessonsMap = new Map<string, LessonDoc[]>()
  const unsectionedLessons: LessonDoc[] = []

  for (const lesson of lessons.docs) {
    const sectionId = typeof lesson.section === 'object'
      ? lesson.section?.id ? String(lesson.section.id) : null
      : lesson.section ? String(lesson.section) : null

    if (sectionId) {
      const arr = sectionLessonsMap.get(sectionId) ?? []
      arr.push(lesson)
      sectionLessonsMap.set(sectionId, arr)
    } else {
      unsectionedLessons.push(lesson)
    }
  }

  const totalLessons = lessons.docs.length
  const completedCount = lessons.docs.filter((l) => completedLessonIds.has(String(l.id))).length
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0

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
          {sections.docs.length > 0 && (
            <span>{sections.docs.length} разделов</span>
          )}
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

      {/* Секции с уроками */}
      <div className="space-y-4">
        {sections.docs.map((section) => {
          const sectionLessons = sectionLessonsMap.get(String(section.id)) ?? []
          const sectionCompleted = sectionLessons.filter((l) =>
            completedLessonIds.has(String(l.id)),
          ).length
          const allDone = sectionCompleted === sectionLessons.length && sectionLessons.length > 0

          return (
            <details key={section.id} className="group rounded-xl border border-border bg-card" open>
              <summary className="flex cursor-pointer items-center gap-3 p-4 list-none">
                <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-open:rotate-180" />
                <span className="flex-1 font-semibold text-foreground">{section.title}</span>
                <span
                  className={`text-xs font-medium rounded-full px-2.5 py-1 ${
                    allDone
                      ? 'bg-success/10 text-success'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {sectionCompleted}/{sectionLessons.length}
                </span>
              </summary>

              <div className="border-t border-border px-2 pb-2">
                {sectionLessons.map((lesson) => (
                  <LessonItem
                    key={lesson.id}
                    lesson={lesson}
                    isCompleted={completedLessonIds.has(String(lesson.id))}
                  />
                ))}
                {sectionLessons.length === 0 && (
                  <p className="px-4 py-3 text-sm text-muted-foreground">Уроки скоро появятся</p>
                )}
              </div>
            </details>
          )
        })}

        {/* Уроки без секции */}
        {unsectionedLessons.length > 0 && (
          <div className="space-y-1">
            {sections.docs.length > 0 && (
              <h3 className="text-sm font-medium text-muted-foreground px-1 mb-2">Другие уроки</h3>
            )}
            {unsectionedLessons.map((lesson) => (
              <LessonItem
                key={lesson.id}
                lesson={lesson}
                isCompleted={completedLessonIds.has(String(lesson.id))}
              />
            ))}
          </div>
        )}

        {lessons.docs.length === 0 && (
          <p className="text-center text-muted-foreground py-12">В этом курсе пока нет уроков</p>
        )}
      </div>
    </div>
  )
}

function LessonItem({
  lesson,
  isCompleted,
}: {
  lesson: { id: number | string; slug: string; title: string; description?: string | null; estimatedMinutes?: number | null }
  isCompleted: boolean
}) {
  return (
    <Link
      href={`/lessons/${lesson.slug}`}
      className="group flex items-center gap-3 rounded-lg px-4 py-3 transition-colors hover:bg-accent/50"
    >
      {isCompleted ? (
        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-success" />
      ) : (
        <Circle className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
          {lesson.title}
        </p>
        {lesson.description && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{lesson.description}</p>
        )}
      </div>

      {lesson.estimatedMinutes && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
          <Clock className="h-3 w-3" />
          {lesson.estimatedMinutes} мин
        </span>
      )}
    </Link>
  )
}
