import { APIError, type CollectionBeforeChangeHook, type CollectionConfig } from 'payload'

import { learningRelationId } from '@/lib/learning-access'
import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { ownGuideStateAccess } from '@/payload/access/learningStateRead'
import { assignOwner } from '@/payload/hooks/assignOwner'
import { lockLearningAccess } from '@/payload/hooks/learningAccessLock'
import { getGuideAccess, invalidateGuideAccess } from '@/server/guide-access'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

export const GUIDE_FEEDBACK_MAX = 1000

/**
 * Записать прочтение и отзыв можно только по выданному гайду: иначе запись раскрыла бы,
 * что гайд существует. Гайд у записи не меняется, дату отзыва ставит сервер.
 */
const guardGuideRead: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (!req.user || req.context?.skipHooks) return data
  const oldGuide = learningRelationId(originalDoc?.guide)
  const guide = learningRelationId(data.guide ?? originalDoc?.guide)
  if (operation === 'update' && oldGuide !== null && guide !== oldGuide) throw new APIError('Нельзя переносить отзыв на другой гайд', 400)
  if (guide === null) throw new APIError('Укажите гайд', 400)
  if ((await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role !== 'admin') {
    await lockLearningAccess(req, req.user.id)
    invalidateGuideAccess(req)
    if (!(await getGuideAccess(req.payload, req.user, req)).canAccessGuide(guide)) throw new APIError('Гайд недоступен', 403)
  }
  const next = { ...data }
  if (typeof next.comment === 'string') next.comment = next.comment.trim() || null
  const changed = (field: 'helpful' | 'comment') => field in data && (data[field] ?? null) !== (originalDoc?.[field] ?? null)
  if (changed('helpful') || changed('comment')) next.feedbackAt = new Date().toISOString()
  else delete next.feedbackAt
  return next
}

/** Кто открыл гайд и помог ли он: одна запись на ученика и гайд. Создаётся при первом открытии. */
export const GuideReads: CollectionConfig = {
  slug: 'guide-reads',
  labels: {
    singular: 'Прочтение гайда',
    plural: 'Прочтения и отзывы о гайдах',
  },
  admin: {
    defaultColumns: ['guide', 'user', 'helpful', 'comment', 'feedbackAt', 'createdAt'],
    group: 'Контент',
    description: 'Создаётся, когда ученик впервые открывает гайд. «Помог ли гайд» и комментарий ученик оставляет внизу страницы гайда.',
  },
  access: {
    create: isAuthenticated,
    read: ownGuideStateAccess,
    update: ownGuideStateAccess,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [assignOwner, guardGuideRead],
  },
  indexes: [{ fields: ['user', 'guide'], unique: true }],
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true, label: 'Ученик' },
    { name: 'guide', type: 'relationship', relationTo: 'guides', required: true, index: true, label: 'Гайд' },
    {
      name: 'helpful',
      type: 'select',
      label: 'Гайд помог?',
      options: [
        { label: 'Помог', value: 'yes' },
        { label: 'Не помог', value: 'no' },
      ],
    },
    { name: 'comment', type: 'textarea', maxLength: GUIDE_FEEDBACK_MAX, label: 'Что было непонятно' },
    { name: 'feedbackAt', type: 'date', label: 'Отзыв оставлен', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
  ],
}
