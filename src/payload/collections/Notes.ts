import type { CollectionConfig } from 'payload'

import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'

export const Notes: CollectionConfig = {
  slug: 'notes',
  admin: {
    defaultColumns: ['user', 'lesson', 'updatedAt'],
    group: 'Прогресс',
  },
  access: {
    create: isAuthenticated,
    read: isAdminOrSelf,
    update: isAdminOrSelf,
    delete: isAdminOrSelf,
  },
  hooks: {
    beforeChange: [
      ({ req, data, operation }) => {
        if (operation === 'create' && req.user && req.user.role !== 'admin') {
          data.user = req.user.id
        }
        return data
      },
    ],
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
