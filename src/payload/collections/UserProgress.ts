import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'
import { awardPoints } from '@/payload/hooks/awardPoints'
import { checkAchievements } from '@/payload/hooks/checkAchievements'
import { updateStreak } from '@/payload/hooks/updateStreak'
import { assignOwner } from '@/payload/hooks/assignOwner'

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
    beforeChange: [assignOwner],
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
