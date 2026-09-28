import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { Star } from 'lucide-react'
import { NotificationsBell } from './NotificationsBell'
import { SearchBar } from './SearchBar'
import { MobileSearchOverlay } from './MobileSearchOverlay'
import { streakView } from '@/lib/streak'

export async function Header() {
  const payload = await getPayload()
  const headersList = await headers()

  let isAuthenticated = false
  let userName = ''
  let totalPoints = 0
  let streakDays = 0

  try {
    const { user } = await payload.auth({ headers: headersList })
    if (user) {
      isAuthenticated = true
      userName = `${user.firstName} ${user.lastName}`
      totalPoints = user.totalPoints ?? 0

      // Загружаем streak
      try {
        const streakResult = await payload.find({
          collection: 'streaks',
          where: { user: { equals: user.id } },
          limit: 1,
        })
        streakDays = streakView(streakResult.docs[0]).days
      } catch (error) {
        // Шапка есть на каждой странице: без серии она показывается дальше.
        console.error('Шапка: не удалось загрузить серию', error)
      }
    }
  } catch (error) {
    console.error('Шапка: не удалось определить пользователя', error)
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-sm lg:px-8">
      {/* Search — desktop inline, mobile icon+overlay */}
      <div className="hidden flex-1 lg:block lg:max-w-md">
        <SearchBar hotkey />
      </div>
      <MobileSearchOverlay />

      {/* Spacer on mobile to push items right */}
      <div className="flex-1 lg:hidden" />

      {/* Right side */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Streak */}
        {streakDays > 0 && (
          <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-[hsl(var(--streak)_/_0.1)] px-3 py-1.5 text-sm font-medium text-[hsl(var(--streak))]">
            🔥 {streakDays}
          </div>
        )}

        {/* Points */}
        {userName && (
          <div className="flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1.5 text-sm font-medium text-warning sm:px-3">
            <Star className="h-4 w-4" />
            {totalPoints}
          </div>
        )}

        {/* Notifications — только для вошедших: колокольчик опрашивает закрытую
            коллекцию по таймеру, и без сессии это бесконечные 403 */}
        {isAuthenticated && <NotificationsBell />}

        {/* User name */}
        {userName && (
          <span className="hidden sm:block text-sm font-medium text-foreground">{userName}</span>
        )}
      </div>
    </header>
  )
}
