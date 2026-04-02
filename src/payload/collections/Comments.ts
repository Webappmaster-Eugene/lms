import type { CollectionConfig } from 'payload'

import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { isAdmin } from '@/payload/access/isAdmin'

export const Comments: CollectionConfig = {
  slug: 'comments',
  admin: {
    defaultColumns: ['user', 'lesson', 'content', 'createdAt'],
    group: 'Коммуникация',
  },
  access: {
    create: isAuthenticated,
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      // Студент видит только свои комментарии
      return { user: { equals: user.id } }
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      // Автор может редактировать свой комментарий
      return { user: { equals: user.id } }
    },
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [
      ({ req, data, operation }) => {
        if (operation === 'create' && req.user) {
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
      label: 'Автор',
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
      label: 'Комментарий',
      maxLength: 2000,
    },
    {
      name: 'parentComment',
      type: 'relationship',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      relationTo: 'comments' as any,
      label: 'Ответ на комментарий',
      admin: {
        description: 'Оставьте пустым для корневого комментария',
      },
    },
    {
      name: 'isResolved',
      type: 'checkbox',
      defaultValue: false,
      label: 'Решён (для Q&A)',
      admin: {
        position: 'sidebar',
      },
    },
  ],
}
