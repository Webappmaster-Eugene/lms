import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { Star, Trophy } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Лидерборд',
}

export default async function LeaderboardPage() {
  const payload = await getPayload()
  const headersList = await headers()
  const { user: currentUser } = await payload.auth({ headers: headersList })

  // Загружаем всех активных студентов, сортируем по баллам
  const users = await payload.find({
    collection: 'users',
    where: {
      role: { equals: 'student' },
      isActive: { equals: true },
    },
    sort: '-totalPoints',
    limit: 50,
  })

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Лидерборд</h1>

      <div className="space-y-2">
        {users.docs.map((user, index) => {
          const position = index + 1
          const isCurrentUser = currentUser?.id === user.id

          return (
            <div
              key={user.id}
              className={`flex items-center gap-4 rounded-xl border p-4 transition-colors ${
                isCurrentUser
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border bg-card'
              }`}
            >
              {/* Позиция */}
              <div className="flex h-10 w-10 items-center justify-center">
                {position <= 3 ? (
                  <Trophy
                    className={`h-6 w-6 ${
                      position === 1
                        ? 'text-[hsl(var(--gold))]'
                        : position === 2
                          ? 'text-[hsl(var(--silver))]'
                          : 'text-[hsl(var(--bronze))]'
                    }`}
                  />
                ) : (
                  <span className="text-lg font-bold text-muted-foreground">{position}</span>
                )}
              </div>

              {/* Имя */}
              <div className="flex-1">
                <p className="font-medium text-foreground">
                  {user.firstName} {user.lastName}
                  {isCurrentUser && (
                    <span className="ml-2 text-xs text-muted-foreground">(вы)</span>
                  )}
                </p>
              </div>

              {/* Баллы */}
              <div className="flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1.5 text-sm font-semibold text-warning">
                <Star className="h-4 w-4" />
                {user.totalPoints ?? 0}
              </div>
            </div>
          )
        })}

        {users.docs.length === 0 && (
          <p className="text-center text-muted-foreground py-12">Пока нет участников</p>
        )}
      </div>
    </div>
  )
}
