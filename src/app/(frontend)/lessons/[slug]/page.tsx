import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createLocalReq } from 'payload'
import Link from 'next/link'
import { ArrowLeft, Clock } from 'lucide-react'
import { LessonLearningProvider } from '@/components/lesson/LessonLearningProvider'
import { learningVideos } from '@/lib/learning-state'
import { ContentBlockRenderer } from '@/components/lesson/ContentBlockRenderer'
import { CompletionButton } from '@/components/lesson/CompletionButton'
import { LessonNotes } from '@/components/lesson/LessonNotes'
import { LessonComments } from '@/components/lesson/LessonComments'
import { LessonKeyboardNav } from '@/components/lesson/LessonKeyboardNav'
import { LessonNavigation } from '@/components/lesson/LessonNavigation'
import { CourseSidebar } from '@/components/course/CourseSidebar'
import { BookmarkButton } from '@/components/bookmarks/BookmarkButton'
import { findBookmarkId } from '@/lib/bookmarks'
import { collectAllPages } from '@/lib/paginate'
import { relationKey } from '@/lib/course-lessons'
import { lessonPosition, orderCourseLessons, type LessonPosition } from '@/lib/roadmap-next-step'
import { protectLessonVideoSources } from '@/lib/lesson-video-source'
import { getLearningAccess } from '@/server/learning-access'
import { recordLearningAccess } from '@/lib/learning-observability'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) return { title: 'Урок' }
  const result = await payload.find({
    collection: 'lessons',
    where: { slug: { equals: slug }, isPublished: { equals: true } },
    limit: 1,
    depth: 0,
    select: { title: true },
  })
  const lesson = result.docs[0]
  return { title: lesson?.title ?? 'Урок' }
}

