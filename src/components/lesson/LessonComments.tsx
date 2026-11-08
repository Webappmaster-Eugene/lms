'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { CheckCircle2, CornerDownRight, Loader2, MessageSquare, Pencil, Trash2 } from 'lucide-react'
import { useAsyncData } from '@/hooks/use-async-data'
import { useHydrated } from '@/hooks/use-hydrated'
import { usePageHasVideo } from '@/hooks/use-page-has-video'
import { useToast } from '@/components/ui/Toast'
import { ChatMessage } from '@/components/questions/ChatMessage'
import { MessageComposer, type ComposerAction } from '@/components/questions/MessageComposer'
import { MessageContent, type TimestampTarget } from '@/components/questions/MessageContent'
import { markAnswersRead } from '@/lib/answer-notifications'
import { authorId, groupThreads, isMentorReply, threadStatus, STATUS_LABELS, type CommentDoc, type Thread, type ThreadStatus } from '@/lib/comment-threads'
import { cn } from '@/lib/utils'

type Props = {
  /** Числовой id — Payload отвергает строковые id в relationship-полях. */
  lessonId: number
  userId?: number
}

const PAGE_SIZE = 100
/** Предохранитель от бесконечного цикла, а не лимит: столько страниц вопросов к одному уроку не бывает. */
const MAX_PAGES = 20

type Loaded = { threads: Thread[]; failed: boolean }

const ASK: ComposerAction[] = [{ id: 'send', label: 'Отправить', ariaLabel: 'Отправить вопрос', busyLabel: 'Отправляем…', busyAriaLabel: 'Отправляем вопрос' }]
const CLARIFY: ComposerAction[] = [{ id: 'send', label: 'Отправить', ariaLabel: 'Отправить уточнение', busyLabel: 'Отправляем…', busyAriaLabel: 'Отправляем уточнение' }]
const SAVE: ComposerAction[] = [{ id: 'save', label: 'Сохранить', busyLabel: 'Сохраняем…' }]

