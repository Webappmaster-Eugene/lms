import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { sendWelcomeEmail } from '@/payload/hooks/sendNotification'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    tokenExpiration: 60 * 60 * 24 * 7, // 7 дней
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'firstName', 'lastName', 'role', 'isActive'],
    group: 'Пользователи',
  },
  hooks: {
    afterChange: [sendWelcomeEmail],
  },
  access: {
    create: isAdmin,
    read: isAuthenticated,
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      // Студент может редактировать только свой профиль
      return { id: { equals: user.id } }
    },
    delete: isAdmin,
    admin: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'firstName',
      type: 'text',
      required: true,
      label: 'Имя',
    },
    {
      name: 'lastName',
      type: 'text',
      required: true,
      label: 'Фамилия',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'student',
      label: 'Роль',
      options: [
        { label: 'Администратор', value: 'admin' },
        { label: 'Студент', value: 'student' },
      ],
      access: {
        update: ({ req: { user } }) => Boolean(user?.role === 'admin'),
      },
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
      label: 'Аватар',
    },
    {
      name: 'bio',
      type: 'textarea',
      label: 'О себе',
      maxLength: 500,
    },
    {
      name: 'totalPoints',
      type: 'number',
      defaultValue: 0,
      label: 'Баллы',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      label: 'Активен',
      admin: {
        position: 'sidebar',
      },
    },
  ],
}
