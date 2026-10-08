import type { Payload } from 'payload'

import { groupThreads, type CommentDoc, type Thread } from '@/lib/comment-threads'
import { relationKey } from '@/lib/course-lessons'
import { collectAllPages } from '@/lib/paginate'

export type LessonRef = { title: string; slug: string } | null

export type QuestionThread = Thread & {
  /** null — доступная ментору переписка снятого урока остаётся без ссылки. */
  lesson: LessonRef
}

type Viewer = { id: number | string; role?: string | null; collection?: string }

/**
 * Ветки вопросов с уроками. Выборка идёт с правами зрителя: ученику сервер
 * отдаёт только его ветки, ментору — все.
 */
export async function loadQuestionThreads(payload: Payload, user: Viewer): Promise<QuestionThread[]> {
  const comments = await collectAllPages(
    ({ page, limit }) =>
      payload.find({
        collection: 'comments',
        user: user as never,
        overrideAccess: false,
        select: { content: true, user: true, lesson: true, parentComment: true, isResolved: true, createdAt: true },
        depth: 1,
        populate: { users: { firstName: true, lastName: true } },
        sort: ['createdAt', 'id'],
        page,
        limit,
      }),
    { label: `вопросы для ${user.id}` },
  )

  const lessonIds = [...new Set(comments.flatMap((c) => relationKey(c.lesson) ?? []))]
  const lessons =
    lessonIds.length === 0
      ? []
      : await collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'lessons',
              user: user as never,
              overrideAccess: false,
              where: { id: { in: lessonIds }, isPublished: { equals: true } },
              select: { title: true, slug: true },
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: `уроки вопросов для ${user.id}` },
        )
  const lessonById = new Map(lessons.map((l) => [String(l.id), { title: l.title, slug: l.slug }]))

  const docs = comments.map((c) => ({ ...c, lesson: undefined }) as unknown as CommentDoc)
  const lessonOfComment = new Map(comments.map((c) => [String(c.id), relationKey(c.lesson)]))
  return groupThreads(docs).map((thread) => ({
    ...thread,
    lesson: lessonById.get(lessonOfComment.get(String(thread.question.id)) ?? '') ?? null,
  }))
}
