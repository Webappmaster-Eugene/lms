'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Send } from 'lucide-react'

import { StatusBadge } from '@/components/lesson/LessonComments'
import { useToast } from '@/components/ui/Toast'
import { authorName, isMentorReply, threadStatus, STATUS_LABELS, type ThreadStatus } from '@/lib/comment-threads'
import type { QuestionThread } from '@/lib/questions'
import { cn, formatDate } from '@/lib/utils'

type Filter = 'all' | ThreadStatus

const FILTERS: Filter[] = ['waiting', 'answered', 'resolved', 'all']
const FILTER_LABELS: Record<Filter, string> = { all: 'Все', ...STATUS_LABELS }

async function send(url: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}`)
}

/**
 * Вопросы учеников для ментора: сначала ждущие ответа, ответ и «решён» —
 * прямо здесь, без админки Payload.
 */
export function MentorQuestions({ threads }: { threads: QuestionThread[] }) {
  const [filter, setFilter] = useState<Filter>('waiting')
  const withStatus = useMemo(() => threads.map((t) => ({ thread: t, status: threadStatus(t) })), [threads])
  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: threads.length, answered: 0, waiting: 0, resolved: 0 }
    for (const { status } of withStatus) result[status] += 1
    return result
  }, [threads.length, withStatus])
  // Ждущие — самые давние сверху: им дольше всех без ответа.
  const shown = withStatus
    .filter(({ status }) => filter === 'all' || status === filter)
    .sort((a, b) =>
      filter === 'waiting' ? a.thread.question.createdAt.localeCompare(b.thread.question.createdAt) : 0,
    )

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
            {FILTER_LABELS[f]} <span className="tabular-nums">{counts[f]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          {filter === 'waiting' ? 'Все вопросы отвечены' : 'Таких вопросов нет'}
        </p>
      ) : (
        <ul className="space-y-4">
          {shown.map(({ thread, status }) => (
            <MentorThread key={thread.question.id} thread={thread} status={status} />
          ))}
        </ul>
      )}
    </div>
  )
}

function MentorThread({ thread, status }: { thread: QuestionThread; status: ThreadStatus }) {
  const { question, replies, lesson } = thread
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'reply' | 'resolve' | null>(null)
  const router = useRouter()
  const { toast } = useToast()

  async function reply() {
    if (!text.trim()) return
    setBusy('reply')
    try {
      await send('/api/comments', 'POST', { content: text, parentComment: Number(question.id) })
      setText('')
      toast('Ответ отправлен — ученик получит уведомление', 'success')
      router.refresh()
    } catch (error) {
      console.error('Не удалось отправить ответ', error)
      toast('Не удалось отправить ответ', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function resolve() {
    setBusy('resolve')
    try {
      await send(`/api/comments/${question.id}`, 'PATCH', { isResolved: true })
      toast('Вопрос закрыт', 'success')
      router.refresh()
    } catch (error) {
      console.error('Не удалось закрыть вопрос', error)
      toast('Не удалось закрыть вопрос', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <li id={`comment-${question.id}`} className="scroll-mt-24 space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium text-foreground">{authorName(question.user)}</p>
          {lesson ? (
            <Link
              href={`/lessons/${lesson.slug}#comment-${question.id}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {lesson.title}
            </Link>
          ) : (
            <span className="text-sm text-muted-foreground">Урок снят с публикации</span>
          )}
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">{formatDate(question.createdAt)}</p>
        <p className="whitespace-pre-wrap text-sm text-foreground">{question.content}</p>
      </div>

      {replies.length > 0 && (
        <ul className="space-y-2 border-l-2 border-border pl-4">
          {replies.map((r) => (
            <li key={r.id} className={cn('text-sm', isMentorReply(r, question) && '-ml-2 rounded-md bg-primary/5 p-2')}>
              <span className="font-medium text-foreground">{authorName(r.user)}</span>
              <span className="text-xs text-muted-foreground"> · {formatDate(r.createdAt)}</span>
              <p className="whitespace-pre-wrap text-foreground">{r.content}</p>
            </li>
          ))}
        </ul>
      )}

      {status !== 'resolved' && (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                void reply()
              }
            }}
            aria-label={`Ответ ученику ${authorName(question.user)}`}
            placeholder="Ответ ученику… (Ctrl/⌘+Enter — отправить)"
            maxLength={2000}
            rows={3}
            className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={resolve}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {busy === 'resolve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Отметить решённым
            </button>
            <button
              type="button"
              onClick={reply}
              disabled={busy !== null || !text.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {busy === 'reply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Ответить
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