async function request(url: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}`)
}

export function LessonComments({ lessonId, userId }: Props) {
  const hydrated = useHydrated()
  const { toast } = useToast()

  const loadComments = useCallback(
    async (signal: AbortSignal): Promise<Loaded> => {
      try {
        // Сервер отдаёт ученику только его ветки — вопросы и ответы на них.
        const all: CommentDoc[] = []
        for (let page = 1; page <= MAX_PAGES; page += 1) {
          const res = await fetch(
            `/api/comments?where[lesson][equals]=${lessonId}&sort=createdAt&limit=${PAGE_SIZE}&page=${page}&depth=1`,
            { credentials: 'include', signal },
          )
          if (!res.ok) throw new Error(`GET /api/comments → ${res.status}`)
          const data = (await res.json()) as { docs?: CommentDoc[]; hasNextPage?: boolean }
          all.push(...(data.docs ?? []))
          if (!data.hasNextPage) break
        }
        return { threads: groupThreads(all), failed: false }
      } catch (error) {
        if (signal.aborted) throw error
        console.error('Не удалось загрузить вопросы к уроку', error)
        return { threads: [], failed: true }
      }
    },
    [lessonId],
  )

  const { data, loading, reload } = useAsyncData<Loaded>(loadComments, { threads: [], failed: false })
  const { threads, failed } = data

  // Ответ на экране — уведомление о нём больше не нужно.
  const hasAnswers = threads.some((t) => t.replies.some((r) => isMentorReply(r, t.question)))
  useEffect(() => {
    if (hasAnswers) void markAnswersRead(`${window.location.pathname}#comment-`)
  }, [hasAnswers])

  // Ссылка из уведомления «Ответ на ваш вопрос» ведёт на #comment-<id>, а ветки
  // появляются после загрузки — браузер сам к ним не прокрутит.
  useEffect(() => {
    if (loading || !window.location.hash.startsWith('#comment-')) return
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'center' })
  }, [loading])

  // Таймкоды в переписке перематывают видео урока, если оно есть.
  const hasVideo = usePageHasVideo()
  const timestamps = useMemo<TimestampTarget>(() => (hasVideo ? { kind: 'seek' } : null), [hasVideo])

  async function ask(text: string) {
    try {
      await request('/api/comments', 'POST', { lesson: lessonId, content: text })
      toast('Вопрос отправлен ментору', 'success')
      reload()
      return true
    } catch (error) {
      console.error('Не удалось отправить вопрос', error)
      toast('Не удалось отправить вопрос', 'error')
      return false
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <MessageSquare className="h-5 w-5" />
          Вопросы к уроку
          {threads.length > 0 && <span className="text-sm font-normal text-muted-foreground">({threads.length})</span>}
        </h3>
        <p className="text-sm text-muted-foreground">Вопросы видите только вы и ментор. Ответ придёт уведомлением.</p>
      </div>

      <MessageComposer
        label="Вопрос к уроку"
        placeholder="Что осталось непонятным?"
        draftKey={`${userId ?? 'guest'}:lesson:${lessonId}`}
        disabled={!hydrated}
        actions={ASK}
        onSubmit={ask}
        guide
        videoTime
        timestamps={timestamps}
      />

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : failed ? (
        <p role="alert" className="py-6 text-center text-sm text-destructive">
          Не удалось загрузить вопросы - обновите страницу
        </p>
      ) : threads.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Вопросов пока нет.</p>
      ) : (
        <ul className="space-y-4">
          {threads.map((thread) => (
            <ThreadItem key={thread.question.id} thread={thread} lessonId={lessonId} userId={userId} timestamps={timestamps} onPosted={reload} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ThreadItem({ thread, lessonId, userId, timestamps, onPosted }: {
  thread: Thread
  lessonId: number
  userId?: number
  timestamps: TimestampTarget
  onPosted: () => void
}) {
  const { question, replies } = thread
  const status = threadStatus(thread)
  const [replying, setReplying] = useState(false)
  const [resolving, setResolving] = useState(false)
  const { toast } = useToast()
  const mine = userId !== undefined && authorId(question.user) === String(userId)

  async function clarify(text: string) {
    try {
      await request('/api/comments', 'POST', { lesson: lessonId, content: text, parentComment: Number(question.id) })
      setReplying(false)
      toast('Уточнение отправлено', 'success')
      onPosted()
      return true
    } catch (error) {
      console.error('Не удалось отправить уточнение', error)
      toast('Не удалось отправить уточнение', 'error')
      return false
    }
  }

  async function resolve() {
    setResolving(true)
    try {
      await request(`/api/comments/${question.id}`, 'PATCH', { isResolved: true })
      toast('Вопрос закрыт. Если что-то снова неясно - напишите уточнение', 'success')
      onPosted()
    } catch (error) {
      console.error('Не удалось закрыть вопрос', error)
      toast('Не удалось закрыть вопрос', 'error')
    } finally {
      setResolving(false)
    }
  }

  const actionClass = 'flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50'
  return (
    <li id={`comment-${question.id}`} className="scroll-mt-24 space-y-3 rounded-xl border border-border bg-card p-4">
      <CommentBody comment={question} mentor={false} userId={userId} timestamps={timestamps} onChanged={onPosted}>
        <StatusBadge status={status} />
      </CommentBody>

      {replies.length > 0 && (
        <ul className="space-y-3 border-t border-border pt-3">
          {replies.map((reply) => {
            const mentor = isMentorReply(reply, question)
            return (
              <li key={reply.id} className={cn(mentor && '-mx-2 rounded-lg bg-primary/5 p-2')}>
                <CommentBody comment={reply} mentor={mentor} userId={userId} timestamps={timestamps} onChanged={onPosted}>
                  {/* Профиль ментора ученику обычно не виден - тогда «Ментор» уже стоит вместо имени. */}
                  {mentor && reply.user && typeof reply.user === 'object' && <Badge className="bg-primary/10 text-foreground">Ментор</Badge>}
                </CommentBody>
              </li>
            )
          })}
        </ul>
      )}

      {replying ? (
        <div className="border-t border-border pt-3">
          <MessageComposer
            label="Уточнение к вопросу"
            placeholder={status === 'resolved' ? 'Уточнение снова откроет вопрос' : 'Что ещё неясно?'}
            draftKey={`${userId ?? 'guest'}:thread:${question.id}`}
            autoFocus
            actions={CLARIFY}
            onSubmit={clarify}
            onCancel={() => setReplying(false)}
            videoTime
            timestamps={timestamps}
          />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setReplying(true)} className={actionClass}>
            <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
            Уточнить
          </button>
          {mine && status === 'answered' && !question.deletedAt && (
            <button type="button" onClick={() => void resolve()} disabled={resolving} className={actionClass}>
              {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />}
              Вопрос решён
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function CommentBody({ comment, mentor, userId, timestamps, onChanged, children }: {
  comment: CommentDoc
  mentor: boolean
  userId?: number
  timestamps: TimestampTarget
  onChanged: () => void
  children?: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const { toast } = useToast()
  const mine = userId !== undefined && authorId(comment.user) === String(userId)

  async function mutate(content: string | null): Promise<boolean> {
    const remove = content === null
    setPending(true)
    setError('')
    try {
      const res = await fetch(`/api/comments/${comment.id}${remove ? '/remove' : ''}`, {
        method: remove ? 'DELETE' : 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...(remove ? {} : { body: JSON.stringify({ content }) }),
      })
      if (!res.ok) throw new Error(`Изменение комментария → ${res.status}`)
      setEditing(false)
      setConfirming(false)
      toast(remove ? 'Комментарий удалён' : 'Комментарий изменён', 'success')
      onChanged()
      return true
    } catch (err) {
      console.error('Не удалось изменить комментарий', err)
      setError(remove ? 'Не удалось удалить комментарий. Попробуйте ещё раз.' : 'Не удалось сохранить изменения. Ваш текст остался в поле - попробуйте ещё раз.')
      return false
    } finally {
      setPending(false)
    }
  }

  function cancel() {
    setEditing(false)
    setConfirming(false)
    setError('')
  }

  const iconClass = 'flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
  const buttonClass = 'min-h-11 rounded-md px-2 text-sm font-medium hover:bg-muted disabled:opacity-50'
  const canChange = mine && !comment.deletedAt && !editing && !confirming
  return (
    <ChatMessage
      comment={comment}
      mentor={mentor}
      badges={children}
      actions={canChange && (
        <>
          <button type="button" aria-label="Изменить" title="Изменить" className={iconClass} onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Удалить" title="Удалить" className={iconClass} onClick={() => setConfirming(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      )}
    >
      {editing ? (
        <MessageComposer
          label="Текст комментария"
          initialValue={comment.content}
          autoFocus
          actions={SAVE}
          onSubmit={(text) => mutate(text)}
          onCancel={cancel}
          videoTime
          timestamps={timestamps}
        />
      ) : comment.deletedAt ? (
        <p className="text-sm italic text-muted-foreground">(Комментарий удалён)</p>
      ) : (
        <MessageContent content={comment.content} timestamps={timestamps} />
      )}
      {confirming && (
        <div role="alertdialog" aria-label="Удалить комментарий?" className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm text-foreground">Удалить комментарий? Его текст исчезнет. Ответы и уточнения в ветке сохранятся. Отменить удаление нельзя.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={cn(buttonClass, 'text-destructive')} onClick={() => void mutate(null)} disabled={pending}>{pending ? 'Удаляем…' : 'Подтвердить удаление'}</button>
            <button type="button" autoFocus className={buttonClass} onClick={cancel} disabled={pending}>Отмена</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </ChatMessage>
  )
}

export function StatusBadge({ status }: { status: ThreadStatus }) {
  if (status === 'resolved') {
    return (
      <Badge className="bg-success/10 text-foreground">
        <CheckCircle2 className="h-3 w-3 text-success" aria-hidden="true" />
        {STATUS_LABELS.resolved}
      </Badge>
    )
  }
  return (
    <Badge className={status === 'answered' ? 'bg-info/10 text-foreground' : 'bg-muted text-muted-foreground'}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-normal', className)}>
      {children}
    </span>
  )
}
