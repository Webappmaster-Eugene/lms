import type { Metadata } from 'next'
import { getLearningRequest } from '@/server/learning-request'
import { notFound, redirect } from 'next/navigation'
import { getLearningAccess } from '@/server/learning-access'
import { CourseLessonItem } from '@/components/course/CourseLessonItem'
import { ShareButton } from '@/components/ui/ShareButton'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ChevronDown, Clock, Lock, PartyPopper } from 'lucide-react'
import { collectAllPages } from '@/lib/paginate'
import { relationKey } from '@/lib/course-lessons'
import { pluralize } from '@/lib/utils'
import { remainingTime } from '@/lib/course-time'
import { nextLesson, orderCourseLessons } from '@/lib/roadmap-next-step'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { protectCourseSourceLinks } from '@/lib/lesson-video-source'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const { payload, user, req } = await getLearningRequest()
  if (!user) return { title: 'Вход' }
  const access = await getLearningAccess(payload, user, req)
  const result = await payload.find({
    collection: 'courses',
    where: { slug: { equals: slug }, isPublished: { equals: true } },
    limit: 1,
    depth: 0,
    select: { title: true },
    overrideAccess: false,
    req,
  })
  const course = result.docs[0]
  return { title: course && access.canBrowseCourse(course.id) ? course.title : 'Курс' }
}

