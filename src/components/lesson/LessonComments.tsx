'use client'

import { useState, useCallback, useEffect } from 'react'
import { CheckCircle2, CornerDownRight, Loader2, MessageSquare, Send } from 'lucide-react'
import { useAsyncData } from '@/hooks/use-async-data'
import { useToast } from '@/components/ui/Toast'
import { authorName, groupThreads, isMentorReply, threadStatus, STATUS_LABELS, type CommentDoc, type Thread, type ThreadStatus } from '@/lib/comment-threads'
import { cn, formatDate } from '@/lib/utils'

type Props = {
  /** Числовой id — Payload отвергает строковые id в relationship-полях. */
  lessonId: number
}

const PAGE_SIZE = 100
/** Предохранитель от бесконечного цикла, а не лимит: столько страниц вопросов к одному уроку не бывает. */
const MAX_PAGES = 20

type Loaded = { threads: Thread[]; failed: boolean }

async function postComment(body: Record<string, unknown>) {
  const res = await fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST /api/comments → ${res.status}`)
}

export function LessonComments({ lessonId }: Props) {
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
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

  // Ссылка из уведомления «Ответ на ваш вопрос» ведёт на #comment-<id>, а ветки
  // появляются после загрузки — браузер сам к ним не прокрутит.
  useEffect(() => {
    if (loading || !window.location.hash.startsWith('#comment-')) return
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'center' })
  }, [loading])

  async function handleSubmit() {
    if (!newComment.trim()) return
    setSubmitting(true)
    try {
      await postComment({ lesson: lessonId, content: newComment })
      setNewComment('')
      toast('Вопрос отправлен ментору', 'success')
      reload()
    } catch (error) {
      console.error('Не удалось отправить вопрос', error)
      toast('Не удалось отправить вопрос', 'error')
    } finally {
      setSubmitting(false)
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
        <p className="text-sm text-muted-foreground">
          Вопросы видите только вы и ментор. Когда он ответит, придёт уведомление.
        </p>
      </div>

      <div className="flex gap-3">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          aria-label="Вопрос к уроку"
          placeholder="Что осталось непонятным?"
          maxLength={2000}
          rows={2}
          className="flex-1 resize-none rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !newComment.trim()}
          aria-label={submitting ? 'Отправляем вопрос' : 'Отправить вопрос'}
          className="flex h-10 w-10 items-center justify-center self-end rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : failed ? (
        <p role="alert" className="py-6 text-center text-sm text-destructive">
          Не удалось загрузить вопросы — обновите страницу
        </p>
      ) : threads.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Вопросов пока нет. Если что-то непонятно — спросите, ментор ответит здесь же.
        </p>
      ) : (
        <ul className="space-y-3">
          {threads.map((thread) => (
            <ThreadItem key={thread.question.id} thread={thread} lessonId={lessonId} onPosted={reload} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ThreadItem({ thread, lessonId, onPosted }: { thread: Thread; lessonId: number; onPosted: () => void }) {
  const { question, replies } = thread
  const status = threadStatus(thread)
  const [replying, setReplying] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const { toast } = useToast()

  async function send() {
    if (!text.trim()) return
    setSending(true)
    try {
      await postComment({ lesson: lessonId, content: text, parentComment: Number(question.id) })
      setText('')
      setReplying(false)
      toast('Уточнение отправлено', 'success')
      onPosted()
    } catch (error) {
      console.error('Не удалось отправить уточнение', error)
      toast('Не удалось отправить уточнение', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <li id={`comment-${question.id}`} className="scroll-mt-24 space-y-3 rounded-lg border border-border bg-card px-4 py-3">
      <CommentBody comment={question}>
        <StatusBadge status={status} />
      </CommentBody>

      {replies.length > 0 && (
        <ul className="space-y-3 border-l-2 border-border pl-4">
          {replies.map((reply) => {
            const mentor = isMentorReply(reply, question)
            return (
              <li key={reply.id} className={cn(mentor && '-ml-2 rounded-md bg-primary/5 p-2')}>
                <CommentBody comment={reply}>
                  {mentor && reply.user && typeof reply.user === 'object' && (
                    <Badge className="bg-primary/10 text-foreground">Ментор</Badge>
                  )}
                </CommentBody>
              </li>
            )
          })}
        </ul>
      )}

      {replying ? (
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Уточнение к вопросу"
            maxLength={2000}
            rows={2}
            autoFocus
            className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <button
            type="button"
            onClick={send}
            disabled={sending || !text.trim()}
            aria-label={sending ? 'Отправляем уточнение' : 'Отправить уточнение'}
            className="flex h-9 w-9 items-center justify-center self-end rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setReplying(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
          Уточнить
        </button>
      )}
    </li>
  )
}

function CommentBody({ comment, children }: { comment: CommentDoc; children?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {authorName(comment.user)}
          {children}
        </span>
        <span className="text-xs text-muted-foreground">{formatDate(comment.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-foreground">{comment.content}</p>
    </div>
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
