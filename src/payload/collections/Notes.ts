import type { CollectionConfig } from 'payload'

import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'
import { assignOwner } from '@/payload/hooks/assignOwner'
import { guardLearningLessonWrite } from '@/payload/hooks/learningLessonWrite'
import { learningStateRead } from '@/payload/access/learningStateRead'

export const Notes: CollectionConfig = {
  slug: 'notes',
  admin: {
    defaultColumns: ['user', 'lesson', 'updatedAt'],
    group: 'Прогресс',
  },
  access: {
    create: isAuthenticated,
    read: learningStateRead(),
    update: isAdminOrSelf,
    delete: isAdminOrSelf,
  },
  hooks: {
    beforeChange: [assignOwner, guardLearningLessonWrite],
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      label: 'Пользователь',
    },
    {
      name: 'lesson',
      type: 'relationship',
      relationTo: 'lessons',
      required: true,
      label: 'Урок',
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
      label: 'Заметка',
      maxLength: 5000,
    },
  ],
}
