'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { MessageSquare } from 'lucide-react'

import { StatusBadge } from '@/components/lesson/LessonComments'
import { markAnswersRead } from '@/lib/answer-notifications'
import { authorName, isMentorReply, threadStatus, STATUS_LABELS, type ThreadStatus } from '@/lib/comment-threads'
import type { QuestionThread } from '@/lib/questions'
import { cn, formatDate, pluralize } from '@/lib/utils'

type Filter = 'all' | ThreadStatus

const FILTERS: Filter[] = ['all', 'answered', 'waiting', 'resolved']
const FILTER_LABELS: Record<Filter, string> = { all: 'Все', ...STATUS_LABELS }

/** Все вопросы ученика по урокам: где ответили, а где ещё ждут. */
export function MyQuestions({ threads }: { threads: QuestionThread[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const withStatus = useMemo(() => threads.map((t) => ({ thread: t, status: threadStatus(t) })), [threads])
  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: threads.length, answered: 0, waiting: 0, resolved: 0 }
    for (const { status } of withStatus) result[status] += 1
    return result
  }, [threads.length, withStatus])
  const shown = withStatus.filter(({ status }) => filter === 'all' || status === filter)

  // Все ответы видны списком — уведомления о них прочитаны.
  const hasAnswers = threads.some((t) => t.replies.some((r) => isMentorReply(r, t.question)))
  useEffect(() => {
    if (hasAnswers) void markAnswersRead('/lessons/')
  }, [hasAnswers])

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="max-w-sm text-muted-foreground">
          Вопросов пока нет. Задать вопрос ментору можно под любым уроком — ответ придёт уведомлением
        </p>
        <Link href="/courses" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
          К курсам
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Статус вопроса">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              filter === f
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {FILTER_LABELS[f]} <span className="opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {pluralize(shown.length, 'вопрос', 'вопроса', 'вопросов')}
      </p>

      <ul className="space-y-3">
        {shown.map(({ thread, status }) => {
          const last = thread.replies.at(-1)
          return (
            <li key={thread.question.id} className="space-y-2 rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {thread.lesson ? (
                  <Link
                    href={`/lessons/${thread.lesson.slug}#comment-${thread.question.id}`}
                    className="font-medium text-foreground hover:text-primary"
                  >
                    {thread.lesson.title}
                  </Link>
                ) : (
                  <span className="font-medium text-muted-foreground">Урок сейчас недоступен</span>
                )}
                <StatusBadge status={status} />
              </div>
              <p className="line-clamp-3 whitespace-pre-wrap text-sm text-foreground">{thread.question.content}</p>
              {last && (
                <p className="line-clamp-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{authorName(last.user)}:</span> {last.content}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {formatDate(thread.question.createdAt)}
                {thread.replies.length > 0 && ` · ${pluralize(thread.replies.length, 'ответ', 'ответа', 'ответов')} в ветке`}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
