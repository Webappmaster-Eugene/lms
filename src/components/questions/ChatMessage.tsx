'use client'

import type { ReactNode } from 'react'
import { GraduationCap } from 'lucide-react'

import { useHydrated } from '@/hooks/use-hydrated'
import { authorInitials, authorName, formatMessageDateTime, formatMessageTime, type CommentDoc } from '@/lib/comment-threads'
import { cn, formatDate } from '@/lib/utils'

/**
 * Относительное время считается по часам и поясу браузера, поэтому до гидратации
 * показывается дата: иначе разметка сервера и клиента разошлась бы.
 */
export function MessageTime({ value }: { value: string }) {
  const hydrated = useHydrated()
  return (
    <time dateTime={value} title={hydrated ? formatMessageDateTime(value) : undefined} className="text-xs text-muted-foreground">
      {hydrated ? formatMessageTime(value) : formatDate(value)}
    </time>
  )
}

/** Сообщение переписки: кружок автора, имя, метки, время, действия и текст. */
export function ChatMessage({ comment, mentor, badges, actions, children }: {
  comment: CommentDoc
  mentor: boolean
  badges?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full text-xs font-semibold',
          mentor ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {mentor ? <GraduationCap className="h-4 w-4" /> : authorInitials(comment.user)}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="min-w-0 text-sm font-medium text-foreground [overflow-wrap:anywhere]">{authorName(comment.user)}</span>
          {badges}
          <MessageTime value={comment.createdAt} />
          {actions && <span className="ml-auto flex items-center">{actions}</span>}
        </div>
        {children}
      </div>
    </div>
  )
}
