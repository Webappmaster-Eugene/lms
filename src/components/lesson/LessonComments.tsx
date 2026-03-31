'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Send, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/utils'

type Props = {
  lessonId: string
}

type CommentUser = {
  firstName?: string
  lastName?: string
}

type CommentDoc = {
  id: string
  content: string
  user: CommentUser | string
  createdAt: string
  isResolved?: boolean
}

export function LessonComments({ lessonId }: Props) {
  const [comments, setComments] = useState<CommentDoc[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/comments?where[lesson][equals]=${lessonId}&where[parentComment][exists]=false&sort=-createdAt&limit=50&depth=1`,
        { credentials: 'include' },
      )
      const data = await res.json()
      setComments(data.docs ?? [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [lessonId])

  useEffect(() => {
    loadComments()
  }, [loadComments])

  async function handleSubmit() {
    if (!newComment.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lesson: lessonId, content: newComment }),
      })
      if (!res.ok) throw new Error('Failed')
      setNewComment('')
      toast('Комментарий добавлен', 'success')
      await loadComments()
    } catch {
      toast('Не удалось добавить комментарий', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <MessageSquare className="h-5 w-5" />
        Обсуждение
        {comments.length > 0 && (
          <span className="text-sm font-normal text-muted-foreground">({comments.length})</span>
        )}
      </h3>

      {/* Форма нового комментария */}
      <div className="flex gap-3">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Задайте вопрос или оставьте комментарий..."
          maxLength={2000}
          rows={2}
          className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none"
        />
        <button
          onClick={handleSubmit}
          disabled={submitting || !newComment.trim()}
          className="flex h-10 w-10 items-center justify-center self-end rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Список комментариев */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">
          Пока нет комментариев. Будьте первым!
        </p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => {
            const user = typeof comment.user === 'object' ? comment.user : null
            const name = user
              ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
              : 'Пользователь'

            return (
              <div
                key={comment.id}
                className="rounded-lg border border-border bg-card px-4 py-3 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(comment.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{comment.content}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
