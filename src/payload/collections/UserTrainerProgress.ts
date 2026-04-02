import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'
import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { awardTrainerPoints } from '@/payload/hooks/awardTrainerPoints'

export const UserTrainerProgress: CollectionConfig = {
  slug: 'user-trainer-progress',
  admin: {
    defaultColumns: ['user', 'task', 'isCompleted', 'attempts', 'completedAt'],
    group: 'Тренажёр',
  },
  access: {
    create: isAuthenticated,
    read: isAdminOrSelf,
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        if (!data) return data
        // Auto-set user for students on create
        if (operation === 'create' && req.user && req.user.role !== 'admin') {
          data.user = req.user.id
        }
        return data
      },
    ],
    afterChange: [awardTrainerPoints],
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
      name: 'task',
      type: 'relationship',
      relationTo: 'trainer-tasks',
      required: true,
      label: 'Задача',
    },
    {
      name: 'isCompleted',
      type: 'checkbox',
      defaultValue: false,
      label: 'Решена',
    },
    {
      name: 'userCode',
      type: 'textarea',
      label: 'Код пользователя',
      maxLength: 10000,
    },
    {
      name: 'completedAt',
      type: 'date',
      label: 'Дата решения',
    },
    {
      name: 'attempts',
      type: 'number',
      defaultValue: 0,
      label: 'Количество попыток',
    },
  ],
}
