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

  // Загружаем все уроки курса для навигации prev/next
  let prevLesson: { slug: string; title: string } | null = null
  let nextLesson: { slug: string; title: string } | null = null

  if (course) {
    const allLessons = await payload.find({
      collection: 'lessons',
      where: {
        course: { equals: course.id },
        isPublished: { equals: true },
      },
      sort: 'order',
      limit: 200,
    })

    const currentIndex = allLessons.docs.findIndex((l) => l.id === lesson.id)
    if (currentIndex > 0) {
      const prev = allLessons.docs[currentIndex - 1]
      prevLesson = { slug: prev.slug, title: prev.title }
    }
    if (currentIndex < allLessons.docs.length - 1) {
      const next = allLessons.docs[currentIndex + 1]
      nextLesson = { slug: next.slug, title: next.title }
    }
  }

  // Загружаем прогресс пользователя по этому уроку
  let isCompleted = false
  let progressId: string | undefined

  if (user) {
    const progress = await payload.find({
      collection: 'user-progress',
      where: {
        user: { equals: user.id },
        lesson: { equals: lesson.id },
      },
      limit: 1,
    })

    if (progress.docs.length > 0) {
      isCompleted = progress.docs[0].isCompleted ?? false
      progressId = String(progress.docs[0].id)
    }

    // Обновляем lastAccessedAt
    if (progressId) {
      await payload.update({
        collection: 'user-progress',
        id: progressId,
        data: { lastAccessedAt: new Date().toISOString() },
        context: { skipHooks: true },
      })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks = (lesson.content ?? []) as any[]

  return (
    <div className="mx-auto max-w-4xl space-y-8">
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
  )
}
