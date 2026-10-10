import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { getProfileDTO } from '@/server/profile/read'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, Pencil, Star, Target, Trophy } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { collectAllPages } from '@/lib/paginate'
import { streakView } from '@/lib/streak'
import { nearestGoals } from '@/lib/achievement-progress'
import { activityGrid, activityStart, countByDay } from '@/lib/activity'
import { ActivityCalendar } from '@/components/profile/ActivityCalendar'

export const metadata: Metadata = {
  title: 'Профиль',
}

export default async function ProfilePage() {
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  if (!user) redirect('/login')

  // Загружаем данные параллельно
  const [profile, progressData, achievementsData, recentTransactions, activeAchievements, unlockedDocs, trainerSolved, completionBonuses, streaks] = await Promise.all([
    getProfileDTO(payload, user),
    collectAllPages(({ page, limit }) => payload.find({
      collection: 'user-progress', depth: 0, select: { lesson: true }, sort: 'id', page, limit,
      where: { user: { equals: user.id }, isCompleted: { equals: true } },
    }), { label: `уникальные пройденные уроки ${user.id}` }),
    payload.find({
      collection: 'user-achievements',
      where: { user: { equals: user.id } },
      depth: 2,
      sort: '-unlockedAt',
      limit: 20,
    }),
    payload.find({
      collection: 'points-transactions',
      where: { user: { equals: user.id } },
      sort: '-createdAt',
      limit: 10,
    }),
    collectAllPages(
      ({ page, limit }) =>
        payload.find({
          collection: 'achievements',
          where: { isActive: { equals: true } },
          sort: 'id',
          page,
          limit,
        }),
      { label: 'активные достижения' },
    ),
    collectAllPages(
      ({ page, limit }) =>
        payload.find({
          collection: 'user-achievements',
          where: { user: { equals: user.id } },
          select: { achievement: true },
          depth: 0,
          sort: 'id',
          page,
          limit,
        }),
      { label: `достижения пользователя ${user.id}` },
    ),
    payload.find({
      collection: 'user-trainer-progress',
      where: { user: { equals: user.id }, isCompleted: { equals: true }, verifiedBy: { equals: 'server' } },
      limit: 0,
    }),
    // Сертификаты подтверждаются полной программой курса, а не ручным бонусом.
    collectAllPages(
      ({ page, limit }) =>
        payload.find({
          collection: 'certificates',
          where: { user: { equals: user.id } },
          select: { type: true, relatedEntity: true },
          depth: 0,
          sort: 'id',
          page,
          limit,
        }),
      { label: `бонусы за завершение ${user.id}` },
    ),
    payload.find({ collection: 'streaks', where: { user: { equals: user.id } }, depth: 0, limit: 1 }),
  ])

  // Отдельно от счётчиков выше: календарю нужны даты, а не только количество.
  const now = new Date()
  const since = activityStart(now).toISOString()
  const [lessonDone, tasksDone] = await Promise.all([
    collectAllPages(
      ({ page, limit }) =>
        payload.find({
          collection: 'user-progress',
          where: { user: { equals: user.id }, isCompleted: { equals: true }, completedAt: { greater_than_equal: since } },
          select: { completedAt: true },
          depth: 0,
          sort: 'id',
          page,
          limit,
        }),
      { label: `активность по урокам ${user.id}` },
    ),
    collectAllPages(
      ({ page, limit }) =>
        payload.find({
          collection: 'user-trainer-progress',
          where: { user: { equals: user.id }, isCompleted: { equals: true }, completedAt: { greater_than_equal: since } },
          select: { completedAt: true },
          depth: 0,
          sort: 'id',
          page,
          limit,
        }),
      { label: `активность в тренажёре ${user.id}` },
    ),
  ])
  const activity = activityGrid(
    countByDay(
      lessonDone.map((p) => p.completedAt),
      tasksDone.map((p) => p.completedAt),
    ),
    now,
  )

  const entityIds = (type: string) =>
    new Set(completionBonuses.filter((t) => t.type === type && t.relatedEntity).map((t) => String(t.relatedEntity)))
  const completedCourseIds = entityIds('course')
  const completedRoadmapIds = entityIds('roadmap')
  const goals = nearestGoals(
    activeAchievements,
    new Set(unlockedDocs.map((u) => String(typeof u.achievement === 'object' ? u.achievement.id : u.achievement))),
    {
      lessons: new Set(progressData.map(progress => String(typeof progress.lesson === 'object' ? progress.lesson.id : progress.lesson))).size,
      courses: completedCourseIds.size,
      roadmaps: completedRoadmapIds.size,
      trainerTasks: trainerSolved.totalDocs,
      points: user.totalPoints ?? 0,
      streakDays: streakView(streaks.docs[0]).days,
      completedCourseIds,
      completedRoadmapIds,
    },
  )

  const telegram = profile.telegram && /^https:\/\/t\.me\/[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(profile.telegram) ? profile.telegram : null

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Профиль */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
          {profile.avatar && typeof profile.avatar === 'object' && profile.avatar.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar.url}
              alt="Аватар"
              className="h-20 w-20 rounded-2xl object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary">
              {profile.firstName?.[0]}
              {profile.lastName?.[0]}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="break-words text-xl font-bold text-foreground sm:text-2xl">
              {profile.firstName} {profile.lastName}
            </h1>
            <p className="break-all text-sm text-muted-foreground">{profile.email}</p>
            {telegram && (
              <a href={telegram} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center break-all text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                Telegram: @{telegram.split('/').at(-1)}
              </a>
            )}
            {profile.bio && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{profile.bio}</p>}
            <Link
              href="/profile/edit"
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Настроить профиль
            </Link>
          </div>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-info/10">
            <BookOpen className="h-6 w-6 text-info" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{new Set(progressData.map(progress => String(typeof progress.lesson === 'object' ? progress.lesson.id : progress.lesson))).size}</p>
            <p className="text-sm text-muted-foreground">Уроков пройдено</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10">
            <Star className="h-6 w-6 text-warning" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{user.totalPoints ?? 0}</p>
            <p className="text-sm text-muted-foreground">Баллов</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10">
            <Trophy className="h-6 w-6 text-success" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{achievementsData.totalDocs}</p>
            <p className="text-sm text-muted-foreground">Достижений</p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground">Активность</h2>
        <div className="mt-4 rounded-xl border border-border bg-card p-5">
          <ActivityCalendar grid={activity} />
        </div>
      </div>

      {/* Ближайшие цели: видно, что осталось до следующей награды */}
      {goals.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground">Ближайшие достижения</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {goals.map((goal) => (
              <div key={goal.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
                <div className="flex items-start gap-2">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <p className="flex-1 text-sm font-medium text-foreground">{goal.title}</p>
                  {goal.pointsReward > 0 && <span className="text-xs font-medium text-warning">+{goal.pointsReward}</span>}
                </div>
                {goal.description && <p className="text-xs text-muted-foreground">{goal.description}</p>}
                <div
                  className="mt-auto h-1.5 rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={goal.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Прогресс к достижению «${goal.title}»`}
                >
                  <div className="h-full rounded-full bg-primary" style={{ width: `${goal.percent}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {goal.remaining} · {goal.current}/{goal.target}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Достижения */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Достижения</h2>
        {achievementsData.docs.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{achievement.title}</p>
                    <p className="text-xs text-muted-foreground">{achievement.description}</p>
                    {ua.unlockedAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(ua.unlockedAt)}
                      </p>
                    )}
                  </div>
                  {achievement.pointsReward && achievement.pointsReward > 0 && (
                    <span className="text-sm font-medium text-warning">
                      +{achievement.pointsReward}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Пока нет достижений. Продолжай учиться!
          </p>
        )}
      </div>

      {/* Последние начисления баллов */}
      {recentTransactions.docs.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground">История баллов</h2>
          <div className="mt-4 space-y-2">
            {recentTransactions.docs.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
              >
                <div>
                  <p className="text-sm text-foreground">{tx.description ?? tx.reason}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    tx.amount > 0 ? 'text-success' : 'text-destructive'
                  }`}
                >
                  {tx.amount > 0 ? '+' : ''}
                  {tx.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
