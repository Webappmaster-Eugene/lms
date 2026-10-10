import { sql } from '@payloadcms/db-postgres'
import { APIError, type CollectionBeforeValidateHook, type PayloadRequest } from 'payload'

import { relationId } from '@/lib/relation-id'
import { requireLessonAccess } from '@/server/learning-access'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { consumeRawCollectionPatch } from '@/payload/hooks/rawCollectionPatch'

export const DELETED_COMMENT = '(Комментарий удалён)'

interface TransactionAdapter {
  sessions: Record<string | number, { db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } } | undefined>
}

/** All updates, including REST PATCH, serialize against deletion before validation. */
export const guardCommentMutation: CollectionBeforeValidateHook = async ({ data, originalDoc, operation, req }) => {
  if (!data) return data
  const actorIsAdmin = req.user ? (await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role === 'admin' : false
  if (operation === 'update' && originalDoc) {
    const patch = consumeRawCollectionPatch(req, 'comments', originalDoc.id)
    if (!patch) throw new APIError('Исходные поля комментария не определены', 409)
    const transactionID = await req.transactionID
    const adapter = req.payload.db as unknown as TransactionAdapter
    const db = transactionID === undefined ? undefined : adapter.sessions[transactionID]?.db
    if (!db) throw new APIError('Изменение комментария требует транзакции', 500)
    await db.execute(sql`select id from comments where id = ${originalDoc.id} for update`)
    const current = await req.payload.findByID({ collection: 'comments', id: originalDoc.id, depth: 0, req })
    if (current.deletedAt) throw new APIError('Удалённый комментарий нельзя изменить', 409)
    if (req.user) {
      if (!actorIsAdmin && relationId(current.user) !== req.user.id) throw new APIError('Комментарий не найден', 404)
      await requireLessonAccess(req.payload, req.user, relationId(current.lesson), req)
    }
    // Preserve immutable relationships even when a stale concurrent request supplied them.
    data.user = relationId(current.user)
    data.lesson = relationId(current.lesson)
    data.parentComment = current.parentComment ? relationId(current.parentComment) : null
    if (!patch.keys.has('content')) data.content = current.content
    // Omitted checkboxes contain a pre-lock fallback; only an explicit administrative patch may replace the fresh value.
    const explicitAdministrativeResolve = patch.keys.has('isResolved') && (actorIsAdmin || (!req.user && patch.overrideAccess))
    if (!explicitAdministrativeResolve) data.isResolved = current.isResolved ?? false
    data.deletedAt = req.context.removeOwnedComment ? new Date().toISOString() : null
  } else {
    if (req.user && !actorIsAdmin) data.isResolved = false
    data.deletedAt = null
  }
  if (req.context.removeOwnedComment) data.content = DELETED_COMMENT
  if ('content' in data) {
    if (typeof data.content !== 'string' || !data.content.trim() || data.content.trim().length > 2000) {
      throw new APIError('Комментарий должен содержать от 1 до 2000 символов', 400)
    }
    data.content = data.content.trim()
  }
  return data
}

export async function removeOwnedComment(req: PayloadRequest): Promise<Response> {
  if (!req.user) return Response.json({ error: 'Войдите в аккаунт' }, { status: 401 })
  const id = Number(req.routeParams?.id)
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: 'Комментарий не найден' }, { status: 404 })
  const doc = await req.payload.findByID({ collection: 'comments', id, depth: 0, overrideAccess: false, req })
  if (relationId(doc.user) !== req.user.id) return Response.json({ error: 'Комментарий не найден' }, { status: 404 })
  await requireLessonAccess(req.payload, req.user, relationId(doc.lesson), req)
  if (doc.deletedAt) return Response.json({ id, deletedAt: doc.deletedAt })
  const updated = await req.payload.update({
    collection: 'comments', id, data: { content: DELETED_COMMENT }, req,
    context: { ...req.context, removeOwnedComment: true },
  })
  return Response.json({ id, deletedAt: updated.deletedAt })
}
