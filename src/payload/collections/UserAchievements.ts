import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'
import { sendAchievementEmail } from '@/payload/hooks/sendNotification'
import { createAchievementNotification } from '@/payload/hooks/createNotification'

export const UserAchievements: CollectionConfig = {
  slug: 'user-achievements',
  admin: {
    defaultColumns: ['user', 'achievement', 'unlockedAt'],
    group: 'Геймификация',
  },
  hooks: {
    afterChange: [sendAchievementEmail, createAchievementNotification],
  },
  access: {
    create: isAdmin,
    read: isAdminOrSelf,
    update: isAdmin,
    delete: isAdmin,
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
      name: 'achievement',
      type: 'relationship',
      relationTo: 'achievements',
      required: true,
      label: 'Достижение',
    },
    {
      name: 'unlockedAt',
      type: 'date',
      required: true,
      label: 'Дата получения',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
  ],
}
