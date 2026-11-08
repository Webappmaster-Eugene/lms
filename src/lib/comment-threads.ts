import { formatDate, pluralize } from '@/lib/utils'

/** Вопрос с кодом и текстом ошибки в прежние 2000 знаков не помещался. */
export const COMMENT_MAX_LENGTH = 5000

/** Комментарий, как его отдаёт REST с depth=1. */
export type CommentDoc = {
  id: number | string
  content: string
  /** Развёрнут — автор виден читателю (сам ученик или админ); числом — ментор. */
  user: { id?: number | string; firstName?: string | null; lastName?: string | null } | number | string | null
  parentComment?: { id: number | string } | number | string | null
  createdAt: string
  isResolved?: boolean | null
  deletedAt?: string | null
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

export function authorName(user: CommentDoc['user']): string {
  if (user && typeof user === 'object') {
    return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Пользователь'
  }
  return 'Ментор'
}

export const authorId = (user: CommentDoc['user']) =>
  user && typeof user === 'object' ? String(user.id ?? '') : user === null ? '' : String(user)

/**
 * Ответ ментора — ответ не от автора вопроса: писать в чужую ветку сервер
 * разрешает только администраторам (restrictCommentThread).
 */
export const isMentorReply = (reply: CommentDoc, question: CommentDoc) =>
  authorId(reply.user) !== authorId(question.user)

export type ThreadStatus = 'resolved' | 'answered' | 'waiting'

/**
 * Ждёт ответа — последнее слово за учеником: вопрос без ответа или уточнение
 * после ответа ментора. Решённую ветку ментор закрыл сам.
 */
export function threadStatus({ question, replies }: Thread): ThreadStatus {
  if (question.isResolved) return 'resolved'
  const last = replies.at(-1)
  return last && isMentorReply(last, question) ? 'answered' : 'waiting'
}

export const STATUS_LABELS: Record<ThreadStatus, string> = {
  resolved: 'Решён',
  answered: 'Есть ответ',
  waiting: 'Ждёт ответа',
}

/** Инициалы для кружка автора: «Анна Ли» → «АЛ». */
export function authorInitials(user: CommentDoc['user']): string {
  const letters = authorName(user).split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0])
  return letters.join('').toUpperCase() || '?'
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/

/**
 * Превью сообщения для списков: без разметки Markdown, блок кода - «[код]».
 * Обрезку по длине делает вёрстка (line-clamp), здесь только чистка.
 */
export function messagePreview(content: string): string {
  const lines: string[] = []
  let fence: string | null = null
  for (const line of content.split('\n')) {
    const marker = FENCE.exec(line)?.[1]
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = null
      continue
    }
    if (marker) {
      fence = marker
      lines.push('[код]')
      continue
    }
    lines.push(line)
  }
  return lines
    .join('\n')
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, '$2')
    .replace(/^ {0,3}#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const CLOCK = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })
const DAY_MONTH = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const FULL = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const MINUTE = 60_000
const DAY = 86_400_000

const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

/** Время сообщения по-человечески: «5 минут назад», «вчера в 14:05», «3 ноября в 09:30». */
export function formatMessageTime(value: string, now = new Date()): string {
  const date = new Date(value)
  const diff = now.getTime() - date.getTime()
  if (Number.isNaN(diff)) return ''
  if (Math.abs(diff) < MINUTE) return 'только что'
  if (diff > 0 && diff < 60 * MINUTE) return `${pluralize(Math.floor(diff / MINUTE), 'минуту', 'минуты', 'минут')} назад`
  const days = Math.round((dayStart(now) - dayStart(date)) / DAY)
  if (days === 0) return `сегодня в ${CLOCK.format(date)}`
  if (days === 1) return `вчера в ${CLOCK.format(date)}`
  if (date.getFullYear() === now.getFullYear()) return `${DAY_MONTH.format(date)} в ${CLOCK.format(date)}`
  return formatDate(date)
}

/** Полная дата и время для подсказки над относительным временем. */
export const formatMessageDateTime = (value: string) => FULL.format(new Date(value))
