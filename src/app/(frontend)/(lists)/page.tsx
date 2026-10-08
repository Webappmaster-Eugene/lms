import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import Link from 'next/link'
import { ArrowRight, Award, BookOpen, Clock, Flame, GraduationCap, Map as MapIcon, MessagesSquare, Star, Trophy } from 'lucide-react'
import { collectAllPages } from '@/lib/paginate'
import { pluralize } from '@/lib/utils'
import { streakView } from '@/lib/streak'
import { loadCourseLessons, relationKey } from '@/lib/course-lessons'
import { latestLearningResume } from '@/server/learning-state'
import { formatTime } from '@/lib/video-memory'
import { nextLesson, recentCourseIds } from '@/lib/roadmap-next-step'
import { createLocalReq, type Where } from 'payload'
import { getLearningAccess } from '@/server/learning-access'

export const metadata: Metadata = {
  title: 'Дашборд',
}

/** Сколько карточек курсов показывает дашборд. */
const DASHBOARD_COURSES = 6

export default async function DashboardPage() {
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  if (!user) return null
  const req = await createLocalReq({ user }, payload)
  const policy = await getLearningAccess(payload, user, req)
  const assignedCourses: Where = user.role === 'admin' ? {} : { id: { in: policy.accessibleCourseIds } }

  // Загружаем данные параллельно
  const [roadmapDocs, courses, progressData, achievementsData, streakData, certificatesData, answers] = await Promise.all([
    collectAllPages(
      ({ page, limit }) =>
        payload.find({
          collection: 'roadmaps',
          where: { isPublished: { equals: true } },
          sort: ['order', 'id'],
          page,
          limit,
        }),
      { label: 'роадмапы дашборда' },
    ),
    payload.find({
      collection: 'courses',
      where: { and: [{ isPublished: { equals: true } }, assignedCourses] },
      sort: ['order', 'id'],
      limit: DASHBOARD_COURSES,
      depth: 0,
      select: { title: true, slug: true, estimatedHours: true },
    }),
    payload.find({
      collection: 'user-progress',
      where: {
        user: { equals: user.id },
        isCompleted: { equals: true },
      },
      limit: 0,
    }),
    payload.find({
      collection: 'user-achievements',
      where: { user: { equals: user.id } },
      limit: 5,
      sort: '-unlockedAt',
      depth: 2,
    }),
    payload.find({
      collection: 'streaks',
      where: { user: { equals: user.id } },
      limit: 1,
    }),
    payload.find({
      collection: 'certificates',
      where: { user: { equals: user.id } },
      limit: 0,
    }),
    // Непрочитанные ответы ментора: прочитанными их отмечает ветка урока или «Мои вопросы».
    payload.find({
      collection: 'notifications',
      where: {
        user: { equals: user.id },
        type: { equals: 'comment' },
        isRead: { equals: false },
        link: { like: '/lessons/' },
      },
      select: { title: true, message: true, link: true },
      sort: ['-createdAt', 'id'],
      limit: 3,
      depth: 0,
    }),
  ])

  const completedLessons = progressData.totalDocs
  const streak = streakView(streakData.docs[0])
  const certificatesCount = certificatesData.totalDocs ?? 0

  // Курсы ученика — по последней активности, а не первые в каталоге: иначе начатый
  // курс из середины каталога на дашборд не попадал.
  const progressDocs = await collectAllPages(
    ({ page, limit }) =>
      payload.find({
        collection: 'user-progress',
        where: { user: { equals: user.id }, isCompleted: { equals: true } },
        select: { lesson: true, updatedAt: true },
        depth: 0,
        sort: 'id',
        page,
        limit,
      }),
    { label: `прогресс пользователя ${user.id}` },
  )
  const completedLessonIds = new Set(progressDocs.flatMap((p) => relationKey(p.lesson) ?? []))

  const touchedLessons =
    completedLessonIds.size > 0
      ? await collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'lessons',
              where: { id: { in: [...completedLessonIds] } },
              select: { course: true },
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: `курсы пройденных уроков ${user.id}` },
        )
      : []
  const courseOfLesson = new Map(
    touchedLessons.flatMap((l) => {
      const courseId = relationKey(l.course)
      return courseId ? [[String(l.id), courseId] as const] : []
    }),
  )
  const recentIds = recentCourseIds(
    progressDocs.flatMap((p) => {
      const lessonId = relationKey(p.lesson)
      return lessonId ? [{ lessonId, at: p.updatedAt }] : []
    }),
    courseOfLesson,
  )

  const startedCourses =
    recentIds.length > 0
      ? (
          await payload.find({
            collection: 'courses',
            where: { and: [{ id: { in: recentIds }, isPublished: { equals: true } }, assignedCourses] },
            select: { title: true, slug: true, estimatedHours: true },
            depth: 0,
            limit: recentIds.length,
          })
        ).docs.sort((a, b) => recentIds.indexOf(String(a.id)) - recentIds.indexOf(String(b.id)))
      : []
  const hasStarted = startedCourses.length > 0
  const shownCourses = hasStarted ? startedCourses.slice(0, DASHBOARD_COURSES) : courses.docs

  const courseLessons = await loadCourseLessons(payload, shownCourses.map((c) => c.id), 'дашборд', policy.canAccessLessonMetadata)

  const coursesWithProgress = shownCourses.map((course) => {
    const cId = String(course.id)
    const courseLessonIds = courseLessons.allIds.get(cId) ?? []
    const totalLessons = courseLessonIds.length
    const completedCount = courseLessonIds.filter((id) => completedLessonIds.has(id)).length
    const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0

    return {
      id: cId,
      title: course.title,
      slug: course.slug,
      estimatedHours: course.estimatedHours,
      totalLessons,
      completedCount,
      progressPercent,
      next: nextLesson(courseLessons.ordered.get(cId) ?? [], completedLessonIds),
    }
  })

  // Продолжить — самый свежий из незаконченных курсов.
  const exactResume = await latestLearningResume(payload, user)
  const resume = hasStarted ? coursesWithProgress.find((c) => c.next && c.completedCount < c.totalLessons) : undefined

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Приветствие */}
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          Привет, {user.firstName}!
        </h1>
        {streak.status === 'at-risk' ? (
          <p className="mt-1 flex items-center gap-1.5 text-foreground">
            <Flame className="h-4 w-4 shrink-0 text-[hsl(var(--streak))]" aria-hidden="true" />
            Серия {pluralize(streak.days, 'день', 'дня', 'дней')} подряд — пройдите урок сегодня, чтобы её не прервать
          </p>
        ) : streak.status === 'today' ? (
          <p className="mt-1 text-muted-foreground">
            Сегодня урок уже пройден — серия {pluralize(streak.days, 'день', 'дня', 'дней')} подряд
          </p>
        ) : (
          <p className="mt-1 text-muted-foreground">Продолжай обучение</p>
        )}
      </div>

      {(exactResume || resume?.next) && (
        <Link
          href={exactResume?.href ?? `/lessons/${resume?.next?.slug}`}
          className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 transition-colors hover:bg-primary/10 sm:flex-row sm:items-center sm:p-5"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">Продолжить с того места, где остановились</p>
            <p className="mt-1 truncate font-semibold text-foreground">{exactResume?.title ?? resume?.next?.title}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {exactResume ? exactResume.course : `${resume?.title} · ${resume?.completedCount}/${resume?.totalLessons} уроков`}
              {exactResume?.videoTitle && <span className="block mt-1">{exactResume.videoTitle} · {exactResume.ended ? 'Видео досмотрено' : `Остановились на ${formatTime(exactResume.seconds ?? 0)}`}</span>}
            </p>
          </div>
          <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Продолжить
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </Link>
      )}

      {answers.totalDocs > 0 && (
        <section aria-labelledby="mentor-answers" className="rounded-xl border border-info/40 bg-info/5 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="mentor-answers" className="flex items-center gap-2 font-semibold text-foreground">
              <MessagesSquare className="h-5 w-5 text-info" aria-hidden="true" />
              Ментор ответил на {answers.totalDocs === 1 ? 'ваш вопрос' : `ваши вопросы (${answers.totalDocs})`}
            </h2>
            <Link href="/questions" className="text-sm text-foreground underline-offset-2 hover:underline">
              Все вопросы
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {answers.docs.map((n) => (
              <li key={n.id}>
                <Link href={n.link ?? '/questions'} className="block rounded-lg bg-card px-3 py-2 transition-colors hover:bg-accent">
                  <span className="block truncate text-sm font-medium text-foreground">{n.title}</span>
                  {n.message && <span className="block truncate text-sm text-muted-foreground">{n.message}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Статистика — горизонтальный скролл на мобильных */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide sm:grid sm:grid-cols-5 sm:gap-4 sm:overflow-visible sm:pb-0">
        <StatCard icon={BookOpen} color="info" value={completedLessons} label="Уроков" />
        <StatCard icon={Star} color="warning" value={user.totalPoints ?? 0} label="Баллов" />
        <StatCard icon={Flame} color="streak" value={streak.days} label="Дней подряд" />
        <StatCard icon={Trophy} color="success" value={achievementsData.totalDocs} label="Достижений" />
        <StatCard icon={Award} color="primary" value={certificatesCount} label="Сертификатов" />
      </div>

      {/* Мои курсы */}
      {coursesWithProgress.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{hasStarted ? 'Мои курсы' : 'С чего начать'}</h2>
            <Link href="/courses" className="text-sm text-primary hover:text-primary/80 transition-colors">
              Все курсы
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {coursesWithProgress.map((course) => (
              <Link
                key={course.id}
                href={`/courses/${course.slug}`}
                className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                    <GraduationCap className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors text-sm truncate">
                      {course.title}
                    </h3>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{pluralize(course.totalLessons, 'урок', 'урока', 'уроков')}</span>
                      {course.estimatedHours ? (
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {course.estimatedHours}ч
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
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
        </div>
      )}

      {/* Роадмапы */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Роадмапы</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {roadmapDocs.map((roadmap) => (
            <Link
              key={roadmap.id}
              href={`/roadmaps/${roadmap.slug}`}
              className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 sm:p-6"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <MapIcon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {roadmap.title}
                  </h3>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Последние достижения */}
      {achievementsData.docs.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground">Последние достижения</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {achievementsData.docs.map((ua) => {
              const achievement =
                typeof ua.achievement === 'object' ? ua.achievement : null
              if (!achievement) return null
              return (
                <div
                  key={ua.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                    <Trophy className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{achievement.title}</p>
                    <p className="text-xs text-muted-foreground">{achievement.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: typeof BookOpen
  color: string
  value: number
  label: string
}) {
  const colorMap: Record<string, string> = {
    info: 'bg-info/10 text-info',
    warning: 'bg-warning/10 text-warning',
    success: 'bg-success/10 text-success',
    primary: 'bg-primary/10 text-primary',
    streak: 'bg-[hsl(var(--streak)_/_0.1)] text-[hsl(var(--streak))]',
  }
  const classes = colorMap[color] ?? colorMap.primary

  return (
    <div className="flex min-w-[140px] flex-shrink-0 items-center gap-3 rounded-xl border border-border bg-card p-3 sm:min-w-0 sm:flex-shrink sm:p-4">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg sm:h-10 sm:w-10 ${classes.split(' ')[0]}`}>
        <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${classes.split(' ')[1]}`} />
      </div>
      <div>
        <p className="text-lg font-bold text-foreground sm:text-xl">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
