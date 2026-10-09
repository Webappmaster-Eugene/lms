import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { Star } from 'lucide-react'
import { NotificationsBell } from './NotificationsBell'
import { SearchBar } from './SearchBar'
import { MobileSearchOverlay } from './MobileSearchOverlay'
import { streakView } from '@/lib/streak'

export async function Header({ trainerEnabled = true }: { trainerEnabled?: boolean } = {}) {
  const payload = await getPayload()
  const headersList = await headers()

  let isAuthenticated = false
  let userId: number | undefined
  let userName = ''
  let totalPoints = 0
  let streakDays = 0

  try {
    const { user } = await payload.auth({ headers: headersList })
    if (user) {
      isAuthenticated = true
      userId = user.id
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
    <header className="sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top,0px))] shrink-0 items-center gap-3 border-b border-border bg-card/80 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[env(safe-area-inset-top,0px)] backdrop-blur-sm lg:h-16 lg:px-8 lg:pt-0">
      {/* Search — desktop inline, mobile icon+overlay */}
      <div className="hidden flex-1 lg:block lg:max-w-md">
        <SearchBar hotkey trainerEnabled={trainerEnabled} />
      </div>
      <MobileSearchOverlay trainerEnabled={trainerEnabled} />

      {/* Spacer on mobile to push items right */}
      <div className="flex-1 lg:hidden" />

      {/* Right side */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Streak */}
        {streakDays > 0 && (
          <div title="Серия занятий: учебные дни считаются по UTC" className="hidden sm:flex items-center gap-1.5 rounded-full bg-[hsl(var(--streak)_/_0.1)] px-3 py-1.5 text-sm font-medium text-[hsl(var(--streak))]">
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
        {isAuthenticated && <NotificationsBell userId={userId} />}

        {/* User name */}
        {userName && (
          <span className="hidden max-w-48 truncate text-sm font-medium text-foreground sm:block" title={userName}>{userName}</span>
        )}
      </div>
    </header>
  )
}
