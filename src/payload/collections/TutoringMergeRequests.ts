import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'

const denied = () => false

export const TutoringMergeRequests: CollectionConfig = {
  slug: 'tutoring-merge-requests',
  lockDocuments: false,
  admin: { group: 'Менторство', useAsTitle: 'title' },
  access: { read: isAdmin, create: denied, update: denied, delete: denied },
  labels: { singular: 'Работа в GitLab', plural: 'Работы в GitLab' },
  indexes: [{ fields: ['project', 'mrIid'], unique: true }, { fields: ['project', 'stage', 'isOpen', 'eventAt'] }],
  fields: [
    { name: 'project', type: 'relationship', relationTo: 'tutoring-projects', required: true },
    { name: 'mrIid', type: 'number', min: 1, required: true, label: 'Номер в проекте' },
    { name: 'stage', type: 'number', min: 0, max: 20, required: true, label: 'Этап' },
    { name: 'title', type: 'text', required: true, maxLength: 255, label: 'Название' },
    { name: 'isOpen', type: 'checkbox', required: true, label: 'Можно выбрать для сдачи' },
    { name: 'headSha', type: 'text', maxLength: 64, label: 'Последний коммит' },
    { name: 'eventAt', type: 'date', required: true, label: 'Время события в GitLab' },
  ],
}
