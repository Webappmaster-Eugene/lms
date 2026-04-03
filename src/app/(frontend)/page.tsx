import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Award, BookOpen, Clock, Flame, GraduationCap, Map, Star, Trophy } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Дашборд',
}

export default async function DashboardPage() {
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  if (!user) return null

  // Загружаем данные параллельно
  const [roadmaps, courses, progressData, achievementsData, streakData, certificatesData] = await Promise.all([
    payload.find({
      collection: 'roadmaps',
      where: { isPublished: { equals: true } },
      sort: 'order',
      limit: 10,
    }),
    payload.find({
      collection: 'courses',
      where: { isPublished: { equals: true } },
      sort: 'order',
      limit: 20,
      depth: 1,
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
  ])

  const completedLessons = progressData.totalDocs
  const streakDays = (streakData.docs[0] as { currentStreak?: number } | undefined)?.currentStreak ?? 0
  const certificatesCount = certificatesData.totalDocs ?? 0

  // Подсчёт прогресса по курсам
  const courseIds = courses.docs.map((c) => String(c.id))
  const allLessons = courseIds.length > 0
    ? await payload.find({
        collection: 'lessons',
        where: {
          course: { in: courseIds },
          isPublished: { equals: true },
        },
        limit: 5000,
      })
    : { docs: [] }

  const lessonsByCourse: Record<string, string[]> = {}
  for (const lesson of allLessons.docs) {
    const cId = String(typeof lesson.course === 'object' ? lesson.course.id : lesson.course)
    if (!lessonsByCourse[cId]) lessonsByCourse[cId] = []
    lessonsByCourse[cId].push(String(lesson.id))
  }

  let completedLessonIds = new Set<string>()
  if (user) {
    const userProgress = await payload.find({
      collection: 'user-progress',
      where: {
        user: { equals: user.id },
        isCompleted: { equals: true },
      },
      limit: 5000,
    })
    completedLessonIds = new Set(
      userProgress.docs.map((p) =>
        String(typeof p.lesson === 'object' ? p.lesson.id : p.lesson),
      ),
    )
  }

  const coursesWithProgress = courses.docs.map((course) => {
    const cId = String(course.id)
    const courseLessonIds = lessonsByCourse[cId] ?? []
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
    }
  })

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Приветствие */}
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          Привет, {user.firstName}!
        </h1>
        <p className="mt-1 text-muted-foreground">Продолжай обучение</p>
      </div>

      {/* Статистика — горизонтальный скролл на мобильных */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide sm:grid sm:grid-cols-5 sm:gap-4 sm:overflow-visible sm:pb-0">
        <StatCard icon={BookOpen} color="info" value={completedLessons} label="Уроков" />
        <StatCard icon={Star} color="warning" value={user.totalPoints ?? 0} label="Баллов" />
        <StatCard icon={Flame} color="streak" value={streakDays} label="Дней подряд" />
        <StatCard icon={Trophy} color="success" value={achievementsData.totalDocs} label="Достижений" />
        <StatCard icon={Award} color="primary" value={certificatesCount} label="Сертификатов" />
      </div>

      {/* Мои курсы */}
      {coursesWithProgress.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Мои курсы</h2>
            <Link href="/courses" className="text-sm text-primary hover:text-primary/80 transition-colors">
              Все курсы
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {coursesWithProgress.slice(0, 6).map((course) => (
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
                      <span>{course.totalLessons} уроков</span>
                      {course.estimatedHours != null && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {course.estimatedHours}ч
                        </span>
                      )}
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
          {roadmaps.docs.map((roadmap) => (
            <Link
              key={roadmap.id}
              href={`/roadmaps/${roadmap.slug}`}
              className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 sm:p-6"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Map className="h-5 w-5 text-primary" />
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
