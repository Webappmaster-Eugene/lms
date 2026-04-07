'use client'

import { useEffect, useState } from 'react'
import { Map, ArrowLeft, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type RoadmapItem = {
  id: number
  title: string
  slug: string
  isPublished: boolean | null
  order: number | null
}

export function RoadmapSelector() {
  const [roadmaps, setRoadmaps] = useState<RoadmapItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch('/api/roadmaps?limit=100&sort=order&depth=0', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Ошибка загрузки роадмапов')
        return res.json()
      })
      .then((json: { docs: RoadmapItem[] }) => {
        if (!cancelled) setRoadmaps(json.docs)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <a
        href="/admin"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Панель управления
      </a>

      <div>
        <h1 className="text-xl font-bold text-foreground">Визуальный редактор роадмапов</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Выберите роадмап для визуального редактирования узлов и связей
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {!isLoading && !error && roadmaps.length === 0 && (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Роадмапы не найдены. Создайте роадмап в{' '}
          <a href="/admin/collections/roadmaps/create" className="text-primary hover:underline">
            коллекции
          </a>.
        </div>
      )}

      <div className="grid gap-3">
        {roadmaps.map((roadmap) => (
          <a
            key={roadmap.id}
            href={`/admin/roadmap-editor/${roadmap.id}`}
            className={cn(
              'flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/50',
            )}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Map className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground truncate">{roadmap.title}</h3>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span>/{roadmap.slug}</span>
                {roadmap.isPublished ? (
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                    Опубликован
                  </span>
                ) : (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    Черновик
                  </span>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