export default async function CourseDetailPage({ params }: Props) {
  const { slug } = await params
  const { payload, user, req } = await getLearningRequest()
  if (!user) redirect('/login')
  const access = await getLearningAccess(payload, user, req)

  const courseResult = await payload.find({
    collection: 'courses',
    where: {
      slug: { equals: slug },
      isPublished: { equals: true },
    },
    limit: 1,
    depth: 0,
    select: { title: true, slug: true, roadmap: true, estimatedHours: true },
    overrideAccess: false,
    req,
  })

  const course = courseResult.docs[0]
  if (!course || !access.canBrowseCourse(course.id)) return notFound()

  const [loadedSectionDocs, loadedLessonDocs, progressDocs, roadmapDocs, courseContent] = await Promise.all([
    collectAllPages(
      ({ page, limit }) =>
        payload.find({
          collection: 'sections',
          where: {
            course: { equals: course.id },
            isPublished: { equals: true },
          },
          sort: ['order', 'id'],
          select: { title: true, order: true },
          depth: 0,
          overrideAccess: false,
          req,
          page,
          limit,
        }),
      { label: `секции курса «${course.slug}»` },
    ),
    collectAllPages(
      ({ page, limit }) =>
        payload.find({
          collection: 'lessons',
          where: {
            and: [{ course: { equals: course.id }, isPublished: { equals: true } }, access.browseLessonWhere],
          },
          sort: ['order', 'id'],
          select: { title: true, slug: true, course: true, section: true, order: true, isPublished: true, estimatedMinutes: true },
          depth: 0,
          overrideAccess: true,
          req,
          page,
          limit,
        }),
      { label: `уроки курса «${course.slug}»` },
    ),
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
    course.roadmap ? payload.find({ collection: 'roadmaps', where: { id: { equals: relationKey(course.roadmap) }, isPublished: { equals: true } }, select: { title: true, slug: true }, depth: 0, limit: 1, overrideAccess: false, req }) : null,
    access.canAccessCourse(course.id) && access.catalogVisibility === 'catalog' ? payload.findByID({ collection: 'courses', id: course.id, select: { description: true }, depth: 0, overrideAccess: true, req }) : null,
  ])

  const lessonDocs = loadedLessonDocs.filter((lesson) => access.canBrowseLessonMetadata(lesson))
  const sectionDocs = loadedSectionDocs.filter((section) => access.canBrowseSection(section.id))

  const completedLessonIds = new Set(
    progressDocs.map((p) => String(typeof p.lesson === 'object' ? p.lesson.id : p.lesson)),
  )

  // Группируем уроки по секциям
  type LessonDoc = (typeof lessonDocs)[number]
  const sectionLessonsMap = new Map<string, LessonDoc[]>()
  const unsectionedLessons: LessonDoc[] = []

  for (const lesson of lessonDocs) {
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

  const totalLessons = lessonDocs.length
  const completedCount = lessonDocs.filter((l) => completedLessonIds.has(String(l.id))).length
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0
  // До первого урока ученику нужна оценка курса целиком — она уже есть в шапке.
  const timeLeft = completedCount > 0 ? remainingTime(lessonDocs, completedLessonIds) : null

  const roadmap = roadmapDocs?.docs[0] ?? null
  const accessibleLessons = new Set(lessonDocs.filter((lesson) => access.canAccessLessonMetadata(lesson)).map((lesson) => String(lesson.id)))

  const sectionRank = new Map(sectionDocs.map((section, index) => [String(section.id), index]))
  const ordered = orderCourseLessons(
    lessonDocs.map((l) => ({
      id: String(l.id),
      slug: l.slug,
      title: l.title,
      courseId: String(course.id),
      sectionId: relationKey(l.section),
      order: l.order ?? 0,
    })),
    sectionRank,
  ).get(String(course.id)) ?? []
  const next = nextLesson(ordered.filter((lesson) => accessibleLessons.has(lesson.id)), completedLessonIds)
  const nextId = next ? ordered.find((l) => l.slug === next.slug)?.id ?? null : null

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
        <div className="mt-3"><ShareButton title={course.title} /></div>
        <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
          <span>{pluralize(totalLessons, 'урок', 'урока', 'уроков')}</span>
          {sectionDocs.length > 0 && (
            <span>{pluralize(sectionDocs.length, 'раздел', 'раздела', 'разделов')}</span>
          )}
          {course.estimatedHours && access.catalogVisibility === 'catalog' ? (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              ~{course.estimatedHours}ч
            </span>
          ) : null}
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{access.catalogVisibility === 'assigned' ? 'Прогресс назначенных уроков' : 'Прогресс'}</span>
            <span className="font-medium text-foreground">
              {completedCount}/{totalLessons} ({progressPercent}%)
            </span>
          </div>
          {timeLeft && <p className="mt-1 text-sm text-muted-foreground">{timeLeft}</p>}
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {user?.role === 'admin' && (
        <Link href={`/manage/courses/${course.id}`} className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">Редактировать программу</Link>
      )}

      {courseContent?.description && (
        <section aria-label="Описание курса" className="prose prose-sm dark:prose-invert max-w-none break-words">
          <RichText data={user?.role === 'admin' ? courseContent.description : protectCourseSourceLinks({ slug: course.slug, description: courseContent.description }).description ?? courseContent.description} />
        </section>
      )}

      {(!access.canAccessCourse(course.id) || accessibleLessons.size < totalLessons) && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{accessibleLessons.size === 0 ? 'Доступ к обучению в этом курсе не назначен. Вы можете посмотреть программу и темы роадмапа. Чтобы открыть уроки, обратитесь к администратору.' : `Вам назначено ${accessibleLessons.size} из ${totalLessons} уроков. Остальные темы видны в программе; доступ к ним может открыть администратор.`}</p>
        </div>
      )}

      {next ? (
        <Link
          href={`/lessons/${next.slug}`}
          className="flex items-center gap-4 rounded-xl border border-primary/40 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              {completedCount > 0 ? 'Продолжить с урока' : 'Начать курс'}
            </p>
            <p className="mt-1 truncate font-semibold text-foreground">{next.title}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            {completedCount > 0 ? 'Продолжить' : 'Начать'}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </Link>
      ) : totalLessons > 0 && accessibleLessons.size === totalLessons && completedCount === totalLessons ? (
        <div className="flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
          <PartyPopper className="h-6 w-6 shrink-0 text-success" aria-hidden="true" />
          <p className="text-sm text-foreground">
            {access.catalogVisibility === 'assigned' ? 'Все назначенные уроки пройдены. ' : 'Курс пройден. '}
            {roadmap ? (
              <Link href={`/roadmaps/${roadmap.slug}`} className="font-medium underline underline-offset-2">
                Что дальше по роадмапу
              </Link>
            ) : (
              <Link href="/certificates" className="font-medium underline underline-offset-2">
                Сертификаты
              </Link>
            )}
          </p>
        </div>
      ) : null}

      {/* Секции с уроками */}
      <div className="space-y-4">
        {sectionDocs.map((section) => {
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
                  <CourseLessonItem
                    key={lesson.id}
                    lesson={lesson}
                    isCompleted={completedLessonIds.has(String(lesson.id))}
                    isNext={String(lesson.id) === nextId}
                    accessAllowed={accessibleLessons.has(String(lesson.id))}
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
            {sectionDocs.length > 0 && (
              <h3 className="text-sm font-medium text-muted-foreground px-1 mb-2">Другие уроки</h3>
            )}
            {unsectionedLessons.map((lesson) => (
              <CourseLessonItem
                key={lesson.id}
                lesson={lesson}
                isCompleted={completedLessonIds.has(String(lesson.id))}
                isNext={String(lesson.id) === nextId}
                accessAllowed={accessibleLessons.has(String(lesson.id))}
              />
            ))}
          </div>
        )}

        {lessonDocs.length === 0 && (
          <p className="text-center text-muted-foreground py-12">В этом курсе пока нет уроков</p>
        )}
      </div>
    </div>
  )
}
