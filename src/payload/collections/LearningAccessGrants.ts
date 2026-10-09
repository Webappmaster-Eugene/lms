import type { CollectionConfig } from 'payload'

import { learningTargetCollections } from '@/lib/learning-access'
import { isAdmin } from '@/payload/access/isAdmin'
import { auditLearningGrantChange, auditLearningGrantDelete, validateLearningGrant } from '@/payload/hooks/learningAccessGrants'
import { lockLearningGrantChange, lockLearningGrantDelete } from '@/payload/hooks/learningAccessLock'
import { captureRawCollectionPatch } from '@/payload/hooks/rawCollectionPatch'

export const LearningAccessGrants: CollectionConfig = {
  slug: 'learning-access-grants',
  lockDocuments: false,
  labels: { singular: 'Назначение доступа', plural: 'Назначения доступа' },
  admin: { group: 'Доступ к обучению', useAsTitle: 'ruleKey', defaultColumns: ['user', 'target', 'effect', 'expiresAt'] },
  access: {
    create: isAdmin,
    read: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: { beforeOperation: [captureRawCollectionPatch], beforeValidate: [validateLearningGrant], beforeChange: [lockLearningGrantChange], beforeDelete: [lockLearningGrantDelete], afterChange: [auditLearningGrantChange], afterDelete: [auditLearningGrantDelete] },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true, label: 'Ученик' },
    { name: 'target', type: 'relationship', relationTo: [...learningTargetCollections], required: true, label: 'Роадмап, курс, урок, тема или задача тренажёра' },
    { name: 'effect', type: 'select', required: true, defaultValue: 'allow', label: 'Действие', options: [{ label: 'Открыть доступ', value: 'allow' }, { label: 'Закрыть доступ', value: 'deny' }] },
    { name: 'startsAt', type: 'date', label: 'Открыть начиная с', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'expiresAt', type: 'date', label: 'Доступ до', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'note', type: 'textarea', maxLength: 1000, label: 'Комментарий администратора' },
    { name: 'ruleKey', type: 'text', required: true, unique: true, label: 'Ключ правила', admin: { hidden: true }, access: { update: () => false } },
  ],
}
