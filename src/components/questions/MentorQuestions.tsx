'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'

import { StatusBadge } from '@/components/lesson/LessonComments'
import { ChatMessage } from '@/components/questions/ChatMessage'
import { MessageComposer, type ComposerAction } from '@/components/questions/MessageComposer'
import { MessageContent, type TimestampTarget } from '@/components/questions/MessageContent'
import { useToast } from '@/components/ui/Toast'
import { authorName, isMentorReply, threadStatus, STATUS_LABELS, type ThreadStatus } from '@/lib/comment-threads'
import type { QuestionThread } from '@/lib/questions'
import { cn } from '@/lib/utils'

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

const REPLY: ComposerAction[] = [
  { id: 'reply', label: 'Ответить', busyLabel: 'Отправляем…' },
  { id: 'reply-resolve', label: 'Ответить и закрыть', busyLabel: 'Отправляем…', secondary: true },
]

function MentorThread({ thread, status }: { thread: QuestionThread; status: ThreadStatus }) {
  const { question, replies, lesson } = thread
  const [resolving, setResolving] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const timestamps = useMemo<TimestampTarget>(() => (lesson ? { kind: 'link', lessonSlug: lesson.slug } : null), [lesson])

  async function reply(text: string, action: string) {
    try {
      await send('/api/comments', 'POST', { content: text, parentComment: Number(question.id) })
    } catch (error) {
      console.error('Не удалось отправить ответ', error)
      toast('Не удалось отправить ответ', 'error')
      return false
    }
    if (action === 'reply-resolve') {
      try {
        await send(`/api/comments/${question.id}`, 'PATCH', { isResolved: true })
        toast('Ответ отправлен, вопрос закрыт', 'success')
      } catch (error) {
        // Ответ уже у ученика - поле очищаем, а закрыть можно ещё раз кнопкой.
        console.error('Не удалось закрыть вопрос после ответа', error)
        toast('Ответ отправлен, но вопрос закрыть не удалось', 'error')
      }
    } else {
      toast('Ответ отправлен - ученик получит уведомление', 'success')
    }
    router.refresh()
    return true
  }

  async function resolve() {
    setResolving(true)
    try {
      await send(`/api/comments/${question.id}`, 'PATCH', { isResolved: true })
      toast('Вопрос закрыт', 'success')
      router.refresh()
    } catch (error) {
      console.error('Не удалось закрыть вопрос', error)
      toast('Не удалось закрыть вопрос', 'error')
    } finally {
      setResolving(false)
    }
  }

  return (
    <li id={`comment-${question.id}`} className="scroll-mt-24 space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {lesson ? (
          <Link
            href={`/lessons/${lesson.slug}#comment-${question.id}`}
            className="min-w-0 text-sm font-medium text-muted-foreground [overflow-wrap:anywhere] hover:text-foreground"
          >
            {lesson.title}
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">Урок снят с публикации</span>
        )}
        <StatusBadge status={status} />
      </div>

      <ChatMessage comment={question} mentor={false}>
        <MessageContent content={question.content} timestamps={timestamps} />
      </ChatMessage>

      {replies.length > 0 && (
        <ul className="space-y-3 border-t border-border pt-3">
          {replies.map((r) => {
            const mentor = isMentorReply(r, question)
            return (
              <li key={r.id} className={cn(mentor && '-mx-2 rounded-lg bg-primary/5 p-2')}>
                <ChatMessage comment={r} mentor={mentor}>
                  <MessageContent content={r.content} timestamps={timestamps} />
                </ChatMessage>
              </li>
            )
          })}
        </ul>
      )}

      {status !== 'resolved' && (
        <MessageComposer
          label={`Ответ ученику ${authorName(question.user)}`}
          placeholder="Ответ ученику…"
          draftKey={`mentor:thread:${question.id}`}
          actions={REPLY}
          onSubmit={reply}
          timestamps={timestamps}
          extra={(
            <button
              type="button"
              onClick={resolve}
              disabled={resolving}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Отметить решённым
            </button>
          )}
        />
      )}
    </li>
  )
}
