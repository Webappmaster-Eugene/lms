import { Forbidden, type CollectionConfig } from 'payload'

import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'

export const LearningAccessPolicies: CollectionConfig = {
  slug: 'learning-access-policies', lockDocuments: false,
  labels: { singular: 'Политика доступа ученика', plural: 'Политики доступа учеников' },
  admin: { hidden: true, group: 'Доступ к обучению' },
  access: {
    read: isAdminOrSelf,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  hooks: {
    beforeChange: [({ data, req }) => { if (req.context?.syncLearningAccessPolicy !== true) throw new Forbidden(req.t); return data }],
    beforeDelete: [({ req }) => { if (req.context?.syncLearningAccessPolicy !== true) throw new Forbidden(req.t) }],
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, unique: true, label: 'Ученик' },
    { name: 'mode', type: 'select', required: true, options: ['all', 'assigned'], label: 'Режим доступа' },
    { name: 'catalogVisibility', type: 'select', options: ['catalog', 'assigned'], label: 'Видимость каталога' },
    { name: 'trainerMode', type: 'select', options: ['all', 'assigned', 'disabled'], label: 'Доступ к тренажёру' },
    { name: 'role', type: 'select', required: true, options: ['admin', 'student'], label: 'Роль аккаунта' },
  ],
}
