'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Circle, Loader2, PartyPopper, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { VIDEO_ENDED_EVENT } from '@/lib/video-memory'

type Props = {
  /** Числовой id — Payload отвергает строковые id в relationship-полях. */
  lessonId: number
  isCompleted: boolean
  progressId?: string
  /** Следующий урок курса — к нему ведёт кнопка сразу после отметки. */
  next?: { slug: string; title: string } | null
  /** Остальные уроки курса уже пройдены: отметка этого завершает курс. */
  completesCourse?: boolean
  courseHref?: string | null
}

/** Прогресс важнее плавности UI: неуспешный ответ должен всплыть, а не потеряться. */
async function send(url: string, init: RequestInit): Promise<void> {
  const response = await fetch(url, { credentials: 'include', ...init })
  if (!response.ok) {
    throw new Error(`${init.method ?? 'POST'} ${url} → ${response.status}`)
  }
}

export function CompletionButton({
  lessonId,
  isCompleted: initialCompleted,
  progressId,
  next = null,
  completesCourse = false,
  courseHref = null,
}: Props) {
  const [completed, setCompleted] = useState(initialCompleted)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  // Видео досмотрено, а кнопка — внизу страницы: предлагаем отметить урок прямо здесь.
  const [prompt, setPrompt] = useState(false)

  useEffect(() => {
    const onEnded = () => setPrompt(true)
    window.addEventListener(VIDEO_ENDED_EVENT, onEnded)
    return () => window.removeEventListener(VIDEO_ENDED_EVENT, onEnded)
  }, [])

  async function toggleCompletion() {
    setLoading(true)
    setError('')

    try {
      if (progressId && completed) {
        // Снять отметку
        await send(`/api/user-progress/${progressId}`, {
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
        await send(`/api/user-progress/${progressId}`, {
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
        await send('/api/user-progress', {
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

  const showPrompt = prompt && (!completed || (next !== null && !loading))

  return (
    <div className="flex flex-col items-center gap-2">
      {showPrompt && (
        <div
          role="dialog"
          aria-label="Видео досмотрено"
          className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-xl sm:inset-x-auto sm:right-6 sm:bottom-6"
        >
          <div className="min-w-0 flex-1 text-sm">
            {completed && next ? (
              <Link href={`/lessons/${next.slug}`} className="flex items-center gap-2 font-medium text-foreground hover:text-primary">
                <span className="truncate">Дальше: {next.title}</span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
            ) : (
              <>
                <p className="font-medium text-foreground">Видео досмотрено</p>
                <p className="text-muted-foreground">Отметить урок пройденным?</p>
              </>
            )}
          </div>
          {!completed && (
            <button
              type="button"
              onClick={toggleCompletion}
              disabled={loading}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Отметить
            </button>
          )}
          <button
            type="button"
            onClick={() => setPrompt(false)}
            aria-label="Закрыть"
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <button
        type="button"
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
      {/* Урок отмечен — дальше один шаг, а не прокрутка до навигации внизу страницы. */}
      {completed && !loading && next && (
        <Link
          href={`/lessons/${next.slug}`}
          className="mt-2 inline-flex max-w-full items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <span className="truncate">Следующий урок: {next.title}</span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
      )}
      {completed && !loading && !next && completesCourse && (
        <div role="status" className="mt-2 flex flex-col items-center gap-2 text-center">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <PartyPopper className="h-5 w-5 text-success" aria-hidden="true" />
            Курс пройден!
          </p>
          {courseHref && (
            <Link href={courseHref} className="text-sm text-primary underline-offset-2 hover:underline">
              Вернуться к курсу
            </Link>
          )}
        </div>
      )}
      {completed && !loading && !next && !completesCourse && courseHref && (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Это последний урок, но в курсе остались непройденные.{' '}
          <Link href={courseHref} className="text-primary underline-offset-2 hover:underline">
            Открыть программу курса
          </Link>
        </p>
      )}
    </div>
  )
}
