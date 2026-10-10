import type { CollectionConfig } from 'payload'

import { learningStateRead } from '@/payload/access/learningStateRead'

/** Viewing history never invokes completion, points or achievement hooks. */
export const LessonLearningStates: CollectionConfig = {
  slug: 'lesson-learning-states',
  lockDocuments: false,
  labels: { singular: 'Место остановки', plural: 'Места остановки' },
  admin: { group: 'Прогресс', defaultColumns: ['user', 'lesson', 'lastViewedAt'] },
  access: {
    read: learningStateRead(),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  indexes: [{ fields: ['lesson', 'user'], unique: true }, { fields: ['user', 'lastViewedAt'] }],
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, label: 'Пользователь' },
    { name: 'lesson', type: 'relationship', relationTo: 'lessons', required: true, label: 'Урок' },
    { name: 'lastViewedAt', type: 'date', required: true, index: true, label: 'Последний просмотр' },
    { name: 'lastVideoId', type: 'text', label: 'Последнее видео' },
    { name: 'positions', type: 'json', label: 'Позиции видео', defaultValue: {} },
  ],
}
