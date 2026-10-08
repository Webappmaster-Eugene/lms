import { Forbidden, type CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'

/** Numeric snapshots deliberately survive deleted users and content. */
export const LearningAccessAudit: CollectionConfig = {
  slug: 'learning-access-audit', lockDocuments: false,
  labels: { singular: 'Событие доступа', plural: 'История назначений доступа' },
  admin: { group: 'Доступ к обучению', defaultColumns: ['createdAt', 'actorId', 'userId', 'operation', 'targetType', 'targetId', 'effect'] },
  access: {
    read: isAdmin,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  hooks: {
    beforeChange: [({ operation, req, data }) => { if (operation !== 'create') throw new Forbidden(req.t); return data }],
    beforeDelete: [({ req }) => { throw new Forbidden(req.t) }],
  },
  fields: [
    { name: 'actorId', type: 'number', required: true, label: 'ID администратора' },
    { name: 'userId', type: 'number', required: true, index: true, label: 'ID ученика' },
    { name: 'grantId', type: 'number', label: 'ID назначения' },
    { name: 'operation', type: 'select', required: true, options: ['create', 'update', 'delete', 'mode'], label: 'Операция' },
    { name: 'targetType', type: 'text', required: true, label: 'Тип цели' },
    { name: 'targetId', type: 'number', required: true, label: 'ID цели' },
    { name: 'effect', type: 'select', required: true, options: ['allow', 'deny'], label: 'Действие' },
    { name: 'previous', type: 'json', label: 'Предыдущее правило' },
    { name: 'current', type: 'json', label: 'Новое правило' },
  ],
}
