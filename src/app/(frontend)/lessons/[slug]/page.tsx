import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { ContentBlockRenderer } from '@/components/lesson/ContentBlockRenderer'
import { CompletionButton } from '@/components/lesson/CompletionButton'
import { LessonNotes } from '@/components/lesson/LessonNotes'
import { LessonComments } from '@/components/lesson/LessonComments'
import { CourseSidebar } from '@/components/course/CourseSidebar'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const payload = await getPayload()
  const result = await payload.find({
    collection: 'lessons',
    where: { slug: { equals: slug }, isPublished: { equals: true } },
    limit: 1,
  })
  const lesson = result.docs[0]
  return { title: lesson?.title ?? 'Урок' }
}

export default async function LessonPage({ params }: Props) {
  const { slug } = await params
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  // Загружаем урок
  const lessonResult = await payload.find({
    collection: 'lessons',
    where: {
      slug: { equals: slug },
      isPublished: { equals: true },
    },
    limit: 1,
    depth: 2,
  })

  const lesson = lessonResult.docs[0]
  if (!lesson) return notFound()

  const course = typeof lesson.course === 'object' ? lesson.course : null

  // Загружаем секции и уроки курса для sidebar и nav
  let sidebarSections: Array<{
    id: string
    title: string
    order: number
    lessons: Array<{ id: string; title: string; slug: string; order: number }>
  }> = []
  let allCourseLessons: typeof lessonResult.docs = []
  let completedLessonIds = new Set<string>()

  if (course) {
    const [sectionsResult, lessonsResult] = await Promise.all([
      payload.find({
        collection: 'sections',
        where: {
          course: { equals: course.id },
          isPublished: { equals: true },
        },
        sort: 'order',
        limit: 100,
      }),
      payload.find({
        collection: 'lessons',
        where: {
          course: { equals: course.id },
          isPublished: { equals: true },
        },
        sort: 'order',
        limit: 500,
      }),
    ])

    allCourseLessons = lessonsResult.docs

    // Загружаем прогресс пользователя — только для уроков этого курса
    if (user) {
      const courseLessonIds = lessonsResult.docs.map((l) => String(l.id))
      if (courseLessonIds.length > 0) {
        const progress = await payload.find({
          collection: 'user-progress',
          where: {
            user: { equals: user.id },
            lesson: { in: courseLessonIds },
            isCompleted: { equals: true },
          },
          limit: 500,
        })
        completedLessonIds = new Set(
          progress.docs.map((p) =>
            String(typeof p.lesson === 'object' ? p.lesson.id : p.lesson),
          ),
        )
      }
    }

    // Группируем уроки по секциям
    const sectionMap = new Map<string, typeof lessonsResult.docs>()
    const unsectioned: typeof lessonsResult.docs = []

    for (const l of lessonsResult.docs) {
      const sectionId = typeof l.section === 'object'
        ? l.section?.id ? String(l.section.id) : null
        : l.section ? String(l.section) : null

      if (sectionId) {
        const arr = sectionMap.get(sectionId) ?? []
        arr.push(l)
        sectionMap.set(sectionId, arr)
      } else {
        unsectioned.push(l)
      }
    }

    sidebarSections = sectionsResult.docs.map((s) => {
      const sLessons = sectionMap.get(String(s.id)) ?? []
      return {
        id: String(s.id),
        title: s.title,
        order: s.order ?? 0,
        lessons: sLessons.map((l) => ({
          id: String(l.id),
          title: l.title,
          slug: l.slug,
          order: l.order ?? 0,
        })),
      }
    })

    // Если есть уроки без секции, добавляем "виртуальную" секцию
    if (unsectioned.length > 0) {
      sidebarSections.push({
        id: '__unsectioned',
        title: 'Другие уроки',
        order: 999,
        lessons: unsectioned.map((l) => ({
          id: String(l.id),
          title: l.title,
          slug: l.slug,
          order: l.order ?? 0,
        })),
      })
    }
  }

  // Prev/Next навигация (учитываем порядок секций)
  let prevLesson: { slug: string; title: string } | null = null
  let nextLesson: { slug: string; title: string } | null = null

  if (allCourseLessons.length > 0) {
    // Сортируем по section.order → lesson.order
    const sorted = [...allCourseLessons].sort((a, b) => {
      const aSectionOrder = typeof a.section === 'object' && a.section ? (a.section.order ?? 0) : 999
      const bSectionOrder = typeof b.section === 'object' && b.section ? (b.section.order ?? 0) : 999
      if (aSectionOrder !== bSectionOrder) return aSectionOrder - bSectionOrder
      return (a.order ?? 0) - (b.order ?? 0)
    })

    const currentIndex = sorted.findIndex((l) => l.id === lesson.id)
    if (currentIndex > 0) {
      const prev = sorted[currentIndex - 1]
      prevLesson = { slug: prev.slug, title: prev.title }
    }
    if (currentIndex < sorted.length - 1) {
      const next = sorted[currentIndex + 1]
      nextLesson = { slug: next.slug, title: next.title }
    }
  }

  // Прогресс этого урока — используем уже загруженные данные + отдельный запрос для progressId
  const isCompleted = completedLessonIds.has(String(lesson.id))
  let progressId: string | undefined

  if (user) {
    const progressDoc = await payload.find({
      collection: 'user-progress',
      where: {
        user: { equals: user.id },
        lesson: { equals: lesson.id },
      },
      limit: 1,
    })

    if (progressDoc.docs.length > 0) {
      progressId = String(progressDoc.docs[0].id)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks = (lesson.content ?? []) as any[]

  const hasSidebar = sidebarSections.length > 0
  const totalLessons = allCourseLessons.length
  const totalCompleted = allCourseLessons.filter((l) => completedLessonIds.has(String(l.id))).length

  return (
    <div className={hasSidebar ? 'flex gap-6' : ''}>
      {/* Main content */}
      <div className={`space-y-8 ${hasSidebar ? 'flex-1 min-w-0' : 'mx-auto max-w-4xl'}`}>
        {/* Навигация */}
        {course && (
          <Link
            href={`/courses/${course.slug}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {course.title}
          </Link>
        )}

        {/* Заголовок */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">{lesson.title}</h1>
          {lesson.description && (
            <p className="text-muted-foreground">{lesson.description}</p>
          )}
          {lesson.estimatedMinutes && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              ~{lesson.estimatedMinutes} мин
            </p>
          )}
        </div>

        {/* Контент урока */}
        <ContentBlockRenderer blocks={blocks} />

        {/* Заметки */}
        <LessonNotes lessonId={String(lesson.id)} />

        {/* Кнопка завершения */}
        <div className="flex justify-center border-t border-border pt-8">
          <CompletionButton
            lessonId={String(lesson.id)}
            isCompleted={isCompleted}
            progressId={progressId}
          />
        </div>

        {/* Обсуждение */}
        <div className="border-t border-border pt-8">
          <LessonComments lessonId={String(lesson.id)} />
        </div>

        {/* Навигация prev/next */}
        <div className="flex items-center justify-between border-t border-border pt-6">
          {prevLesson ? (
            <Link
              href={`/lessons/${prevLesson.slug}`}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="max-w-[200px] truncate">{prevLesson.title}</span>
            </Link>
          ) : (
            <div />
          )}
          {nextLesson ? (
            <Link
              href={`/lessons/${nextLesson.slug}`}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="max-w-[200px] truncate">{nextLesson.title}</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <div />
          )}
        </div>
      </div>

      {/* Course Sidebar */}
      {hasSidebar && (
        <div className="hidden lg:block w-72 flex-shrink-0">
          {/* key forces remount when lesson changes to update expandedSections */}
          <CourseSidebar
            key={String(lesson.id)}
            courseTitle={course?.title ?? ''}
            sections={sidebarSections}
            completedLessonIds={completedLessonIds}
            currentLessonId={String(lesson.id)}
            totalLessons={totalLessons}
            totalCompleted={totalCompleted}
          />
        </div>
      )}
    </div>
  )
}
