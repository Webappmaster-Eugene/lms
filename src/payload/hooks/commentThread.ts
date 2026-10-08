import {
  Forbidden,
  type CollectionAfterChangeHook,
  type CollectionBeforeValidateHook,
  type PayloadRequest,
} from 'payload'

import { collectAllPages } from '@/lib/paginate'
import { relationId } from '@/lib/relation-id'
import { logger, withSpan } from '@/lib/telemetry'

/**
 * Вопросы к уроку — приватная переписка ученика с ментором: корневой вопрос
 * и ответы на него. Ученик читает свою ветку целиком (доступ — по автору
 * корня), поэтому писать в чужую ветку ему нельзя: ответ стал бы виден
 * постороннему, а сам он получил бы доступ к чужой переписке.
 */

type CommentDoc = { id: number; user: unknown; lesson: unknown; parentComment?: unknown }

const EXCERPT = 200

function excerpt(text: unknown): string {
  const value = String(text ?? '').trim()
  return value.length > EXCERPT ? `${value.slice(0, EXCERPT - 1)}…` : value
}

async function findRoot(req: PayloadRequest, id: unknown): Promise<CommentDoc> {
  const parent = (await req.payload.findByID({
    collection: 'comments',
    id: relationId(id),
    depth: 0,
    req,
  })) as unknown as CommentDoc
  // Ветка плоская: ответ на ответ крепится к корню.
  if (!parent.parentComment) return parent
  return (await req.payload.findByID({
    collection: 'comments',
    id: relationId(parent.parentComment),
    depth: 0,
    req,
  })) as unknown as CommentDoc
}

/**
 * До валидации: урок ответа берётся из корня, поэтому его можно не передавать.
 */
export const restrictCommentThread: CollectionBeforeValidateHook = async ({ data, operation, originalDoc, req }) => {
  if (!data) return data
  const isAdmin = req.user?.role === 'admin'

  if (operation === 'update') {
    // Перенести свой комментарий в чужую ветку или урок — тот же обход доступа.
    if (!isAdmin && originalDoc) {
      data.parentComment = originalDoc.parentComment ?? null
      data.lesson = originalDoc.lesson
    }
    return data
  }

  if (!data.parentComment) return data

  const root = await findRoot(req, data.parentComment)
  if (!isAdmin && relationId(root.user) !== Number(req.user?.id)) {
    throw new Forbidden(req.t)
  }
  data.parentComment = root.id
  data.lesson = relationId(root.lesson)
  return data
}

async function lessonOf(req: PayloadRequest, lesson: unknown) {
  return req.payload.findByID({
    collection: 'lessons',
    id: relationId(lesson),
    depth: 0,
    select: { title: true, slug: true },
    req,
  })
}

export const notifyCommentThread: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create' || req.context?.skipHooks) return doc

  return withSpan('hook.notifyCommentThread', { 'comment.id': doc.id }, async () => {
    try {
      const author = relationId(doc.user)
      const lesson = await lessonOf(req, doc.lesson)

      if (doc.parentComment) {
        const root = await findRoot(req, doc.parentComment)
        const asker = relationId(root.user)
        // Своё уточнение в своей ветке — уведомлять некого.
        if (asker === author) return doc
        await req.payload.create({
          req,
          collection: 'notifications',
          data: {
            user: asker,
            title: `Ответ на ваш вопрос к уроку «${lesson.title}»`,
            message: excerpt(doc.content),
            type: 'comment',
            link: `/lessons/${lesson.slug}#comment-${root.id}`,
            isRead: false,
          },
        })
        return doc
      }

      if (req.user?.role === 'admin') return doc
      const admins = await collectAllPages(
        ({ page, limit }) =>
          req.payload.find({
            collection: 'users',
            where: { role: { equals: 'admin' } },
            select: { role: true },
            depth: 0,
            sort: 'id',
            page,
            limit,
            req,
          }),
        { label: 'администраторы для уведомления о вопросе' },
      )
      for (const admin of admins) {
        await req.payload.create({
          req,
          collection: 'notifications',
          data: {
            user: admin.id,
            title: `Вопрос к уроку «${lesson.title}»`,
            message: excerpt(doc.content),
            type: 'comment',
            link: `/admin/questions#comment-${doc.id}`,
            isRead: false,
          },
        })
      }
    } catch (err) {
      // Вопрос уже сохранён — без уведомления он всё равно виден в админке.
      logger.error('Не удалось уведомить о комментарии', err, { 'comment.id': doc.id })
    }
    return doc
  })
}
