import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { Star } from 'lucide-react'
import { NotificationsBell } from './NotificationsBell'
import { SearchBar } from './SearchBar'

export async function Header() {
  const payload = await getPayload()
  const headersList = await headers()

  let userName = ''
  let totalPoints = 0
  let streakDays = 0

  try {
    const { user } = await payload.auth({ headers: headersList })
    if (user) {
      userName = `${user.firstName} ${user.lastName}`
      totalPoints = user.totalPoints ?? 0

      // Загружаем streak
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const streakResult = await (payload as any).find({
          collection: 'streaks',
          where: { user: { equals: user.id } },
          limit: 1,
        })
        if (streakResult.docs?.length > 0) {
          streakDays = streakResult.docs[0].currentStreak ?? 0
        }
      } catch {
        // streak not available yet
      }
    }
  } catch {
    // auth failed
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-card/80 px-6 backdrop-blur-sm lg:px-8">
      {/* Поиск */}
      <div className="flex-1 max-w-md">
        <SearchBar />
      </div>

      {/* Правая часть */}
      <div className="flex items-center gap-3">
        {/* Streak */}
        {streakDays > 0 && (
          <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-[hsl(var(--streak)_/_0.1)] px-3 py-1.5 text-sm font-medium text-[hsl(var(--streak))]">
            🔥 {streakDays}
          </div>
        )}

        {/* Points */}
        {userName && (
          <div className="flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1.5 text-sm font-medium text-warning">
            <Star className="h-4 w-4" />
            {totalPoints}
          </div>
        )}

        {/* Notifications */}
        <NotificationsBell />

        {/* User name */}
        {userName && (
          <span className="hidden sm:block text-sm font-medium text-foreground">{userName}</span>
        )}
      </div>
    </header>
  )
}
