import type { CollectionConfig } from 'payload'

import { isAdminOrSelf } from '@/payload/access/isAdminOrSelf'
import { isAdmin } from '@/payload/access/isAdmin'

export const Streaks: CollectionConfig = {
  slug: 'streaks',
  admin: {
    defaultColumns: ['user', 'currentStreak', 'longestStreak', 'lastActivityDate'],
    group: 'Прогресс',
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
      unique: true,
      label: 'Пользователь',
    },
    {
      name: 'currentStreak',
      type: 'number',
      defaultValue: 0,
      required: true,
      label: 'Текущая серия (дней)',
    },
    {
      name: 'longestStreak',
      type: 'number',
      defaultValue: 0,
      required: true,
      label: 'Лучшая серия (дней)',
    },
    {
      name: 'lastActivityDate',
      type: 'text',
      label: 'Последний день активности (YYYY-MM-DD)',
    },
    {
      name: 'totalActiveDays',
      type: 'number',
      defaultValue: 0,
      label: 'Всего активных дней',
    },
  ],
}
