import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'
import { awardPoints } from '@/payload/hooks/awardPoints'
import { checkAchievements } from '@/payload/hooks/checkAchievements'
import { updateStreak } from '@/payload/hooks/updateStreak'

export const UserProgress: CollectionConfig = {
  slug: 'user-progress',
  admin: {
    defaultColumns: ['user', 'lesson', 'isCompleted', 'completedAt'],
    group: 'Прогресс',
  },
  access: {
    create: isAuthenticated,
    read: isAdminOrSelf,
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [
      ({ req, data, operation }) => {
        if (operation === 'create') {
          // Для hook-вызовов (context.skipHooks) пропускаем проверку
          if (req.context?.skipHooks) return data
          // Студент может создавать прогресс только для себя
          if (req.user && req.user.role !== 'admin') {
            data.user = req.user.id
          }
        }
        return data
      },
    ],
    afterChange: [awardPoints, checkAchievements, updateStreak],
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
      name: 'isCompleted',
      type: 'checkbox',
      defaultValue: false,
      label: 'Пройден',
    },
    {
      name: 'completedAt',
      type: 'date',
      label: 'Дата прохождения',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'lastAccessedAt',
      type: 'date',
      label: 'Последний доступ',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
  ],
}
