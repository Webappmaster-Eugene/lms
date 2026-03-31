'use client'

import { useState } from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Props = {
  lessonId: string
  isCompleted: boolean
  progressId?: string
}

export function CompletionButton({ lessonId, isCompleted: initialCompleted, progressId }: Props) {
  const [completed, setCompleted] = useState(initialCompleted)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function toggleCompletion() {
    setLoading(true)
    setError('')

    try {
      if (progressId && completed) {
        // Снять отметку
        await fetch(`/api/user-progress/${progressId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            isCompleted: false,
            completedAt: null,
          }),
        })
        setCompleted(false)
      } else if (progressId && !completed) {
        // Отметить пройденным (update existing)
        await fetch(`/api/user-progress/${progressId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            isCompleted: true,
            completedAt: new Date().toISOString(),
          }),
        })
        setCompleted(true)
      } else {
        // Создать запись прогресса
        await fetch('/api/user-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            lesson: lessonId,
            isCompleted: true,
            completedAt: new Date().toISOString(),
            lastAccessedAt: new Date().toISOString(),
          }),
        })
        setCompleted(true)
      }

      router.refresh()
    } catch (err) {
      console.error('Failed to toggle completion:', err)
      setCompleted(initialCompleted) // Откатываем UI к исходному состоянию
      setError('Не удалось обновить прогресс. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={toggleCompletion}
        disabled={loading}
        className={`flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-colors ${
          completed
            ? 'bg-success/10 text-success hover:bg-success/20'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        } disabled:opacity-50`}
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : completed ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
        {completed ? 'Урок пройден' : 'Отметить пройденным'}
      </button>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}
