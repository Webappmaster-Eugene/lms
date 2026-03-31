import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Award, BookOpen, Flame, Map, Star, Trophy } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Дашборд',
}

export default async function DashboardPage() {
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  if (!user) return null

  // Загружаем данные параллельно
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [roadmaps, progressData, achievementsData, streakData, certificatesData] = await Promise.all([
    payload.find({
      collection: 'roadmaps',
      where: { isPublished: { equals: true } },
      sort: 'order',
      limit: 10,
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
    (payload as any).find({
      collection: 'streaks',
      where: { user: { equals: user.id } },
      limit: 1,
    }),
    (payload as any).find({
      collection: 'certificates',
      where: { user: { equals: user.id } },
      limit: 0,
    }),
  ])

  const completedLessons = progressData.totalDocs
  const streakDays = streakData.docs?.[0]?.currentStreak ?? 0
  const certificatesCount = certificatesData.totalDocs ?? 0

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Приветствие */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Привет, {user.firstName}!
        </h1>
        <p className="mt-1 text-muted-foreground">Продолжай обучение</p>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
            <BookOpen className="h-5 w-5 text-info" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{completedLessons}</p>
            <p className="text-xs text-muted-foreground">Уроков</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
            <Star className="h-5 w-5 text-warning" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{user.totalPoints ?? 0}</p>
            <p className="text-xs text-muted-foreground">Баллов</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--streak)_/_0.1)]">
            <Flame className="h-5 w-5 text-[hsl(var(--streak))]" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{streakDays}</p>
            <p className="text-xs text-muted-foreground">Дней подряд</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
            <Trophy className="h-5 w-5 text-success" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{achievementsData.totalDocs}</p>
            <p className="text-xs text-muted-foreground">Достижений</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Award className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{certificatesCount}</p>
            <p className="text-xs text-muted-foreground">Сертификатов</p>
          </div>
        </div>
      </div>

      {/* Роадмапы */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Роадмапы</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {roadmaps.docs.map((roadmap) => (
            <Link
              key={roadmap.id}
              href={`/roadmaps/${roadmap.slug}`}
              className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50"
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