export default async function LessonPage({ params }: Props) {
  const { slug } = await params
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/lessons/${slug}`)}`)
  const req = await createLocalReq({ user }, payload)
  const policy = await getLearningAccess(payload, user, req)

  // Catalog metadata is safe to preview; fetch the learning material only after authorization.
  const metadataResult = await payload.find({
    collection: 'lessons',
    where: { slug: { equals: slug }, isPublished: { equals: true } },
    limit: 1,
    depth: 0,
    select: { title: true, slug: true, course: true, section: true, isPublished: true },
    overrideAccess: true,
    req,
  })
  const metadata = metadataResult.docs[0]
  if (!metadata) return notFound()
  if (!policy.canBrowseLessonMetadata(metadata)) return notFound()
  if (!policy.canAccessLessonMetadata(metadata)) {
    recordLearningAccess({ resource: 'lesson', outcome: 'deny', reason: 'restricted', userId: user.id, resourceId: metadata.id })
    return (
      <div className="mx-auto max-w-2xl space-y-5 rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Программа обучения</p>
        <h1 className="text-2xl font-bold text-foreground">{metadata.title}</h1>
        <p className="text-muted-foreground">Доступ к этому уроку пока не назначен. Вы можете посмотреть программу и обратиться к ментору, чтобы обсудить обучение.</p>
        <Link href="/roadmaps" className="inline-flex rounded-lg bg-primary px-4 py-2 text-primary-foreground">Посмотреть роадмапы</Link>
      </div>
    )
  }

  // Загружаем урок
  const lessonResult = await payload.find({
    collection: 'lessons',
    where: {
      slug: { equals: slug },
      isPublished: { equals: true },
    },
    limit: 1,
    depth: 2,
    // Source IDs are derived before redaction; the policy above authorizes this server-only read.
    overrideAccess: true,
    user,
    req,
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
  let allCourseLessons: { id: number }[] = []
  let completedLessonIds = new Set<string>()
  let position: LessonPosition | null = null

  if (course) {
    const [sectionDocs, lessonDocs] = await Promise.all([
      collectAllPages(
        ({ page, limit }) =>
          payload.find({
            collection: 'sections',
            select: { title: true, course: true, isPublished: true, order: true },
            depth: 0,
            where: {
              course: { equals: course.id },
              isPublished: { equals: true },
            },
            sort: ['order', 'id'],
            page,
            limit,
          }),
        { label: `секции курса ${course.id}` },
      ),
      collectAllPages(
        ({ page, limit }) =>
          payload.find({
            collection: 'lessons',
            select: { title: true, slug: true, course: true, section: true, order: true, isPublished: true },
            depth: 0,
            where: {
              course: { equals: course.id },
              isPublished: { equals: true },
            },
            sort: ['order', 'id'],
            page,
            limit,
          }),
        { label: `уроки курса ${course.id}` },
      ),
    ])

    allCourseLessons = lessonDocs

    // Порядок как на странице курса: секции по их порядку, уроки скрытых секций не участвуют.
    const sectionRank = new Map(sectionDocs.map((section, index) => [String(section.id), index]))
    const ordered = orderCourseLessons(
      lessonDocs.filter((l) => policy.canAccessLessonMetadata(l)).map((l) => ({
        id: String(l.id),
        slug: l.slug,
        title: l.title,
        courseId: String(course.id),
        sectionId: relationKey(l.section),
        order: l.order ?? 0,
      })),
      sectionRank,
    )
    position = lessonPosition(ordered.get(String(course.id)) ?? [], String(lesson.id))

    // Прогресс — только по урокам этого курса
    if (user) {
      const courseLessonIds = lessonDocs.map((l) => String(l.id))
      if (courseLessonIds.length > 0) {
        const progressDocs = await collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'user-progress',
              where: {
                user: { equals: user.id },
                lesson: { in: courseLessonIds },
                isCompleted: { equals: true },
              },
              select: { lesson: true },
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: `прогресс пользователя ${user.id} по курсу ${course.id}` },
        )
        completedLessonIds = new Set(
          progressDocs.map((p) => String(typeof p.lesson === 'object' ? p.lesson.id : p.lesson)),
        )
      }
    }

    // Группируем уроки по секциям
    const sectionMap = new Map<string, typeof lessonDocs>()
    const unsectioned: typeof lessonDocs = []

    for (const l of lessonDocs.filter((item) => policy.canAccessLessonMetadata(item))) {
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

    sidebarSections = sectionDocs.map((s) => {
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

  const prevLesson = position?.prev ?? null
  const nextLesson = position?.next ?? null

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

  const bookmarkId = user ? await findBookmarkId(payload, user.id, { lesson: lesson.id }) : null

  const visibleLesson = user.role === 'admin' ? lesson : protectLessonVideoSources(lesson)
  const blocks = visibleLesson.content ?? []

  const hasSidebar = sidebarSections.length > 0
  const totalLessons = allCourseLessons.length
  const totalCompleted = allCourseLessons.filter((l) => completedLessonIds.has(String(l.id))).length
  // Остальные уроки курса пройдены — отметка этого завершает курс.
  const othersDone = allCourseLessons.every((l) => l.id === lesson.id || completedLessonIds.has(String(l.id)))

  return (
    <div className={hasSidebar ? 'flex flex-col gap-6 lg:flex-row' : ''}>
      {hasSidebar && (
        <CourseSidebar
          key={String(lesson.id)}
          courseTitle={course?.title ?? ''}
          sections={sidebarSections}
          completedLessonIds={completedLessonIds}
          currentLessonId={String(lesson.id)}
          totalLessons={totalLessons}
          totalCompleted={totalCompleted}
        />
      )}
      {/* Main content */}
      <div className={`space-y-8 ${hasSidebar ? 'flex-1 min-w-0' : 'mx-auto max-w-4xl'}`}>
        {/* Навигация */}
        {course && (
          <Link
            href={`/courses/${course.slug}`}
            className="inline-flex min-h-11 max-w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{course.title}</span>
          </Link>
        )}

        {/* Заголовок */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">{lesson.title}</h1>
            {user?.role === 'admin' && <Link href={`/manage/lessons/${lesson.id}`} className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">Редактировать урок</Link>}
            {user && <BookmarkButton target={{ lesson: lesson.id }} initialId={bookmarkId} />}
          </div>
          {visibleLesson.description && (
            <p className="text-muted-foreground">{visibleLesson.description}</p>
          )}
          {(position || lesson.estimatedMinutes) && (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {position && (
                <span>
                  Урок {position.index} из {position.total}
                </span>
              )}
              {lesson.estimatedMinutes && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />~{lesson.estimatedMinutes} мин
                </span>
              )}
            </p>
          )}
        </div>

        {/* Контент урока */}
        {user ? (
          <LessonLearningProvider key={`${user.id}:${lesson.id}`} userId={user.id} lessonId={lesson.id}>
            <ContentBlockRenderer blocks={blocks} learningVideos={learningVideos(lesson)} />
          </LessonLearningProvider>
        ) : <ContentBlockRenderer blocks={blocks} />}

        {/* Заметки */}
        <LessonNotes lessonId={lesson.id} />

        {/* Кнопка завершения */}
        <div className="flex justify-center border-t border-border pt-8">
          <CompletionButton
            lessonId={lesson.id}
            isCompleted={isCompleted}
            progressId={progressId}
            next={nextLesson}
            completesCourse={othersDone}
            courseHref={course ? `/courses/${course.slug}` : null}
          />
        </div>

        {/* Навигация prev/next */}
        <LessonKeyboardNav
          prevHref={prevLesson ? `/lessons/${prevLesson.slug}` : null}
          nextHref={nextLesson ? `/lessons/${nextLesson.slug}` : null}
        />
        <LessonNavigation previous={prevLesson} next={nextLesson} />

        {/* Обсуждение */}
        <div className="border-t border-border pt-8">
          <LessonComments lessonId={lesson.id} />
        </div>
      </div>
    </div>
  )
}
