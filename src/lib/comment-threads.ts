/** Комментарий, как его отдаёт REST с depth=1. */
export type CommentDoc = {
  id: number | string
  content: string
  /** Развёрнут — автор виден читателю (сам ученик или админ); числом — ментор. */
  user: { id?: number | string; firstName?: string | null; lastName?: string | null } | number | string | null
  parentComment?: { id: number | string } | number | string | null
  createdAt: string
  isResolved?: boolean | null
}

export type Thread = {
  question: CommentDoc
  replies: CommentDoc[]
}

const idOf = (ref: CommentDoc['parentComment']) =>
  ref === null || ref === undefined ? null : String(typeof ref === 'object' ? ref.id : ref)

/** Вопросы — сначала свежие, ответы в ветке — по порядку переписки. */
export function groupThreads(comments: CommentDoc[]): Thread[] {
  const byCreated = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const threads = new Map<string, Thread>()
  for (const c of byCreated) if (idOf(c.parentComment) === null) threads.set(String(c.id), { question: c, replies: [] })
  for (const c of byCreated) {
    const parent = idOf(c.parentComment)
    if (parent !== null) threads.get(parent)?.replies.push(c)
  }
  return [...threads.values()].reverse()
}

/**
 * Имя автора. Чужой профиль ученику не раскрывается, а в его ветку, кроме него
 * самого, пишет только ментор — поэтому неразвёрнутый автор и есть ментор.
 */
export function authorName(user: CommentDoc['user']): string {
  if (user && typeof user === 'object') {
    return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Пользователь'
  }
  return 'Ментор'
}

export const isMentor = (user: CommentDoc['user']) => !(user && typeof user === 'object')
